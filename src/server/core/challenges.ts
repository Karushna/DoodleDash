import { redis } from '@devvit/web/server';
import { keys, today, yesterday } from './redisKeys.js';
import type { LeaderboardEntry, Stroke } from '../../shared/api.js';

const FALLBACK_PROMPTS = [
  'a cat', 'a house', 'a car', 'a tree', 'a dog', 'the sun', 'a pizza',
  'a rocket', 'a fish', 'a flower', 'a bicycle', 'a mountain', 'a crown',
  'a penguin', 'a castle', 'a robot', 'a rainbow', 'a dragon', 'a cactus',
  'a banana', 'a lightning bolt', 'a submarine', 'a butterfly', 'a volcano',
];

type ChallengeRecord = { prompt: string; date: string; submittedBy: string };
type StreakRecord = { current: number; longest: number; lastDate: string };
type DrawingRecord = { strokes: Stroke[]; submittedAt: string; reactions: Record<string, number>; votes?: number; username: string };
type PromptQueueItem = { prompt: string; submittedBy: string; submittedAt: string };

export async function getDailyChallenge(): Promise<ChallengeRecord> {
  const date = today();
  const existing = await redis.get(keys.challenge(date));
  if (existing) return JSON.parse(existing) as ChallengeRecord;

  // Pull from queue
  const queueRaw = await redis.get(keys.challengeQueue());
  const queue: PromptQueueItem[] = queueRaw ? (JSON.parse(queueRaw) as PromptQueueItem[]) : [];

  let prompt: string;
  let submittedBy = 'system';

  if (queue.length > 0) {
    const item = queue.shift()!;
    prompt = item.prompt;
    submittedBy = item.submittedBy;
    await redis.set(keys.challengeQueue(), JSON.stringify(queue));
  } else {
    // Deterministic fallback: pick by day-of-year so it's stable across requests
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getUTCFullYear(), 0, 0).getTime()) / 86_400_000
    );
    prompt = FALLBACK_PROMPTS[dayOfYear % FALLBACK_PROMPTS.length]!;
  }

  const record: ChallengeRecord = { prompt, date, submittedBy };
  await redis.set(keys.challenge(date), JSON.stringify(record));
  return record;
}

export async function getOrCreateStreak(username: string): Promise<StreakRecord> {
  const raw = await redis.get(keys.streak(username));
  if (raw) return JSON.parse(raw) as StreakRecord;
  return { current: 0, longest: 0, lastDate: '' };
}

export async function updateStreak(username: string): Promise<{ streak: StreakRecord; isNew: boolean }> {
  const streak = await getOrCreateStreak(username);
  const date = today();

  if (streak.lastDate === date) {
    // Already counted today
    return { streak, isNew: false };
  }

  const isConsecutive = streak.lastDate === yesterday();
  streak.current = isConsecutive ? streak.current + 1 : 1;
  streak.longest = Math.max(streak.longest, streak.current);
  streak.lastDate = date;

  await redis.set(keys.streak(username), JSON.stringify(streak));
  return { streak, isNew: true };
}

export function getUnlockedColors(streak: StreakRecord): string[] {
  const colors = ['#000000', '#ffffff', '#888888'];
  if (streak.current >= 3) colors.push('#ff4444');
  if (streak.current >= 7) colors.push('#4488ff');
  if (streak.current >= 14) colors.push('#44cc44');
  if (streak.current >= 30) colors.push('#aa44ff');
  if (streak.current >= 60) colors.push('#ffaa00');
  if (streak.current >= 100) colors.push('#ff8800');
  return colors;
}

export function getNewlyUnlockedColors(oldStreak: number, newStreak: number): string[] {
  const milestones: [number, string][] = [
    [3, '#ff4444'], [7, '#4488ff'], [14, '#44cc44'],
    [30, '#aa44ff'], [60, '#ffaa00'], [100, '#ff8800'],
  ];
  return milestones
    .filter(([n]) => oldStreak < n && newStreak >= n)
    .map(([, color]) => color);
}

export async function registerUser(username: string): Promise<void> {
  const raw = await redis.get(keys.usersAll());
  const users: string[] = raw ? (JSON.parse(raw) as string[]) : [];
  if (!users.includes(username)) {
    users.push(username);
    await redis.set(keys.usersAll(), JSON.stringify(users));
  }
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const raw = await redis.get(keys.usersAll());
  if (!raw) return [];
  const users = JSON.parse(raw) as string[];

  const entries: LeaderboardEntry[] = [];
  for (const u of users) {
    const sRaw = await redis.get(keys.streak(u));
    if (!sRaw) continue;
    const s = JSON.parse(sRaw) as StreakRecord;
    if (s.current > 0 || s.longest > 0) {
      entries.push({ username: u, current: s.current, longest: s.longest });
    }
  }

  return entries.sort((a, b) => b.current - a.current || b.longest - a.longest).slice(0, 20);
}

export type { DrawingRecord, StreakRecord, PromptQueueItem };
