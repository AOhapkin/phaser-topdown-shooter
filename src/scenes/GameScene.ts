import Phaser from "phaser";
import { Player } from "../entities/Player";
import { Bullet } from "../entities/Bullet";
import { Enemy, EnemyType } from "../entities/Enemy";
import { LootPickup, LootType } from "../entities/LootPickup";
import { Weapon } from "../weapons/Weapon";
import { BasicGun } from "../weapons/BasicGun";

import playerSvg from "../assets/player.svg?url";
import enemySvg from "../assets/enemy.svg?url";
import bulletSvg from "../assets/bullet.svg?url";
import healSvg from "../assets/heal.svg?url";
import speedSvg from "../assets/speed.svg?url";

type EnemyConfig = {
  type: EnemyType;
  minLevel: number;
  weight: number;
};

const ENEMY_CONFIGS: EnemyConfig[] = [
  { type: "runner", minLevel: 1, weight: 70 },
  { type: "tank", minLevel: 3, weight: 30 },
];

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;

  private fireRate = 150; // мс между выстрелами
  private bulletCount = 1;
  private bulletSpread = 0.15;

  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private healthText!: Phaser.GameObjects.Text;

  private level = 1;
  private xp = 0;
  private xpToNextLevel = 5;
  private xpText!: Phaser.GameObjects.Text;

  private gameOver = false;
  private gameOverText?: Phaser.GameObjects.Text;
  private isStarted = false;
  private startText?: Phaser.GameObjects.Text;
  private startOverlay?: Phaser.GameObjects.Rectangle;

  private baseSpawnDelay = 1000;
  private currentSpawnDelay = 1000;
  private spawnEvent?: Phaser.Time.TimerEvent;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private loot!: Phaser.Physics.Arcade.Group;
  private weapon!: Weapon;

  constructor() {
    super("GameScene");
  }

  preload() {
    this.load.image("player", playerSvg);
    this.load.image("enemy", enemySvg);
    this.load.image("bullet", bulletSvg);
    this.load.image("loot-heal", healSvg);
    this.load.image("loot-speed", speedSvg);
  }

  create() {
    const { width, height } = this.scale;

    // Резюмим физику и сбрасываем флаг gameOver при каждом старте/рестарте сцены
    this.physics.resume();
    this.gameOver = false;
    this.isStarted = false;

    // Сбрасываем параметры сложности / стрельбы
    this.fireRate = 150;
    this.bulletCount = 1;
    this.bulletSpread = 0.15;
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

    // Оружие
    this.weapon = new BasicGun({
      fireRate: this.fireRate,
      bulletCount: this.bulletCount,
      bulletSpread: this.bulletSpread,
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

    this.loot = this.physics.add.group({
      classType: LootPickup,
      runChildUpdate: false,
    });

    this.physics.add.overlap(
      this.player,
      this.loot,
      this
        .handlePlayerPickupLoot as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
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

    // Стартовый экран: оверлей + текст
    this.startOverlay = this.add.rectangle(
      width / 2,
      height / 2,
      width,
      height,
      0x000000,
      0.85
    );
    this.startOverlay.setOrigin(0.5, 0.5);
    this.startOverlay.setScrollFactor(0);
    this.startOverlay.setDepth(100);
    this.startOverlay.setInteractive();

    this.startText = this.add.text(width / 2, height / 2, "Click to start", {
      fontSize: "32px",
      color: "#ffffff",
      align: "center",
    });
    this.startText.setOrigin(0.5, 0.5);
    this.startText.setDepth(101);

    this.startOverlay.once("pointerdown", () => {
      this.startGame();
    });
  }

  update(time: number) {
    if (this.gameOver) {
      if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
        this.scene.restart();
      }
      return;
    }

    if (!this.isStarted) {
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
    this.weapon.tryFire({
      scene: this,
      player: this.player,
      bullets: this.bullets,
      pointer,
      time,
    });
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

    const availableConfigs = ENEMY_CONFIGS.filter(
      (cfg) => cfg.minLevel <= this.level
    );
    if (availableConfigs.length === 0) {
      return;
    }

    const totalWeight = availableConfigs.reduce(
      (sum, cfg) => sum + cfg.weight,
      0
    );
    let roll = Phaser.Math.Between(1, totalWeight);
    let chosen = availableConfigs[0];

    for (const cfg of availableConfigs) {
      if (roll <= cfg.weight) {
        chosen = cfg;
        break;
      }
      roll -= cfg.weight;
    }

    const enemy = new Enemy(this, x, y, this.player, chosen.type);
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

    const killed = enemy.takeDamage(this.player.getDamage());

    if (killed) {
      this.score += 1;
      this.scoreText.setText(`Score: ${this.score}`);

      this.addXP(1);
      this.maybeDropLoot(enemy.x, enemy.y);
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
    this.fireRate = Math.max(60, this.fireRate - 10);

    this.currentSpawnDelay = Math.max(300, this.currentSpawnDelay - 100);
    this.updateSpawnTimer();

    if (this.level >= 6) {
      this.bulletCount = 3;
      this.bulletSpread = 0.3;
    } else if (this.level >= 3) {
      this.bulletCount = 2;
      this.bulletSpread = 0.2;
    } else {
      this.bulletCount = 1;
      this.bulletSpread = 0.15;
    }

    if (this.weapon instanceof BasicGun) {
      this.weapon.setFireRate(this.fireRate);
      this.weapon.setPattern(this.bulletCount, this.bulletSpread);
    }

    this.player.onLevelUp(this.level);
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

  private maybeDropLoot(x: number, y: number) {
    const dropChance = 0.1;
    if (Math.random() > dropChance) {
      return;
    }

    const roll = Math.random();
    let lootType: LootType = "heal";

    if (roll < 0.5) {
      lootType = "heal";
    } else if (roll < 0.8) {
      lootType = "speed";
    } else {
      lootType = "armor";
    }

    if (this.hasLootOfType(lootType)) {
      return;
    }

    const loot = new LootPickup(this, x, y, lootType);
    this.loot.add(loot);
  }

  private hasLootOfType(type: LootType): boolean {
    const children = this.loot?.getChildren?.() ?? [];
    return children.some((obj) => {
      const loot = obj as LootPickup;
      return loot.lootType === type;
    });
  }

  private handlePlayerPickupLoot(
    _playerObj:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Tilemaps.Tile,
    lootObj:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Tilemaps.Tile
  ) {
    const loot = lootObj as LootPickup;

    switch (loot.lootType) {
      case "heal":
        this.player.applyHeal(1);
        this.updateHealthText();
        break;
      case "speed":
        this.player.applySpeedBoost(1.5, 4000);
        break;
      case "armor":
        this.player.applyArmor(4000);
        break;
    }

    loot.destroy();
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

  private startGame() {
    if (this.isStarted || this.gameOver) {
      return;
    }

    this.isStarted = true;

    this.updateSpawnTimer();

    const targets: Phaser.GameObjects.GameObject[] = [];

    if (this.startOverlay) {
      targets.push(this.startOverlay);
    }
    if (this.startText) {
      targets.push(this.startText);
    }

    if (targets.length > 0) {
      this.tweens.add({
        targets,
        alpha: 0,
        duration: 400,
        ease: "Sine.easeInOut",
        onComplete: () => {
          if (this.startOverlay) {
            this.startOverlay.destroy();
            this.startOverlay = undefined;
          }
          if (this.startText) {
            this.startText.destroy();
            this.startText = undefined;
          }
        },
      });
    }
  }
}
