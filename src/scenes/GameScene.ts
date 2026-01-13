import Phaser from "phaser";
import { Player } from "../entities/Player";
import { Bullet } from "../entities/Bullet";
import { Enemy, EnemyType } from "../entities/Enemy";
import { LootPickup, LootType } from "../entities/LootPickup";
import { Weapon } from "../weapons/types";
import { BasicGun } from "../weapons/BasicGun";
import { Shotgun } from "../weapons/Shotgun";
import { LevelUpOption } from "../ui/LevelUpOverlay";
import { StageSystem } from "../systems/StageSystem";

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

// Buff durations (ms)
const BUFF_RAPID_DURATION_MS = 8000;
const BUFF_DOUBLE_DURATION_MS = 10000;
const BUFF_FREEZE_DURATION_MS = 6000;
const BUFF_MAX_DURATION_MS = 20000; // Cap for stacking

// Buff spawn chances (PIERCE removed - only available via Stage Clear perk)
const BUFF_RAPID_CHANCE = 0.012; // 1.2%
const BUFF_DOUBLE_CHANCE = 0.009; // 0.9%
const BUFF_FREEZE_CHANCE = 0.006; // 0.6%

// Max active buff loot on map
const MAX_ACTIVE_BUFF_LOOT = 2;

// Global cooldown for buff drops (ms)
const BUFF_DROP_COOLDOWN_MS = 12000;

