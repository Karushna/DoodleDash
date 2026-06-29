import Phaser from 'phaser';
import type { GalleryDrawing, GalleryResponse, Stroke, VoteResponse } from '../../shared/api.js';

const THUMB_W = 140;
const THUMB_H = 105;
const COLS = 2;
const GAP = 12;

export class Gallery extends Phaser.Scene {
  private drawings: GalleryDrawing[] = [];
  private scrollContainer!: Phaser.GameObjects.Container;
  private scrollY = 0;
  private maxScroll = 0;
  private isDragging = false;
  private dragStartY = 0;
  private dragScrollY = 0;

  constructor() {
    super('Gallery');
  }

  async create(): Promise<void> {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0f0f0f');

    // Header
    const hdrBg = this.add.graphics();
    hdrBg.fillStyle(0x111111);
    hdrBg.fillRect(0, 0, width, 48);

    this.add.text(width / 2, 24, "Today's Gallery", {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffffff',
      fontFamily: 'Arial',
    }).setOrigin(0.5);

    const backBtn = this.add.text(12, 24, '← Back', {
      fontSize: '13px',
      color: '#4488ff',
      fontFamily: 'Arial',
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    backBtn.on('pointerdown', () => this.scene.start('DailyHub'));

    const loadingText = this.add.text(width / 2, height / 2, 'Loading drawings…', {
      fontSize: '16px',
      color: '#888888',
      fontFamily: 'Arial',
    }).setOrigin(0.5);

    try {
      const res = await fetch('/api/gallery');
      const data = (await res.json()) as GalleryResponse;
      this.drawings = data.drawings;
    } catch {
      loadingText.setText('Failed to load gallery.');
      return;
    }

    loadingText.destroy();

    if (this.drawings.length === 0) {
      this.add.text(width / 2, height / 2, 'No drawings yet today.\nBe the first to draw! 🎨', {
        fontSize: '16px',
        color: '#888888',
        fontFamily: 'Arial',
        align: 'center',
      }).setOrigin(0.5);
      return;
    }

    this.buildGrid(width, height);
  }

  private buildGrid(width: number, height: number): void {
    const topPad = 56;
    const sidePad = (width - COLS * THUMB_W - (COLS - 1) * GAP) / 2;

    this.scrollContainer = this.add.container(0, 0);

    const rows = Math.ceil(this.drawings.length / COLS);
    const totalH = rows * (THUMB_H + 60 + GAP);

    this.drawings.forEach((drawing, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = sidePad + col * (THUMB_W + GAP);
      const y = topPad + row * (THUMB_H + 60 + GAP);

      this.addDrawingCard(drawing, x, y);
    });

    this.maxScroll = Math.max(0, totalH + topPad - height + 60);
    this.setupScroll(height);
  }

  private addDrawingCard(drawing: GalleryDrawing, x: number, y: number): void {
    // White thumbnail background
    const bg = this.add.graphics();
    bg.fillStyle(0xffffff, 1);
    bg.fillRect(x, y, THUMB_W, THUMB_H);

    // Draw strokes directly (no RenderTexture)
    const drawGfx = this.renderStrokesToGfx(drawing.strokes, x, y, THUMB_W, THUMB_H);

    // Username
    const nameText = this.add.text(x + THUMB_W / 2, y + THUMB_H + 4, `u/${drawing.username}`, {
      fontSize: '11px',
      color: '#cccccc',
      fontFamily: 'Arial',
    }).setOrigin(0.5, 0);

    // Vote count
    const voteText = this.add.text(x + THUMB_W / 2 - 14, y + THUMB_H + 20, `${drawing.votes}`, {
      fontSize: '13px',
      color: '#ffffff',
      fontFamily: 'Arial',
    }).setOrigin(0.5, 0);

    // Vote heart button
    const heartColor = drawing.hasVoted ? '#ff4444' : '#666666';
    const heartBtn = this.add.text(x + THUMB_W / 2 + 8, y + THUMB_H + 20, '♥', {
      fontSize: '14px',
      color: heartColor,
      fontFamily: 'Arial',
    }).setOrigin(0, 0).setInteractive({ useHandCursor: true });

    heartBtn.on('pointerdown', async () => {
      if (drawing.hasVoted) return;
      drawing.hasVoted = true;
      heartBtn.setColor('#ff4444');
      try {
        const res = await fetch('/api/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUsername: drawing.username }),
        });
        const data = (await res.json()) as VoteResponse;
        drawing.votes = data.newVotes;
        voteText.setText(`${data.newVotes}`);
      } catch {
        drawing.hasVoted = false;
        heartBtn.setColor('#666666');
      }
    });

    this.scrollContainer.add([bg, drawGfx, nameText, voteText, heartBtn]);
  }

  private renderStrokesToGfx(strokes: Stroke[], ox: number, oy: number, w: number, h: number): Phaser.GameObjects.Graphics {
    // Original canvas size matches Drawing scene: full width, height minus top(48)+bottom(90)
    const origW = this.scale.width;
    const origH = this.scale.height - 138;
    const sx = w / origW;
    const sy = h / origH;
    const gfx = this.add.graphics();

    for (const stroke of strokes) {
      const hex = parseInt(stroke.color.replace('#', ''), 16);
      gfx.lineStyle(Math.max(1, stroke.size * Math.min(sx, sy)), hex, 1);
      for (let i = 1; i < stroke.points.length; i++) {
        gfx.beginPath();
        gfx.moveTo(ox + stroke.points[i - 1]!.x * sx, oy + stroke.points[i - 1]!.y * sy);
        gfx.lineTo(ox + stroke.points[i]!.x * sx, oy + stroke.points[i]!.y * sy);
        gfx.strokePath();
      }
    }
    return gfx;
  }

  private setupScroll(_height: number): void {
    const topY = 48;
    this.cameras.main.setScroll(0, 0);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y < topY) return;
      this.isDragging = true;
      this.dragStartY = p.y;
      this.dragScrollY = this.scrollY;
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.isDragging) return;
      const delta = this.dragStartY - p.y;
      this.scrollY = Phaser.Math.Clamp(this.dragScrollY + delta, 0, this.maxScroll);
      this.scrollContainer.setY(-this.scrollY);
    });

    this.input.on('pointerup', () => { this.isDragging = false; });

    this.input.on('wheel', (_p: Phaser.Input.Pointer, _gos: unknown, _dx: number, dy: number) => {
      this.scrollY = Phaser.Math.Clamp(this.scrollY + dy, 0, this.maxScroll);
      this.scrollContainer.setY(-this.scrollY);
    });
  }
}
