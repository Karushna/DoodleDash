import { Hono } from 'hono';
import { redis, reddit } from '@devvit/web/server';
import type {
  ErrorResponse,
  GalleryDrawing,
  GalleryResponse,
  InitResponse,
  LeaderboardResponse,
  ReactResponse,
  ReactionType,
  SubmitDrawingRequest,
  SubmitDrawingResponse,
  SubmitPromptResponse,
} from '../../shared/api.js';
import { REACTION_TYPES } from '../../shared/api.js';
import {
  getDailyChallenge,
  getLeaderboard,
  getNewlyUnlockedColors,
  getOrCreateStreak,
  getUnlockedColors,
  registerUser,
  updateStreak,
  type DrawingRecord,
  type PromptQueueItem,
} from '../core/challenges.js';
import { keys, today } from '../core/redisKeys.js';

export const api = new Hono();

api.get('/init', async (c) => {
  try {
    const [challenge, username] = await Promise.all([
      getDailyChallenge(),
      reddit.getCurrentUsername(),
    ]);

    const user = username ?? 'anonymous';
    const date = today();

    const [drawingRaw, drawingsListRaw, streakData] = await Promise.all([
      redis.get(keys.drawing(date, user)),
      redis.get(keys.drawingsList(date)),
      getOrCreateStreak(user),
    ]);

    const drawingsList: string[] = drawingsListRaw ? (JSON.parse(drawingsListRaw) as string[]) : [];

    return c.json<InitResponse>({
      type: 'init',
      challenge: { prompt: challenge.prompt, date: challenge.date },
      hasDrawnToday: drawingRaw !== null,
      streak: { current: streakData.current, longest: streakData.longest },
      unlockedColors: getUnlockedColors(streakData),
      drawingCount: drawingsList.length,
    });
  } catch (error) {
    console.error('API init error:', error);
    return c.json<ErrorResponse>({ type: 'error', message: String(error) }, 500);
  }
});

api.post('/drawing/submit', async (c) => {
  try {
    const username = await reddit.getCurrentUsername();
    if (!username) return c.json<ErrorResponse>({ type: 'error', message: 'Not logged in' }, 401);

    const { strokes } = await c.req.json<SubmitDrawingRequest>();
    const date = today();

    const oldStreak = await getOrCreateStreak(username);
    const oldCount = oldStreak.current;

    const drawingRecord: DrawingRecord = {
      strokes,
      submittedAt: new Date().toISOString(),
      reactions: { fire: 0, laugh: 0, wow: 0, love: 0, art: 0 },
      username,
    };

    await redis.set(keys.drawing(date, username), JSON.stringify(drawingRecord));

    const listRaw = await redis.get(keys.drawingsList(date));
    const list: string[] = listRaw ? (JSON.parse(listRaw) as string[]) : [];
    if (!list.includes(username)) {
      list.push(username);
      await redis.set(keys.drawingsList(date), JSON.stringify(list));
    }

    const { streak: newStreakData } = await updateStreak(username);
    await registerUser(username);

    const newColors = getNewlyUnlockedColors(oldCount, newStreakData.current);

    return c.json<SubmitDrawingResponse>({
      type: 'submit_drawing',
      newStreak: newStreakData.current,
      newColors,
    });
  } catch (error) {
    console.error('API drawing/submit error:', error);
    return c.json<ErrorResponse>({ type: 'error', message: String(error) }, 500);
  }
});

api.get('/gallery', async (c) => {
  try {
    const username = (await reddit.getCurrentUsername()) ?? '';
    const date = today();

    const listRaw = await redis.get(keys.drawingsList(date));
    const list: string[] = listRaw ? (JSON.parse(listRaw) as string[]) : [];

    const emptyReactions = (): Record<ReactionType, number> =>
      ({ fire: 0, laugh: 0, wow: 0, love: 0, art: 0 });

    const drawings: GalleryDrawing[] = [];
    for (const user of list) {
      const raw = await redis.get(keys.drawing(date, user));
      if (!raw) continue;
      const record = JSON.parse(raw) as DrawingRecord;

      const reactions: Record<ReactionType, number> = record.reactions
        ? { ...emptyReactions(), ...record.reactions }
        : { ...emptyReactions(), love: record.votes ?? 0 };

      let myReaction: ReactionType | null = null;
      if (username) {
        const stored = await redis.get(keys.vote(date, user, username));
        if (stored && REACTION_TYPES.includes(stored as ReactionType)) {
          myReaction = stored as ReactionType;
        } else if (stored === '1') {
          myReaction = 'love';
        }
      }

      drawings.push({ username: user, strokes: record.strokes, reactions, myReaction });
    }

    drawings.sort((a, b) => {
      const sumA = Object.values(a.reactions).reduce((s, n) => s + n, 0);
      const sumB = Object.values(b.reactions).reduce((s, n) => s + n, 0);
      return sumB - sumA;
    });

    return c.json<GalleryResponse>({ type: 'gallery', drawings, date });
  } catch (error) {
    console.error('API gallery error:', error);
    return c.json<ErrorResponse>({ type: 'error', message: String(error) }, 500);
  }
});

