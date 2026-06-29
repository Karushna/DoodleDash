import { Scene } from 'phaser';

export class Preloader extends Scene {
  constructor() {
    super('Preloader');
  }

  init(): void {
    this.add.image(512, 384, 'background');
    this.add.rectangle(512, 384, 468, 32).setStrokeStyle(1, 0x333333);
    const bar = this.add.rectangle(512 - 230, 384, 4, 28, 0x4488ff);
    this.load.on('progress', (progress: number) => {
      bar.width = 4 + 460 * progress;
    });
  }

  preload(): void {
    this.load.setPath('../assets');
    // bg.png is loaded in Boot; no additional assets needed here
  }

  create(): void {
    // Determine which scene to start based on splash page signal
    const targetScene = sessionStorage.getItem('doodledash_scene');
    if (targetScene === 'gallery') {
      sessionStorage.removeItem('doodledash_scene');
      this.scene.start('Gallery');
    } else {
      sessionStorage.removeItem('doodledash_scene');
      this.scene.start('DailyHub');
    }
  }
}
