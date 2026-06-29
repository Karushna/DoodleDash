import Phaser from 'phaser';
import { REACTION_EMOJIS, REACTION_TYPES } from '../../shared/api.js';
import type { GalleryDrawing, GalleryResponse, ReactResponse, Stroke } from '../../shared/api.js';

const THUMB_W = 140;
const THUMB_H = 105;
const COLS = 2;
const GAP = 12;
// Card slot height: thumbnail + username + reaction row + padding
const CARD_EXTRA = 70;

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
    const totalH = rows * (THUMB_H + CARD_EXTRA + GAP);

    this.drawings.forEach((drawing, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = sidePad + col * (THUMB_W + GAP);
      const y = topPad + row * (THUMB_H + CARD_EXTRA + GAP);
      this.addDrawingCard(drawing, x, y);
    });

    this.maxScroll = Math.max(0, totalH + topPad - height + 60);
    this.setupScroll(height);
  }

  private addDrawingCard(drawing: GalleryDrawing, x: number, y: number): void {
    const bg = this.add.graphics();
    bg.fillStyle(0xffffff, 1);
    bg.fillRect(x, y, THUMB_W, THUMB_H);

    const drawGfx = this.renderStrokesToGfx(drawing.strokes, x, y, THUMB_W, THUMB_H);

    const nameText = this.add.text(x + THUMB_W / 2, y + THUMB_H + 4, `u/${drawing.username}`, {
      fontSize: '11px',
      color: '#cccccc',
      fontFamily: 'Arial',
    }).setOrigin(0.5, 0);

    // Emoji reaction row
    const btnW = Math.floor(THUMB_W / REACTION_TYPES.length);
    const reactionY = y + THUMB_H + 22;

    for (let i = 0; i < REACTION_TYPES.length; i++) {
      const type = REACTION_TYPES[i]!;
      const emoji = REACTION_EMOJIS[type];
      const bx = x + i * btnW;

      const rbg = this.add.graphics();
      const countTxt = this.add.text(bx + btnW / 2, reactionY + 18, `${drawing.reactions[type] ?? 0}`, {
        fontSize: '9px',
        color: '#888888',
        fontFamily: 'Arial',
      }).setOrigin(0.5, 0);

      const updateBtn = () => {
        rbg.clear();
        if (drawing.myReaction === type) {
          rbg.fillStyle(0x1144cc, 1);
          rbg.fillRoundedRect(bx + 1, reactionY, btnW - 2, 30, 3);
          countTxt.setColor('#ffffff');
        } else {
          countTxt.setColor('#888888');
        }
        countTxt.setText(`${drawing.reactions[type] ?? 0}`);
      };
      updateBtn();

      const emojiTxt = this.add.text(bx + btnW / 2, reactionY + 3, emoji, {
        fontSize: '13px',
        fontFamily: 'Arial',
      }).setOrigin(0.5, 0);

      // Transparent hit area covering full button zone
      const hitArea = this.add
        .rectangle(bx + btnW / 2, reactionY + 15, btnW - 2, 30, 0x000000, 0)
        .setInteractive({ useHandCursor: true });

      hitArea.on('pointerdown', () => {
        void (async () => {
          const prev = drawing.myReaction;
          if (prev === type) return;

          drawing.myReaction = type;
          if (prev) {
            drawing.reactions[prev] = Math.max(0, (drawing.reactions[prev] ?? 0) - 1);
          }
          drawing.reactions[type] = (drawing.reactions[type] ?? 0) + 1;

          // Refresh all buttons on this card (update every button's bg + count)
          // We call updateBtn() via closure — each button stores its own updateBtn
          updateBtn();

          try {
            const res = await fetch('/api/react', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ targetUsername: drawing.username, reactionType: type }),
            });
            const data = (await res.json()) as ReactResponse;
            // Sync server counts back
            for (const rt of REACTION_TYPES) {
              drawing.reactions[rt] = data.reactions[rt] ?? 0;
            }
            updateBtn();
          } catch { /* leave optimistic update */ }
        })();
      });

      this.scrollContainer.add([rbg, emojiTxt, countTxt, hitArea]);
    }

    this.scrollContainer.add([bg, drawGfx, nameText]);
  }

  private renderStrokesToGfx(strokes: Stroke[], ox: number, oy: number, w: number, h: number): Phaser.GameObjects.Graphics {
    // Drawing scene canvas: full width, height minus topH(48) + botH(100)
    const origW = this.scale.width;
    const origH = this.scale.height - 148;
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
