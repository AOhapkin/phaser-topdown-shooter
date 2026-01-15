import Phaser from "phaser";
import { Player } from "../entities/Player";
import { Bullet } from "../entities/Bullet";
import { Enemy } from "../entities/Enemy";
import { LootPickup, LootType } from "../entities/LootPickup";
// Weapon, BasicGun, and Shotgun moved to WeaponSystem
// LevelUpOption import removed - now handled by PerkSystem
import { StageSystem } from "../systems/StageSystem";
import { SpawnSystem } from "../systems/SpawnSystem";
import { BuffSystem } from "../systems/BuffSystem";
import { WeaponSystem } from "../systems/WeaponSystem";
import { OverlaySystem } from "../systems/OverlaySystem";
import { MatchStatsSystem } from "../systems/MatchStatsSystem";
import { StageResultSystem } from "../systems/StageResultSystem";
import { PerkSystem } from "../systems/PerkSystem";
import { LootDropSystem } from "../systems/LootDropSystem";
import { EnemySystem } from "../systems/EnemySystem";
import { CombatSystem } from "../systems/CombatSystem";
import { PlayerStateSystem } from "../systems/PlayerStateSystem";
import { GameContext } from "../systems/GameContext";
import type { WeaponId as WeaponConfigId } from "../config/WeaponsConfig";
import { GameTuning } from "../config/GameTuning";
import { GameSystems, GameSystemsCallbacks } from "../systems/GameSystems";

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

// Phase settings moved to GameTuning.spawn.phases
const PHASES: readonly PhaseSettings[] = GameTuning.spawn.phases;

// Burst modifiers moved to GameTuning.spawn.burst
const BURST_SPAWN_REDUCTION = GameTuning.spawn.burst.spawnReduction;
const BURST_RUNNER_WEIGHT_BOOST = GameTuning.spawn.burst.runnerWeightBoost;
const BURST_SPEED_BOOST = GameTuning.spawn.burst.speedBoost;
const RECOVERY_SPAWN_MULTIPLIER = GameTuning.spawn.recovery.spawnMultiplier;

// Weapon-drop and buff drop parameters moved to LootDropSystem

// Buff types (moved to BuffSystem, keeping for compatibility)
// TODO: Remove after full integration
type BuffType = "rapid" | "double" | "pierce" | "freeze";

