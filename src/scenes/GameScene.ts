import Phaser from "phaser";
import { Player } from "../entities/Player";
import { Bullet } from "../entities/Bullet";
import { Enemy, EnemyType } from "../entities/Enemy";
import { LootPickup, LootType } from "../entities/LootPickup";
import { Weapon } from "../weapons/types";
import { BasicGun } from "../weapons/BasicGun";
import { Shotgun } from "../weapons/Shotgun";
import { LevelUpOverlay, LevelUpOption } from "../ui/LevelUpOverlay";

import playerSvg from "../assets/player.svg?url";
import enemySvg from "../assets/enemy.svg?url";
import bulletSvg from "../assets/bullet.svg?url";
import healSvg from "../assets/heal.svg?url";
import speedSvg from "../assets/speed.svg?url";

// EnemyConfig и ENEMY_CONFIGS больше не используются - теперь используем систему фаз
// type EnemyConfig = {
//   type: EnemyType;
//   minLevel: number;
//   weight: number;
// };
//
// const ENEMY_CONFIGS: EnemyConfig[] = [
//   { type: "runner", minLevel: 1, weight: 70 },
//   { type: "tank", minLevel: 3, weight: 30 },
//   { type: "fast", minLevel: 5, weight: 25 },
//   { type: "heavy", minLevel: 7, weight: 20 },
// ];

type PhaseSettings = {
  phase: number;
  durationSec: number;
  maxAliveEnemies: number;
  spawnDelayMs: number;
  weights: { runner: number; tank: number };
  tankCap: number;
};

const PHASE_DURATION_SEC = 45;
const MIN_SPAWN_DELAY_MS = 560;

type MatchStats = {
  startedAtMs: number;
  endedAtMs: number | null;

  score: number;
  level: number;
  phase: number;

  shotsFired: number; // реально выпущенные пули
  shotsHit: number; // попадания по врагам
  killsTotal: number;
  killsRunner: number;
  killsTank: number;

  damageTaken: number;
  healsPicked: number;
  speedPicked: number;

  weaponStart: string; // "PISTOL"
  weaponCurrent: string; // "PISTOL"/"SHOTGUN"
  weaponSwitches: number;
};

