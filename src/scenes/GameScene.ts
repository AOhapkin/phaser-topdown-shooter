import Phaser from "phaser";
import { Player } from "../entities/Player";
import { Bullet } from "../entities/Bullet";
import { Enemy, EnemyType } from "../entities/Enemy";
import { LootPickup, LootType } from "../entities/LootPickup";
import { Weapon } from "../weapons/types";
import { BasicGun } from "../weapons/BasicGun";
import { Shotgun } from "../weapons/Shotgun";
import { LevelUpOption } from "../ui/LevelUpOverlay";

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

// Stage system constants
const STAGE_DURATION_SEC = 75;
const BURST_INTERVAL_MIN_SEC = 12;
const BURST_INTERVAL_MAX_SEC = 15;
const BURST_DURATION_MIN_SEC = 4;
const BURST_DURATION_MAX_SEC = 6;
const RECOVERY_DURATION_MIN_SEC = 2;
const RECOVERY_DURATION_MAX_SEC = 3;

// Burst modifiers
const BURST_SPAWN_REDUCTION = 0.45; // 45% reduction (spawn 55% faster)
const BURST_RUNNER_WEIGHT_BOOST = 1.3; // 30% boost to runner weight
const BURST_SPEED_BOOST = 1.12; // 12% speed increase
const RECOVERY_SPAWN_MULTIPLIER = 1.2; // 20% slower spawn (multiply delay by 1.2)

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
  private isStageClear = false;
  private debugEnabled = false;

  // Stable spawn scheduler
  private spawnTickEvent?: Phaser.Time.TimerEvent;
  private nextSpawnAtMs = 0;
  private currentBaseSpawnDelayMs = 1000; // from phase settings
  private spawnDelayMultiplier = 1.0; // burst/recovery modifier
  private lastSpawnDebugLog = 0; // for temporary debug logging
  private restartKey!: Phaser.Input.Keyboard.Key;
  private continueKey!: Phaser.Input.Keyboard.Key;
  private loot!: Phaser.Physics.Arcade.Group;
  private weapon!: Weapon;
  private stageClearOverlay?: Phaser.GameObjects.Container;

  // Phase system
  private runStartTime = 0;
  private currentPhase = 1;
  private phaseText?: Phaser.GameObjects.Text;

  // Stage system
  private currentStage = 1;
  private stageStartTime = 0; // Time when current stage started
  private stageElapsedSec = 0;

  // Burst cycle
  private burstState: "idle" | "burst" | "recovery" = "idle";
  private nextBurstTime = 0; // When next burst should start
  private burstEndTime = 0; // When current burst ends
  private recoveryEndTime = 0; // When recovery ends

  // Match stats
  private stats!: MatchStats;
  private debugLogs = false; // выключить шумные логи

  // Stage Clear perks
  private playerPierceLevel = 0; // Сколько врагов может пробить пуля

  // Upgrade points system
  private upgradePoints = 0; // Очки для прокачки между стадиями
  private upgradePointsText?: Phaser.GameObjects.Text;

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
    this.currentBaseSpawnDelayMs = 1000;
    this.spawnDelayMultiplier = 1.0;
    this.nextSpawnAtMs = 0;
    this.lastSpawnDebugLog = 0;

    // Сбрасываем фазы
    this.runStartTime = 0;
    this.currentPhase = 1;

    // Сбрасываем stage system
    this.currentStage = 1;
    this.stageStartTime = 0;
    this.stageElapsedSec = 0;
    this.burstState = "idle";
    this.isStageClear = false;
    this.nextBurstTime = 0;
    this.burstEndTime = 0;
    this.recoveryEndTime = 0;

    // Убираем overlay, если есть
    this.hideStageClearOverlay();

    // Клавиша рестарта
    this.restartKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.R
    );

    // Клавиша продолжения (Enter)
    this.continueKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER
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

    // Upgrade points display
    this.upgradePointsText = this.add.text(16, 60, "", {
      fontSize: "16px",
      color: "#ffff00",
    });
    this.updateUpgradePointsText();

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

    if (this.isStageClear) {
      // Проверяем Enter для продолжения
      if (Phaser.Input.Keyboard.JustDown(this.continueKey)) {
        this.continueToNextStage();
      }
      return;
    }

    // Обновление текущей фазы
    const elapsed = this.getElapsedSec();
    const phase = this.getPhaseNumber(elapsed);
    if (phase !== this.currentPhase) {
      this.currentPhase = phase;
      // Обновляем статистику
      this.stats.phase = this.currentPhase;
      // Обновляем базовую задержку спавна (не пересоздаём таймер)
      const settings = this.getPhaseSettings(this.currentPhase);
      this.currentBaseSpawnDelayMs = settings.spawnDelayMs;
      // Опционально: обновить debug текст
      if (this.phaseText) {
        this.phaseText.setText(
          `PHASE: ${this.currentPhase} | Max: ${settings.maxAliveEnemies} | Delay: ${settings.spawnDelayMs}ms`
        );
      }
    }

    // Обновление stage system
    this.updateStageSystem(time);

    if (this.player && !this.isStageClear) {
      this.player.update();
    }

    if (!this.isStageClear) {
      this.handleShooting(time);
      this.updateAmmoUI(time);
    }
  }

  // ЛКМ → выстрел в сторону курсора
  private handleShooting(time: number) {
    if (
      this.gameOver ||
      !this.player.isAlive() ||
      !this.isStarted ||
      this.isLevelUpOpen ||
      this.isStageClear
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
      onBulletSpawned: (bullet: Bullet) => {
        this.stats.shotsFired++;
        // Применяем pierce perk к пуле
        if (this.playerPierceLevel > 0) {
          bullet.pierceLeft = this.playerPierceLevel;
        }
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
        this.enemies,
        this.currentStage
      );
      this.enemies.add(enemy);

      // Применяем stage speed multiplier
      const stageSpeedMult = this.getStageSpeedMultiplier(this.currentStage);
      enemy.setSpeedMultiplier(stageSpeedMult);

      // Применяем burst speed boost к новому врагу, если сейчас burst
      if (this.burstState === "burst") {
        enemy.setSpeedMultiplier(stageSpeedMult * BURST_SPEED_BOOST);
      }
      return;
    }

    // 3) Выбор типа по весам (с учётом burst и stage)
    let runnerWeight = settings.weights.runner;
    let tankWeight = settings.weights.tank;

    // Применяем stage modifier для веса танков
    tankWeight = Math.round(tankWeight * this.getStageTankWeightMultiplier(this.currentStage));

    // Во время burst увеличиваем вес runner
    if (this.burstState === "burst") {
      runnerWeight = Math.round(runnerWeight * BURST_RUNNER_WEIGHT_BOOST);
    }

    const totalWeight = runnerWeight + tankWeight;
    let roll = Phaser.Math.Between(1, totalWeight);
    let chosenType: EnemyType = "runner";

    if (roll <= runnerWeight) {
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
      this.enemies,
      this.currentStage
    );
    this.enemies.add(enemy);

    // Применяем stage speed multiplier
    const stageSpeedMult = this.getStageSpeedMultiplier(this.currentStage);
    enemy.setSpeedMultiplier(stageSpeedMult);

    // Применяем burst speed boost к новому врагу, если сейчас burst
    if (this.burstState === "burst") {
      enemy.setSpeedMultiplier(stageSpeedMult * BURST_SPEED_BOOST);
    }
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

    // Защита от повторного попадания в того же врага (для pierce)
    if (bullet.hasHitEnemy(enemy)) {
      return;
    }

    // Помечаем врага как обработанного
    bullet.markEnemyHit(enemy);

    // Визуальный фидбек до уничтожения пули
    enemy.applyHitFeedback(bullet.x, bullet.y, this.time.now);

    // Статистика: попадание
    this.stats.shotsHit++;

    // Наносим урон (урон игрока, без бонуса оружия)
    const totalDamage = this.player.getDamage();
    const killed = enemy.takeDamage(totalDamage);

    // Проверяем pierce: если пуля может пробить, уменьшаем счётчик и не уничтожаем
    if (bullet.pierceLeft > 0) {
      bullet.pierceLeft--;
      // Пуля продолжает полёт и может попасть в другого врага
    } else {
      // Пуля не может пробить - уничтожаем её
      const bulletBody = bullet.body as Phaser.Physics.Arcade.Body | undefined;
      if (bulletBody) {
        bulletBody.enable = false;
      }
      bullet.destroy();
    }

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
      // 2% шанс выпадения weapon-drop
      if (Math.random() < 0.02) {
        const weaponLoot = new LootPickup(this, enemy.x, enemy.y, "weapon-drop");
        this.loot.add(weaponLoot);
      }
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
    if (this.isStageClear) {
      return;
    }

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

  // Stage-based modifiers
  private getStageSpawnDelayMultiplier(stage: number): number {
    // Уменьшаем задержку спавна на 6% за стадию (спавн быстрее)
    // Минимум 0.6 (не быстрее чем в 1.67 раза)
    return Math.max(0.6, Math.pow(0.94, stage - 1));
  }

  private getStageTankWeightMultiplier(stage: number): number {
    // Увеличиваем вес танков на 8% за стадию
    return Math.pow(1.08, stage - 1);
  }

  private getStageSpeedMultiplier(stage: number): number {
    // Увеличиваем скорость врагов на 2% за стадию
    // Максимум 1.3 (не быстрее чем в 1.3 раза)
    return Math.min(1.3, 1.0 + (stage - 1) * 0.02);
  }

  private applyStageSpeedToEnemies(): void {
    // Применяем stage speed multiplier ко всем активным врагам
    const mult = this.getStageSpeedMultiplier(this.currentStage);
    const children = this.enemies.getChildren();
    for (let i = 0; i < children.length; i++) {
      const enemy = children[i] as Enemy;
      if (enemy && enemy.active) {
        const isDying = (enemy as any).isDying;
        if (!isDying) {
          // Если сейчас burst, учитываем burst multiplier
          const finalMult = this.burstState === "burst" ? mult * BURST_SPEED_BOOST : mult;
          enemy.setSpeedMultiplier(finalMult);
        }
      }
    }
  }

  private getStageRunnerHP(stage: number): number {
    // runner: 1 HP до стадии 4, затем 2 до стадии 7, затем 3
    if (stage >= 7) return 3;
    if (stage >= 4) return 2;
    return 1;
  }

  private getStageTankHP(stage: number): number {
    // tank: 3 HP до стадии 4, затем 4 до стадии 7, затем 5
    if (stage >= 7) return 5;
    if (stage >= 4) return 4;
    return 3;
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
    // Линейная формула: 6 + (level - 1) * 2
    // lvl1->2: 6, lvl2->3: 8, lvl3->4: 10, и т.д.
    return Math.max(6, 6 + (level - 1) * 2);
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

      // Начисляем очки прокачки вместо показа overlay
      this.upgradePoints += 1;
      this.updateUpgradePointsText();

      this.onLevelUp();
      // Убрали showLevelUpOverlay() - теперь прокачка только между стадиями
    }
  }

  private onLevelUp() {
    // Усложнение через фазы теперь управляется системой фаз
    // Оставляем эту логику для совместимости, но приоритет у фаз
    // Можно убрать или оставить как fallback

    // Прокачка характеристик игрока
    this.player.onLevelUp(this.level);
  }

  // Убрали showLevelUpOverlay() - теперь прокачка только между стадиями через upgrade points


  private updateXPText() {
    const needed = this.getXPToNextLevel(this.level);
    this.xpText.setText(`LVL: ${this.level}  XP: ${this.xp}/${needed}`);
  }

  private updateUpgradePointsText() {
    if (this.upgradePointsText) {
      this.upgradePointsText.setText(`PTS: ${this.upgradePoints}`);
    }
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

  // Метод для будущей реализации смены оружия при подборе weapon-drop
  // Пока не используется, но оставлен для будущей реализации
  private switchWeaponTo(key: "pistol" | "shotgun"): void {
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

  // ============================================
  // STABLE SPAWN SCHEDULER
  // ============================================

  private getSpawnMultiplier(): number {
    if (this.burstState === "burst") {
      return 1 - BURST_SPAWN_REDUCTION; // e.g. 0.55 (45% faster)
    }
    if (this.burstState === "recovery") {
      return RECOVERY_SPAWN_MULTIPLIER; // e.g. 1.2 (20% slower)
    }
    return 1.0;
  }

  private startSpawnScheduler(time: number): void {
    // Останавливаем старый планировщик, если есть
    this.stopSpawnScheduler();

    // Получаем базовую задержку из текущих настроек фазы
    const settings = this.getPhaseSettings(this.currentPhase);
    this.currentBaseSpawnDelayMs = settings.spawnDelayMs;

    // Получаем множитель из текущего состояния burst
    this.spawnDelayMultiplier = this.getSpawnMultiplier();

    // Устанавливаем время следующего спавна
    this.nextSpawnAtMs = time + this.currentBaseSpawnDelayMs * this.spawnDelayMultiplier;

    // Создаём стабильный looped timer, который тикает каждые 200ms
    this.spawnTickEvent = this.time.addEvent({
      delay: 200, // tick rate
      loop: true,
      callback: () => this.spawnTick(),
    });
  }

  private stopSpawnScheduler(): void {
    if (this.spawnTickEvent) {
      this.spawnTickEvent.remove(false);
      this.spawnTickEvent = undefined;
    }
  }

  private spawnTick(): void {
    if (this.gameOver || !this.isStarted || this.isStageClear) {
      return;
    }

    const now = this.time.now;

    // Проверяем, пора ли спавнить
    if (now < this.nextSpawnAtMs) {
      return;
    }

    // Проверяем лимит врагов
    const settings = this.getPhaseSettings(this.currentPhase);
    const alive = this.enemies.countActive(true);
    if (alive >= settings.maxAliveEnemies) {
      // Если достигнут лимит, откладываем следующий спавн на короткое время
      this.nextSpawnAtMs = now + 500; // проверяем каждые 500ms
      return;
    }

    // Спавним врага
    this.spawnEnemy();

    // Пересчитываем базовую задержку (на случай смены фазы)
    const currentSettings = this.getPhaseSettings(this.currentPhase);
    let baseDelay = currentSettings.spawnDelayMs;
    // Применяем stage modifier
    baseDelay = baseDelay * this.getStageSpawnDelayMultiplier(this.currentStage);
    baseDelay = Math.max(MIN_SPAWN_DELAY_MS, baseDelay);
    this.currentBaseSpawnDelayMs = baseDelay;

    // Пересчитываем множитель (на случай смены burst/recovery)
    this.spawnDelayMultiplier = this.getSpawnMultiplier();

    // Устанавливаем время следующего спавна
    this.nextSpawnAtMs = now + this.currentBaseSpawnDelayMs * this.spawnDelayMultiplier;

    // Временный debug лог (только если debugLogs включен)
    if (this.debugLogs && now - this.lastSpawnDebugLog >= 5000) {
      this.lastSpawnDebugLog = now;
      const nextIn = Math.max(0, this.nextSpawnAtMs - now);
      console.log(
        `[SPAWNDBG] alive=${alive} nextIn=${nextIn.toFixed(0)}ms state=${this.burstState} mult=${this.spawnDelayMultiplier.toFixed(2)}`
      );
    }
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
    if (this.isStageClear) {
      return;
    }

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
      case "weapon-drop":
        console.log("[LOOT] weapon-drop picked");
        this.onWeaponDropPicked();
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

    // Останавливаем планировщик спавна
    this.stopSpawnScheduler();

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

    // Инициализируем stage system
    this.currentStage = 1;
    this.stageStartTime = this.time.now;
    this.stageElapsedSec = 0;
    this.burstState = "idle";
    this.scheduleNextBurst();

    // Обновляем статистику при старте
    this.stats.startedAtMs = this.time.now;
    this.stats.weaponStart = this.weapon.getStats().name;
    this.stats.weaponCurrent = this.weapon.getStats().name;

    // Стартуем стабильный планировщик спавна
    this.startSpawnScheduler(this.time.now);

    // Логируем начало stage
    console.log(`[STAGE] START stage=${this.currentStage}`);

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

  // ============================================
  // STAGE SYSTEM
  // ============================================

  private updateStageSystem(time: number): void {
    if (!this.isStarted || this.gameOver) {
      return;
    }

    // Обновляем время стадии
    this.stageElapsedSec = (time - this.stageStartTime) / 1000;

    // Проверяем завершение стадии
    if (this.stageElapsedSec >= STAGE_DURATION_SEC) {
      this.endStage(true);
      this.onStageClear();
      return;
    }

    // Обновляем burst cycle
    this.updateBurstCycle(time);
  }


  private endStage(survived: boolean): void {
    console.log(`[STAGE] END stage=${this.currentStage} survived=${survived}`);
  }

  private onStageClear(): void {
    if (this.gameOver || !this.isStarted || this.isStageClear) {
      return;
    }

    this.isStageClear = true;

    // Останавливаем спавн
    this.stopSpawnScheduler();

    // Замораживаем физику
    this.physics.world.pause();

    // Останавливаем движение игрока
    if (this.player && this.player.body) {
      const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
      playerBody.setVelocity(0, 0);
    }

    // Останавливаем движение всех врагов
    const enemies = this.enemies.getChildren();
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i] as Enemy;
      if (enemy && enemy.body) {
        const enemyBody = enemy.body as Phaser.Physics.Arcade.Body;
        enemyBody.setVelocity(0, 0);
      }
    }

    // Показываем overlay
    this.showStageClearOverlay();

    console.log(`[STAGE] CLEAR stage=${this.currentStage}`);
  }

  private showStageClearOverlay(): void {
    this.showStageClearPerkStep();
  }

  private showStageClearPerkStep(): void {
    const { width, height } = this.scale;

    // Затемняющий фон
    const bg = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.9)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30000)
      .setInteractive({ useHandCursor: false });

    // Заголовок
    const title = this.add
      .text(width / 2, height / 2 - 180, `STAGE ${this.currentStage} CLEAR`, {
        fontSize: "56px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30001);

    // Подзаголовок
    const subtitle = this.add
      .text(width / 2, height / 2 - 130, "Pick one perk", {
        fontSize: "24px",
        color: "#cccccc",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30001);

    // Получаем 3 перка для выбора
    const perks = this.getStageClearPerks();

    // Адаптивный layout: вертикально на узких экранах, горизонтально на широких
    const isNarrow = width < 900;
    const cardObjects: Phaser.GameObjects.GameObject[] = [];
    
    let cardW: number;
    let cardH: number;
    let cardGap: number;
    let cardsStartX: number;
    let cardsStartY: number;

    if (isNarrow) {
      // Вертикальный layout
      cardW = Math.min(560, width - 80);
      cardH = 90;
      cardGap = 18;
      cardsStartX = width / 2;
      cardsStartY = height / 2 - 60;
    } else {
      // Горизонтальный layout
      cardW = Math.min(420, (width - 160) / 3);
      cardH = 100;
      cardGap = 20;
      cardsStartX = width / 2 - (cardW + cardGap);
      cardsStartY = height / 2 - 20;
    }

    perks.forEach((perk, i) => {
      let cardX: number;
      let cardY: number;

      if (isNarrow) {
        // Вертикальное расположение
        cardX = cardsStartX;
        cardY = cardsStartY + i * (cardH + cardGap);
      } else {
        // Горизонтальное расположение
        cardX = cardsStartX + i * (cardW + cardGap);
        cardY = cardsStartY;
      }

      const card = this.add
        .rectangle(cardX, cardY, cardW, cardH, 0x2a2a2a, 1)
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(30001)
        .setInteractive({ useHandCursor: true })
        .setStrokeStyle(2, 0xffffff, 0.2);

      const cardText = this.add
        .text(cardX, cardY, perk.title, {
          fontSize: isNarrow ? "20px" : "24px",
          color: "#ffffff",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(30002);

      // Hover эффект
      card.on("pointerover", () => {
        card.setFillStyle(0x3a3a3a, 1);
        card.setScale(1.05);
      });
      card.on("pointerout", () => {
        card.setFillStyle(0x2a2a2a, 1);
        card.setScale(1);
      });

      // Обработчик клика
      card.on(
        "pointerdown",
        (
          _pointer: Phaser.Input.Pointer,
          _x: number,
          _y: number,
          event: any
        ) => {
          if (event?.stopPropagation) {
            event.stopPropagation();
          }
          perk.apply();
          // Переходим к шагу прокачки
          this.hideStageClearOverlay();
          this.showStageClearUpgradesStep();
        }
      );

      cardObjects.push(card, cardText);
    });

    this.stageClearOverlay = this.add.container(0, 0, [
      bg,
      title,
      subtitle,
      ...cardObjects,
    ]);
    this.stageClearOverlay.setDepth(30000);
    this.stageClearOverlay.setScrollFactor(0);
  }

  private showStageClearUpgradesStep(): void {
    const { width, height } = this.scale;

    // Затемняющий фон
    const bg = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.9)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30000)
      .setInteractive({ useHandCursor: false });

    // Заголовок
    const title = this.add
      .text(width / 2, height / 2 - 200, "UPGRADES", {
        fontSize: "48px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30001);

    // Показываем очки
    const pointsText = this.add
      .text(width / 2, height / 2 - 150, `POINTS: ${this.upgradePoints}`, {
        fontSize: "28px",
        color: "#ffff00",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30001);

    // Адаптивный layout
    const isNarrow = width < 900;
    const upgradeObjects: Phaser.GameObjects.GameObject[] = [];

    const upgrades = [
      {
        title: "FIRE RATE -20ms",
        canApply: () => {
          if (this.upgradePoints <= 0) return false;
          if (this.weapon.key === "pistol") {
            const gun = this.weapon as BasicGun;
            return gun.canDecreaseFireRate(20);
          }
          return false;
        },
        apply: () => {
          if (this.weapon.key === "pistol") {
            const gun = this.weapon as BasicGun;
            gun.decreaseFireRate(20);
          }
          this.upgradePoints--;
          this.updateUpgradePointsText();
          pointsText.setText(`POINTS: ${this.upgradePoints}`);
          this.refreshUpgradeButtons(upgradeObjects, upgrades, isNarrow, width, height, pointsText);
        },
      },
      {
        title: "RELOAD -100ms",
        canApply: () => {
          if (this.upgradePoints <= 0) return false;
          if (this.weapon.key === "pistol") {
            const gun = this.weapon as BasicGun;
            return gun.canDecreaseReloadTime(100);
          }
          return false;
        },
        apply: () => {
          if (this.weapon.key === "pistol") {
            const gun = this.weapon as BasicGun;
            gun.decreaseReloadTime(100);
          }
          this.upgradePoints--;
          this.updateUpgradePointsText();
          pointsText.setText(`POINTS: ${this.upgradePoints}`);
          this.refreshUpgradeButtons(upgradeObjects, upgrades, isNarrow, width, height, pointsText);
        },
      },
      {
        title: "MAX HP +1",
        canApply: () => {
          if (this.upgradePoints <= 0) return false;
          return this.player.canIncreaseMaxHp();
        },
        apply: () => {
          this.player.increaseMaxHp();
          this.updateHealthText();
          this.upgradePoints--;
          this.updateUpgradePointsText();
          pointsText.setText(`POINTS: ${this.upgradePoints}`);
          this.refreshUpgradeButtons(upgradeObjects, upgrades, isNarrow, width, height, pointsText);
        },
      },
      {
        title: "MOVE +5%",
        canApply: () => {
          if (this.upgradePoints <= 0) return false;
          return this.player.canIncreaseMoveSpeed();
        },
        apply: () => {
          this.player.increaseMoveSpeed();
          this.upgradePoints--;
          this.updateUpgradePointsText();
          pointsText.setText(`POINTS: ${this.upgradePoints}`);
          this.refreshUpgradeButtons(upgradeObjects, upgrades, isNarrow, width, height, pointsText);
        },
      },
    ];

    this.createUpgradeButtons(upgrades, isNarrow, width, height, upgradeObjects);

    // Кнопка CONTINUE
    const continueY = isNarrow ? height / 2 + 200 : height / 2 + 180;
    const continueBtn = this.add
      .rectangle(width / 2, continueY, 200, 60, 0x2a2a2a, 1)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30001)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(2, 0xffffff, 0.3);

    const continueText = this.add
      .text(width / 2, continueY, "CONTINUE", {
        fontSize: "24px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30002);

    continueBtn.on("pointerover", () => {
      continueBtn.setFillStyle(0x3a3a3a, 1);
    });
    continueBtn.on("pointerout", () => {
      continueBtn.setFillStyle(0x2a2a2a, 1);
    });
    continueBtn.on(
      "pointerdown",
      (
        _pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: any
      ) => {
        if (event?.stopPropagation) {
          event.stopPropagation();
        }
        this.continueToNextStage();
      }
    );

    upgradeObjects.push(bg, title, pointsText, continueBtn, continueText);

    this.stageClearOverlay = this.add.container(0, 0, upgradeObjects);
    this.stageClearOverlay.setDepth(30000);
    this.stageClearOverlay.setScrollFactor(0);
  }

  private createUpgradeButtons(
    upgrades: Array<{
      title: string;
      canApply: () => boolean;
      apply: () => void;
    }>,
    isNarrow: boolean,
    width: number,
    height: number,
    upgradeObjects: Phaser.GameObjects.GameObject[]
  ): void {
    const cardW = isNarrow ? Math.min(480, width - 80) : 220;
    const cardH = 70;
    const cardGap = isNarrow ? 16 : 20;
    const startY = height / 2 - 80;

    upgrades.forEach((upgrade, i) => {
      const cardY = isNarrow
        ? startY + i * (cardH + cardGap)
        : startY;
      const cardX = isNarrow
        ? width / 2
        : width / 2 - 330 + i * (cardW + cardGap);

      const canApply = upgrade.canApply();
      const card = this.add
        .rectangle(cardX, cardY, cardW, cardH, canApply ? 0x2a2a2a : 0x1a1a1a, 1)
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(30001)
        .setInteractive({ useHandCursor: canApply })
        .setStrokeStyle(2, canApply ? 0xffffff : 0x666666, 0.2);

      const cardText = this.add
        .text(cardX, cardY, upgrade.title, {
          fontSize: isNarrow ? "18px" : "20px",
          color: canApply ? "#ffffff" : "#888888",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(30002);

      if (canApply) {
        card.on("pointerover", () => {
          card.setFillStyle(0x3a3a3a, 1);
          card.setScale(1.05);
        });
        card.on("pointerout", () => {
          card.setFillStyle(0x2a2a2a, 1);
          card.setScale(1);
        });
        card.on(
          "pointerdown",
          (
            _pointer: Phaser.Input.Pointer,
            _x: number,
            _y: number,
            event: any
          ) => {
            if (event?.stopPropagation) {
              event.stopPropagation();
            }
            upgrade.apply();
          }
        );
      }

      upgradeObjects.push(card, cardText);
    });
  }

  private refreshUpgradeButtons(
    upgradeObjects: Phaser.GameObjects.GameObject[],
    upgrades: Array<{
      title: string;
      canApply: () => boolean;
      apply: () => void;
    }>,
    isNarrow: boolean,
    width: number,
    height: number,
    pointsText: Phaser.GameObjects.Text
  ): void {
    // Удаляем старые кнопки (кроме bg, title, pointsText, continueBtn, continueText)
    const toKeep = 5; // bg, title, pointsText, continueBtn, continueText
    while (upgradeObjects.length > toKeep) {
      const obj = upgradeObjects.pop();
      if (obj) obj.destroy();
    }

    // Создаём новые кнопки
    this.createUpgradeButtons(upgrades, isNarrow, width, height, upgradeObjects);

    // Обновляем контейнер
    if (this.stageClearOverlay) {
      this.stageClearOverlay.destroy(true);
    }
    this.stageClearOverlay = this.add.container(0, 0, upgradeObjects);
    this.stageClearOverlay.setDepth(30000);
    this.stageClearOverlay.setScrollFactor(0);
    
    // Обновляем pointsText (он уже в upgradeObjects)
    pointsText.setText(`POINTS: ${this.upgradePoints}`);
  }

  private getStageClearPerks(): LevelUpOption[] {
    const all: LevelUpOption[] = [];

    // 1) PIERCE +1
    all.push({
      title: "PIERCE +1",
      description: "",
      apply: () => {
        this.playerPierceLevel++;
      },
    });

    // 2) KNOCKBACK +25%
    all.push({
      title: "KNOCKBACK +25%",
      description: "",
      apply: () => {
        this.player.increaseKnockbackMultiplier(0.25);
      },
    });

    // 3) MAGNET +20%
    all.push({
      title: "MAGNET +20%",
      description: "",
      apply: () => {
        this.player.increaseLootPickupRadiusMultiplier(0.2);
      },
    });

    // 4) HEAL ON CLEAR
    all.push({
      title: "HEAL ON CLEAR",
      description: "",
      apply: () => {
        this.player.applyHeal(1);
        this.updateHealthText();
      },
    });

    // 5) BULLET SIZE +30% (опционально, если нужно больше опций)
    all.push({
      title: "BULLET SIZE +30%",
      description: "",
      apply: () => {
        // Увеличиваем размер пуль (scale)
        // Это будет применяться при создании пуль
        // Пока просто добавляем флаг, можно реализовать позже
      },
    });

    // Перемешиваем и берём 3 уникальных перка
    Phaser.Utils.Array.Shuffle(all);
    return all.slice(0, 3);
  }

  private hideStageClearOverlay(): void {
    if (this.stageClearOverlay) {
      this.stageClearOverlay.destroy(true);
      this.stageClearOverlay = undefined;
    }
  }

  private onWeaponDropPicked(): void {
    // TODO: Реализовать смену оружия при подборе weapon-drop
    // Пока только логируем
    // В будущем здесь будет вызов: this.switchWeaponTo("newWeaponType");
    // Временно вызываем метод, чтобы TypeScript не считал его неиспользуемым
    void this.switchWeaponTo;
  }

  private continueToNextStage(): void {
    if (!this.isStageClear) {
      return;
    }

    this.isStageClear = false;
    this.hideStageClearOverlay();

    // Возобновляем физику
    this.physics.world.resume();

    // Переходим к следующей стадии
    const now = this.time.now;
    this.currentStage++;
    this.stageStartTime = now;
    this.stageElapsedSec = 0;
    this.burstState = "idle";
    this.scheduleNextBurst();

    // Применяем stage speed multiplier ко всем врагам
    this.applyStageSpeedToEnemies();

    // Запускаем спавн
    this.startSpawnScheduler(now);

    // Логируем параметры стадии
    const settings = this.getPhaseSettings(this.currentPhase);
    const spawnDelay = this.currentBaseSpawnDelayMs;
    const runnerHP = this.getStageRunnerHP(this.currentStage);
    const tankHP = this.getStageTankHP(this.currentStage);
    const speedMult = this.getStageSpeedMultiplier(this.currentStage);
    const tankWeight = Math.round(
      settings.weights.tank * this.getStageTankWeightMultiplier(this.currentStage)
    );
    console.log(
      `[STAGE] START stage=${this.currentStage} (spawnDelay=${spawnDelay.toFixed(0)}ms, weights=runner:${settings.weights.runner}/tank:${tankWeight}, hpRunner=${runnerHP}, hpTank=${tankHP}, speedMul=${speedMult.toFixed(2)})`
    );
  }

  private scheduleNextBurst(): void {
    const intervalSec = Phaser.Math.Between(
      BURST_INTERVAL_MIN_SEC,
      BURST_INTERVAL_MAX_SEC
    );
    this.nextBurstTime = this.time.now + intervalSec * 1000;
  }

  private updateBurstCycle(time: number): void {
    if (this.burstState === "idle") {
      // Проверяем, пора ли начать burst
      if (time >= this.nextBurstTime) {
        this.startBurst(time);
      }
    } else if (this.burstState === "burst") {
      // Проверяем, пора ли закончить burst
      if (time >= this.burstEndTime) {
        this.endBurst(time);
      }
    } else if (this.burstState === "recovery") {
      // Проверяем, пора ли закончить recovery
      if (time >= this.recoveryEndTime) {
        this.endRecovery();
      }
    }
  }

  private startBurst(time: number): void {
    this.burstState = "burst";
    const durationSec = Phaser.Math.Between(
      BURST_DURATION_MIN_SEC,
      BURST_DURATION_MAX_SEC
    );
    this.burstEndTime = time + durationSec * 1000;

    // Обновляем множитель спавна (не пересоздаём таймер)
    this.spawnDelayMultiplier = this.getSpawnMultiplier();

    // Немедленно применяем burst эффект: "подтягиваем" следующий спавн ближе
    const base = this.getPhaseSettings(this.currentPhase).spawnDelayMs;
    const mult = this.getSpawnMultiplier();
    const desired = time + base * mult;
    this.nextSpawnAtMs = Math.min(this.nextSpawnAtMs, desired);

    // Применяем speed boost ко всем активным врагам
    this.applyBurstSpeedToEnemies(true);

    console.log(
      `[BURST] START t=${this.stageElapsedSec.toFixed(1)}s duration=${durationSec.toFixed(1)}s`
    );
  }

  private endBurst(time: number): void {
    this.burstState = "recovery";
    const recoverySec = Phaser.Math.Between(
      RECOVERY_DURATION_MIN_SEC,
      RECOVERY_DURATION_MAX_SEC
    );
    this.recoveryEndTime = time + recoverySec * 1000;

    // Убираем speed boost
    this.applyBurstSpeedToEnemies(false);

    // Обновляем множитель спавна (не пересоздаём таймер)
    this.spawnDelayMultiplier = this.getSpawnMultiplier();

    // Немедленно применяем recovery эффект: "отодвигаем" следующий спавн дальше
    const base = this.getPhaseSettings(this.currentPhase).spawnDelayMs;
    const mult = this.getSpawnMultiplier();
    const desired = time + base * mult;
    this.nextSpawnAtMs = Math.max(this.nextSpawnAtMs, desired);

    console.log(`[BURST] END`);
  }

  private endRecovery(): void {
    this.burstState = "idle";
    this.scheduleNextBurst();

    // Обновляем множитель спавна (не пересоздаём таймер)
    this.spawnDelayMultiplier = this.getSpawnMultiplier();
  }

  private applyBurstSpeedToEnemies(apply: boolean): void {
    const children = this.enemies.getChildren();
    const stageMult = this.getStageSpeedMultiplier(this.currentStage);
    for (let i = 0; i < children.length; i++) {
      const enemy = children[i] as Enemy;
      if (enemy && enemy.active) {
        // Проверяем isDying через приватное поле (через any для доступа)
        const isDying = (enemy as any).isDying;
        if (!isDying) {
          const baseMult = stageMult;
          const finalMult = apply ? baseMult * BURST_SPEED_BOOST : baseMult;
          enemy.setSpeedMultiplier(finalMult);
        }
      }
    }
  }
}
