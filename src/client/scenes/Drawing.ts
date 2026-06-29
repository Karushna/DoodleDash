import Phaser from 'phaser';
import type { Stroke, SubmitDrawingResponse } from '../../shared/api.js';

const MAX_POINTS = 8000;
const TIMER_SECONDS = 300;

const SIZES: { label: string; size: number }[] = [
  { label: 'S', size: 3 },
  { label: 'M', size: 8 },
  { label: 'L', size: 16 },
];

const PALETTE = [
  '#000000', '#ffffff', '#888888',
  '#ff3333', '#ff8800', '#ffdd00',
  '#33cc44', '#3388ff', '#aa44ff',
  '#884422',
];

interface DrawingSceneData {
  challenge: { prompt: string; date: string };
  unlockedColors: string[];
}

export class Drawing extends Phaser.Scene {
  // Drawing state
  private strokes: Stroke[] = [];
  private currentPoints: { x: number; y: number }[] = [];
  private isDrawing = false;
  private lastX = 0;
  private lastY = 0;
  private brushColor = '#000000';
  private brushSize = 8;
  private isEraser = false;
  private totalPoints = 0;

  // Canvas bounds (world space)
  private canvasX = 0;
  private canvasY = 0;
  private canvasW = 0;
  private canvasH = 0;

  // Phaser objects
  private canvasGfx!: Phaser.GameObjects.Graphics;
  private selGfx!: Phaser.GameObjects.Graphics;
  private timerText!: Phaser.GameObjects.Text;
  private timerEvent!: Phaser.Time.TimerEvent;

  // Scene data
  private secondsLeft = TIMER_SECONDS;
  private challenge: DrawingSceneData['challenge'] = { prompt: '', date: '' };
  private palette: string[] = [...PALETTE];
  private submitted = false;

  // Tool UI refs (for live highlight without restart)
  private swatchArcs: { obj: Phaser.GameObjects.Arc; color: string }[] = [];
  private sizeBtns = new Map<number, Phaser.GameObjects.Text>();
  private pencilBtn!: Phaser.GameObjects.Text;
  private eraserBtn!: Phaser.GameObjects.Text;

  constructor() {
    super('Drawing');
  }

  init(data: DrawingSceneData): void {
    this.challenge = data.challenge ?? { prompt: 'a mystery', date: '' };
    const extras = (data.unlockedColors ?? []).filter((c) => !PALETTE.includes(c));
    this.palette = [...PALETTE, ...extras];
    this.strokes = [];
    this.currentPoints = [];
    this.isDrawing = false;
    this.totalPoints = 0;
    this.secondsLeft = TIMER_SECONDS;
    this.submitted = false;
    this.brushColor = '#000000';
    this.brushSize = 8;
    this.isEraser = false;
    this.swatchArcs = [];
    this.sizeBtns = new Map();
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#1a1a1a');

    const topH = 48;
    const botH = 90;

    this.canvasX = 0;
    this.canvasY = topH;
    this.canvasW = width;
    this.canvasH = height - topH - botH;

    // White canvas background (Rectangle behind the drawing graphics)
    this.add.rectangle(
      this.canvasX + this.canvasW / 2,
      this.canvasY + this.canvasH / 2,
      this.canvasW,
      this.canvasH,
      0xffffff,
    );

    // Graphics object redrawn every frame in update()
    this.canvasGfx = this.add.graphics();

    this.buildTopBar(topH, width);
    this.buildBottomBar(height, botH, width);

    // Selection ring overlay (on top of everything)
    this.selGfx = this.add.graphics();
    this.refreshUI();

    this.setupInput();
    this.startTimer();
  }

  // ── Phaser update loop — redraws all strokes every frame ─────────────────

  override update(): void {
    this.canvasGfx.clear();

    for (const stroke of this.strokes) {
      this.renderStroke(stroke);
    }

    // Live preview of the stroke currently being drawn
    if (this.isDrawing && this.currentPoints.length > 1) {
      const color = this.isEraser ? '#ffffff' : this.brushColor;
      this.renderStroke({ points: this.currentPoints, color, size: this.brushSize });
    }
  }

