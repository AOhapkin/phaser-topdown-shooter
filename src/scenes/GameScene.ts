import Phaser from "phaser";
import { Player } from "../entities/Player";
import { Bullet } from "../entities/Bullet";
import { Enemy, EnemyType } from "../entities/Enemy";

import playerSvg from "../assets/player.svg?url";
import enemySvg from "../assets/enemy.svg?url";
import bulletSvg from "../assets/bullet.svg?url";

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;

  private lastShotTime = 0;
  private fireRate = 150; // мс между выстрелами

  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private healthText!: Phaser.GameObjects.Text;

  private level = 1;
  private xp = 0;
  private xpToNextLevel = 5;
  private xpText!: Phaser.GameObjects.Text;

  private gameOver = false;
  private gameOverText?: Phaser.GameObjects.Text;

  private baseSpawnDelay = 1000;
  private currentSpawnDelay = 1000;
  private spawnEvent?: Phaser.Time.TimerEvent;
  private restartKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super("GameScene");
  }

  preload() {
    this.load.svg("player", playerSvg, { width: 32, height: 32 });
    this.load.svg("enemy", enemySvg, { width: 28, height: 28 });
    this.load.svg("bullet", bulletSvg, { width: 8, height: 8 });
  }

  create() {
    const { width, height } = this.scale;

    // Резюмим физику и сбрасываем флаг gameOver при каждом старте/рестарте сцены
    this.physics.resume();
    this.gameOver = false;

    // Сбрасываем параметры сложности / стрельбы
    this.fireRate = 150;
    this.baseSpawnDelay = 1000;
    this.currentSpawnDelay = this.baseSpawnDelay;

    // Клавиша рестарта
    this.restartKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.R
    );

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
      this
        .handleBulletHitEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );

    this.physics.add.overlap(
      this.player,
      this.enemies,
      this
        .handleEnemyHitPlayer as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );

    // UI: score и здоровье
    this.score = 0;
    this.scoreText = this.add.text(16, 16, "Score: 0", {
      fontSize: "18px",
      color: "#ffffff",
    });

    this.healthText = this.add.text(width - 16, 16, "", {
      fontSize: "18px",
      color: "#ffffff",
    });
    this.healthText.setOrigin(1, 0);
    this.updateHealthText();

    // XP / уровень
    this.level = 1;
    this.xp = 0;
    this.xpToNextLevel = 5;

    this.xpText = this.add.text(16, 40, "", {
      fontSize: "16px",
      color: "#ffffff",
    });
    this.updateXPText();

    // Таймер спавна врагов
    this.updateSpawnTimer();
  }

  update(time: number) {
    if (this.gameOver) {
      if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
        this.scene.restart();
      }
      return;
    }

    if (this.player) {
      this.player.update();
    }

    this.handleShooting(time);
  }

  // ЛКМ → выстрел в сторону курсора
  private handleShooting(time: number) {
    if (this.gameOver || !this.player.isAlive()) {
      return;
    }

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
    if (this.gameOver || !this.player.isAlive()) {
      return;
    }

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

    const roll = Phaser.Math.Between(1, 100);
    const type: EnemyType = roll <= 70 ? "runner" : "tank";

    const enemy = new Enemy(this, x, y, this.player, type);
    this.enemies.add(enemy);
  }

  // Пуля попала во врага
  private handleBulletHitEnemy(
    bulletObj:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Tilemaps.Tile,
    enemyObj:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Tilemaps.Tile
  ) {
    const bullet = bulletObj as Bullet;
    const enemy = enemyObj as Enemy;

    bullet.destroy();

    const killed = enemy.takeDamage(1);

    if (killed) {
      this.score += 1;
      this.scoreText.setText(`Score: ${this.score}`);

      this.addXP(1);
    }
  }

  // Враг коснулся игрока
  private handleEnemyHitPlayer(
    _playerObj:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Tilemaps.Tile,
    enemyObj:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Tilemaps.Tile
  ) {
    const enemy = enemyObj as Enemy;
    enemy.destroy();

    this.player.takeDamage(1);
    this.updateHealthText();

    if (!this.player.isAlive()) {
      this.handleGameOver();
    }
  }

  private updateHealthText() {
    const hp = this.player?.getHealth?.() ?? 0;
    const maxHp = this.player?.getMaxHealth?.() ?? 0;
    this.healthText.setText(`HP: ${hp}/${maxHp}`);
  }

  private addXP(amount: number) {
    this.xp += amount;
    this.checkLevelUp();
    this.updateXPText();
  }

  private checkLevelUp() {
    while (this.xp >= this.xpToNextLevel) {
      this.xp -= this.xpToNextLevel;
      this.level += 1;

      this.xpToNextLevel = Math.floor(this.xpToNextLevel * 1.5);

      this.onLevelUp();
    }
  }

  private onLevelUp() {
    // Бафф игрока: уменьшаем задержку между выстрелами
    this.fireRate = Math.max(60, this.fireRate - 10);

    // Усложняем игру: уменьшаем задержку спавна врагов
    this.currentSpawnDelay = Math.max(300, this.currentSpawnDelay - 100);
    this.updateSpawnTimer();
  }

  private updateXPText() {
    this.xpText.setText(
      `LVL: ${this.level}  XP: ${this.xp}/${this.xpToNextLevel}`
    );
  }

  private updateSpawnTimer() {
    if (this.gameOver) {
      return;
    }

    if (this.spawnEvent) {
      this.spawnEvent.remove(false);
    }

    this.spawnEvent = this.time.addEvent({
      delay: this.currentSpawnDelay,
      loop: true,
      callback: this.spawnEnemy,
      callbackScope: this,
    });
  }

  private handleGameOver() {
    if (this.gameOver) {
      return;
    }

    this.gameOver = true;

    if (this.spawnEvent) {
      this.spawnEvent.remove(false);
    }

    this.physics.pause();

    const { width, height } = this.scale;

    this.gameOverText = this.add.text(
      width / 2,
      height / 2,
      "GAME OVER\nPress R to restart",
      {
        fontSize: "32px",
        color: "#ff5555",
        align: "center",
      }
    );
    this.gameOverText.setOrigin(0.5, 0.5);
  }
}
