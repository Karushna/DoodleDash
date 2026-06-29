import Phaser from 'phaser';
import type { LeaderboardResponse } from '../../shared/api.js';

export class Leaderboard extends Phaser.Scene {
  constructor() {
    super('Leaderboard');
  }

  async create(): Promise<void> {
    const { width, height } = this.scale;
    const cx = width / 2;
    this.cameras.main.setBackgroundColor('#0f0f0f');

    // Header
    const hdrBg = this.add.graphics();
    hdrBg.fillStyle(0x111111);
    hdrBg.fillRect(0, 0, width, 48);

    this.add.text(cx, 24, '🏆 Leaderboard', {
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

    const loadingText = this.add.text(cx, height / 2, 'Loading…', {
      fontSize: '16px',
      color: '#888888',
      fontFamily: 'Arial',
    }).setOrigin(0.5);

    let data: LeaderboardResponse;
    try {
      const res = await fetch('/api/leaderboard');
      data = (await res.json()) as LeaderboardResponse;
    } catch {
      loadingText.setText('Failed to load leaderboard.');
      return;
    }

    loadingText.destroy();

    if (data.streaks.length === 0) {
      this.add.text(cx, height / 2, 'No players yet.\nStart drawing to get ranked! 🎨', {
        fontSize: '16px',
        color: '#888888',
        fontFamily: 'Arial',
        align: 'center',
      }).setOrigin(0.5);
      return;
    }

    // Column headers
    const topY = 58;
    const rowH = 44;
    const rankX = 20;
    const nameX = 56;
    const streakX = width - 80;
    const longestX = width - 20;

    this.add.text(rankX, topY, '#', { fontSize: '11px', color: '#666666', fontFamily: 'Arial' }).setOrigin(0, 0);
    this.add.text(nameX, topY, 'Player', { fontSize: '11px', color: '#666666', fontFamily: 'Arial' }).setOrigin(0, 0);
    this.add.text(streakX, topY, 'Streak', { fontSize: '11px', color: '#666666', fontFamily: 'Arial' }).setOrigin(0.5, 0);
    this.add.text(longestX, topY, 'Best', { fontSize: '11px', color: '#666666', fontFamily: 'Arial' }).setOrigin(1, 0);

    const sep = this.add.graphics();
    sep.lineStyle(1, 0x333333);
    sep.lineBetween(0, topY + 16, width, topY + 16);

    const rankColors: Record<number, string> = { 1: '#ffaa00', 2: '#aaaaaa', 3: '#cd7f32' };

    data.streaks.forEach((entry, i) => {
      const rank = i + 1;
      const y = topY + 20 + rank * rowH;
      const isMe = rank === data.myRank;

      // Highlight current user
      if (isMe) {
        const hl = this.add.graphics();
        hl.fillStyle(0x1a1a2e, 1);
        hl.fillRect(0, y - 4, width, rowH - 4);
      }

      const rankColor = rankColors[rank] ?? (isMe ? '#4488ff' : '#ffffff');

      this.add.text(rankX, y + rowH / 2 - 8, `${rank}`, {
        fontSize: '14px',
        fontStyle: 'bold',
        color: rankColor,
        fontFamily: 'Arial',
      });

      const medal = rank === 1 ? '🥇 ' : rank === 2 ? '🥈 ' : rank === 3 ? '🥉 ' : '';
      const nameLabel = isMe ? `${medal}${entry.username} (you)` : `${medal}${entry.username}`;
      this.add.text(nameX, y + rowH / 2 - 8, nameLabel, {
        fontSize: '14px',
        color: isMe ? '#4488ff' : '#ffffff',
        fontFamily: 'Arial',
        fontStyle: isMe ? 'bold' : 'normal',
      });

      this.add.text(streakX, y + rowH / 2 - 8, `🔥 ${entry.current}`, {
        fontSize: '14px',
        color: '#ffaa00',
        fontFamily: 'Arial',
      }).setOrigin(0.5, 0);

      this.add.text(longestX, y + rowH / 2 - 8, `${entry.longest}`, {
        fontSize: '13px',
        color: '#888888',
        fontFamily: 'Arial',
      }).setOrigin(1, 0);

      // Row separator
      const rowSep = this.add.graphics();
      rowSep.lineStyle(1, 0x222222);
      rowSep.lineBetween(0, y + rowH - 6, width, y + rowH - 6);
    });
  }
}