  private renderStroke(stroke: Stroke): void {
    const hex = parseInt(stroke.color.replace('#', ''), 16);
    this.canvasGfx.lineStyle(stroke.size, hex, 1);
    for (let i = 1; i < stroke.points.length; i++) {
      const p0 = stroke.points[i - 1]!;
      const p1 = stroke.points[i]!;
      this.canvasGfx.beginPath();
      this.canvasGfx.moveTo(this.canvasX + p0.x, this.canvasY + p0.y);
      this.canvasGfx.lineTo(this.canvasX + p1.x, this.canvasY + p1.y);
      this.canvasGfx.strokePath();
    }
  }

  // ── Top bar ───────────────────────────────────────────────────────────────

  private buildTopBar(h: number, width: number): void {
    const bg = this.add.graphics();
    bg.fillStyle(0x0f0f0f);
    bg.fillRect(0, 0, width, h);

    this.add.text(12, h / 2, `Draw: ${this.challenge.prompt}`, {
      fontSize: '13px',
      color: '#dddddd',
      fontFamily: 'Arial',
      wordWrap: { width: width - 80 },
    }).setOrigin(0, 0.5);

    this.timerText = this.add.text(width - 12, h / 2, '5:00', {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffaa00',
      fontFamily: 'Arial',
    }).setOrigin(1, 0.5);
  }

  // ── Bottom toolbar ────────────────────────────────────────────────────────

