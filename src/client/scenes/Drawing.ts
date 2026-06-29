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

type ToolMode = 'pencil' | 'eraser' | 'fill' | 'rect' | 'circle' | 'line';

interface DrawingSceneData {
  challenge: { prompt: string; date: string };
  unlockedColors: string[];
}

export class Drawing extends Phaser.Scene {
  // Drawing state
  private strokes: Stroke[] = [];
  private currentPoints: { x: number; y: number }[] = [];
  private isDrawing = false;
  private brushColor = '#000000';
  private brushSize = 8;
  private toolMode: ToolMode = 'pencil';
  private totalPoints = 0;
  private shapeStart: { x: number; y: number } | null = null;
  private pointerX = 0;
  private pointerY = 0;

  // Canvas bounds
  private canvasX = 0;
  private canvasY = 0;
  private canvasW = 0;
  private canvasH = 0;

  // Phaser objects
  private canvasGfx!: Phaser.GameObjects.Graphics;
  private previewGfx!: Phaser.GameObjects.Graphics;
  private selGfx!: Phaser.GameObjects.Graphics;
  private timerText!: Phaser.GameObjects.Text;
  private timerEvent!: Phaser.Time.TimerEvent;

  // Scene data
  private secondsLeft = TIMER_SECONDS;
  private challenge: DrawingSceneData['challenge'] = { prompt: '', date: '' };
  private palette: string[] = [...PALETTE];
  private submitted = false;

  // UI refs
  private swatchArcs: { obj: Phaser.GameObjects.Arc; color: string }[] = [];
  private sizeBtns = new Map<number, Phaser.GameObjects.Text>();
  private toolBtns = new Map<ToolMode, Phaser.GameObjects.Text>();

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
    this.toolMode = 'pencil';
    this.shapeStart = null;
    this.swatchArcs = [];
    this.sizeBtns = new Map();
    this.toolBtns = new Map();
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#1a1a1a');

    const topH = 48;
    const botH = 100;

    this.canvasX = 0;
    this.canvasY = topH;
    this.canvasW = width;
    this.canvasH = height - topH - botH;

    // White canvas background
    this.add.rectangle(
      this.canvasX + this.canvasW / 2,
      this.canvasY + this.canvasH / 2,
      this.canvasW,
      this.canvasH,
      0xffffff,
    );

    this.canvasGfx = this.add.graphics();
    this.previewGfx = this.add.graphics();

    this.buildTopBar(topH, width);
    this.buildBottomBar(height, botH, width);

    this.selGfx = this.add.graphics();
    this.refreshUI();

