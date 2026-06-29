import Phaser from 'phaser';
import type { Stroke } from '../../shared/api.js';

interface ResultsData {
  newStreak: number;
  newColors: string[];
  strokes: Stroke[];
  challenge: { prompt: string; date: string };
}

export class Results extends Phaser.Scene {
  private sceneData: ResultsData = { newStreak: 0, newColors: [], strokes: [], challenge: { prompt: '', date: '' } };

  constructor() {
    super('Results');
  }

  init(data: ResultsData): void {
    this.sceneData = data;
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    this.cameras.main.setBackgroundColor('#0f0f0f');

    // Title
    this.add.text(cx, height * 0.07, '🎉 Drawing Submitted!', {
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#ffffff',
      fontFamily: 'Arial Black, Arial',
    }).setOrigin(0.5);

    // Drawing preview
    const previewW = Math.min(width * 0.7, 300);
    const previewH = previewW * 0.75;
    const previewX = cx - previewW / 2;
    const previewY = height * 0.14;

    const previewBorder = this.add.graphics();
    previewBorder.lineStyle(2, 0x444444);
    previewBorder.strokeRect(previewX - 1, previewY - 1, previewW + 2, previewH + 2);

    // White preview background
    const previewGfx = this.add.graphics();
    previewGfx.fillStyle(0xffffff, 1);
    previewGfx.fillRect(previewX, previewY, previewW, previewH);

    // Draw strokes directly (no RenderTexture)
    const origW = this.scale.width;
    const origH = this.scale.height - 148; // Drawing scene canvas height (topH=48 + botH=100)
    const scaleX = previewW / origW;
    const scaleY = previewH / origH;

    for (const stroke of this.sceneData.strokes) {
      const hexColor = parseInt(stroke.color.replace('#', ''), 16);
      previewGfx.lineStyle(Math.max(1, stroke.size * Math.min(scaleX, scaleY)), hexColor, 1);
      for (let i = 1; i < stroke.points.length; i++) {
        previewGfx.beginPath();
        previewGfx.moveTo(previewX + stroke.points[i - 1]!.x * scaleX, previewY + stroke.points[i - 1]!.y * scaleY);
        previewGfx.lineTo(previewX + stroke.points[i]!.x * scaleX, previewY + stroke.points[i]!.y * scaleY);
        previewGfx.strokePath();
      }
    }

    let y = previewY + previewH + 16;

    // Streak
    if (this.sceneData.newStreak > 0) {
      this.add.text(cx, y, `🔥 ${this.sceneData.newStreak}-day streak!`, {
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#ffaa00',
        fontFamily: 'Arial',
      }).setOrigin(0.5);
      y += 30;
    }

    // New cosmetics
    if (this.sceneData.newColors.length > 0) {
      this.add.text(cx, y, '✨ New brush colors unlocked!', {
        fontSize: '14px',
        color: '#44cc44',
        fontFamily: 'Arial',
      }).setOrigin(0.5);
      y += 24;

      let swatchX = cx - (this.sceneData.newColors.length * 22) / 2;
      for (const color of this.sceneData.newColors) {
        const hexColor = parseInt(color.replace('#', ''), 16);
        const g = this.add.graphics();
        g.fillStyle(hexColor);
        g.fillRoundedRect(swatchX, y, 18, 18, 4);
        swatchX += 24;
      }
      y += 28;
    }

    y += 4;

    // Buttons
    const galleryBtn = this.add.text(cx, y, 'View Gallery', {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
      fontFamily: 'Arial',
      backgroundColor: '#2a2a2a',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    galleryBtn.on('pointerdown', () => this.scene.start('Gallery'));

    const hubBtn = this.add.text(cx, y + 50, 'Back to Hub', {
      fontSize: '14px',
      color: '#888888',
      fontFamily: 'Arial',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    hubBtn.on('pointerdown', () => this.scene.start('DailyHub'));
  }
}
