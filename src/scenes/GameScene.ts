import Phaser from "phaser";
import { Player } from "../entities/Player";
import { Bullet } from "../entities/Bullet";
import { Enemy } from "../entities/Enemy";
import { LootPickup, LootType } from "../entities/LootPickup";
// Weapon, BasicGun, and Shotgun moved to WeaponSystem
// LevelUpOption import removed - now handled by PerkSystem
import { StageSystem } from "../systems/StageSystem";
import {
  SpawnSystem,
  EnemyType as SpawnEnemyType,
} from "../systems/SpawnSystem";
import { BuffSystem } from "../systems/BuffSystem";
import { WeaponSystem } from "../systems/WeaponSystem";
import { OverlaySystem } from "../systems/OverlaySystem";
import { MatchStatsSystem } from "../systems/MatchStatsSystem";
import { StageResultSystem } from "../systems/StageResultSystem";
import { PerkSystem } from "../systems/PerkSystem";

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

// Stage system constants moved to StageSystem.ts

// Burst modifiers
const BURST_SPAWN_REDUCTION = 0.45; // 45% reduction (spawn 55% faster)
const BURST_RUNNER_WEIGHT_BOOST = 1.3; // 30% boost to runner weight
const BURST_SPEED_BOOST = 1.12; // 12% speed increase
const RECOVERY_SPAWN_MULTIPLIER = 1.2; // 20% slower spawn (multiply delay by 1.2)

// Weapon-drop spawn constraints
const WEAPON_DROP_BASE_CHANCE = 0.003; // 0.3% per enemy death
const WEAPON_DROP_COOLDOWN_MS = 30000; // 30 seconds cooldown

// Buff durations (ms) - moved to BuffSystem.ts
// TODO: Remove these constants after full integration
// const BUFF_RAPID_DURATION_MS = 8000;
// const BUFF_DOUBLE_DURATION_MS = 10000;
// const BUFF_FREEZE_DURATION_MS = 6000;
// const BUFF_MAX_DURATION_MS = 20000;

// Buff drop parameters
const BUFF_DROP_COOLDOWN_MS = 12000; // Global cooldown for buff drops (ms)
const BUFF_DROP_CHANCE = 0.18; // Chance to attempt buff drop on event (e.g., enemy kill)
const BUFF_MAX_ON_MAP = 1; // Maximum buff loot items on map simultaneously

// Buff type weights (for selection when drop is attempted)
// Total: 100% (freeze: 45%, rapid: 35%, double: 20%)
const BUFF_FREEZE_WEIGHT = 0.45;
const BUFF_RAPID_WEIGHT = 0.35;
const BUFF_DOUBLE_WEIGHT = 0.2;

// Buff types (moved to BuffSystem, keeping for compatibility)
// TODO: Remove after full integration
type BuffType = "rapid" | "double" | "pierce" | "freeze";