    this.setupInput();
    this.startTimer();
  }

  override update(): void {
    this.canvasGfx.clear();
    for (const stroke of this.strokes) {
      this.renderStroke(this.canvasGfx, stroke);
    }
    if (this.isDrawing && this.currentPoints.length > 1) {
      const color = this.toolMode === 'eraser' ? '#ffffff' : this.brushColor;
      this.renderStroke(this.canvasGfx, { points: this.currentPoints, color, size: this.brushSize });
    }

    // Shape live preview
    this.previewGfx.clear();
    if (this.shapeStart !== null && (this.toolMode === 'rect' || this.toolMode === 'circle' || this.toolMode === 'line')) {
      const endX = Phaser.Math.Clamp(this.pointerX, 0, this.canvasW);
      const endY = Phaser.Math.Clamp(this.pointerY, 0, this.canvasH);
      const preview = this.buildShapeStroke(this.toolMode, this.shapeStart, { x: endX, y: endY });
      const hex = parseInt(preview.color.replace('#', ''), 16);
      this.previewGfx.lineStyle(preview.size, hex, 0.65);
      const pts = preview.points;
      if (pts.length > 0) {
        this.previewGfx.beginPath();
        this.previewGfx.moveTo(this.canvasX + pts[0]!.x, this.canvasY + pts[0]!.y);
        for (let i = 1; i < pts.length; i++) {
          this.previewGfx.lineTo(this.canvasX + pts[i]!.x, this.canvasY + pts[i]!.y);
        }
        this.previewGfx.strokePath();
      }
    }
  }

  private renderStroke(gfx: Phaser.GameObjects.Graphics, stroke: Stroke): void {
    const hex = parseInt(stroke.color.replace('#', ''), 16);
    gfx.lineStyle(stroke.size, hex, 1);
    for (let i = 1; i < stroke.points.length; i++) {
      const p0 = stroke.points[i - 1]!;
      const p1 = stroke.points[i]!;
      gfx.beginPath();
      gfx.moveTo(this.canvasX + p0.x, this.canvasY + p0.y);
      gfx.lineTo(this.canvasX + p1.x, this.canvasY + p1.y);
      gfx.strokePath();
    }
  }

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

    // Row 1: colour palette (y+18)
    const row1Y = barY + 18;
    const r = 12;
    const gap = 6;
    const totalPaletteW = this.palette.length * r * 2 + (this.palette.length - 1) * gap;
    let sx = Math.max(8, (width - totalPaletteW) / 2);

    this.swatchArcs = [];
    for (const color of this.palette) {
      const hex = parseInt(color.replace('#', ''), 16);
      const cx = sx + r;
      if (color === '#ffffff') {
        this.add.arc(cx, row1Y, r + 1, 0, 360, false, 0x999999, 1);
      }
      const arc = this.add.arc(cx, row1Y, r, 0, 360, false, hex, 1);
      arc.setInteractive({ useHandCursor: true });
      const cap = color;
      arc.on('pointerdown', () => {
        this.brushColor = cap;
        this.toolMode = 'pencil';
        this.refreshUI();
      });
      this.swatchArcs.push({ obj: arc, color });
      sx += r * 2 + gap;
    }

    // Row 2: Size buttons + Pencil / Eraser / Fill (y+48)
    const row2Y = barY + 48;
    let tx = 8;

    for (const { label, size } of SIZES) {
      const btn = this.makeBtn(tx, row2Y, label, '#333333');
      btn.on('pointerdown', () => {
        this.brushSize = size;
        if (this.toolMode !== 'pencil' && this.toolMode !== 'eraser') this.toolMode = 'pencil';
        this.refreshUI();
      });
      this.sizeBtns.set(size, btn);
      tx += btn.width + 4;
    }

    tx += 4;

    const pencilBtn = this.makeBtn(tx, row2Y, '✏ Pen', '#4488ff');
    pencilBtn.on('pointerdown', () => { this.toolMode = 'pencil'; this.refreshUI(); });
    this.toolBtns.set('pencil', pencilBtn);
    tx += pencilBtn.width + 4;

    const eraseBtn = this.makeBtn(tx, row2Y, '⬜ Erase', '#333333');
    eraseBtn.on('pointerdown', () => { this.toolMode = 'eraser'; this.refreshUI(); });
    this.toolBtns.set('eraser', eraseBtn);
    tx += eraseBtn.width + 4;

    const fillBtn = this.makeBtn(tx, row2Y, '🪣 Fill', '#333333');
    fillBtn.on('pointerdown', () => { this.toolMode = 'fill'; this.refreshUI(); });
    this.toolBtns.set('fill', fillBtn);

    // Row 3: Shape tools + Undo + Clear + Submit (y+80)
    const row3Y = barY + 80;
    let tx3 = 8;

    const rectBtn = this.makeBtn(tx3, row3Y, '▭ Rect', '#333333');
    rectBtn.on('pointerdown', () => { this.toolMode = 'rect'; this.refreshUI(); });
    this.toolBtns.set('rect', rectBtn);
    tx3 += rectBtn.width + 4;

    const circBtn = this.makeBtn(tx3, row3Y, '○ Circ', '#333333');
    circBtn.on('pointerdown', () => { this.toolMode = 'circle'; this.refreshUI(); });
    this.toolBtns.set('circle', circBtn);
    tx3 += circBtn.width + 4;

    const lineBtn = this.makeBtn(tx3, row3Y, '╱ Line', '#333333');
    lineBtn.on('pointerdown', () => { this.toolMode = 'line'; this.refreshUI(); });
    this.toolBtns.set('line', lineBtn);
    tx3 += lineBtn.width + 8;

    const undoBtn = this.makeBtn(tx3, row3Y, '↩ Undo', '#222222', '#cccccc');
    undoBtn.on('pointerdown', () => this.undoLastStroke());
    tx3 += undoBtn.width + 4;

    this.makeBtn(tx3, row3Y, '🗑 Clear', '#2a0000', '#ff6666')
      .on('pointerdown', () => this.clearCanvas());

    this.makeBtn(width - 8, row3Y, 'Submit →', '#d93900', '#ffffff', 1)
      .on('pointerdown', () => { void this.submitDrawing(); });
  }

  private makeBtn(
    x: number, y: number, label: string,
    bgColor: string, color = '#ffffff', originX = 0,
  ): Phaser.GameObjects.Text {
    return this.add.text(x, y, label, {
      fontSize: '12px',
      color,
      fontFamily: 'Arial',
      backgroundColor: bgColor,
      padding: { x: 8, y: 4 },
    }).setOrigin(originX, 0.5).setInteractive({ useHandCursor: true });
  }

  private refreshUI(): void {
    for (const [mode, btn] of this.toolBtns) {
      btn.setBackgroundColor(mode === this.toolMode ? '#4488ff' : '#333333');
    }
    for (const [size, btn] of this.sizeBtns) {
      const active = size === this.brushSize && (this.toolMode === 'pencil' || this.toolMode === 'eraser');
      btn.setBackgroundColor(active ? '#4488ff' : '#333333');
    }
    if (!this.selGfx) return;
    this.selGfx.clear();
    if (this.toolMode !== 'eraser') {
      for (const { obj, color } of this.swatchArcs) {
        if (color === this.brushColor) {
          this.selGfx.lineStyle(3, 0xffffff);
          this.selGfx.strokeCircle(obj.x, obj.y, 16);
          this.selGfx.lineStyle(1, 0x000000);
          this.selGfx.strokeCircle(obj.x, obj.y, 19);
          break;
        }
      }
    }
  }

  private setupInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.inCanvas(p.x, p.y)) return;
      const cx = Phaser.Math.Clamp(p.x - this.canvasX, 0, this.canvasW);
      const cy = Phaser.Math.Clamp(p.y - this.canvasY, 0, this.canvasH);

      if (this.toolMode === 'fill') {
        this.doFill(cx, cy);
        return;
      }

      if (this.toolMode === 'rect' || this.toolMode === 'circle' || this.toolMode === 'line') {
        this.shapeStart = { x: cx, y: cy };
        return;
      }

      this.isDrawing = true;
      this.currentPoints = [{ x: cx, y: cy }];
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.pointerX = p.x - this.canvasX;
      this.pointerY = p.y - this.canvasY;

      if (!this.isDrawing) return;
      if (this.totalPoints >= MAX_POINTS) return;

      const nx = Phaser.Math.Clamp(this.pointerX, 0, this.canvasW);
      const ny = Phaser.Math.Clamp(this.pointerY, 0, this.canvasH);
      this.currentPoints.push({ x: nx, y: ny });
      this.totalPoints++;
    });

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.toolMode === 'rect' || this.toolMode === 'circle' || this.toolMode === 'line') {
        if (this.shapeStart) {
          const endX = Phaser.Math.Clamp(p.x - this.canvasX, 0, this.canvasW);
          const endY = Phaser.Math.Clamp(p.y - this.canvasY, 0, this.canvasH);
          const stroke = this.buildShapeStroke(this.toolMode, this.shapeStart, { x: endX, y: endY });
          this.strokes.push(stroke);
          this.totalPoints += stroke.points.length;
          this.shapeStart = null;
          this.previewGfx.clear();
        }
        return;
      }

      if (!this.isDrawing) return;
      this.isDrawing = false;
      if (this.currentPoints.length > 0) {
        const color = this.toolMode === 'eraser' ? '#ffffff' : this.brushColor;
        this.strokes.push({ points: [...this.currentPoints], color, size: this.brushSize });
        this.currentPoints = [];
      }
    });
  }

  private inCanvas(x: number, y: number): boolean {
    return x >= this.canvasX && x <= this.canvasX + this.canvasW
        && y >= this.canvasY && y <= this.canvasY + this.canvasH;
  }

  // ── Fill bucket ────────────────────────────────────────────────────────────

  private doFill(cx: number, cy: number): void {
    const W = Math.floor(this.canvasW);
    const H = Math.floor(this.canvasH);

    const offscreen = document.createElement('canvas');
    offscreen.width = W;
    offscreen.height = H;
    const ctx = offscreen.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    for (const stroke of this.strokes) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const pts = stroke.points;
      if (pts.length === 0) continue;
      ctx.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
      ctx.stroke();
    }

    const px = Math.max(0, Math.min(Math.floor(cx), W - 1));
    const py = Math.max(0, Math.min(Math.floor(cy), H - 1));
    const imgData = ctx.getImageData(0, 0, W, H);
    const { data } = imgData;

    const i0 = (py * W + px) * 4;
    const tr = data[i0]!;
    const tg = data[i0 + 1]!;
    const tb = data[i0 + 2]!;

    const fillHex = this.brushColor.replace('#', '');
    const fr = parseInt(fillHex.slice(0, 2), 16);
    const fg = parseInt(fillHex.slice(2, 4), 16);
    const fb = parseInt(fillHex.slice(4, 6), 16);

    if (Math.abs(tr - fr) <= 5 && Math.abs(tg - fg) <= 5 && Math.abs(tb - fb) <= 5) return;

    const tolerance = 30;
    const visited = new Uint8Array(W * H);
    const queue: number[] = [py * W + px];
    visited[py * W + px] = 1;
    const rowMap = new Map<number, number[]>();

    while (queue.length > 0) {
      const pos = queue.pop()!;
      const qx = pos % W;
      const qy = Math.floor(pos / W);
      const row = rowMap.get(qy);
      if (row) row.push(qx); else rowMap.set(qy, [qx]);

      const neighbors: [number, number][] = [
        [qx - 1, qy], [qx + 1, qy], [qx, qy - 1], [qx, qy + 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const npos = ny * W + nx;
        if (visited[npos]) continue;
        visited[npos] = 1;
        const ni = npos * 4;
        if (
          Math.abs(data[ni]! - tr) <= tolerance &&
          Math.abs(data[ni + 1]! - tg) <= tolerance &&
          Math.abs(data[ni + 2]! - tb) <= tolerance
        ) {
          queue.push(npos);
        }
      }
    }

    // Compress filled pixels into horizontal scanline strokes
    const newStrokes: Stroke[] = [];
    for (const [ry, xs] of rowMap) {
      xs.sort((a, b) => a - b);
      let start = xs[0]!;
      let prev = xs[0]!;
      for (let i = 1; i <= xs.length; i++) {
        const cur = xs[i];
        if (cur === undefined || cur > prev + 1) {
          newStrokes.push({
            points: [{ x: start, y: ry }, { x: prev, y: ry }],
            color: this.brushColor,
            size: 2,
          });
          if (cur !== undefined) { start = cur; prev = cur; }
        } else {
          prev = cur;
        }
      }
    }

    this.strokes.push(...newStrokes);
    this.totalPoints += newStrokes.reduce((s, st) => s + st.points.length, 0);
  }

  // ── Shape tool ─────────────────────────────────────────────────────────────

  private buildShapeStroke(
    mode: 'rect' | 'circle' | 'line',
    start: { x: number; y: number },
    end: { x: number; y: number },
  ): Stroke {
    const color = this.brushColor;
    const size = this.brushSize;

    if (mode === 'line') {
      return { points: [start, end], color, size };
    }

    if (mode === 'rect') {
      return {
        points: [
          { x: start.x, y: start.y },
          { x: end.x, y: start.y },
          { x: end.x, y: end.y },
          { x: start.x, y: end.y },
          { x: start.x, y: start.y },
        ],
        color,
        size,
      };
    }

    // Circle: centre = midpoint, radius = half diagonal
    const cxc = (start.x + end.x) / 2;
    const cyc = (start.y + end.y) / 2;
    const radius = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2) / 2;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= 36; i++) {
      const angle = (i / 36) * Math.PI * 2;
      pts.push({ x: cxc + radius * Math.cos(angle), y: cyc + radius * Math.sin(angle) });
    }
    return { points: pts, color, size };
  }

  // ── Drawing actions ────────────────────────────────────────────────────────

  private undoLastStroke(): void {
    if (this.strokes.length === 0) return;
    const removed = this.strokes.pop();
    if (removed) this.totalPoints -= removed.points.length;
  }

  private clearCanvas(): void {
    this.strokes = [];
    this.totalPoints = 0;
  }

  // ── Timer ──────────────────────────────────────────────────────────────────

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

  // ── Submit ─────────────────────────────────────────────────────────────────

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
      this.add.text(this.scale.width / 2, this.scale.height - 120, 'Submit failed — try again', {
        fontSize: '14px',
        color: '#ff4444',
        fontFamily: 'Arial',
      }).setOrigin(0.5);
    }
  }
}