const PHASES: PhaseSettings[] = [
  {
    phase: 1,
    durationSec: PHASE_DURATION_SEC,
    maxAliveEnemies: 10,
    spawnDelayMs: 900,
    weights: { runner: 100, tank: 0 },
    tankCap: 0,
  },
  {
    phase: 2,
    durationSec: PHASE_DURATION_SEC,
    maxAliveEnemies: 12,
    spawnDelayMs: 850,
    weights: { runner: 90, tank: 10 },
    tankCap: 1,
  },
  {
    phase: 3,
    durationSec: PHASE_DURATION_SEC,
    maxAliveEnemies: 14,
    spawnDelayMs: 800,
    weights: { runner: 80, tank: 20 },
    tankCap: 2,
  },
  {
    phase: 4,
    durationSec: PHASE_DURATION_SEC,
    maxAliveEnemies: 16,
    spawnDelayMs: 760,
    weights: { runner: 70, tank: 30 },
    tankCap: 3,
  },
  {
    phase: 5,
    durationSec: PHASE_DURATION_SEC,
    maxAliveEnemies: 18,
    spawnDelayMs: 720,
    weights: { runner: 60, tank: 40 },
    tankCap: 4,
  },
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

  // Phase system
  private runStartTime = 0;
  private currentPhase = 1;
  private phaseText?: Phaser.GameObjects.Text;

  // Match stats
  private stats!: MatchStats;
  private debugLogs = false; // выключить шумные логи

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

    // Сбрасываем фазы
    this.runStartTime = 0;
    this.currentPhase = 1;

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

    // Hotkey F2 для печати статистики
    const statsKey = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.F2
    );
    statsKey?.on("down", () => {
      this.printMatchSummary("MANUAL");
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
    this.weapon.refillAndReset();

    // Инициализируем статистику после создания оружия
    this.resetMatchStats();

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

    this.xpText = this.add.text(16, 40, "", {
      fontSize: "16px",
      color: "#ffffff",
    });
    this.updateXPText();

    // Временный лог порогов для проверки (только если debugLogs включен)
    if (this.debugLogs) {
      console.log("XP Thresholds for first 10 levels:");
      for (let lvl = 1; lvl <= 10; lvl++) {
        console.log(`lvl ${lvl} need ${this.getXPToNextLevel(lvl)}`);
      }
    }

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

    // Обновление текущей фазы
    const elapsed = this.getElapsedSec();
    const phase = this.getPhaseNumber(elapsed);
    if (phase !== this.currentPhase) {
      this.currentPhase = phase;
      // Обновляем статистику
      this.stats.phase = this.currentPhase;
      this.updateSpawnTimerByPhase();
      // Опционально: обновить debug текст
      if (this.phaseText) {
        const settings = this.getPhaseSettings(this.currentPhase);
        this.phaseText.setText(
          `PHASE: ${this.currentPhase} | Max: ${settings.maxAliveEnemies} | Delay: ${settings.spawnDelayMs}ms`
        );
      }
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
    const aimAngle = Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      pointer.worldX,
      pointer.worldY
    );

    // Проверяем, что кнопка мыши нажата
    if (!pointer.isDown) {
      return;
    }

    this.weapon.tryFire({
      scene: this,
      time,
      playerX: this.player.x,
      playerY: this.player.y,
      aimAngle,
      bullets: this.bullets,
      onBulletSpawned: () => {
        this.stats.shotsFired++;
      },
    });
  }

  // Спавн врага по краям экрана
  private spawnEnemy() {
    if (this.gameOver || !this.player.isAlive()) {
      return;
    }

    const settings = this.getPhaseSettings(this.currentPhase);

    // 1) Проверка maxAliveEnemies
    const alive = this.enemies.countActive(true);
    if (alive >= settings.maxAliveEnemies) {
      return;
    }

    // 2) Проверка tankCap
    const tanksAlive = this.getAliveTanksCount();
    if (settings.tankCap === 0) {
      // Фаза 1: только runner
      const { width, height } = this.scale;
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

      const enemy = new Enemy(
        this,
        x,
        y,
        this.player,
        "runner",
        this.currentPhase,
        this.enemies
      );
      this.enemies.add(enemy);
      return;
    }

    // 3) Выбор типа по весам
    const totalWeight = settings.weights.runner + settings.weights.tank;
    let roll = Phaser.Math.Between(1, totalWeight);
    let chosenType: EnemyType = "runner";

    if (roll <= settings.weights.runner) {
      chosenType = "runner";
    } else {
      chosenType = "tank";
    }

    // 4) Применить tankCap
    if (chosenType === "tank" && tanksAlive >= settings.tankCap) {
      chosenType = "runner";
    }

    // 5) Спавн
    const { width, height } = this.scale;
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

    const enemy = new Enemy(
      this,
      x,
      y,
      this.player,
      chosenType,
      this.currentPhase,
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

    // Защита от двойного overlap: отключаем body пули перед destroy
    const bulletBody = bullet.body as Phaser.Physics.Arcade.Body | undefined;
    if (bulletBody) {
      bulletBody.enable = false;
    }

    // Визуальный фидбек до уничтожения пули
    enemy.applyHitFeedback(bullet.x, bullet.y, this.time.now);

    // Статистика: попадание
    this.stats.shotsHit++;

    // Наносим урон (урон игрока, без бонуса оружия)
    const totalDamage = this.player.getDamage();
    const killed = enemy.takeDamage(totalDamage);

    // Пуля всегда исчезает при попадании
    bullet.destroy();

    if (killed) {
      // Микро hit-stop
      this.physics.pause();
      this.time.delayedCall(14, () => {
        this.physics.resume();
      });

      enemy.die(bullet.x, bullet.y);

      // Статистика: убийство
      this.stats.killsTotal++;
      if (enemy.type === "runner") {
        this.stats.killsRunner++;
      } else if (enemy.type === "tank") {
        this.stats.killsTank++;
      }

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
    this.stats.damageTaken += 1;
    this.updateHealthText();

    // 2) Запускаем i-frames
    player.startInvulnerability(player.getIFramesMs());

    // 3) Отбрасываем игрока
    const strength = enemy.type === "tank" ? 320 : 260; // Чуть сильнее от танка
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

  private getElapsedSec(): number {
    if (this.runStartTime === 0) {
      return 0;
    }
    return Math.max(0, (this.time.now - this.runStartTime) / 1000);
  }

  private getPhaseNumber(elapsedSec: number): number {
    return Math.floor(elapsedSec / PHASE_DURATION_SEC) + 1;
  }

  private getPhaseSettings(phase: number): PhaseSettings {
    const preset = PHASES.find((p) => p.phase === phase);
    if (preset) {
      return preset;
    }

    // phase 6+
    const extra = phase - 6;
    const aliveBoost = Math.floor(extra / 2) * 2; // +2 каждые 2 фазы
    const maxAliveEnemies = 20 + aliveBoost; // фаза 6 стартует с 20
    const spawnDelayMs = Math.max(
      MIN_SPAWN_DELAY_MS,
      680 - Math.floor(extra / 1) * 35
    );
    return {
      phase,
      durationSec: PHASE_DURATION_SEC,
      maxAliveEnemies,
      spawnDelayMs,
      weights: { runner: 55, tank: 45 },
      tankCap: 5,
    };
  }

  private getAliveTanksCount(): number {
    let count = 0;
    this.enemies.getChildren().forEach((obj) => {
      const enemy = obj as Enemy;
      if (enemy.active && enemy.type === "tank") {
        count++;
      }
    });
    return count;
  }

  private getXPToNextLevel(level: number): number {
    // Линейная формула: 4 + level * 2
    // lvl1->2: 6, lvl2->3: 8, lvl3->4: 10, и т.д.
    return 4 + level * 2;
  }

  private addXP(amount: number) {
    this.xp += amount;
    this.checkLevelUp();
    this.updateXPText();
  }

  private checkLevelUp() {
    // Корректная обработка перепрыгивания порога
    while (this.xp >= this.getXPToNextLevel(this.level)) {
      const needed = this.getXPToNextLevel(this.level);
      this.xp -= needed;
      this.level += 1;

      // Обновляем статистику
      this.stats.level = this.level;

      this.onLevelUp();
      this.showLevelUpOverlay();
    }
  }

  private onLevelUp() {
    // Усложнение через фазы теперь управляется системой фаз
    // Оставляем эту логику для совместимости, но приоритет у фаз
    // Можно убрать или оставить как fallback

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
    const all: LevelUpOption[] = [];

    // 1) Handling апгрейды пистолета (только если текущее оружие - пистолет)
    if (this.weapon.key === "pistol") {
      const gun = this.weapon as BasicGun;

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
    }

    // 2) Апгрейды игрока (movement-skill)
    if (this.player.canIncreaseMoveSpeed()) {
      all.push({
        title: "MOVE SPEED +5%",
        description: "",
        apply: () => {
          this.player.increaseMoveSpeed();
        },
      });
    }

    if (this.player.canIncreaseIFrames()) {
      all.push({
        title: "I-FRAMES +100ms",
        description: "",
        apply: () => {
          this.player.increaseIFrames();
        },
      });
    }

    // Max HP (редко: 35% шанс добавить в пул)
    if (this.player.canIncreaseMaxHp() && Math.random() < 0.35) {
      all.push({
        title: "MAX HP +1",
        description: "",
        apply: () => {
          this.player.increaseMaxHp();
          this.updateHealthText();
        },
      });
    }

    // 3) Новое оружие: SHOTGUN (только если level >= 6 и не shotgun уже)
    if (this.level >= 6 && this.weapon.key !== "shotgun") {
      if (Math.random() < 0.3) {
        // 30% шанс добавить в пул
        all.push({
          title: "NEW WEAPON: SHOTGUN",
          description: "",
          apply: () => {
            this.switchWeaponTo("shotgun");
          },
        });
      }
    }

    // Перемешиваем основной пул
    Phaser.Utils.Array.Shuffle(all);

    // Берём первые 3
    let selected = all.slice(0, 3);

    // 4) Fallback логика: если меньше 3, добиваем fallback опциями
    if (selected.length < 3) {
      const fallbacks: LevelUpOption[] = [];

      // HEAL +1 (если не полное HP)
      if (this.player.getHealth() < this.player.getMaxHealth()) {
        fallbacks.push({
          title: "HEAL +1",
          description: "",
          apply: () => {
            this.player.applyHeal(1);
            this.updateHealthText();
          },
        });
      }

      // MAX HP +1 (если можно)
      if (this.player.canIncreaseMaxHp()) {
        fallbacks.push({
          title: "MAX HP +1",
          description: "",
          apply: () => {
            this.player.increaseMaxHp();
            this.updateHealthText();
          },
        });
      }

      // NEW WEAPON (если доступно)
      if (this.level >= 6 && this.weapon.key !== "shotgun") {
        fallbacks.push({
          title: "NEW WEAPON: SHOTGUN",
          description: "",
          apply: () => {
            this.switchWeaponTo("shotgun");
          },
        });
      }

      // MOVE SPEED (если можно)
      if (this.player.canIncreaseMoveSpeed()) {
        fallbacks.push({
          title: "MOVE SPEED +5%",
          description: "",
          apply: () => {
            this.player.increaseMoveSpeed();
          },
        });
      }

      // I-FRAMES (если можно)
      if (this.player.canIncreaseIFrames()) {
        fallbacks.push({
          title: "I-FRAMES +100ms",
          description: "",
          apply: () => {
            this.player.increaseIFrames();
          },
        });
      }

      // Убираем дубликаты из fallbacks (те что уже в selected)
      const selectedTitles = new Set(selected.map((opt) => opt.title));
      const uniqueFallbacks = fallbacks.filter(
        (opt) => !selectedTitles.has(opt.title)
      );

      // Добавляем fallbacks до 3 опций
      selected = [...selected, ...uniqueFallbacks].slice(0, 3);
    }

    // 5) Если всё равно 0 (теоретически), показываем CONTINUE
    if (selected.length === 0) {
      selected.push({
        title: "CONTINUE",
        description: "",
        apply: () => {
          // Просто продолжаем игру
        },
      });
    }

    return selected;
  }


  private updateXPText() {
    const needed = this.getXPToNextLevel(this.level);
    this.xpText.setText(`LVL: ${this.level}  XP: ${this.xp}/${needed}`);
  }

  private updateAmmoUI(time: number) {
    if (!this.weapon) {
      return;
    }

    const ammo = this.weapon.getAmmoInMag();
    const magazineSize = this.weapon.getMagazineSize();
    const isReloading = this.weapon.isReloading();

    // Обновляем текст патронов
    this.ammoText.setText(`Ammo: ${ammo}/${magazineSize}`);

    // Показываем/скрываем прогресс-бар перезарядки
    if (isReloading) {
      this.reloadProgressBarBg.setVisible(true);
      this.reloadProgressBar.setVisible(true);

      // Получаем прогресс перезарядки
      let reloadProgress = 0;
      if (this.weapon.key === "pistol") {
        reloadProgress = (this.weapon as BasicGun).getReloadProgressWithTime(
          time
        );
      } else if (this.weapon.key === "shotgun") {
        reloadProgress = (this.weapon as Shotgun).getReloadProgressWithTime(
          time
        );
      }

      // Обновляем ширину прогресс-бара (0-200px)
      const barWidth = 200 * reloadProgress;
      this.reloadProgressBar.setSize(barWidth, 8);
    } else {
      this.reloadProgressBarBg.setVisible(false);
      this.reloadProgressBar.setVisible(false);
    }
  }

  private switchWeaponTo(key: "pistol" | "shotgun") {
    if (this.weapon?.key === key) {
      return;
    }

    // Статистика: смена оружия
    this.stats.weaponSwitches++;
    this.stats.weaponCurrent = this.weapon.getStats().name;

    // Заменяем оружие
    if (key === "pistol") {
      this.weapon = new BasicGun({});
    } else if (key === "shotgun") {
      this.weapon = new Shotgun();
    }

    this.weapon.refillAndReset();
    this.updateAmmoUI(this.time.now);
  }

  // updateSpawnTimer больше не используется - теперь используем updateSpawnTimerByPhase
  // private updateSpawnTimer() {
  //   if (this.gameOver) {
  //     return;
  //   }
  //
  //   if (this.spawnEvent) {
  //     this.spawnEvent.remove(false);
  //   }
  //
  //   this.spawnEvent = this.time.addEvent({
  //     delay: this.currentSpawnDelay,
  //     loop: true,
  //     callback: this.spawnEnemy,
  //     callbackScope: this,
  //   });
  // }

  private updateSpawnTimerByPhase() {
    if (this.gameOver || !this.isStarted) {
      return;
    }

    const settings = this.getPhaseSettings(this.currentPhase);
    const delay = settings.spawnDelayMs;

    // Если уже есть timer и delay совпадает — ничего не делать
    if (this.spawnEvent && this.currentSpawnDelay === delay) {
      return;
    }

    // Иначе уничтожить старый timer и создать новый
    if (this.spawnEvent) {
      this.spawnEvent.remove(false);
    }

    this.currentSpawnDelay = delay;
    this.spawnEvent = this.time.addEvent({
      delay: delay,
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
        this.stats.healsPicked++;
        this.updateHealthText();
        break;
      case "speed":
        this.player.applySpeedBoost(1.5, 4000); // x1.5 на 4 секунды
        this.stats.speedPicked++;
        break;
    }

    loot.destroy();
  }

  private handleGameOver() {
    if (this.gameOver) {
      return;
    }

    this.gameOver = true;

    // Печатаем статистику при Game Over
    this.printMatchSummary("GAME_OVER");

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

    // Устанавливаем время начала забега
    this.runStartTime = this.time.now;
    this.currentPhase = 1;

    // Обновляем статистику при старте
    this.stats.startedAtMs = this.time.now;
    this.stats.weaponStart = this.weapon.getStats().name;
    this.stats.weaponCurrent = this.weapon.getStats().name;

    // Стартуем спавн по фазе
    this.updateSpawnTimerByPhase();

    // Опционально: debug текст фазы
    if (this.debugEnabled) {
      const settings = this.getPhaseSettings(this.currentPhase);
      this.phaseText = this.add.text(16, 60, "", {
        fontSize: "14px",
        color: "#ffff00",
      });
      this.phaseText.setScrollFactor(0);
      this.phaseText.setText(
        `PHASE: ${this.currentPhase} | Max: ${settings.maxAliveEnemies} | Delay: ${settings.spawnDelayMs}ms`
      );
    }

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

  private resetMatchStats(): void {
    this.stats = {
      startedAtMs: this.time.now,
      endedAtMs: null,
      score: 0,
      level: 1,
      phase: 1,
      shotsFired: 0,
      shotsHit: 0,
      killsTotal: 0,
      killsRunner: 0,
      killsTank: 0,
      damageTaken: 0,
      healsPicked: 0,
      speedPicked: 0,
      weaponStart: this.weapon?.getStats()?.name ?? "PISTOL",
      weaponCurrent: this.weapon?.getStats()?.name ?? "PISTOL",
      weaponSwitches: 0,
    };
  }

  private printMatchSummary(
    reason: "GAME_OVER" | "RESTART" | "MANUAL"
  ): void {
    // Обновляем текущие значения
    this.stats.score = this.score;
    this.stats.level = this.level;
    this.stats.phase = this.currentPhase;
    this.stats.weaponCurrent = this.weapon?.getStats()?.name ?? "UNKNOWN";

    // Фиксируем время окончания, если ещё не зафиксировано
    if (this.stats.endedAtMs === null) {
      this.stats.endedAtMs = this.time.now;
    }

    const durationSec =
      (this.stats.endedAtMs - this.stats.startedAtMs) / 1000;
    const accuracy =
      this.stats.shotsFired > 0
        ? (this.stats.shotsHit / this.stats.shotsFired) * 100
        : 0;

    console.groupCollapsed(
      `[MATCH] ${reason} | ${durationSec.toFixed(1)}s | score=${this.stats.score} lvl=${this.stats.level} phase=${this.stats.phase}`
    );
    console.log(
      `Weapon: ${this.stats.weaponStart} -> ${this.stats.weaponCurrent} (switches: ${this.stats.weaponSwitches})`
    );
    console.log(
      `Shots: fired=${this.stats.shotsFired}, hit=${this.stats.shotsHit}, acc=${accuracy.toFixed(1)}%`
    );
    console.log(
      `Kills: total=${this.stats.killsTotal} (runner=${this.stats.killsRunner}, tank=${this.stats.killsTank})`
    );
    console.log(
      `Player: damageTaken=${this.stats.damageTaken}, heals=${this.stats.healsPicked}, speed=${this.stats.speedPicked}`
    );
    console.groupEnd();
  }
}