api.post('/react', async (c) => {
  try {
    const voter = await reddit.getCurrentUsername();
    if (!voter) return c.json<ErrorResponse>({ type: 'error', message: 'Not logged in' }, 401);

    const { targetUsername, reactionType } = await c.req.json<{
      targetUsername: string;
      reactionType: ReactionType;
    }>();
    if (!targetUsername || !reactionType || !REACTION_TYPES.includes(reactionType)) {
      return c.json<ErrorResponse>({ type: 'error', message: 'Invalid request' }, 400);
    }

    const date = today();
    const voteKey = keys.vote(date, targetUsername, voter);
    const prevRaw = await redis.get(voteKey);

    const raw = await redis.get(keys.drawing(date, targetUsername));
    if (!raw) return c.json<ErrorResponse>({ type: 'error', message: 'Drawing not found' }, 404);

    const record = JSON.parse(raw) as DrawingRecord;

    if (!record.reactions) {
      record.reactions = { fire: 0, laugh: 0, wow: 0, love: record.votes ?? 0, art: 0 };
    }

    if (prevRaw === reactionType) {
      return c.json<ReactResponse>({ type: 'react', reactions: record.reactions as Record<ReactionType, number> });
    }

    if (prevRaw) {
      const prev = (REACTION_TYPES.includes(prevRaw as ReactionType) ? prevRaw : 'love') as ReactionType;
      record.reactions[prev] = Math.max(0, (record.reactions[prev] ?? 0) - 1);
    }

    record.reactions[reactionType] = (record.reactions[reactionType] ?? 0) + 1;

    await Promise.all([
      redis.set(voteKey, reactionType),
      redis.set(keys.drawing(date, targetUsername), JSON.stringify(record)),
    ]);

    return c.json<ReactResponse>({ type: 'react', reactions: record.reactions as Record<ReactionType, number> });
  } catch (error) {
    console.error('API react error:', error);
    return c.json<ErrorResponse>({ type: 'error', message: String(error) }, 500);
  }
});

api.get('/leaderboard', async (c) => {
  try {
    const username = (await reddit.getCurrentUsername()) ?? '';
    const entries = await getLeaderboard();
    const myRank = entries.findIndex((e) => e.username === username) + 1;

    return c.json<LeaderboardResponse>({
      type: 'leaderboard',
      streaks: entries,
      myRank,
    });
  } catch (error) {
    console.error('API leaderboard error:', error);
    return c.json<ErrorResponse>({ type: 'error', message: String(error) }, 500);
  }
});

api.post('/prompt/submit', async (c) => {
  try {
    const username = await reddit.getCurrentUsername();
    if (!username) return c.json<ErrorResponse>({ type: 'error', message: 'Not logged in' }, 401);

    const { prompt } = await c.req.json<{ prompt: string }>();
    const trimmed = typeof prompt === 'string' ? prompt.trim() : '';
    if (!trimmed || trimmed.length < 2 || trimmed.length > 80) {
      return c.json<ErrorResponse>({ type: 'error', message: 'Prompt must be 2–80 characters' }, 400);
    }

    const queueRaw = await redis.get(keys.challengeQueue());
    const queue: PromptQueueItem[] = queueRaw ? (JSON.parse(queueRaw) as PromptQueueItem[]) : [];
    queue.push({ prompt: trimmed, submittedBy: username, submittedAt: new Date().toISOString() });
    await redis.set(keys.challengeQueue(), JSON.stringify(queue));

    return c.json<SubmitPromptResponse>({ type: 'submit_prompt', queuePosition: queue.length });
  } catch (error) {
    console.error('API prompt/submit error:', error);
    return c.json<ErrorResponse>({ type: 'error', message: String(error) }, 500);
  }
});

// DEV: clears today's drawing record so you can draw again
api.delete('/drawing/reset', async (c) => {
  try {
    const username = await reddit.getCurrentUsername();
    if (!username) return c.json<ErrorResponse>({ type: 'error', message: 'Not logged in' }, 401);
    const date = today();
    await redis.del(keys.drawing(date, username));
    const listRaw = await redis.get(keys.drawingsList(date));
    const list: string[] = listRaw ? (JSON.parse(listRaw) as string[]) : [];
    const updated = list.filter((u) => u !== username);
    await redis.set(keys.drawingsList(date), JSON.stringify(updated));
    return c.json({ reset: true });
  } catch (error) {
    return c.json<ErrorResponse>({ type: 'error', message: String(error) }, 500);
  }
});