// MatchStats type removed - now handled by MatchStatsSystem

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
  private weaponSwitches = 0; // Track weapon switches for logging
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
  // suppressShootingUntil moved to WeaponSystem
  // TODO: Remove after full integration
  // private suppressShootingUntil = 0;
  private isLevelUpOpen = false;
  private isStageClear = false;
  private debugEnabled = false;

  // Spawn scheduler moved to SpawnSystem
  // TODO: Remove lastSpawnDebugLog if not needed
  // private lastSpawnDebugLog = 0;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private continueKey!: Phaser.Input.Keyboard.Key;
  private loot!: Phaser.Physics.Arcade.Group;
  private stageClearOverlay?: Phaser.GameObjects.Container;

  // Phase system
  private runStartTime = 0;
  private currentPhase = 1;
  private phaseText?: Phaser.GameObjects.Text;

  // Stage system (moved to StageSystem)
  private stageSystem!: StageSystem;

  // Spawn system (moved to SpawnSystem)
  private spawnSystem!: SpawnSystem;

  // Buff system (moved to BuffSystem)
  private buffSystem!: BuffSystem;

  // Weapon system (moved to WeaponSystem)
  private weaponSystem!: WeaponSystem;

  // Overlay system
  private overlaySystem!: OverlaySystem;

  // Match stats system
  private matchStatsSystem!: MatchStatsSystem;

  // Stage result system
  private stageResultSystem!: StageResultSystem;

  // Perk system
  private perkSystem!: PerkSystem;
  private debugLogs = false; // выключить шумные логи

  // Stage Clear perks (moved to PerkSystem)
  // playerPierceLevel is synced with PerkSystem via callback onPierceChanged
  private playerPierceLevel = 0;

  // Weapon-drop constraints
  private lastWeaponDropTime = 0; // Time when weapon-drop was spawned or picked

  // Buff loot tracking
  private lastBuffDropTime = 0; // Time when last buff loot was dropped
  private activeBuffLoot = new Set<LootPickup>(); // Track active buff loot items
  private lastCooldownLogTime = 0; // Throttle cooldown logs (log at most once per second)
  private cooldownLogSkipCount = 0; // Count skipped cooldown logs

  // Buff system moved to BuffSystem
  private buffHudText?: Phaser.GameObjects.Text;
  private lastBuffHudUpdate = 0;
  private enemySpeedMultiplier = 1.0; // Global enemy speed multiplier (for freeze buff)

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

    // Spawn system parameters are reset via spawnSystem.reset()

    // Сбрасываем фазы
    this.runStartTime = 0;
    this.currentPhase = 1;

    // Stage system will be initialized after this
    this.isStageClear = false;

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

    // Инициализируем OverlaySystem
    this.overlaySystem = new OverlaySystem();

    // Инициализируем MatchStatsSystem
    this.matchStatsSystem = new MatchStatsSystem();

    // Инициализируем статистику (weaponSystem будет инициализирован после)
    this.resetMatchStats();

    // Инициализируем SpawnSystem
    this.spawnSystem = new SpawnSystem(
      this,
      {
        getIsActive: () => {
          return this.isStarted && !this.gameOver && !this.isStageClear;
        },
        getCurrentPhase: () => this.currentPhase,
        getPhaseSettings: (phase: number) => this.getPhaseSettings(phase),
        getBurstState: () => this.stageSystem.getBurstState(),
        getSpawnDelayMultiplier: () => this.getSpawnMultiplier(),
        getEffectiveWeights: (settings, burstState) => {
          let runnerWeight = settings.weights.runner;
          let tankWeight = settings.weights.tank;

          // Применяем stage modifier для веса танков
          tankWeight = Math.round(
            tankWeight *
              this.getStageTankWeightMultiplier(this.stageSystem.getStage())
          );

          // Во время burst увеличиваем вес runner
          if (burstState === "burst") {
            runnerWeight = Math.round(runnerWeight * BURST_RUNNER_WEIGHT_BOOST);
          }

          return { runner: runnerWeight, tank: tankWeight };
        },
        getAliveEnemiesCount: () => this.enemies.countActive(true),
        getAliveTanksCount: () => this.getAliveTanksCount(),
        spawnEnemy: (chosenType: SpawnEnemyType) => {
          this.spawnEnemyByType(chosenType);
        },
        logSpawnDebug: (msg: string) => {
          if (this.debugLogs) {
            console.log(msg);
          }
        },
      },
      MIN_SPAWN_DELAY_MS
    );

    // Инициализируем PerkSystem
    this.perkSystem = new PerkSystem({
      onPierceChanged: (level: number) => {
        this.playerPierceLevel = level;
      },
      onKnockbackChanged: (multiplier: number) => {
        this.player.increaseKnockbackMultiplier(multiplier);
      },
      onMagnetChanged: (multiplier: number) => {
        this.player.increaseLootPickupRadiusMultiplier(multiplier);
      },
      onHealOnClear: () => {
        this.player.applyHeal(1);
        this.updateHealthText();
      },
      onBulletSizeChanged: (_multiplier: number) => {
        // Увеличиваем размер пуль (scale)
        // Это будет применяться при создании пуль
        // Пока просто добавляем флаг, можно реализовать позже
      },
    });

    // Инициализируем BuffSystem
    this.buffSystem = new BuffSystem({
      getIsActive: () => {
        return this.isStarted && !this.gameOver && !this.isStageClear;
      },
      getTimeNow: () => this.time.now,
      getEnemies: () => {
        if (!this.enemies) {
          return [];
        }
        try {
          const children = this.enemies.getChildren();
          if (children && Array.isArray(children)) {
            return children.filter(
              (obj) => obj && (obj as Enemy).active
            ) as Enemy[];
          }
        } catch (e) {
          // Group not fully initialized
        }
        return [];
      },
      onReloadBypassEnabled: (enabled: boolean) => {
        // DOUBLE buff: reload bypass is handled via bypassAmmo in WeaponSystem
        // This callback is called for logging purposes
        if (enabled) {
          // Log is already done in startBuff
        } else {
          // DOUBLE ended: restore normal ammo behavior
          // This is handled by WeaponSystem internally
        }
      },
      onRapidFireMultiplierChanged: (_mult: number) => {
        // RAPID buff: fire rate multiplier is handled in WeaponSystem.tryShoot()
        // This callback is called for potential future use
        // Currently, rapid is checked via buffSystem.isActive("rapid") in WeaponSystem
      },
      applyFreezeToEnemy: (enemy: Enemy) => {
        enemy.setFrozen(true);
      },
      removeFreezeFromEnemy: (enemy: Enemy) => {
        enemy.setFrozen(false);
      },
      isEnemyFreezable: (enemy: Enemy) => {
        // Check if enemy is not dying
        const isDying = (enemy as any).isDying;
        return !isDying;
      },
      log: (msg: string) => {
        console.log(msg);
      },
    });

    // Инициализируем WeaponSystem
    this.weaponSystem = new WeaponSystem({
      getIsActive: () => {
        return (
          !this.gameOver &&
          this.player.isAlive() &&
          this.isStarted &&
          !this.isLevelUpOpen &&
          !this.isStageClear
        );
      },
      getTimeNow: () => this.time.now,
      getPlayerPos: () => ({ x: this.player.x, y: this.player.y }),
      getAimAngle: () => {
        const pointer = this.input.activePointer;
        return Phaser.Math.Angle.Between(
          this.player.x,
          this.player.y,
          pointer.worldX,
          pointer.worldY
        );
      },
      isBuffActive: (type: "rapid" | "double") => {
        return this.buffSystem.isActive(type);
      },
      canBypassReload: () => {
        return this.buffSystem.isActive("double");
      },
      getScene: () => this,
      getBulletsGroup: () => this.bullets,
      getPlayerPierceLevel: () => this.playerPierceLevel,
      scheduleDelayedCall: (delayMs: number, callback: () => void) => {
        this.time.delayedCall(delayMs, callback);
      },
      onShotFired: (projectilesCount: number) => {
        this.matchStatsSystem.onShotFired(projectilesCount);
      },
    });

    // Инициализируем StageSystem
    this.stageSystem = new StageSystem(this, {
      onStageStart: (_stage: number) => {
        // Logging handled in StageSystem, no duplicate here
      },
      onStageEnd: (stage: number, survived: boolean) => {
        // Logging handled in StageSystem, no duplicate here
        this.stageResultSystem.onStageEnd(stage);
        this.endStage(survived);
        this.onStageClear();
      },
      onBurstStart: (stageElapsedSec: number, durationSec: number) => {
        console.log(
          `[BURST] START t=${stageElapsedSec.toFixed(
            1
          )}s duration=${durationSec.toFixed(1)}s`
        );
        // Обновляем таймер спавна при изменении burst state
        this.spawnSystem.onParamsChanged(this.time.now);
        // Применяем speed boost ко всем активным врагам
        this.applyBurstSpeedToEnemies(true);
      },
      onBurstEnd: () => {
        console.log(`[BURST] END`);
        // Убираем speed boost
        this.applyBurstSpeedToEnemies(false);
        // Обновляем таймер спавна при изменении burst state
        this.spawnSystem.onParamsChanged(this.time.now);
      },
      onBurstStateChanged: (_state) => {
        // Обновляем таймер спавна при изменении состояния burst
        this.spawnSystem.onParamsChanged(this.time.now);
      },
    });

    // Инициализируем StageResultSystem (after stageSystem and matchStatsSystem)
    this.stageResultSystem = new StageResultSystem(
      this.matchStatsSystem,
      this.stageSystem
    );

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

    // UI: score и здоровье (score managed by MatchStatsSystem)
    this.score = 0;
    this.weaponSwitches = 0;
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

    // Buff HUD (top-right, under health)
    this.buffHudText = this.add.text(width - 16, 40, "", {
      fontSize: "14px",
      color: "#ffff00",
      align: "right",
    });
    this.buffHudText.setOrigin(1, 0);
    this.updateBuffHud();

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
    this.reloadProgressBar = this.add.rectangle(16, ammoY + 25, 0, 8, 0xff6b6b);
    this.reloadProgressBar.setOrigin(0, 0);
    this.reloadProgressBar.setScrollFactor(0);
    this.reloadProgressBar.setVisible(false);

    // Стартовый экран: оверлей + title + мерцающий hint
    this.isStarted = false;
    this.overlaySystem.open("start");

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
        _pointer: Phaser.Input.Pointer,
        _lx: number,
        _ly: number,
        event: any
      ) => {
        // Stop event propagation to prevent gameplay input
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
      // Phase tracking (used in printMatchSummary)
      // Обновляем таймер спавна при смене фазы
      this.spawnSystem.onParamsChanged(this.time.now);
      // Опционально: обновить debug текст
      if (this.phaseText) {
        const phaseSettings = this.getPhaseSettings(this.currentPhase);
        this.phaseText.setText(
          `PHASE: ${this.currentPhase} | Max: ${phaseSettings.maxAliveEnemies} | Delay: ${phaseSettings.spawnDelayMs}ms`
        );
      }
    }

    // Обновление stage system
    if (this.isStarted && !this.gameOver) {
      this.stageSystem.update(time);
    }
    this.buffSystem.update();
    this.updateBuffHud(time);

    // Clean up inactive buff loot from tracking
    this.activeBuffLoot.forEach((loot) => {
      if (!loot || !loot.active) {
        this.activeBuffLoot.delete(loot);
      }
    });

    if (this.player && !this.isStageClear) {
      this.player.update();
    }

    if (!this.isStageClear) {
      // Update weapon system
      this.weaponSystem.update();

      // Guard: block gameplay input when overlay is open
      if (!this.overlaySystem.isBlockingInput()) {
        // Handle shooting input
        const pointer = this.input.activePointer;
        if (pointer.isDown) {
          this.weaponSystem.tryShoot();
        }
      }
      this.updateAmmoUI(time);
    }
  }

  // Спавн врага по краям экрана (вызывается из SpawnSystem)
  private spawnEnemyByType(chosenType: SpawnEnemyType): void {
    if (this.gameOver || !this.player.isAlive()) {
      return;
    }

    const settings = this.getPhaseSettings(this.currentPhase);

    // Проверка tankCap для фазы 1 (только runner)
    if (settings.tankCap === 0 && chosenType !== "runner") {
      chosenType = "runner";
    }

    // Спавн
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
      this.stageSystem.getStage()
    );
    this.enemies.add(enemy);

    // Применяем stage speed multiplier
    const stageSpeedMult = this.getStageSpeedMultiplier(
      this.stageSystem.getStage()
    );
    const burstMult =
      this.stageSystem.getBurstState() === "burst" ? BURST_SPEED_BOOST : 1.0;
    enemy.setSpeedMultiplier(
      stageSpeedMult * burstMult * this.enemySpeedMultiplier
    );

    // Если FREEZE активен - замораживаем нового врага
    this.buffSystem.onEnemySpawned(enemy);
  }

  // TODO: Remove after SpawnSystem integration complete
  // @deprecated Use spawnEnemyByType instead
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  // @ts-ignore - deprecated method, kept for compatibility
  private spawnEnemy() {
    // This method is kept for compatibility but should not be called
    // SpawnSystem now handles enemy type selection
    console.warn("[DEPRECATED] spawnEnemy() called, use spawnEnemyByType()");
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

    // Guard 1: bullet must exist and be active
    if (!bullet || !bullet.active) {
      return;
    }

    // Guard 2: bullet must have enabled body
    if (!bullet.body) {
      return;
    }
    const bulletBody = bullet.body as Phaser.Physics.Arcade.Body;
    if (!bulletBody.enable) {
      return;
    }

    // Guard 3: enemy must exist, be active and not dying
    if (!enemy || !enemy.active || (enemy as any).isDying) {
      return;
    }

    // Guard 4: защита от повторного попадания в того же врага (для pierce) - используем стабильный ID
    if (bullet.hasHitEnemy(enemy.id)) {
      return;
    }

    // Guard 5: помечаем врага как обработанного СРАЗУ (до любых других операций) - используем стабильный ID
    // Это защищает от двойного overlap в одном кадре
    bullet.markEnemyHit(enemy.id);

    // Визуальный фидбек до уничтожения пули
    enemy.applyHitFeedback(bullet.x, bullet.y, this.time.now);

    // Статистика: попадание (каждое попадание пули в врага = +1)
    this.matchStatsSystem.onProjectileHit();

    // Наносим урон (урон игрока, без бонуса оружия)
    const totalDamage = this.player.getDamage();
    const killed = enemy.takeDamage(totalDamage);

    // Проверяем pierce: если пуля может пробить, уменьшаем счётчик и не уничтожаем
    if (bullet.pierceLeft > 0) {
      bullet.pierceLeft--;
      // Пуля продолжает полёт и может попасть в другого врага
    } else {
      // Пуля не может пробить - отключаем коллайдер и уничтожаем немедленно
      // Делаем это СРАЗУ, чтобы предотвратить повторную обработку в том же кадре
      bulletBody.enable = false;
      bullet.setActive(false);
      bullet.setVisible(false);
      bullet.destroy();
    }

    if (killed) {
      // Микро hit-stop
      this.physics.pause();
      this.time.delayedCall(14, () => {
        this.physics.resume();
      });

      enemy.die(bullet.x, bullet.y);

      // Статистика: убийство (score обновляется внутри MatchStatsSystem)
      if (enemy.type === "runner" || enemy.type === "tank") {
        this.matchStatsSystem.onEnemyKilled(enemy.type);
      } else {
        // fast/heavy count as total kills only
        this.matchStatsSystem.onEnemyKilledTotalOnly();
      }

      // Update score UI from MatchStatsSystem
      const summary = this.matchStatsSystem.getSummary();
      this.score = summary.score;
      this.scoreText.setText(`Score: ${this.score}`);

      this.addXP(1);
      this.maybeDropLoot(enemy.x, enemy.y);
      // Weapon-drop spawn with constraints
      this.maybeSpawnWeaponDrop(enemy.x, enemy.y);
      // Buff loot spawn
      this.maybeSpawnBuffLoot(enemy.x, enemy.y);
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
    this.matchStatsSystem.onPlayerDamaged(1);
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
  // @ts-ignore - unused method, kept for potential future use
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
    const mult = this.getStageSpeedMultiplier(this.stageSystem.getStage());
    const children = this.enemies.getChildren();
    for (let i = 0; i < children.length; i++) {
      const enemy = children[i] as Enemy;
      if (enemy && enemy.active) {
        const isDying = (enemy as any).isDying;
        if (!isDying) {
          // Если сейчас burst, учитываем burst multiplier
          const finalMult =
            this.stageSystem.getBurstState() === "burst"
              ? mult * BURST_SPEED_BOOST
              : mult;
          enemy.setSpeedMultiplier(finalMult);
        }
      }
    }
  }

  // @ts-ignore - Method kept for potential future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private getStageRunnerHP(stage: number): number {
    // runner: 1 HP до стадии 4, затем 2 до стадии 7, затем 3
    if (stage >= 7) return 3;
    if (stage >= 4) return 2;
    return 1;
  }

  // @ts-ignore - Method kept for potential future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      // Level tracking (used in printMatchSummary)

      // Level up без показа overlay - прокачка только через перки между стадиями

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

  // Убрали showLevelUpOverlay() - теперь прокачка только через перки между стадиями

  private updateXPText() {
    const needed = this.getXPToNextLevel(this.level);
    this.xpText.setText(`LVL: ${this.level}  XP: ${this.xp}/${needed}`);
  }

  private updateAmmoUI(_time: number) {
    if (!this.weaponSystem) {
      return;
    }

    const state = this.weaponSystem.getState();
    this.ammoText.setText(`Ammo: ${state.ammoInMag}/${state.magazineSize}`);

    // Показываем/скрываем прогресс-бар перезарядки
    if (state.isReloading) {
      this.reloadProgressBarBg.setVisible(true);
      this.reloadProgressBar.setVisible(true);

      // Обновляем ширину прогресс-бара (0-200px)
      const barWidth = 200 * state.reloadProgress01;
      this.reloadProgressBar.setSize(barWidth, 8);
    } else {
      this.reloadProgressBarBg.setVisible(false);
      this.reloadProgressBar.setVisible(false);
    }
  }

  // Метод для будущей реализации смены оружия при подборе weapon-drop
  // Пока не используется, но оставлен для будущей реализации
  private switchWeaponTo(key: "pistol" | "shotgun"): void {
    const weaponId: "PISTOL" | "SHOTGUN" =
      key === "pistol" ? "PISTOL" : "SHOTGUN";

    if (this.weaponSystem.getCurrentWeaponId() === weaponId) {
      return;
    }

    // Статистика: смена оружия
    this.weaponSwitches++;

    // Заменяем оружие через WeaponSystem
    this.weaponSystem.switchWeapon(weaponId);
    this.updateAmmoUI(this.time.now);
  }

  // ============================================
  // STABLE SPAWN SCHEDULER
  // ============================================

  private getSpawnMultiplier(): number {
    if (this.stageSystem.getBurstState() === "burst") {
      return 1 - BURST_SPAWN_REDUCTION; // e.g. 0.55 (45% faster)
    }
    if (this.stageSystem.getBurstState() === "recovery") {
      return RECOVERY_SPAWN_MULTIPLIER; // e.g. 1.2 (20% slower)
    }
    return 1.0;
  }

  // Spawn scheduler methods removed - now handled by SpawnSystem
  // TODO: Remove deprecated methods after full integration

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
      return loot.active && loot.lootType === type;
    });
  }

  private maybeSpawnWeaponDrop(x: number, y: number): void {
    const now = this.time.now;

    // Проверка cooldown
    if (now - this.lastWeaponDropTime < WEAPON_DROP_COOLDOWN_MS) {
      return;
    }

    // Проверка: уже есть активный weapon-drop на карте
    if (this.hasLootOfType("weapon-drop")) {
      return;
    }

    // Базовый шанс выпадения
    if (Math.random() >= WEAPON_DROP_BASE_CHANCE) {
      return;
    }

    // Спавним weapon-drop (also has TTL via LootPickup)
    const weaponLoot = new LootPickup(this, x, y, "weapon-drop");
    this.loot.add(weaponLoot);
    this.lastWeaponDropTime = now;

    // Log weapon drop with TTL
    const ttlMs = Phaser.Math.Between(8000, 12000);
    console.log(`[LOOT] weapon-drop dropped: ttl=${ttlMs}ms`);
  }

  private maybeSpawnBuffLoot(x: number, y: number): void {
    const now = this.time.now;

    // 1) Roll for drop chance (if chance fails, don't log anything)
    const dropRoll = Math.random();
    if (dropRoll >= BUFF_DROP_CHANCE) {
      return; // No drop attempt, no log
    }

    // 2) Check cooldown (if on cooldown, count as skip for throttled logs)
    if (now - this.lastBuffDropTime < BUFF_DROP_COOLDOWN_MS) {
      // Throttle cooldown logs: log at most once per 3 seconds, or every 10th skip
      this.cooldownLogSkipCount++;
      const timeSinceLastLog = now - this.lastCooldownLogTime;
      if (timeSinceLastLog >= 3000 || this.cooldownLogSkipCount >= 10) {
        console.log(
          `[LOOT] buff drop skipped (cooldown) x${this.cooldownLogSkipCount}`
        );
        this.lastCooldownLogTime = now;
        this.cooldownLogSkipCount = 0;
      }
      return;
    }

    // 3) Limit active buff loot items
    const activeBuffLootCount = Array.from(this.activeBuffLoot).filter(
      (loot) => loot && loot.active
    ).length;
    if (activeBuffLootCount >= BUFF_MAX_ON_MAP) {
      console.log(`[LOOT] buff drop skipped (limit)`);
      return;
    }

    // 4) Roll for buff type using weights (freeze: 45%, rapid: 35%, double: 20%)
    const typeRoll = Math.random();
    let buffType: LootType | null = null;

    if (typeRoll < BUFF_FREEZE_WEIGHT) {
      buffType = "buff-freeze";
    } else if (typeRoll < BUFF_FREEZE_WEIGHT + BUFF_RAPID_WEIGHT) {
      buffType = "buff-rapid";
    } else if (
      typeRoll <
      BUFF_FREEZE_WEIGHT + BUFF_RAPID_WEIGHT + BUFF_DOUBLE_WEIGHT
    ) {
      buffType = "buff-double";
    } else {
      // Fallback (shouldn't happen if weights sum to 1.0)
      buffType = "buff-freeze";
    }

    // 5) Do not drop a buff if that buff is currently active
    const buffKey = buffType.replace("buff-", "") as
      | "rapid"
      | "double"
      | "freeze";
    if (this.buffSystem.isActive(buffKey)) {
      console.log(`[LOOT] buff drop skipped (active: ${buffKey})`);
      return;
    }

    // 6) Spawn buff loot
    const ttlMs = Phaser.Math.Between(8000, 12000);
    const buffLoot = new LootPickup(this, x, y, buffType);
    this.loot.add(buffLoot);
    this.activeBuffLoot.add(buffLoot);

    // Reset cooldown log counter on successful spawn
    this.cooldownLogSkipCount = 0;

    // Log spawn with TTL
    console.log(`[LOOT] buff dropped: ${buffType} ttl=${ttlMs}ms`);

    // Update cooldown
    this.lastBuffDropTime = now;
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
        this.matchStatsSystem.onPlayerHealed(1);
        this.updateHealthText();
        break;
      case "speed":
        this.player.applySpeedBoost(1.5, 4000); // x1.5 на 4 секунды
        this.matchStatsSystem.onPlayerSpeedChanged(1);
        break;
      case "weapon-drop":
        console.log("[LOOT] weapon-drop picked");
        this.lastWeaponDropTime = this.time.now; // Обновляем cooldown при подборе
        this.onWeaponDropPicked();
        break;
      case "buff-rapid":
        console.log(`[LOOT] buff picked: buff-rapid`);
        this.buffSystem.startBuff("rapid");
        break;
      case "buff-double":
        console.log(`[LOOT] buff picked: buff-double`);
        this.buffSystem.startBuff("double");
        break;
      // PIERCE removed from loot - only available via Stage Clear perk
      case "buff-freeze":
        console.log(`[LOOT] buff picked: buff-freeze`);
        this.buffSystem.startBuff("freeze");
        break;
    }

    // Remove from tracking if it's a buff loot or weapon-drop
    if (loot.lootType.startsWith("buff-") || loot.lootType === "weapon-drop") {
      this.activeBuffLoot.delete(loot);
    }

    loot.destroy();
  }

  // ============================================
  // BUFF SYSTEM (moved to BuffSystem)
  // ============================================
  // TODO: Remove deprecated methods after full integration
  // @deprecated Use buffSystem.startBuff() instead
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  // @ts-ignore - deprecated method, kept for compatibility
  private applyBuff(type: BuffType, durationMs: number): void {
    // Moved to buffSystem.startBuff()
  }

  // @deprecated Use buffSystem.update() instead
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  // @ts-ignore - deprecated method, kept for compatibility
  private updateBuffs(time: number): void {
    // Moved to buffSystem.update()
  }

  // @ts-ignore - method is used but linter doesn't see it
  private applyEnemySpeedMultiplier(): void {
    if (!this.enemies) {
      return;
    }
    try {
      const children = this.enemies.getChildren();
      if (children && Array.isArray(children)) {
        children.forEach((obj) => {
          const enemy = obj as Enemy;
          if (enemy && enemy.active && !enemy.isFrozen()) {
            const stageSpeedMult = this.getStageSpeedMultiplier(
              this.stageSystem.getStage()
            );
            const burstMult =
              this.stageSystem.getBurstState() === "burst"
                ? BURST_SPEED_BOOST
                : 1.0;
            enemy.setSpeedMultiplier(
              stageSpeedMult * burstMult * this.enemySpeedMultiplier
            );
          }
        });
      }
    } catch (e) {
      // Group not fully initialized, ignore
    }
  }

  // TODO: Remove after BuffSystem integration complete
  // @deprecated Use buffSystem methods instead
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  // @ts-ignore - deprecated method, kept for compatibility
  private applyFreezeToAllEnemies(): void {
    // Moved to buffSystem
  }

  // TODO: Remove after BuffSystem integration complete
  // @deprecated Use buffSystem methods instead
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  // @ts-ignore - deprecated method, kept for compatibility
  private removeFreezeFromAllEnemies(): void {
    // Moved to buffSystem - this method is no longer used
    // Freeze removal is handled by buffSystem.removeBuff("freeze")
  }

  private updateBuffHud(time?: number): void {
    if (!this.buffHudText) return;

    // Update every 200ms to avoid string churn
    if (time !== undefined) {
      if (time - this.lastBuffHudUpdate < 200) {
        return;
      }
      this.lastBuffHudUpdate = time;
    }

    const now = time ?? this.time.now;
    const activeBuffs = this.buffSystem.getActiveBuffs();

    if (activeBuffs.size === 0) {
      this.buffHudText.setText("");
      return;
    }

    const lines: string[] = [];

    for (const [type, buff] of activeBuffs.entries()) {
      const remaining = Math.max(0, buff.endTime - now);
      const seconds = (remaining / 1000).toFixed(1);
      const typeUpper = type.toUpperCase();
      lines.push(`${typeUpper} ${seconds}s`);
    }

    this.buffHudText.setText(lines.join("\n"));
  }

  private handleGameOver() {
    if (this.gameOver) {
      return;
    }

    this.gameOver = true;
    this.overlaySystem.open("gameover");

    // Clear buff loot tracking on game over
    this.activeBuffLoot.forEach((loot) => {
      if (loot && loot.active) {
        loot.destroy();
      }
    });
    this.activeBuffLoot.clear();

    // Печатаем статистику при Game Over
    this.stageResultSystem.onMatchEnd(this.time.now);
    this.printMatchSummary("GAME_OVER");

    // Останавливаем планировщик спавна
    this.spawnSystem.stop();

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
    this.weaponSystem.setSuppressShootingUntil(this.time.now + 200);

    this.isStarted = true;
    this.overlaySystem.close();

    // Устанавливаем время начала забега
    this.runStartTime = this.time.now;
    this.currentPhase = 1;

    // Инициализируем stage system
    this.stageSystem.start(this.time.now);

    // Обновляем статистику при старте
    this.matchStatsSystem.reset(this.time.now);

    // Block shooting for short time after start
    this.weaponSystem.setSuppressShootingUntil(this.time.now + 200);

    // Стартуем стабильный планировщик спавна
    this.spawnSystem.start(this.time.now);

    // Stage start уже залогирован в callback

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
    // Close any open overlays on restart
    if (this.overlaySystem) {
      this.overlaySystem.close();
    }

    // Clear all buffs and unfreeze enemies on restart
    if (this.buffSystem) {
      this.buffSystem.reset();
    }
    this.enemySpeedMultiplier = 1.0;
    // Freeze removal is handled by buffSystem.reset()
    // Reset stage system
    if (this.stageSystem) {
      this.stageSystem.reset(this.time.now);
    }

    // Clear buff loot tracking and destroy all buff loot items
    this.activeBuffLoot.forEach((loot) => {
      if (loot && loot.active) {
        loot.destroy();
      }
    });
    this.activeBuffLoot.clear();
    this.lastBuffDropTime = 0;

    // Reset match stats
    if (this.matchStatsSystem) {
      this.matchStatsSystem.reset(this.time.now);
    }

    // Reset perk system
    if (this.perkSystem) {
      this.perkSystem.reset();
      this.playerPierceLevel = 0;
    }
  }

  private printMatchSummary(reason: "GAME_OVER" | "RESTART" | "MANUAL"): void {
    // Get match summary from StageResultSystem
    const summary = this.stageResultSystem.getMatchSummary();

    // Get current game state values
    const weaponStart =
      this.weaponSystem?.getCurrentWeapon()?.getStats()?.name ?? "PISTOL";
    const weaponCurrent =
      this.weaponSystem?.getCurrentWeapon()?.getStats()?.name ?? "UNKNOWN";

    console.groupCollapsed(
      `[MATCH] ${reason} | ${summary.durationSec.toFixed(1)}s | score=${
        summary.score
      } lvl=${this.level} phase=${this.currentPhase}`
    );
    console.log(
      `Weapon: ${weaponStart} -> ${weaponCurrent} (switches: ${this.weaponSwitches})`
    );
    console.log(
      `Shots: proj fired=${summary.shotsFired}, hit=${
        summary.shotsHit
      }, acc=${summary.accuracy.toFixed(1)}%`
    );
    console.log(
      `Kills: total=${summary.killsTotal} (runner=${summary.killsRunner}, tank=${summary.killsTank})`
    );
    console.log(
      `Player: damageTaken=${summary.damageTaken}, heals=${summary.heals}, speed=${summary.speed}`
    );
    console.groupEnd();
  }

  // ============================================
  // STAGE SYSTEM
  // ============================================

  // updateStageSystem removed - now handled by stageSystem.update()

  private endStage(_survived: boolean): void {
    // Logging handled in StageSystem.onStageEnd callback
    // No duplicate log here
  }

  private onStageClear(): void {
    // Clear buff loot tracking on stage clear
    this.activeBuffLoot.forEach((loot) => {
      if (loot && loot.active) {
        loot.destroy();
      }
    });
    this.activeBuffLoot.clear();
    this.lastBuffDropTime = 0;
    if (this.gameOver || !this.isStarted || this.isStageClear) {
      return;
    }

    this.isStageClear = true;
    this.overlaySystem.open("stageclear");

    // Останавливаем спавн
    this.spawnSystem.stop();

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

    console.log(`[STAGE] CLEAR stage=${this.stageSystem.getStage()}`);
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
      .text(
        width / 2,
        height / 2 - 180,
        `STAGE ${this.stageSystem.getStage()} CLEAR`,
        {
          fontSize: "56px",
          color: "#ffffff",
          fontStyle: "bold",
        }
      )
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
    const perks = this.perkSystem.getAvailablePerks();

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
          // Stop event propagation to prevent gameplay input
          if (event?.stopPropagation) {
            event.stopPropagation();
          }
          // Логируем выбор перка
          console.log(`[PERK] picked ${perk.title}`);
          perk.apply(); // This calls PerkSystem.applyPerk() internally
          // Переходим к следующей стадии
          this.continueToNextStage();
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

  // getStageClearPerks() removed - now handled by PerkSystem.getAvailablePerks()

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
    this.overlaySystem.close();
    this.hideStageClearOverlay();

    // Возобновляем физику
    this.physics.world.resume();

    // StageSystem уже инкрементировал стадию в update() через callback onStageEnd
    // Просто применяем эффекты для новой стадии
    const now = this.time.now;

    // Применяем stage speed multiplier ко всем врагам
    this.applyStageSpeedToEnemies();

    // Запускаем спавн
    this.spawnSystem.start(now);

    // Logging handled in StageSystem.onStageStart callback
    // No duplicate log here
  }

  // Burst cycle methods removed - now handled by StageSystem

  private applyBurstSpeedToEnemies(apply: boolean): void {
    const children = this.enemies.getChildren();
    const stageMult = this.getStageSpeedMultiplier(this.stageSystem.getStage());
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
