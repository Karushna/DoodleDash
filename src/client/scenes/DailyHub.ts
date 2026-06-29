import Phaser from 'phaser';
import type { InitResponse } from '../../shared/api.js';

export class DailyHub extends Phaser.Scene {
  private initData: InitResponse | null = null;

  constructor() {
    super('DailyHub');
  }

  async create(): Promise<void> {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor('#0f0f0f');

    // Loading text
    const loading = this.add.text(width / 2, height / 2, 'Loading…', {
      fontSize: '20px',
      color: '#888888',
      fontFamily: 'Arial',
    }).setOrigin(0.5);

    try {
      const res = await fetch('/api/init');
      this.initData = (await res.json()) as InitResponse;
    } catch {
      loading.setText('Failed to load. Please refresh.');
      return;
    }

    loading.destroy();
    this.buildUI();
  }

  private buildUI(): void {
    const data = this.initData!;
    const { width, height } = this.scale;
    const cx = width / 2;

    // Title
    this.add.text(cx, height * 0.08, '🎨 Doodle Dash', {
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#ffffff',
      fontFamily: 'Arial Black, Arial',
    }).setOrigin(0.5);

    // Streak badge
    if (data.streak.current > 0) {
      this.add.text(cx, height * 0.16, `🔥 ${data.streak.current}-day streak`, {
        fontSize: '16px',
        color: '#ffaa00',
        fontFamily: 'Arial',
        backgroundColor: '#2a1a00',
        padding: { x: 12, y: 5 },
      }).setOrigin(0.5);
    }

    // Challenge box background
    const boxW = Math.min(width * 0.85, 400);
    const boxH = 90;
    const boxX = cx - boxW / 2;
    const boxY = height * 0.24;
    const boxGfx = this.add.graphics();
    boxGfx.fillStyle(0x1a1a2e);
    boxGfx.fillRoundedRect(boxX, boxY, boxW, boxH, 12);
    boxGfx.lineStyle(2, 0x4488ff);
    boxGfx.strokeRoundedRect(boxX, boxY, boxW, boxH, 12);

    this.add.text(cx, boxY + 16, "TODAY'S CHALLENGE", {
      fontSize: '10px',
      fontStyle: 'bold',
      color: '#4488ff',
      fontFamily: 'Arial',
      letterSpacing: 2,
    }).setOrigin(0.5);

    this.add.text(cx, boxY + 55, data.challenge.prompt, {
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffffff',
      fontFamily: 'Arial Black, Arial',
      wordWrap: { width: boxW - 24 },
    }).setOrigin(0.5);

    // Drawing count
    if (data.drawingCount > 0) {
      this.add.text(cx, height * 0.46, `${data.drawingCount} drawing${data.drawingCount === 1 ? '' : 's'} submitted today`, {
        fontSize: '13px',
        color: '#888888',
        fontFamily: 'Arial',
      }).setOrigin(0.5);
    }

    const btnY = height * 0.54;
    const btnSpacing = 56;

    // Draw button
    const drawBtn = this.makeButton(cx, btnY, 'Draw Today', 0xd93900);
    drawBtn.setInteractive({ useHandCursor: true });
    drawBtn.on('pointerdown', () => {
      this.scene.start('Drawing', { challenge: data.challenge, unlockedColors: data.unlockedColors });
    });

    // Gallery button
    const galleryBtn = this.makeButton(cx, btnY + btnSpacing, 'View Gallery', 0x222222, '#cccccc');
    galleryBtn.setInteractive({ useHandCursor: true });
    galleryBtn.on('pointerdown', () => this.scene.start('Gallery'));

    // Leaderboard button
    const lbBtn = this.makeButton(cx, btnY + btnSpacing * 2, 'Leaderboard', 0x222222, '#cccccc');
    lbBtn.setInteractive({ useHandCursor: true });
    lbBtn.on('pointerdown', () => this.scene.start('Leaderboard'));

    this.scale.on('resize', () => {
      this.scene.restart();
    });
  }

  private makeButton(x: number, y: number, label: string, bgColor: number, textColor = '#ffffff'): Phaser.GameObjects.Text {
    const btn = this.add.text(x, y, label, {
      fontSize: '16px',
      fontStyle: 'bold',
      color: textColor,
      fontFamily: 'Arial',
      backgroundColor: `#${bgColor.toString(16).padStart(6, '0')}`,
      padding: { x: 24, y: 10 },
    }).setOrigin(0.5);
    return btn;
  }
}
