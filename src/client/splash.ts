import { requestExpandedMode } from '@devvit/web/client';
import type { InitResponse, SubmitPromptResponse } from '../shared/api.js';

const promptEl = document.getElementById('challenge-prompt') as HTMLDivElement;
const streakBadge = document.getElementById('streak-badge') as HTMLDivElement;
const streakCount = document.getElementById('streak-count') as HTMLSpanElement;
const drawingCountEl = document.getElementById('drawing-count') as HTMLDivElement;
const drawBtn = document.getElementById('draw-btn') as HTMLButtonElement;
const galleryBtn = document.getElementById('gallery-btn') as HTMLButtonElement;
const submitLink = document.getElementById('submit-prompt-link') as HTMLDivElement;
const promptForm = document.getElementById('prompt-form') as HTMLDivElement;
const promptInput = document.getElementById('prompt-input') as HTMLInputElement;
const promptSubmitBtn = document.getElementById('prompt-submit-btn') as HTMLButtonElement;
const promptMsg = document.getElementById('prompt-msg') as HTMLDivElement;

async function init(): Promise<void> {
  try {
    const res = await fetch('/api/init');
    const data = (await res.json()) as InitResponse;

    promptEl.textContent = data.challenge.prompt;

    if (data.streak.current > 0) {
      streakBadge.style.display = 'inline-flex';
      streakCount.textContent = String(data.streak.current);
    }

    if (data.drawingCount > 0) {
      drawingCountEl.textContent = `${data.drawingCount} drawing${data.drawingCount === 1 ? '' : 's'} submitted today`;
    }

  } catch {
    promptEl.textContent = 'Could not load challenge';
  }
}

drawBtn.addEventListener('click', (e) => {
  sessionStorage.setItem('doodledash_scene', 'draw');
  requestExpandedMode(e, 'game');
});

galleryBtn.addEventListener('click', (e) => {
  sessionStorage.setItem('doodledash_scene', 'gallery');
  requestExpandedMode(e, 'game');
});

submitLink.addEventListener('click', () => {
  const isVisible = promptForm.style.display !== 'none';
  promptForm.style.display = isVisible ? 'none' : 'flex';
  if (!isVisible) promptInput.focus();
});

promptSubmitBtn.addEventListener('click', async () => {
  const prompt = promptInput.value.trim();
  if (!prompt) { promptMsg.textContent = 'Please enter a prompt.'; return; }
  if (prompt.length < 2 || prompt.length > 80) {
    promptMsg.textContent = 'Prompt must be 2–80 characters.';
    return;
  }

  promptSubmitBtn.disabled = true;
  promptMsg.textContent = 'Submitting…';

  try {
    const res = await fetch('/api/prompt/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    const data = (await res.json()) as SubmitPromptResponse;
    promptMsg.textContent = `Queued at position #${data.queuePosition}! Thanks 🎉`;
    promptInput.value = '';
  } catch {
    promptMsg.textContent = 'Failed to submit. Try again.';
  } finally {
    promptSubmitBtn.disabled = false;
  }
});

void init();
