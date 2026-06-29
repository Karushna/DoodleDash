export type Stroke = {
  points: { x: number; y: number }[];
  color: string;
  size: number;
};

export type InitResponse = {
  type: 'init';
  challenge: { prompt: string; date: string };
  hasDrawnToday: boolean;
  streak: { current: number; longest: number };
  unlockedColors: string[];
  drawingCount: number;
};

export type SubmitDrawingRequest = {
  strokes: Stroke[];
};

export type SubmitDrawingResponse = {
  type: 'submit_drawing';
  newStreak: number;
  newColors: string[];
};

export type ReactionType = 'fire' | 'laugh' | 'wow' | 'love' | 'art';

export const REACTION_EMOJIS: Record<ReactionType, string> = {
  fire: '🔥',
  laugh: '😂',
  wow: '😮',
  love: '❤️',
  art: '🎨',
};

export const REACTION_TYPES: ReactionType[] = ['fire', 'laugh', 'wow', 'love', 'art'];

export type GalleryDrawing = {
  username: string;
  strokes: Stroke[];
  reactions: Record<ReactionType, number>;
  myReaction: ReactionType | null;
};

export type GalleryResponse = {
  type: 'gallery';
  drawings: GalleryDrawing[];
  date: string;
};

export type ReactResponse = {
  type: 'react';
  reactions: Record<ReactionType, number>;
};

export type LeaderboardEntry = {
  username: string;
  current: number;
  longest: number;
};

export type LeaderboardResponse = {
  type: 'leaderboard';
  streaks: LeaderboardEntry[];
  myRank: number;
};

export type SubmitPromptResponse = {
  type: 'submit_prompt';
  queuePosition: number;
};

export type ErrorResponse = { type: 'error'; message: string };