// Buff types
type BuffType = "rapid" | "double" | "pierce" | "freeze";
type ActiveBuff = {
  type: BuffType;
  endTime: number; // When buff expires
};

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

  // Stage system (moved to StageSystem)
  private stageSystem!: StageSystem;

  // Match stats
  private stats!: MatchStats;
  private debugLogs = false; // выключить шумные логи

  // Stage Clear perks
  private playerPierceLevel = 0; // Сколько врагов может пробить пуля

  // Weapon-drop constraints
  private lastWeaponDropTime = 0; // Time when weapon-drop was spawned or picked

  // Buff loot tracking
  private lastBuffDropTime = 0; // Time when last buff loot was dropped
  private activeBuffLoot = new Set<LootPickup>(); // Track active buff loot items

  // Active buffs system
  private activeBuffs = new Map<BuffType, ActiveBuff>();
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

    // Сбрасываем параметры сложности
    this.currentBaseSpawnDelayMs = 1000;
    this.spawnDelayMultiplier = 1.0;
    this.nextSpawnAtMs = 0;
    this.lastSpawnDebugLog = 0;

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

    // Оружие: стартовый пистолет
    this.weapon = new BasicGun({});
    this.weapon.refillAndReset();

    // Инициализируем статистику после создания оружия
    this.resetMatchStats();

    // Инициализируем StageSystem
    this.stageSystem = new StageSystem(this, {
      onStageStart: (stage: number) => {
        console.log(`[STAGE] START stage=${stage}`);
      },
      onStageEnd: (stage: number, survived: boolean) => {
        console.log(`[STAGE] END stage=${stage} survived=${survived}`);
        this.endStage(survived);
        this.onStageClear();
      },
      onBurstStart: (stageElapsedSec: number, durationSec: number) => {
        console.log(
          `[BURST] START t=${stageElapsedSec.toFixed(
            1
          )}s duration=${durationSec.toFixed(1)}s`
        );
        // Обновляем множитель спавна
        this.spawnDelayMultiplier = this.getSpawnMultiplier();
        // Немедленно применяем burst эффект: "подтягиваем" следующий спавн ближе
        const base = this.getPhaseSettings(this.currentPhase).spawnDelayMs;
        const mult = this.getSpawnMultiplier();
        const desired = this.time.now + base * mult;
        this.nextSpawnAtMs = Math.min(this.nextSpawnAtMs, desired);
        // Применяем speed boost ко всем активным врагам
        this.applyBurstSpeedToEnemies(true);
      },
      onBurstEnd: () => {
        console.log(`[BURST] END`);
        // Убираем speed boost
        this.applyBurstSpeedToEnemies(false);
        // Обновляем множитель спавна
        this.spawnDelayMultiplier = this.getSpawnMultiplier();
        // Немедленно применяем recovery эффект: "отодвигаем" следующий спавн дальше
        const base = this.getPhaseSettings(this.currentPhase).spawnDelayMs;
        const mult = this.getSpawnMultiplier();
        const desired = this.time.now + base * mult;
        this.nextSpawnAtMs = Math.max(this.nextSpawnAtMs, desired);
      },
      onBurstStateChanged: (_state) => {
        // Обновляем множитель спавна при изменении состояния burst
        this.spawnDelayMultiplier = this.getSpawnMultiplier();
      },
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
      (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: any) => {
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
    if (this.isStarted && !this.gameOver) {
      this.stageSystem.update(time);
    }
    this.updateBuffs(time);
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

    // Apply RAPID buff: reduce fire rate by 50%
    const rapidActive = this.activeBuffs.has("rapid");
    const baseFireRate = this.weapon.getStats().fireRateMs;
    const effectiveFireRate = rapidActive ? baseFireRate * 0.5 : baseFireRate;

    // Check fire rate with buff
    const weaponLastShot = (this.weapon as any).lastShotTime || 0;
    if (time < weaponLastShot + effectiveFireRate) {
      return;
    }

    // DOUBLE buff: weapon-specific behavior
    const doubleActive = this.activeBuffs.has("double");
    const isShotgun = this.weapon.key === "shotgun";
    const weapon = this.weapon as any;

    // Track if first shot succeeded
    let firstShotSucceeded = false;

    // DOUBLE buff: bypass ammo/reload (infinite ammo)
    const bypassAmmo = doubleActive;

    // First shot: use weapon.tryFire (handles ammo, reload, fireRate update)
    this.weapon.tryFire({
      scene: this,
      time,
      playerX: this.player.x,
      playerY: this.player.y,
      aimAngle: aimAngle,
      bullets: this.bullets,
      bypassAmmo: bypassAmmo,
      onBulletSpawned: (bullet: Bullet) => {
        firstShotSucceeded = true;
        this.stats.shotsFired++;
        // Применяем pierce perk к пуле (only from Stage Clear perk)
        if (this.playerPierceLevel > 0) {
          bullet.pierceLeft = this.playerPierceLevel;
        }
      },
    });

    // DOUBLE buff: weapon-specific second shot
    if (doubleActive && firstShotSucceeded && !weapon._isReloading) {
      if (isShotgun) {
        // Shotgun: schedule second shot after 100ms delay (bypassAmmo for DOUBLE)
        this.time.delayedCall(100, () => {
          // Check buff still active and weapon still ready (bypassAmmo means no ammo check needed)
          if (
            !this.activeBuffs.has("double") ||
            (weapon._isReloading && !bypassAmmo)
          ) {
            return;
          }
          // Fire second shotgun shot (bypassAmmo=true for DOUBLE)
          this.weapon.tryFire({
            scene: this,
            time: this.time.now,
            playerX: this.player.x,
            playerY: this.player.y,
            aimAngle: aimAngle,
            bullets: this.bullets,
            bypassAmmo: true, // DOUBLE buff: infinite ammo
            onBulletSpawned: (bullet: Bullet) => {
              this.stats.shotsFired++;
              // Apply pierce perk (only from Stage Clear perk)
              if (this.playerPierceLevel > 0) {
                bullet.pierceLeft = this.playerPierceLevel;
              }
            },
          });
        });
      } else {
        // Pistol: spawn second bullet immediately with spread (no extra ammo cost)
        const spreadAngle = 0.08; // +/- 0.08 rad for double shot
        const bulletAngle = aimAngle + spreadAngle;
        const bullet = new Bullet(this, this.player.x, this.player.y);
        this.bullets.add(bullet);

        // Count as fired
        this.stats.shotsFired++;

        // Apply pierce perk (only from Stage Clear perk)
        if (this.playerPierceLevel > 0) {
          bullet.pierceLeft = this.playerPierceLevel;
        }

        // Set velocity
        const speed = bullet.speed;
        const vx = Math.cos(bulletAngle) * speed;
        const vy = Math.sin(bulletAngle) * speed;
        const body = bullet.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(vx, vy);
        body.setAllowGravity(false);
      }
    }
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
      return;
    }

    // 3) Выбор типа по весам (с учётом burst и stage)
    let runnerWeight = settings.weights.runner;
    let tankWeight = settings.weights.tank;

    // Применяем stage modifier для веса танков
    tankWeight = Math.round(
      tankWeight *
        this.getStageTankWeightMultiplier(this.stageSystem.getStage())
    );

    // Во время burst увеличиваем вес runner
    if (this.stageSystem.getBurstState() === "burst") {
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
    if (this.activeBuffs.has("freeze")) {
      enemy.setFrozen(true);
      console.log(`[BUFF] freeze applied to spawned enemy`);
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

    // Помечаем врага как обработанного (до любых других операций)
    bullet.markEnemyHit(enemy);

    // Визуальный фидбек до уничтожения пули
    enemy.applyHitFeedback(bullet.x, bullet.y, this.time.now);

    // Статистика: попадание
    this.stats.shotsHit++;

    // Наносим урон (урон игрока, без бонуса оружия)
    const totalDamage = this.player.getDamage();
    const killed = enemy.takeDamage(totalDamage);

    // Проверяем pierce: если пуля может пробить, уменьшаем счётчик и не уничтожаем
    const bulletBody = bullet.body as Phaser.Physics.Arcade.Body | undefined;
    if (bullet.pierceLeft > 0) {
      bullet.pierceLeft--;
      // Пуля продолжает полёт и может попасть в другого врага
    } else {
      // Пуля не может пробить - отключаем коллайдер и уничтожаем
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
    if (this.stageSystem.getBurstState() === "burst") {
      return 1 - BURST_SPAWN_REDUCTION; // e.g. 0.55 (45% faster)
    }
    if (this.stageSystem.getBurstState() === "recovery") {
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
    this.nextSpawnAtMs =
      time + this.currentBaseSpawnDelayMs * this.spawnDelayMultiplier;

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
    baseDelay =
      baseDelay *
      this.getStageSpawnDelayMultiplier(this.stageSystem.getStage());
    baseDelay = Math.max(MIN_SPAWN_DELAY_MS, baseDelay);
    this.currentBaseSpawnDelayMs = baseDelay;

    // Пересчитываем множитель (на случай смены burst/recovery)
    this.spawnDelayMultiplier = this.getSpawnMultiplier();

    // Устанавливаем время следующего спавна
    this.nextSpawnAtMs =
      now + this.currentBaseSpawnDelayMs * this.spawnDelayMultiplier;

    // Временный debug лог (только если debugLogs включен)
    if (this.debugLogs && now - this.lastSpawnDebugLog >= 5000) {
      this.lastSpawnDebugLog = now;
      const nextIn = Math.max(0, this.nextSpawnAtMs - now);
      console.log(
        `[SPAWNDBG] alive=${alive} nextIn=${nextIn.toFixed(
          0
        )}ms state=${this.stageSystem.getBurstState()} mult=${this.spawnDelayMultiplier.toFixed(
          2
        )}`
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

    // 1) Global cooldown check
    if (now - this.lastBuffDropTime < BUFF_DROP_COOLDOWN_MS) {
      console.log(`[LOOT] buff drop skipped (cooldown)`);
      return;
    }

    // 2) Limit active buff loot items (max 2)
    const activeBuffLootCount = Array.from(this.activeBuffLoot).filter(
      (loot) => loot && loot.active
    ).length;
    if (activeBuffLootCount >= MAX_ACTIVE_BUFF_LOOT) {
      console.log(`[LOOT] buff drop skipped (limit)`);
      return;
    }

    // 3) Roll for buff type (PIERCE removed - only available via Stage Clear)
    const roll = Math.random();
    let buffType: LootType | null = null;

    // Total chance: RAPID + DOUBLE + FREEZE (PIERCE removed)
    const totalChance =
      BUFF_RAPID_CHANCE + BUFF_DOUBLE_CHANCE + BUFF_FREEZE_CHANCE;

    if (roll < BUFF_RAPID_CHANCE) {
      buffType = "buff-rapid";
    } else if (roll < BUFF_RAPID_CHANCE + BUFF_DOUBLE_CHANCE) {
      buffType = "buff-double";
    } else if (roll < totalChance) {
      buffType = "buff-freeze";
    } else {
      // No buff drop
      return;
    }

    // 4) Do not drop a buff if that buff is currently active
    const buffKey = buffType.replace("buff-", "") as BuffType;
    if (this.activeBuffs.has(buffKey)) {
      console.log(`[LOOT] buff drop skipped (active: ${buffKey})`);
      return;
    }

    // 5) Spawn buff loot
    const buffLoot = new LootPickup(this, x, y, buffType);
    this.loot.add(buffLoot);
    this.activeBuffLoot.add(buffLoot);

    // Calculate TTL for logging
    const ttlMs = Phaser.Math.Between(8000, 12000);
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
        this.stats.healsPicked++;
        this.updateHealthText();
        break;
      case "speed":
        this.player.applySpeedBoost(1.5, 4000); // x1.5 на 4 секунды
        this.stats.speedPicked++;
        break;
      case "weapon-drop":
        console.log("[LOOT] weapon-drop picked");
        this.lastWeaponDropTime = this.time.now; // Обновляем cooldown при подборе
        this.onWeaponDropPicked();
        break;
      case "buff-rapid":
        this.applyBuff("rapid", BUFF_RAPID_DURATION_MS);
        break;
      case "buff-double":
        this.applyBuff("double", BUFF_DOUBLE_DURATION_MS);
        break;
      // PIERCE removed from loot - only available via Stage Clear perk
      case "buff-freeze":
        this.applyBuff("freeze", BUFF_FREEZE_DURATION_MS);
        break;
    }

    // Remove from tracking if it's a buff loot or weapon-drop
    if (loot.lootType.startsWith("buff-") || loot.lootType === "weapon-drop") {
      this.activeBuffLoot.delete(loot);
    }

    loot.destroy();
  }

  // ============================================
  // BUFF SYSTEM
  // ============================================

  private applyBuff(type: BuffType, durationMs: number): void {
    const now = this.time.now;
    const existing = this.activeBuffs.get(type);

    if (existing) {
      // DOUBLE: refresh duration only (no stacking)
      // Other buffs: extend duration (cap at BUFF_MAX_DURATION_MS)
      if (type === "double") {
        const newEndTime = now + durationMs;
        const remaining = durationMs;
        this.activeBuffs.set(type, { type, endTime: newEndTime });
        console.log(
          `[BUFF] refresh type=${type} remain=${remaining.toFixed(0)}ms`
        );
      } else {
        const newEndTime = Math.min(
          existing.endTime + durationMs,
          now + BUFF_MAX_DURATION_MS
        );
        const remaining = newEndTime - now;
        this.activeBuffs.set(type, { type, endTime: newEndTime });
        console.log(
          `[BUFF] extend type=${type} remain=${remaining.toFixed(0)}ms`
        );

        // Re-apply effects if needed (for freeze, re-apply to all enemies)
        if (type === "freeze") {
          this.applyFreezeToAllEnemies();
        }
      }
    } else {
      // Start new buff
      const endTime = now + durationMs;
      this.activeBuffs.set(type, { type, endTime });
      console.log(`[BUFF] start type=${type} dur=${durationMs}ms`);

      // Apply immediate effects
      if (type === "freeze") {
        this.applyFreezeToAllEnemies();
      } else if (type === "double") {
        console.log(`[BUFF] double: reload bypass enabled`);
      }
    }
  }

  private updateBuffs(time: number): void {
    const expired: BuffType[] = [];

    for (const [type, buff] of this.activeBuffs.entries()) {
      if (time >= buff.endTime) {
        expired.push(type);
      }
    }

    for (const type of expired) {
      this.activeBuffs.delete(type);
      console.log(`[BUFF] end type=${type}`);

      // Remove effects
      if (type === "freeze") {
        this.removeFreezeFromAllEnemies();
      } else if (type === "double") {
        // DOUBLE ended: restore normal ammo behavior
        // Ensure ammo is valid (refill if needed)
        const weapon = this.weapon as any;
        if (weapon.ammo !== undefined && weapon.ammo <= 0) {
          weapon.refillAndReset();
        }
      }
    }
  }

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

  private applyFreezeToAllEnemies(): void {
    if (!this.enemies) {
      return; // enemies group not initialized yet
    }
    try {
      let count = 0;
      const children = this.enemies.getChildren();
      if (children && Array.isArray(children)) {
        children.forEach((obj) => {
          const enemy = obj as Enemy;
          if (enemy && enemy.active && !(enemy as any).isDying) {
            enemy.setFrozen(true);
            count++;
          }
        });
      }
      console.log(`[BUFF] freeze applied to ${count} enemies`);
    } catch (e) {
      // Group not fully initialized, ignore
    }
  }

  private removeFreezeFromAllEnemies(): void {
    if (!this.enemies) {
      return; // enemies group not initialized yet
    }
    try {
      let count = 0;
      const children = this.enemies.getChildren();
      if (children && Array.isArray(children)) {
        children.forEach((obj) => {
          const enemy = obj as Enemy;
          if (enemy && enemy.active) {
            enemy.setFrozen(false);
            count++;
          }
        });
      }
      // Restore speed multiplier after unfreeze
      this.enemySpeedMultiplier = 1.0;
      if (this.enemies) {
        this.applyEnemySpeedMultiplier();
      }
      if (count > 0) {
        console.log(`[BUFF] freeze removed from ${count} enemies`);
      }
    } catch (e) {
      // Group not fully initialized, ignore
    }
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

    if (this.activeBuffs.size === 0) {
      this.buffHudText.setText("");
      return;
    }

    const now = time ?? this.time.now;
    const lines: string[] = [];

    for (const [type, buff] of this.activeBuffs.entries()) {
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

    // Clear buff loot tracking on game over
    this.activeBuffLoot.forEach((loot) => {
      if (loot && loot.active) {
        loot.destroy();
      }
    });
    this.activeBuffLoot.clear();

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
    this.stageSystem.start(this.time.now);

    // Обновляем статистику при старте
    this.stats.startedAtMs = this.time.now;
    this.stats.weaponStart = this.weapon.getStats().name;
    this.stats.weaponCurrent = this.weapon.getStats().name;

    // Стартуем стабильный планировщик спавна
    this.startSpawnScheduler(this.time.now);

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
    // Clear all buffs and unfreeze enemies on restart
    this.activeBuffs.clear();
    this.enemySpeedMultiplier = 1.0;
    // Only remove freeze if enemies group is initialized
    if (this.enemies) {
      this.removeFreezeFromAllEnemies();
    }
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

  private printMatchSummary(reason: "GAME_OVER" | "RESTART" | "MANUAL"): void {
    // Обновляем текущие значения
    this.stats.score = this.score;
    this.stats.level = this.level;
    this.stats.phase = this.currentPhase;
    this.stats.weaponCurrent = this.weapon?.getStats()?.name ?? "UNKNOWN";

    // Фиксируем время окончания, если ещё не зафиксировано
    if (this.stats.endedAtMs === null) {
      this.stats.endedAtMs = this.time.now;
    }

    const durationSec = (this.stats.endedAtMs - this.stats.startedAtMs) / 1000;
    // Проверка: hit не должен превышать fired
    if (this.stats.shotsHit > this.stats.shotsFired) {
      console.warn(
        `[STATS BUG] hit > fired: fired=${this.stats.shotsFired}, hit=${this.stats.shotsHit}, weapon=${this.stats.weaponCurrent}`
      );
      // Исправляем: hit не может быть больше fired
      this.stats.shotsHit = Math.min(
        this.stats.shotsHit,
        this.stats.shotsFired
      );
    }

    const accuracy =
      this.stats.shotsFired > 0
        ? (this.stats.shotsHit / this.stats.shotsFired) * 100
        : 0;

    console.groupCollapsed(
      `[MATCH] ${reason} | ${durationSec.toFixed(1)}s | score=${
        this.stats.score
      } lvl=${this.stats.level} phase=${this.stats.phase}`
    );
    console.log(
      `Weapon: ${this.stats.weaponStart} -> ${this.stats.weaponCurrent} (switches: ${this.stats.weaponSwitches})`
    );
    console.log(
      `Shots: fired=${this.stats.shotsFired}, hit=${
        this.stats.shotsHit
      }, acc=${accuracy.toFixed(1)}%`
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

  // updateStageSystem removed - now handled by stageSystem.update()

  private endStage(survived: boolean): void {
    console.log(
      `[STAGE] END stage=${this.stageSystem.getStage()} survived=${survived}`
    );
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

    // StageSystem уже инкрементировал стадию в update() через callback onStageEnd
    // Просто применяем эффекты для новой стадии
    const now = this.time.now;

    // Применяем stage speed multiplier ко всем врагам
    this.applyStageSpeedToEnemies();

    // Запускаем спавн
    this.startSpawnScheduler(now);

    // Логируем параметры стадии
    const settings = this.getPhaseSettings(this.currentPhase);
    const spawnDelay = this.currentBaseSpawnDelayMs;
    const runnerHP = this.getStageRunnerHP(this.stageSystem.getStage());
    const tankHP = this.getStageTankHP(this.stageSystem.getStage());
    const speedMult = this.getStageSpeedMultiplier(this.stageSystem.getStage());
    const tankWeight = Math.round(
      settings.weights.tank *
        this.getStageTankWeightMultiplier(this.stageSystem.getStage())
    );
    console.log(
      `[STAGE] START stage=${this.stageSystem.getStage()} (spawnDelay=${spawnDelay.toFixed(
        0
      )}ms, weights=runner:${
        settings.weights.runner
      }/tank:${tankWeight}, hpRunner=${runnerHP}, hpTank=${tankHP}, speedMul=${speedMult.toFixed(
        2
      )})`
    );
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
