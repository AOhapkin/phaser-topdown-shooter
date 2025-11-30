import Phaser from 'phaser';
import { Player } from '../entities/Player';

import playerSvg from '../assets/player.svg?url';
import enemySvg from '../assets/enemy.svg?url';
import bulletSvg from '../assets/bullet.svg?url';

export class GameScene extends Phaser.Scene {
  private player!: Player;

  constructor() {
    super('GameScene');
  }

  preload() {
    // Загрузка SVG как текстур
    this.load.svg('player', playerSvg, { width: 32, height: 32 });
    this.load.svg('enemy', enemySvg, { width: 28, height: 28 });
    this.load.svg('bullet', bulletSvg, { width: 8, height: 8 });
  }

  create() {
    const { width, height } = this.scale;

    // Игрок в центре
    this.player = new Player(this, width / 2, height / 2);

    // Ограничим игрока границами мира
    this.physics.world.setBounds(0, 0, width, height);
    this.player.setCollideWorldBounds(true);
  }

  update() {
    if (this.player) {
      this.player.update();
    }
  }
}

