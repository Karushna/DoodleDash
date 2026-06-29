import { Hono } from 'hono';
import { redis, reddit } from '@devvit/web/server';
import type {
  ErrorResponse,
  GalleryDrawing,
  GalleryResponse,
  InitResponse,
  LeaderboardResponse,
  SubmitDrawingRequest,
  SubmitDrawingResponse,
  SubmitPromptResponse,
  VoteResponse,
} from '../../shared/api.js';
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
      votes: 0,
      username,
    };

    // Save drawing
    await redis.set(keys.drawing(date, username), JSON.stringify(drawingRecord));

    // Update drawings list
    const listRaw = await redis.get(keys.drawingsList(date));
    const list: string[] = listRaw ? (JSON.parse(listRaw) as string[]) : [];
    if (!list.includes(username)) {
      list.push(username);
      await redis.set(keys.drawingsList(date), JSON.stringify(list));
    }

    // Update streak + register user for leaderboard
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

    const drawings: GalleryDrawing[] = [];
    for (const user of list) {
      const raw = await redis.get(keys.drawing(date, user));
      if (!raw) continue;
      const record = JSON.parse(raw) as DrawingRecord;
      const voteKey = keys.vote(date, user, username);
      const hasVoted = username ? (await redis.get(voteKey)) === '1' : false;
      drawings.push({
        username: user,
        strokes: record.strokes,
        votes: record.votes,
        hasVoted,
      });
    }

    // Sort by votes descending
    drawings.sort((a, b) => b.votes - a.votes);

    return c.json<GalleryResponse>({ type: 'gallery', drawings, date });
  } catch (error) {
    console.error('API gallery error:', error);
    return c.json<ErrorResponse>({ type: 'error', message: String(error) }, 500);
  }
});

api.post('/vote', async (c) => {
  try {
    const voter = await reddit.getCurrentUsername();
    if (!voter) return c.json<ErrorResponse>({ type: 'error', message: 'Not logged in' }, 401);

    const { targetUsername } = await c.req.json<{ targetUsername: string }>();
    if (!targetUsername) return c.json<ErrorResponse>({ type: 'error', message: 'Missing targetUsername' }, 400);

    const date = today();
    const voteKey = keys.vote(date, targetUsername, voter);

    // Prevent double vote
    const alreadyVoted = await redis.get(voteKey);
    if (alreadyVoted) {
      const raw = await redis.get(keys.drawing(date, targetUsername));
      const record = raw ? (JSON.parse(raw) as DrawingRecord) : { votes: 0 };
      return c.json<VoteResponse>({ type: 'vote', newVotes: record.votes });
    }

    // Mark vote
    await redis.set(voteKey, '1');

    // Increment votes on drawing
    const raw = await redis.get(keys.drawing(date, targetUsername));
    if (!raw) return c.json<ErrorResponse>({ type: 'error', message: 'Drawing not found' }, 404);

    const record = JSON.parse(raw) as DrawingRecord;
    record.votes += 1;
    await redis.set(keys.drawing(date, targetUsername), JSON.stringify(record));

    return c.json<VoteResponse>({ type: 'vote', newVotes: record.votes });
  } catch (error) {
    console.error('API vote error:', error);
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
