import Phaser from "phaser";
import { Player } from "../entities/Player";
import { Bullet } from "../entities/Bullet";
import { Enemy, EnemyType } from "../entities/Enemy";
import { LootPickup, LootType } from "../entities/LootPickup";
import { Weapon } from "../weapons/Weapon";
import { BasicGun } from "../weapons/BasicGun";
import { LevelUpOverlay, LevelUpOption } from "../ui/LevelUpOverlay";

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
  { type: "fast", minLevel: 5, weight: 25 },
  { type: "heavy", minLevel: 7, weight: 20 },
];

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;


  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private healthText!: Phaser.GameObjects.Text;

  private level = 1;
  private xp = 0;
  private xpToNextLevel = 5;
  private xpText!: Phaser.GameObjects.Text;

  private ammoText!: Phaser.GameObjects.Text;
  private reloadProgressBarBg!: Phaser.GameObjects.Rectangle;
  private reloadProgressBar!: Phaser.GameObjects.Rectangle;

  private gameOver = false;
  private gameOverText?: Phaser.GameObjects.Text;
  private isStarted = false;
  private startOverlay?: Phaser.GameObjects.Rectangle;
  private startTitleText?: Phaser.GameObjects.Text;
  private startHintText?: Phaser.GameObjects.Text;
  private startHintTween?: Phaser.Tweens.Tween;
  private suppressShootingUntil = 0; // timestamp in ms (scene.time.now)
  private isLevelUpOpen = false;
  private debugEnabled = false;

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

    // Сбрасываем параметры сложности
    this.baseSpawnDelay = 1000;
    this.currentSpawnDelay = this.baseSpawnDelay;

    // Клавиша рестарта
    this.restartKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.R
    );

    // Переключатель debug (F1)
    const debugKey = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.F1
    );
    debugKey?.on("down", () => {
      this.debugEnabled = !this.debugEnabled;
      // Переключаем debug режим Arcade Physics
      const arcadeWorld = this.physics.world as Phaser.Physics.Arcade.World;
      if (arcadeWorld) {
        arcadeWorld.drawDebug = this.debugEnabled;
        arcadeWorld.debugGraphic?.clear();
      }
    });

    // Игрок
    this.player = new Player(this, width / 2, height / 2);

    this.physics.world.setBounds(0, 0, width, height);
    this.player.setCollideWorldBounds(true);

    // Группа пуль
    this.bullets = this.physics.add.group({
      classType: Bullet,
      runChildUpdate: false,
    });

    // Оружие: стартовый пистолет
    this.weapon = new BasicGun({});

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

    // UI: патроны и прогресс-бар перезарядки (слева внизу)
    const ammoY = height - 60;
    this.ammoText = this.add.text(16, ammoY, "Ammo: 6/6", {
      fontSize: "18px",
      color: "#ffffff",
    });
    this.ammoText.setScrollFactor(0);

    // Фон прогресс-бара
    this.reloadProgressBarBg = this.add.rectangle(
      16,
      ammoY + 25,
      200,
      8,
      0x333333,
      0.8
    );
    this.reloadProgressBarBg.setOrigin(0, 0);
    this.reloadProgressBarBg.setScrollFactor(0);
    this.reloadProgressBarBg.setVisible(false);

    // Сам прогресс-бар
    this.reloadProgressBar = this.add.rectangle(
      16,
      ammoY + 25,
      0,
      8,
      0xff6b6b
    );
    this.reloadProgressBar.setOrigin(0, 0);
    this.reloadProgressBar.setScrollFactor(0);
    this.reloadProgressBar.setVisible(false);

    // Стартовый экран: оверлей + title + мерцающий hint
    this.isStarted = false;

    this.startOverlay = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.94)
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(10000)
      .setInteractive({ useHandCursor: true });

    this.startTitleText = this.add
      .text(width / 2, height / 2 - 40, "SWARM RUN", {
        fontSize: "64px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(10001);

    this.startHintText = this.add
      .text(width / 2, height / 2 + 40, "Click to start", {
        fontSize: "28px",
        color: "#ffffff",
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(10001);

    // Мерцание hint
    this.startHintTween = this.tweens.add({
      targets: this.startHintText,
      alpha: 0.35,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Обработчик клика с stopPropagation
    this.startOverlay.on(
      "pointerdown",
      (
        _p: Phaser.Input.Pointer,
        _lx: number,
        _ly: number,
        event: any
      ) => {
        if (event?.stopPropagation) {
          event.stopPropagation();
        }
        this.startGameFromOverlay();
      }
    );
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

    if (this.isLevelUpOpen) {
      return;
    }

    if (this.player) {
      this.player.update();
    }

    this.handleShooting(time);
    this.updateAmmoUI(time);
  }

  // ЛКМ → выстрел в сторону курсора
  private handleShooting(time: number) {
    if (
      this.gameOver ||
      !this.player.isAlive() ||
      !this.isStarted ||
      this.isLevelUpOpen
    ) {
      return;
    }

    // Блокируем стрельбу на короткое время после старта
    if (this.time.now < this.suppressShootingUntil) {
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

    // Динамические веса: runner реже на высоких уровнях, tank/heavy чаще
    const configsWithWeights = availableConfigs.map((cfg) => {
      let weight = cfg.weight;

      // Runner становится реже на высоких уровнях
      if (cfg.type === "runner") {
        weight = Math.max(20, 70 - (this.level - 1) * 3);
      }

      // Tank становится чаще
      if (cfg.type === "tank") {
        weight = Math.min(50, 30 + (this.level - 3) * 3);
      }

      // Heavy становится чаще на высоких уровнях
      if (cfg.type === "heavy") {
        weight = Math.min(40, 20 + (this.level - 7) * 2);
      }

      return { ...cfg, weight };
    });

    const totalWeight = configsWithWeights.reduce(
      (sum, cfg) => sum + cfg.weight,
      0
    );
    if (totalWeight <= 0) {
      return;
    }

    let roll = Phaser.Math.Between(1, totalWeight);
    let chosen = configsWithWeights[0];

    for (const cfg of configsWithWeights) {
      if (roll <= cfg.weight) {
        chosen = cfg;
        break;
      }
      roll -= cfg.weight;
    }

    const enemy = new Enemy(
      this,
      x,
      y,
      this.player,
      chosen.type,
      this.level,
      this.enemies
    );
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

    // Визуальный фидбек до уничтожения пули
    enemy.applyHitFeedback(bullet.x, bullet.y, this.time.now);

    // Наносим урон
    const gun = this.weapon as BasicGun;
    const totalDamage = this.player.getDamage() + gun.getDamageBonus();
    const killed = enemy.takeDamage(totalDamage);

    // Пуля всегда исчезает при попадании
    bullet.destroy();

    if (killed) {
      this.score += 1;
      this.scoreText.setText(`Score: ${this.score}`);

      this.addXP(1);
      this.maybeDropLoot(enemy.x, enemy.y);
    }
  }

  // Враг коснулся игрока
  private handleEnemyHitPlayer(
    playerObj:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Tilemaps.Tile,
    enemyObj:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Tilemaps.Tile
  ) {
    const player = playerObj as Player;
    const enemy = enemyObj as Enemy;

    if (!player.isAlive()) {
      return;
    }

    // Если игрок неуязвим — просто игнорируем контакт
    if (player.isInvulnerable()) {
      return;
    }

    // 1) Наносим урон
    player.takeDamage(1);
    this.updateHealthText();

    // 2) Запускаем i-frames
    player.startInvulnerability(800); // 800ms — хороший старт

    // 3) Отбрасываем игрока
    const strength = enemy.getType() === "tank" ? 320 : 260; // Чуть сильнее от танка
    player.applyKnockback(enemy.x, enemy.y, strength, 140); // 140ms knockback

    // Врага НЕ уничтожаем!

    if (!player.isAlive()) {
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
      this.showLevelUpOverlay();
    }
  }

  private onLevelUp() {
    // Усложняем игру: немного уменьшаем задержку спавна врагов
    // но не опускаемся ниже 400 мс
    this.currentSpawnDelay = Math.max(400, this.currentSpawnDelay - 50);
    this.updateSpawnTimer();

    // Прокачка характеристик игрока
    this.player.onLevelUp(this.level);
  }

  private showLevelUpOverlay() {
    if (this.isLevelUpOpen) {
      return;
    }

    this.isLevelUpOpen = true;

    // Пауза игры
    this.physics.pause();
    this.time.timeScale = 0;

    const options: LevelUpOption[] = this.getAvailableLevelUpOptions();

    new LevelUpOverlay(this, options, () => {
      // Закрыли overlay — продолжаем игру
      this.isLevelUpOpen = false;
      this.time.timeScale = 1;
      this.physics.resume();

      // ВАЖНО: сбросить состояние кнопки мыши,
      // чтобы удержание/клик не превратился в автоматический выстрел сразу после закрытия
      this.input.activePointer.isDown = false;
    });
  }

  private getAvailableLevelUpOptions(): LevelUpOption[] {
    const gun = this.weapon as BasicGun;
    const all: LevelUpOption[] = [];

    if (gun.canIncreaseDamage()) {
      all.push({
        title: "DAMAGE +1",
        description: "",
        apply: () => {
          gun.increaseDamage();
        },
      });
    }

    if (gun.canDecreaseFireRate(40)) {
      all.push({
        title: "FIRE RATE -40ms",
        description: "",
        apply: () => {
          gun.decreaseFireRate(40);
        },
      });
    }

    if (gun.canDecreaseReloadTime(150)) {
      all.push({
        title: "RELOAD -150ms",
        description: "",
        apply: () => {
          gun.decreaseReloadTime(150);
        },
      });
    }

    if (gun.canIncreaseMagazine(1)) {
      all.push({
        title: "MAGAZINE +1",
        description: "",
        apply: () => {
          gun.increaseMagazine(1);
        },
      });
    }

    // Если доступных улучшений меньше 3, возвращаем все доступные
    if (all.length === 0) {
      return [];
    }

    // Перемешиваем и берем 3 случайных
    Phaser.Utils.Array.Shuffle(all);
    return all.slice(0, 3);
  }


  private updateXPText() {
    this.xpText.setText(
      `LVL: ${this.level}  XP: ${this.xp}/${this.xpToNextLevel}`
    );
  }

  private updateAmmoUI(time: number) {
    if (!this.weapon || !(this.weapon instanceof BasicGun)) {
      return;
    }

    const gun = this.weapon as BasicGun;
    const ammo = gun.getAmmo();
    const magazineSize = gun.getMagazineSize();
    const isReloading = gun.getIsReloading();
    const reloadProgress = gun.getReloadProgress(time);

    // Обновляем текст патронов
    this.ammoText.setText(`Ammo: ${ammo}/${magazineSize}`);

    // Показываем/скрываем прогресс-бар перезарядки
    if (isReloading) {
      this.reloadProgressBarBg.setVisible(true);
      this.reloadProgressBar.setVisible(true);

      // Обновляем ширину прогресс-бара (0-200px)
      const barWidth = 200 * reloadProgress;
      this.reloadProgressBar.setSize(barWidth, 8);
    } else {
      this.reloadProgressBarBg.setVisible(false);
      this.reloadProgressBar.setVisible(false);
    }
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
    let lootType: LootType;

    // heal 60%, speed 40%
    if (roll < 0.6) {
      lootType = "heal";
    } else {
      lootType = "speed";
    }

    // Проверка: такого типа уже нет на поле
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
        this.player.applySpeedBoost(1.5, 4000); // x1.5 на 4 секунды
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

  private startGameFromOverlay() {
    if (this.isStarted || this.gameOver) {
      return;
    }

    // Важно: "съесть" клик, чтобы не было выстрела
    this.input.activePointer.isDown = false;

    // Блокируем стрельбу на короткое время после старта
    this.suppressShootingUntil = this.time.now + 200;

    this.isStarted = true;

    // Стартуем спавн и прочее
    this.updateSpawnTimer();

    // Выключаем мерцание
    if (this.startHintTween) {
      this.startHintTween.stop();
      this.startHintTween = undefined;
    }

    // Плавно скрываем overlay + тексты
    const targets: Phaser.GameObjects.GameObject[] = [];
    if (this.startOverlay) {
      targets.push(this.startOverlay);
    }
    if (this.startTitleText) {
      targets.push(this.startTitleText);
    }
    if (this.startHintText) {
      targets.push(this.startHintText);
    }

    this.tweens.add({
      targets,
      alpha: 0,
      duration: 220,
      ease: "Sine.easeInOut",
      onComplete: () => {
        if (this.startOverlay) {
          this.startOverlay.destroy();
          this.startOverlay = undefined;
        }
        if (this.startTitleText) {
          this.startTitleText.destroy();
          this.startTitleText = undefined;
        }
        if (this.startHintText) {
          this.startHintText.destroy();
          this.startHintText = undefined;
        }
      },
    });
  }
}
