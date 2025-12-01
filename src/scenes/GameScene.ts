import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { Bullet } from '../entities/Bullet';
import { Enemy } from '../entities/Enemy';

import playerSvg from '../assets/player.svg?url';
import enemySvg from '../assets/enemy.svg?url';
import bulletSvg from '../assets/bullet.svg?url';

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;

  private lastShotTime = 0;
  private fireRate = 150; // мс между выстрелами

  constructor() {
    super('GameScene');
  }

  preload() {
    this.load.svg('player', playerSvg, { width: 32, height: 32 });
    this.load.svg('enemy', enemySvg, { width: 28, height: 28 });
    this.load.svg('bullet', bulletSvg, { width: 8, height: 8 });
  }

  create() {
    const { width, height } = this.scale;

    // Игрок
    this.player = new Player(this, width / 2, height / 2);

    this.physics.world.setBounds(0, 0, width, height);
    this.player.setCollideWorldBounds(true);

    // Группа пуль
    this.bullets = this.physics.add.group({
      classType: Bullet,
      runChildUpdate: false,
    });

    // Группа врагов
    this.enemies = this.physics.add.group({
      classType: Enemy,
      runChildUpdate: true,
    });

    // Коллизии / пересечения
    this.physics.add.overlap(
      this.bullets,
      this.enemies,
      this.handleBulletHitEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );

    this.physics.add.overlap(
      this.player,
      this.enemies,
      this.handleEnemyHitPlayer as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );

    // Таймер спавна врагов
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: this.spawnEnemy,
      callbackScope: this,
    });
  }

  update(time: number) {
    if (this.player) {
      this.player.update();
    }

    this.handleShooting(time);
  }

  // ЛКМ → выстрел в сторону курсора
  private handleShooting(time: number) {
    const pointer = this.input.activePointer;

    if (!pointer.isDown) {
      return;
    }

    if (time < this.lastShotTime + this.fireRate) {
      return;
    }

    const bullet = new Bullet(this, this.player.x, this.player.y);
    this.bullets.add(bullet);

    const angle = Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      pointer.worldX,
      pointer.worldY
    );

    const speed = bullet.speed;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(vx, vy);
    body.setAllowGravity(false);

    this.lastShotTime = time;
  }

  // Спавн врага по краям экрана
  private spawnEnemy() {
    const { width, height } = this.scale;

    // Случайная сторона: 0 = сверху, 1 = снизу, 2 = слева, 3 = справа
    const side = Phaser.Math.Between(0, 3);
    let x = 0;
    let y = 0;

    switch (side) {
      case 0: // top
        x = Phaser.Math.Between(0, width);
        y = -20;
        break;
      case 1: // bottom
        x = Phaser.Math.Between(0, width);
        y = height + 20;
        break;
      case 2: // left
        x = -20;
        y = Phaser.Math.Between(0, height);
        break;
      case 3: // right
        x = width + 20;
        y = Phaser.Math.Between(0, height);
        break;
    }

    const enemy = new Enemy(this, x, y, this.player);
    this.enemies.add(enemy);
  }

  // Пуля попала во врага
  private handleBulletHitEnemy(
    bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    enemyObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    const bullet = bulletObj as Bullet;
    const enemy = enemyObj as Enemy;

    bullet.destroy();
    enemy.destroy();

    // Здесь потом добавим счет/XP
  }

  // Враг коснулся игрока
  private handleEnemyHitPlayer(
    _playerObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    enemyObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    const enemy = enemyObj as Enemy;
    enemy.destroy();

    console.log('Player hit by enemy!');
    // Потом добавим HP, экран смерти и т.п.
  }
}

