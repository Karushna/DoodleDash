import { Boot } from './scenes/Boot.js';
import { Preloader } from './scenes/Preloader.js';
import { DailyHub } from './scenes/DailyHub.js';
import { Drawing } from './scenes/Drawing.js';
import { Results } from './scenes/Results.js';
import { Gallery } from './scenes/Gallery.js';
import { Leaderboard } from './scenes/Leaderboard.js';
import * as Phaser from 'phaser';
import { AUTO, Game } from 'phaser';

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  parent: 'game-container',
  backgroundColor: '#0f0f0f',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1024,
    height: 768,
  },
  scene: [Boot, Preloader, DailyHub, Drawing, Results, Gallery, Leaderboard],
};

const StartGame = (parent: string) => {
  return new Game({ ...config, parent });
};

document.addEventListener('DOMContentLoaded', () => {
  StartGame('game-container');
});
