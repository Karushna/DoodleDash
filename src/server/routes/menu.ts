import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context, reddit } from '@devvit/web/server';
import { createPost } from '../core/post.js';
import { keys } from '../core/redisKeys.js';
import { redis } from '@devvit/web/server';
import type { PromptQueueItem } from '../core/challenges.js';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    const post = await createPost();
    return c.json<UiResponse>(
      { navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}` },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>({ showToast: 'Failed to create post' }, 400);
  }
});

menu.post('/prompt-form', async (c) => {
  try {
    const body = await c.req.json<{ prompt?: string }>();
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const username = (await reddit.getCurrentUsername()) ?? 'moderator';

    if (!prompt || prompt.length < 2 || prompt.length > 80) {
      return c.json<UiResponse>({ showToast: 'Prompt must be 2–80 characters.' }, 200);
    }

    const queueRaw = await redis.get(keys.challengeQueue());
    const queue: PromptQueueItem[] = queueRaw ? (JSON.parse(queueRaw) as PromptQueueItem[]) : [];
    queue.push({ prompt, submittedBy: username, submittedAt: new Date().toISOString() });
    await redis.set(keys.challengeQueue(), JSON.stringify(queue));

    return c.json<UiResponse>({ showToast: `Queued prompt #${queue.length}: "${prompt}"` }, 200);
  } catch (error) {
    console.error('Error queuing prompt:', error);
    return c.json<UiResponse>({ showToast: 'Failed to queue prompt' }, 400);
  }
});