// MatchStats type removed - now handled by MatchStatsSystem

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

  // Match state flags moved to MatchStateSystem
  // Legacy fields removed - use this.systems.matchStateSystem instead
  private gameOverText?: Phaser.GameObjects.Text;
  private startOverlay?: Phaser.GameObjects.Rectangle;
  private startTitleText?: Phaser.GameObjects.Text;
  private startHintText?: Phaser.GameObjects.Text;
  private startHintTween?: Phaser.Tweens.Tween;
  // suppressShootingUntil moved to WeaponSystem
  // TODO: Remove after full integration
  // private suppressShootingUntil = 0;
  private isLevelUpOpen = false;
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

  // Legacy system accessors (migrate to this.systems.* gradually)
  // Using getters to access systems from GameSystems container
  private get stageSystem(): StageSystem {
    return this.systems.stageSystem;
  }

  private get spawnSystem(): SpawnSystem {
    return this.systems.spawnSystem;
  }

  private get buffSystem(): BuffSystem {
    return this.systems.buffSystem;
  }

  private get weaponSystem(): WeaponSystem {
    return this.systems.weaponSystem;
  }

  private get overlaySystem(): OverlaySystem {
    return this.systems.overlaySystem;
  }

  private get matchStatsSystem(): MatchStatsSystem {
    return this.systems.matchStatsSystem;
  }

  private get stageResultSystem(): StageResultSystem {
    return this.systems.stageResultSystem;
  }

  private get perkSystem(): PerkSystem {
    return this.systems.perkSystem;
  }

  private get lootDropSystem(): LootDropSystem {
    return this.systems.lootDropSystem;
  }

  private get enemySystem(): EnemySystem {
    return this.systems.enemySystem;
  }

  private get combatSystem(): CombatSystem {
    return this.systems.combatSystem;
  }

  private get playerStateSystem(): PlayerStateSystem {
    return this.systems.playerStateSystem;
  }

  // Game systems container
  private systems!: GameSystems;

  private debugLogs = false; // выключить шумные логи

  // Weapon-drop and buff loot tracking moved to LootDropSystem

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

    // Резюмим физику при каждом старте/рестарте сцены
    this.physics.resume();

    // Spawn system parameters are reset via spawnSystem.reset()

    // Сбрасываем фазы
    this.runStartTime = 0;
    this.currentPhase = 1;

    // Match state flags will be reset via systems.resetMatch()

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

    // Debug hotkey: spawn weapon-drop (O) - only if debug enabled
    if (GameTuning.debug.enabled) {
      const weaponDropKey = this.input.keyboard?.addKey(
        Phaser.Input.Keyboard.KeyCodes.O
      );
      weaponDropKey?.on("down", () => {
        if (!this.systems) {
          return;
        }
        const playerPos = { x: this.player.x, y: this.player.y };
        // Spawn weapon-drop near player with small offset
        const offsetX = Phaser.Math.Between(-30, 30);
        const offsetY = Phaser.Math.Between(-30, 30);
        const spawnX = playerPos.x + offsetX;
        const spawnY = playerPos.y + offsetY;
        this.lootDropSystem.spawnWeaponLootDebug(spawnX, spawnY);
      });
    }

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

    // Группа врагов
    this.enemies = this.physics.add.group({
      classType: Enemy,
      runChildUpdate: true,
    });

    this.loot = this.physics.add.group({
      classType: LootPickup,
      runChildUpdate: false,
    });

    // Create player-enemies overlap
    this.physics.add.overlap(
      this.player,
      this.enemies,
      this
        .handleEnemyHitPlayer as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );

    // Create player-loot overlap
    this.physics.add.overlap(
      this.player,
      this.loot,
      this
        .handlePlayerPickupLoot as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );

    // Create GameContext with getters that read fresh values from GameScene
    // Note: matchStateSystem will be set after systems are created
    const logFn = (msg: string) => console.log(msg);

    const ctx: GameContext = {
      scene: this,
      player: this.player,
      bulletsGroup: this.bullets,
      enemiesGroup: this.enemies,
      lootGroup: this.loot,
      getMatchStateSystem: () => this.systems.matchStateSystem,
      getTimeNow: () => this.time.now,
      getIsActive: () => {
        const state = this.systems.matchStateSystem;
        return (
          state.isStarted() && !state.isGameOver() && !state.isStageClear()
        );
      },
      getIsStarted: () => this.systems.matchStateSystem.isStarted(),
      getIsGameOver: () => this.systems.matchStateSystem.isGameOver(),
      getIsStageClear: () => this.systems.matchStateSystem.isStageClear(),
      debugEnabled: () => this.debugLogs,
      log: logFn,
    };

    // Create GameSystems with callbacks
    const systemsCallbacks: GameSystemsCallbacks = {
      getIsStarted: () => this.systems.matchStateSystem.isStarted(),
      getGameOver: () => this.systems.matchStateSystem.isGameOver(),
      getIsStageClear: () => this.systems.matchStateSystem.isStageClear(),
      getIsLevelUpOpen: () => this.isLevelUpOpen,
      getCurrentPhase: () => this.currentPhase,
      getPhaseSettings: (phase: number) => this.getPhaseSettings(phase),
      getBurstState: () => this.stageSystem.getBurstState(),
      getSpawnDelayMultiplier: () => this.getSpawnMultiplier(),
      getEffectiveWeights: (settings, burstState) => {
        let runnerWeight = settings.weights.runner;
        let tankWeight = settings.weights.tank;
        tankWeight = Math.round(
          tankWeight *
            this.getStageTankWeightMultiplier(this.stageSystem.getStage())
        );
        if (burstState === "burst") {
          runnerWeight = Math.round(runnerWeight * BURST_RUNNER_WEIGHT_BOOST);
        }
        return { runner: runnerWeight, tank: tankWeight };
      },
      getStageTankWeightMultiplier: (stage: number) =>
        this.getStageTankWeightMultiplier(stage),
      getStageSpeedMultiplier: (stage: number) =>
        this.getStageSpeedMultiplier(stage),
      getEnemySpeedMultiplier: () => this.enemySpeedMultiplier,
      setEnemySpeedMultiplier: (mult: number) => {
        this.enemySpeedMultiplier = mult;
      },
      getAimAngle: () => {
        const pointer = this.input.activePointer;
        return Phaser.Math.Angle.Between(
          this.player.x,
          this.player.y,
          pointer.worldX,
          pointer.worldY
        );
      },
      getScore: () => this.score,
      setScore: (score: number) => {
        this.score = score;
      },
      updateHealthText: () => this.updateHealthText(),
      updateScoreText: (score: number) => {
        this.scoreText.setText(`Score: ${score}`);
      },
      addXP: (amount: number) => this.addXP(amount),
      maybeDropLoot: (x: number, y: number) => this.maybeDropLoot(x, y),
      pausePhysics: () => this.physics.pause(),
      resumePhysics: (delayMs: number) => {
        this.time.delayedCall(delayMs, () => {
          this.physics.resume();
        });
      },
      onStageEnd: (stage: number, survived: boolean) => {
        this.stageResultSystem.onStageEnd(stage);
        this.endStage(survived);
        this.onStageClear();
      },
      onBurstStart: (_stageElapsedSec: number, _durationSec: number) => {
        // Burst logging handled in StageSystem via ctx.log
        this.spawnSystem.onParamsChanged(this.time.now);
        this.enemySystem.applySpeedMultiplier(BURST_SPEED_BOOST);
      },
      onBurstEnd: () => {
        // Burst logging handled in StageSystem via ctx.log
        this.enemySystem.applySpeedMultiplier(1.0);
        this.spawnSystem.onParamsChanged(this.time.now);
      },
      onBurstStateChanged: (_state) => {
        this.spawnSystem.onParamsChanged(this.time.now);
      },
      updatePlayerPickupRadius: () => this.updatePlayerPickupRadius(),
      hasLootOfType: (type: string) => !this.hasLootOfType(type as LootType),
      onWeaponDropPicked: (_weaponId: WeaponConfigId | null) =>
        this.onWeaponDropPicked(_weaponId),
      log: (msg: string) => ctx.log?.(msg) ?? console.log(msg),
    };

    // Create GameSystems container
    this.systems = new GameSystems(ctx, systemsCallbacks);

    // Initialize systems (create overlaps, etc.)
    this.systems.init();

    // Reset systems to ensure clean state after scene restart
    // This ensures that restart always leads to the same initial state
    this.systems.resetMatch();
    this.enemySpeedMultiplier = 1.0;

    // Reset MatchStateSystem to initial state explicitly
    this.systems.matchStateSystem.setStarted(false);
    this.systems.matchStateSystem.setGameOver(false);
    this.systems.matchStateSystem.setStageClear(false);

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
    // Removed: debug logs should go through ctx.log if needed

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
    this.systems.matchStateSystem.setStarted(false);
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
    if (this.systems.matchStateSystem.isGameOver()) {
      if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
        this.scene.restart();
      }
      return;
    }

    if (!this.systems.matchStateSystem.isStarted()) {
      return;
    }

    if (this.isLevelUpOpen) {
      return;
    }

    if (this.systems.matchStateSystem.isStageClear()) {
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

    // Update all systems via GameSystems container
    if (this.systems) {
      this.systems.update(time);
    }

    this.updateBuffHud(time);

    if (this.player && !this.systems.matchStateSystem.isStageClear()) {
      this.player.update();
    }

    if (!this.systems.matchStateSystem.isStageClear()) {
      // Weapon system update is handled by GameSystems.update()

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

  // spawnEnemyByType() moved to EnemySystem.spawn()

  // TODO: Remove after SpawnSystem integration complete
  // @deprecated Use spawnEnemyByType instead
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  // @ts-ignore - deprecated method, kept for compatibility
  private spawnEnemy() {
    // This method is kept for compatibility but should not be called
    // SpawnSystem now handles enemy type selection
    console.warn("[DEPRECATED] spawnEnemy() called, use spawnEnemyByType()");
  }

  // handleBulletHitEnemy() moved to ProjectileSystem

  // Враг коснулся игрока - делегируем в CombatSystem
  private handleEnemyHitPlayer(
    _playerObj:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Tilemaps.Tile,
    enemyObj:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Tilemaps.Tile
  ): void {
    if (this.systems.matchStateSystem.isStageClear()) {
      return;
    }

    const enemy = enemyObj as Enemy;

    // Делегируем в CombatSystem
    this.combatSystem.onEnemyHitPlayer(enemy);

    if (!this.player.isAlive()) {
      this.handleGameOver();
    }
  }

  private updateHealthText() {
    const hp = this.player?.getHealth?.() ?? 0;
    const maxHp = this.player?.getMaxHealth?.() ?? 0;
    this.healthText.setText(`HP: ${hp}/${maxHp}`);
  }

  /**
   * Update player's pickup radius based on PlayerStateSystem magnet multiplier
   * This affects loot pickup overlap detection
   */
  private updatePlayerPickupRadius(): void {
    if (!this.player || !this.playerStateSystem) {
      return;
    }
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    if (!playerBody) {
      return;
    }
    // Base radius for loot pickup overlap (player's default collision radius)
    const baseRadius = 16;
    // Read magnet multiplier from unified stats snapshot
    const playerStats = this.playerStateSystem.getStats();
    const magnetMult = playerStats.magnetMultiplier;
    // Update collision radius to increase loot pickup range
    playerBody.setCircle(baseRadius * magnetMult);
  }

  private getElapsedSec(): number {
    if (this.runStartTime === 0) {
      return 0;
    }
    return Math.max(0, (this.time.now - this.runStartTime) / 1000);
  }

  private getPhaseNumber(elapsedSec: number): number {
    // Phase duration from GameTuning (all phases have same duration)
    const phaseDurationSec = GameTuning.spawn.phases[0]?.durationSec ?? 45;
    return Math.floor(elapsedSec / phaseDurationSec) + 1;
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
      GameTuning.spawn.minDelayMs,
      680 - Math.floor(extra / 1) * 35
    );
    return {
      phase,
      durationSec: GameTuning.spawn.phases[0]?.durationSec ?? 45,
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
    // Увеличиваем вес танков на 8% за стадию (из GameTuning)
    const perStagePercent =
      GameTuning.enemies.tankWeightScaling.perStagePercent;
    return Math.pow(1 + perStagePercent / 100, stage - 1);
  }

  private getStageSpeedMultiplier(stage: number): number {
    // Увеличиваем скорость врагов на 2% за стадию (из GameTuning)
    // Максимум 1.3 (не быстрее чем в 1.3 раза)
    const perStagePercent = GameTuning.enemies.speedScaling.perStagePercent;
    const maxMultiplier = GameTuning.enemies.speedScaling.maxMultiplier;
    return Math.min(maxMultiplier, 1.0 + (stage - 1) * (perStagePercent / 100));
  }

  private applyStageSpeedToEnemies(): void {
    // Применяем stage speed multiplier ко всем активным врагам
    // Stage multiplier is applied in EnemySystem.applySpeedMultiplier via getStageSpeedMultiplier callback
    const burstMult =
      this.stageSystem.getBurstState() === "burst" ? BURST_SPEED_BOOST : 1.0;
    this.enemySystem.applySpeedMultiplier(burstMult);
  }

  // @ts-ignore - Method kept for potential future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private getStageRunnerHP(stage: number): number {
    // runner: 1 HP до стадии 4, затем 2 до стадии 7, затем 3 (из GameTuning)
    const scaling = GameTuning.enemies.hpScaling.runner;
    if (stage >= 7) return scaling.stage7;
    if (stage >= 4) return scaling.stage4;
    return GameTuning.enemies.types.runner.baseHp;
  }

  // @ts-ignore - Method kept for potential future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private getStageTankHP(stage: number): number {
    // tank: 3 HP до стадии 4, затем 4 до стадии 7, затем 5 (из GameTuning)
    const scaling = GameTuning.enemies.hpScaling.tank;
    if (stage >= 7) return scaling.stage7;
    if (stage >= 4) return scaling.stage4;
    return GameTuning.enemies.types.tank.baseHp;
  }

  // getAliveTanksCount() moved to EnemySystem.getTankAliveCount()

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

  // Метод для смены оружия при подборе weapon-drop
  private switchWeaponTo(key: "pistol" | "shotgun" | "smg"): void {
    let weaponId: "PISTOL" | "SHOTGUN" | "SMG";
    if (key === "pistol") {
      weaponId = "PISTOL";
    } else if (key === "shotgun") {
      weaponId = "SHOTGUN";
    } else if (key === "smg") {
      weaponId = "SMG";
    } else {
      return; // Unknown weapon key
    }

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

    // Use systems context log if available (systems are created before this can be called)
    const logFn = this.systems
      ? ((this.systems as any).ctx as GameContext)?.log
      : undefined;
    const loot = new LootPickup(
      this,
      x,
      y,
      lootType,
      logFn ?? ((msg: string) => console.log(msg))
    );
    this.loot.add(loot);
  }

  private hasLootOfType(type: LootType): boolean {
    const children = this.loot?.getChildren?.() ?? [];
    return children.some((obj) => {
      const loot = obj as LootPickup;
      return loot.active && loot.lootType === type;
    });
  }

  // maybeSpawnWeaponDrop() and maybeSpawnBuffLoot() moved to LootDropSystem

  private handlePlayerPickupLoot(
    _playerObj:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Tilemaps.Tile,
    lootObj:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Tilemaps.Tile
  ) {
    if (this.systems.matchStateSystem.isStageClear()) {
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
      case "buff-rapid":
      case "buff-double":
      case "buff-freeze":
        // Handle buff and weapon-drop pickups through LootDropSystem
        this.lootDropSystem.onPickup(loot);
        break;
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
    if (this.systems.matchStateSystem.isGameOver()) {
      return;
    }

    this.systems.matchStateSystem.setGameOver(true);
    this.overlaySystem.open("gameover");

    // Clear buff loot tracking on game over (handled by LootDropSystem.reset())

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
    if (
      this.systems.matchStateSystem.isStarted() ||
      this.systems.matchStateSystem.isGameOver()
    ) {
      return;
    }

    // Важно: "съесть" клик, чтобы не было выстрела
    this.input.activePointer.isDown = false;

    // Блокируем стрельбу на короткое время после старта
    this.weaponSystem.setSuppressShootingUntil(this.time.now + 200);

    this.systems.matchStateSystem.setStarted(true);
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

  resetMatchStats(): void {
    // Use GameSystems.resetMatch() to reset all systems in correct order
    if (this.systems) {
      this.enemySpeedMultiplier = 1.0;
      this.systems.resetMatch();
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
    // Clear buff loot tracking on stage clear (handled by LootDropSystem)
    const state = this.systems.matchStateSystem;
    if (state.isGameOver() || !state.isStarted() || state.isStageClear()) {
      return;
    }

    this.systems.matchStateSystem.setStageClear(true);
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

    // Apply heal on clear perk if enabled
    if (this.playerStateSystem.hasHealOnClear()) {
      this.player.applyHeal(1);
      this.matchStatsSystem.onPlayerHealed(1);
      this.updateHealthText();
    }

    // Показываем overlay
    this.showStageClearOverlay();

    // Stage clear logging handled in StageSystem via ctx.log
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
    const perks = this.perkSystem.getRandomPick(3);

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
          // Perk logging handled in PerkSystem via ctx.log
          this.perkSystem.apply(perk.id);
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

  // getStageClearPerks() removed - now handled by PerkSystem.getRandomPick()

  private hideStageClearOverlay(): void {
    if (this.stageClearOverlay) {
      this.stageClearOverlay.destroy(true);
      this.stageClearOverlay = undefined;
    }
  }

  private onWeaponDropPicked(weaponId: WeaponConfigId | null): void {
    const currentWeaponId = this.weaponSystem.getCurrentWeaponId();

    // Log pickup event (use systems context log if available, fallback to console.log)
    const logFn = this.systems
      ? ((this.systems as any).ctx as GameContext)?.log
      : undefined;
    const log = logFn ?? ((msg: string) => console.log(msg));

    log(
      `[WEAPON_DROP] picked weaponId=${
        weaponId ?? "null"
      } current=${currentWeaponId}`
    );

    // If weaponId is null, do nothing (only log)
    if (weaponId === null) {
      log(`[WEAPON_DROP] ignored reason=null`);
      return;
    }

    // If weaponId matches current weapon, do nothing (log and return)
    if (weaponId === currentWeaponId) {
      log(`[WEAPON_DROP] ignored reason=same`);
      return;
    }

    // Convert WeaponId ("PISTOL" | "SHOTGUN" | "SMG") to key ("pistol" | "shotgun" | "smg")
    let key: "pistol" | "shotgun" | "smg";
    if (weaponId === "PISTOL") {
      key = "pistol";
    } else if (weaponId === "SHOTGUN") {
      key = "shotgun";
    } else if (weaponId === "SMG") {
      key = "smg";
    } else {
      // Unknown weaponId, log and return
      log(`[WEAPON_DROP] ignored reason=unknown weaponId=${weaponId}`);
      return;
    }

    // Log switch event
    log(`[WEAPON_DROP] switch ${currentWeaponId} -> ${weaponId}`);

    // Switch weapon (this will increment weaponSwitches and update UI)
    this.switchWeaponTo(key);
  }

  private continueToNextStage(): void {
    if (!this.systems.matchStateSystem.isStageClear()) {
      return;
    }

    this.systems.matchStateSystem.setStageClear(false);
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
  // applyBurstSpeedToEnemies() moved to EnemySystem.applySpeedMultiplier()
}
