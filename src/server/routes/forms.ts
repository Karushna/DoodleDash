import { Hono } from 'hono';
import { redis } from '@devvit/web/server';
import type { UiResponse } from '@devvit/web/shared';
import { keys } from '../core/redisKeys.js';
import type { PromptQueueItem } from '../core/challenges.js';

type PromptFormValues = {
  prompt?: string;
  submittedBy?: string;
};

export const forms = new Hono();

forms.post('/prompt-submit', async (c) => {
  const { prompt, submittedBy } = await c.req.json<PromptFormValues>();
  const trimmed = typeof prompt === 'string' ? prompt.trim() : '';

  if (!trimmed || trimmed.length < 2 || trimmed.length > 80) {
    return c.json<UiResponse>({ showToast: 'Prompt must be between 2 and 80 characters.' }, 200);
  }

  const queueRaw = await redis.get(keys.challengeQueue());
  const queue: PromptQueueItem[] = queueRaw ? (JSON.parse(queueRaw) as PromptQueueItem[]) : [];
  queue.push({ prompt: trimmed, submittedBy: submittedBy ?? 'moderator', submittedAt: new Date().toISOString() });
  await redis.set(keys.challengeQueue(), JSON.stringify(queue));

  return c.json<UiResponse>({ showToast: `Prompt queued at position #${queue.length}: "${trimmed}"` }, 200);
});