  private buildBottomBar(height: number, barH: number, width: number): void {
    const barY = height - barH;

    const bg = this.add.graphics();
    bg.fillStyle(0x111111);
    bg.fillRect(0, barY, width, barH);
    bg.lineStyle(1, 0x333333);
    bg.beginPath();
    bg.moveTo(0, barY);
    bg.lineTo(width, barY);
    bg.strokePath();

    // ── Row 1: colour palette ─────────────────────────────────────────────
    const row1Y = barY + 22;
    const r = 13;
    const gap = 7;
    const totalPaletteW = this.palette.length * r * 2 + (this.palette.length - 1) * gap;
    let sx = Math.max(8, (width - totalPaletteW) / 2);

    this.swatchArcs = [];
    for (const color of this.palette) {
      const hex = parseInt(color.replace('#', ''), 16);
      const cx = sx + r;

      if (color === '#ffffff') {
        // Gray border so white swatch is visible
        this.add.arc(cx, row1Y, r + 1, 0, 360, false, 0x999999, 1);
      }
      const arc = this.add.arc(cx, row1Y, r, 0, 360, false, hex, 1);
      arc.setInteractive({ useHandCursor: true });
      const cap = color;
      arc.on('pointerdown', () => {
        this.brushColor = cap;
        this.isEraser = false;
        this.refreshUI();
      });
      this.swatchArcs.push({ obj: arc, color });
      sx += r * 2 + gap;
    }

    // ── Row 2: tools ──────────────────────────────────────────────────────
    const row2Y = barY + 65;
    let tx = 8;

    for (const { label, size } of SIZES) {
      const btn = this.add.text(tx, row2Y, label, {
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#ffffff',
        fontFamily: 'Arial',
        backgroundColor: '#333333',
        padding: { x: 10, y: 5 },
      }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => {
        this.brushSize = size;
        this.isEraser = false;
        this.refreshUI();
      });
      this.sizeBtns.set(size, btn);
      tx += btn.width + 4;
    }

    tx += 6;

    this.pencilBtn = this.add.text(tx, row2Y, '✏ Pencil', {
      fontSize: '13px',
      color: '#ffffff',
      fontFamily: 'Arial',
      backgroundColor: '#4488ff',
      padding: { x: 10, y: 5 },
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    this.pencilBtn.on('pointerdown', () => {
      this.isEraser = false;
      this.refreshUI();
    });
    tx += this.pencilBtn.width + 4;

    this.eraserBtn = this.add.text(tx, row2Y, '⬜ Erase', {
      fontSize: '13px',
      color: '#ffffff',
      fontFamily: 'Arial',
      backgroundColor: '#333333',
      padding: { x: 10, y: 5 },
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    this.eraserBtn.on('pointerdown', () => {
      this.isEraser = true;
      this.refreshUI();
    });
    tx += this.eraserBtn.width + 4;

    const undoBtn = this.add.text(tx, row2Y, '↩ Undo', {
      fontSize: '13px',
      color: '#cccccc',
      fontFamily: 'Arial',
      backgroundColor: '#222222',
      padding: { x: 10, y: 5 },
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    undoBtn.on('pointerdown', () => this.undoLastStroke());
    tx += undoBtn.width + 4;

    this.add.text(tx, row2Y, '🗑 Clear', {
      fontSize: '13px',
      color: '#ff6666',
      fontFamily: 'Arial',
      backgroundColor: '#2a0000',
      padding: { x: 10, y: 5 },
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.clearCanvas());

    this.add.text(width - 8, row2Y, 'Submit →', {
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#ffffff',
      fontFamily: 'Arial',
      backgroundColor: '#d93900',
      padding: { x: 12, y: 5 },
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { void this.submitDrawing(); });
  }

  // ── Tool highlight (no scene restart) ────────────────────────────────────

  private refreshUI(): void {
    for (const [size, btn] of this.sizeBtns) {
      btn.setBackgroundColor(size === this.brushSize && !this.isEraser ? '#4488ff' : '#333333');
    }
    this.pencilBtn?.setBackgroundColor(!this.isEraser ? '#4488ff' : '#333333');
    this.eraserBtn?.setBackgroundColor(this.isEraser ? '#4488ff' : '#333333');

    if (!this.selGfx) return;
    this.selGfx.clear();
    if (!this.isEraser) {
      for (const { obj, color } of this.swatchArcs) {
        if (color === this.brushColor) {
          this.selGfx.lineStyle(3, 0xffffff);
          this.selGfx.strokeCircle(obj.x, obj.y, 17);
          this.selGfx.lineStyle(1, 0x000000);
          this.selGfx.strokeCircle(obj.x, obj.y, 20);
          break;
        }
      }
    }
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private setupInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.inCanvas(p.x, p.y)) return;
      this.isDrawing = true;
      this.lastX = p.x - this.canvasX;
      this.lastY = p.y - this.canvasY;
      this.currentPoints = [{ x: this.lastX, y: this.lastY }];
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.isDrawing) return;
      if (this.totalPoints >= MAX_POINTS) return;

      const cx = p.x - this.canvasX;
      const cy = p.y - this.canvasY;

      // Clamp to canvas bounds
      const nx = Phaser.Math.Clamp(cx, 0, this.canvasW);
      const ny = Phaser.Math.Clamp(cy, 0, this.canvasH);

      this.currentPoints.push({ x: nx, y: ny });
      this.totalPoints++;
      this.lastX = nx;
      this.lastY = ny;
    });

    this.input.on('pointerup', () => {
      if (!this.isDrawing) return;
      this.isDrawing = false;
      if (this.currentPoints.length > 0) {
        const color = this.isEraser ? '#ffffff' : this.brushColor;
        this.strokes.push({ points: [...this.currentPoints], color, size: this.brushSize });
        this.currentPoints = [];
      }
    });
  }

  private inCanvas(x: number, y: number): boolean {
    return x >= this.canvasX && x <= this.canvasX + this.canvasW
        && y >= this.canvasY && y <= this.canvasY + this.canvasH;
  }

  // ── Drawing actions ───────────────────────────────────────────────────────

  private undoLastStroke(): void {
    if (this.strokes.length === 0) return;
    const removed = this.strokes.pop();
    if (removed) this.totalPoints -= removed.points.length;
  }

  private clearCanvas(): void {
    this.strokes = [];
    this.totalPoints = 0;
  }

  // ── Timer ─────────────────────────────────────────────────────────────────

  private startTimer(): void {
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        this.secondsLeft--;
        const m = Math.floor(this.secondsLeft / 60);
        const s = this.secondsLeft % 60;
        this.timerText.setText(`${m}:${s.toString().padStart(2, '0')}`);
        if (this.secondsLeft <= 30) this.timerText.setColor('#ff4444');
        if (this.secondsLeft <= 0) {
          this.timerEvent.destroy();
          void this.submitDrawing();
        }
      },
    });
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  private async submitDrawing(): Promise<void> {
    if (this.submitted) return;
    this.submitted = true;
    this.timerEvent?.destroy();

    try {
      const res = await fetch('/api/drawing/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strokes: this.strokes }),
      });
      const data = (await res.json()) as SubmitDrawingResponse;
      this.scene.start('Results', {
        newStreak: data.newStreak,
        newColors: data.newColors,
        strokes: this.strokes,
        challenge: this.challenge,
      });
    } catch {
      this.submitted = false;
      this.add.text(this.scale.width / 2, this.scale.height - 100, 'Submit failed — try again', {
        fontSize: '14px',
        color: '#ff4444',
        fontFamily: 'Arial',
      }).setOrigin(0.5);
    }
  }
}
