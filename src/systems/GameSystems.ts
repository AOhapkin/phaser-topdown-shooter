import { GameContext } from "./GameContext";
import { MatchStateSystem } from "./MatchStateSystem";
import { PlayerStateSystem } from "./PlayerStateSystem";
import { CombatSystem } from "./CombatSystem";
import { ProjectileSystem } from "./ProjectileSystem";
import { WeaponSystem } from "./WeaponSystem";
import { EnemySystem } from "./EnemySystem";
import { PerkSystem } from "./PerkSystem";
import { PerkEffectsSystem } from "./PerkEffectsSystem";
import { BuffSystem } from "./BuffSystem";
import { MatchStatsSystem } from "./MatchStatsSystem";
import { StageSystem } from "./StageSystem";
import { StageResultSystem } from "./StageResultSystem";
import { SpawnSystem } from "./SpawnSystem";
import { LootDropSystem } from "./LootDropSystem";
import { OverlaySystem } from "./OverlaySystem";
import { Enemy, EnemyType } from "../entities/Enemy";
import { PhaseSettings, BurstState } from "./SpawnSystem";
import type { WeaponId as WeaponConfigId } from "../config/WeaponsConfig";
import { GameTuning } from "../config/GameTuning";

/**
 * GameSystems container manages all game systems lifecycle
 * Provides unified initialization, reset, and update methods
 */
export interface GameSystemsCallbacks {
  // Game state queries
  getIsStarted: () => boolean;
  getGameOver: () => boolean;
  getIsStageClear: () => boolean;
  getIsLevelUpOpen: () => boolean;
  getCurrentPhase: () => number;
  getPhaseSettings: (phase: number) => PhaseSettings;
  getBurstState: () => BurstState;
  getSpawnDelayMultiplier: () => number;
  getEffectiveWeights: (
    settings: PhaseSettings,
    burstState: BurstState
  ) => { runner: number; tank: number };
  getStageTankWeightMultiplier: (stage: number) => number;
  getStageSpeedMultiplier: (stage: number) => number;
  getEnemySpeedMultiplier: () => number;
  setEnemySpeedMultiplier: (mult: number) => void;
  hasLootOfType: (type: string) => boolean;
  getAimAngle: () => number;
  getScore: () => number;
  setScore: (score: number) => void;
  updateHealthText: () => void;
  updateScoreText: (score: number) => void;
  addXP: (amount: number) => void;
  maybeDropLoot: (x: number, y: number) => void;
  pausePhysics: () => void;
  resumePhysics: (delayMs: number) => void;
  onStageEnd: (stage: number, survived: boolean) => void;
  onBurstStart: (stageElapsedSec: number, durationSec: number) => void;
  onBurstEnd: () => void;
  onBurstStateChanged: (state: BurstState) => void;
  updatePlayerPickupRadius: () => void;
  onWeaponDropPicked: (weaponId: WeaponConfigId | null) => void;
  log?: (msg: string) => void;
}

export class GameSystems {
  private readonly ctx: GameContext;
  private callbacks: GameSystemsCallbacks;

  // Systems
  public readonly matchStateSystem: MatchStateSystem;
  public readonly playerStateSystem: PlayerStateSystem;
  public readonly combatSystem: CombatSystem;
  public readonly projectileSystem: ProjectileSystem;
  public readonly weaponSystem: WeaponSystem;
  public readonly enemySystem: EnemySystem;
  public readonly perkSystem: PerkSystem;
  private readonly perkEffects: PerkEffectsSystem;
  public readonly buffSystem: BuffSystem;
  public readonly matchStatsSystem: MatchStatsSystem;
  public readonly stageSystem: StageSystem;
  public readonly stageResultSystem: StageResultSystem;
  public readonly spawnSystem: SpawnSystem;
  public readonly lootDropSystem: LootDropSystem;
  public readonly overlaySystem: OverlaySystem;

  constructor(ctx: GameContext, callbacks: GameSystemsCallbacks) {
    this.ctx = ctx;
    this.callbacks = callbacks;

    // Initialize systems in dependency order
    // 1. MatchStateSystem (no dependencies, must be first)
    this.matchStateSystem = new MatchStateSystem();

    // 2. PlayerStateSystem (no dependencies)
    this.playerStateSystem = new PlayerStateSystem({
      getDebugEnabled: () => ctx.debugEnabled?.() ?? false,
      log: (msg: string) => ctx.log?.(msg),
    });

    // 2.5. PerkEffectsSystem (depends on playerStateSystem)
    this.perkEffects = new PerkEffectsSystem(this.playerStateSystem, () =>
      this.callbacks.updatePlayerPickupRadius()
    );

    // 3. OverlaySystem (no dependencies)
    this.overlaySystem = new OverlaySystem();

    // 4. MatchStatsSystem (no dependencies)
    this.matchStatsSystem = new MatchStatsSystem();

    // 5. StageSystem (depends on callbacks for stage events)
    this.stageSystem = new StageSystem(ctx.scene, {
      onStageStart: (_stage: number) => {
        // Logging handled in StageSystem
      },
      onStageEnd: (stage: number, survived: boolean) => {
        this.callbacks.onStageEnd(stage, survived);
      },
      onBurstStart: (stageElapsedSec: number, durationSec: number) => {
        this.callbacks.onBurstStart(stageElapsedSec, durationSec);
      },
      onBurstEnd: () => {
        this.callbacks.onBurstEnd();
      },
      onBurstStateChanged: (state: BurstState) => {
        this.callbacks.onBurstStateChanged(state);
      },
      log: (msg: string) => ctx.log?.(msg),
    });

    // 6. StageResultSystem (depends on matchStatsSystem and stageSystem)
    this.stageResultSystem = new StageResultSystem(
      this.matchStatsSystem,
      this.stageSystem
    );

    // 7. BuffSystem (depends on ctx, enemies will be available later)
    this.buffSystem = new BuffSystem({
      getIsActive: () => ctx.getIsActive(),
      getTimeNow: () => ctx.getTimeNow(),
      getEnemies: () => {
        try {
          const children = ctx.enemiesGroup.getChildren();
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
      onReloadBypassEnabled: (_enabled: boolean) => {
        // DOUBLE buff: reload bypass is handled via bypassAmmo in WeaponSystem
      },
      onRapidFireMultiplierChanged: (_mult: number) => {
        // RAPID buff: fire rate multiplier is handled in WeaponSystem.tryShoot()
      },
      onBuffChanged: (type: "rapid" | "double" | "freeze" | null) => {
        // Notify WeaponSystem about buff changes (only for rapid)
        // Use closure to access this.weaponSystem at call time (not at construction time)
        // weaponSystem is created after buffSystem, so we check for existence
        const weaponSystem = this.weaponSystem;
        if ((type === "rapid" || type === null) && weaponSystem) {
          weaponSystem.onBuffChanged(type);
        }
      },
      applyFreezeToEnemy: (enemy: Enemy) => {
        enemy.setFrozen(true);
      },
      removeFreezeFromEnemy: (enemy: Enemy) => {
        enemy.setFrozen(false);
      },
      isEnemyFreezable: (enemy: Enemy) => {
        const isDying = (enemy as any).isDying;
        return !isDying;
      },
      log: (msg: string) => ctx.log?.(msg),
    });

    // 8. PerkSystem (depends on playerStateSystem)
    this.perkSystem = new PerkSystem({
      onPerkApplied: (perkId, newLevel, delta) => {
        // Log in debug mode through unified logger
        if (ctx.debugEnabled?.()) {
          ctx.log?.(
            `[PERK_APPLY] id=${perkId} level=${newLevel} delta=${delta}`
          );
        }

        // Apply perk effects through PerkEffectsSystem
        this.perkEffects.apply(perkId, delta);
      },
      log: (msg: string) => ctx.log?.(msg),
    });

    // 9. EnemySystem (depends on ctx, enemies group, player)
    this.enemySystem = new EnemySystem({
      getIsActive: () => ctx.getIsActive(),
      getScene: () => ctx.scene,
      getEnemiesGroup: () => ctx.enemiesGroup,
      getPlayer: () => ctx.player,
      getPlayerPos: () => ({ x: ctx.player.x, y: ctx.player.y }),
      onEnemyHitPlayer: (enemy: Enemy) => {
        // Delegate to CombatSystem
        if (this.callbacks.getIsStageClear()) {
          return;
        }
        this.combatSystem.onEnemyHitPlayer(enemy);
        if (!ctx.player.isAlive()) {
          // Game over handled by GameScene
        }
      },
      onEnemyKilled: (type: EnemyType) => {
        if (type === "runner" || type === "tank") {
          this.matchStatsSystem.onEnemyKilled(type);
        } else {
          this.matchStatsSystem.onEnemyKilledTotalOnly();
        }
      },
      isBurstActive: () => {
        return this.stageSystem.getBurstState() === "burst";
      },
      getBurstSpeedMultiplier: () => {
        return GameTuning.spawn.burst.speedBoost;
      },
      isFreezeActive: () => {
        return this.buffSystem.isActive("freeze");
      },
      applyFreezeToEnemy: (enemy: Enemy) => {
        enemy.setFrozen(true);
      },
      getStageSpeedMultiplier: (stage: number) => {
        return this.callbacks.getStageSpeedMultiplier(stage);
      },
      getCurrentPhase: () => this.callbacks.getCurrentPhase(),
      getPhaseSettings: (phase: number) =>
        this.callbacks.getPhaseSettings(phase),
      getStage: () => this.stageSystem.getStage(),
      getEnemySpeedMultiplier: () => this.callbacks.getEnemySpeedMultiplier(),
      log: (msg: string) => ctx.log?.(msg),
    });

    // 10. CombatSystem (depends on ctx, playerStateSystem, matchStatsSystem)
    this.combatSystem = new CombatSystem({
      getIsActive: () => ctx.getIsActive(),
      getPlayer: () => ctx.player,
      getTimeNow: () => ctx.getTimeNow(),
      getPlayerStateSystem: () => this.playerStateSystem,
      onEnemyKilled: (type: "runner" | "tank") => {
        this.matchStatsSystem.onEnemyKilled(type);
      },
      onEnemyKilledTotalOnly: () => {
        this.matchStatsSystem.onEnemyKilledTotalOnly();
      },
      onPlayerDamaged: (amount: number) => {
        this.matchStatsSystem.onPlayerDamaged(amount);
        this.callbacks.updateHealthText();
      },
      onEnemyKilledCallback: (enemy: Enemy) => {
        const summary = this.matchStatsSystem.getSummary();
        this.callbacks.setScore(summary.score);
        this.callbacks.updateScoreText(summary.score);

        this.callbacks.addXP(1);
        this.callbacks.maybeDropLoot(enemy.x, enemy.y);
        this.lootDropSystem.maybeSpawnWeaponLoot(enemy.x, enemy.y);
        this.lootDropSystem.maybeSpawnBuffLoot(enemy.x, enemy.y);
      },
      pausePhysics: () => {
        this.callbacks.pausePhysics();
      },
      resumePhysics: (delayMs: number) => {
        this.callbacks.resumePhysics(delayMs);
      },
    });

    // 11. ProjectileSystem (depends on ctx, combatSystem, matchStatsSystem)
    this.projectileSystem = new ProjectileSystem({
      getIsActive: () => ctx.getIsActive(),
      getScene: () => ctx.scene,
      getBulletsGroup: () => ctx.bulletsGroup,
      getEnemiesGroup: () => ctx.enemiesGroup,
      getCombatSystem: () => this.combatSystem,
      onProjectileHit: () => {
        this.matchStatsSystem.onProjectileHit();
      },
    });

    // 12. WeaponSystem (depends on ctx, buffSystem, playerStateSystem, matchStatsSystem)
    this.weaponSystem = new WeaponSystem({
      getIsActive: () => {
        return (
          !ctx.getIsGameOver() &&
          ctx.player.isAlive() &&
          ctx.getIsStarted() &&
          !this.callbacks.getIsLevelUpOpen() &&
          !ctx.getIsStageClear()
        );
      },
      getTimeNow: () => ctx.getTimeNow(),
      getPlayerPos: () => ({ x: ctx.player.x, y: ctx.player.y }),
      getAimAngle: () => this.callbacks.getAimAngle(),
      isBuffActive: (type: "rapid" | "double") => {
        return this.buffSystem.isActive(type);
      },
      canBypassReload: () => {
        // Check if any buff with bypassReload is active (data-driven from GameTuning)
        return (
          (this.buffSystem.isActive("double") &&
            GameTuning.buffs.double.bypassReload) ||
          (this.buffSystem.isActive("rapid") &&
            GameTuning.buffs.rapid.bypassReload)
        );
      },
      getScene: () => ctx.scene,
      getBulletsGroup: () => ctx.bulletsGroup,
      getPlayerPierceLevel: () => this.playerStateSystem.getStats().pierceBonus,
      getPlayerStateSystem: () => this.playerStateSystem,
      scheduleDelayedCall: (delayMs: number, callback: () => void) => {
        ctx.scene.time.delayedCall(delayMs, callback);
      },
      onShotFired: (projectilesCount: number) => {
        this.matchStatsSystem.onShotFired(projectilesCount);
      },
      log: (msg: string) => ctx.log?.(msg),
    });

    // 13. SpawnSystem (depends on ctx, enemySystem, stageSystem, callbacks)
    this.spawnSystem = new SpawnSystem(
      ctx.scene,
      {
        getIsActive: () => ctx.getIsActive(),
        getCurrentPhase: () => this.callbacks.getCurrentPhase(),
        getPhaseSettings: (phase: number) =>
          this.callbacks.getPhaseSettings(phase),
        getBurstState: () => this.stageSystem.getBurstState(),
        getSpawnDelayMultiplier: () => this.callbacks.getSpawnDelayMultiplier(),
        getEffectiveWeights: (settings, burstState) => {
          return this.callbacks.getEffectiveWeights(settings, burstState);
        },
        getAliveEnemiesCount: () => this.enemySystem.getAliveCount(),
        getAliveTanksCount: () => this.enemySystem.getTankAliveCount(),
        spawnEnemy: (chosenType: "runner" | "tank") => {
          this.enemySystem.spawn(chosenType);
        },
        logSpawnDebug: (msg: string) => {
          ctx.log?.(msg);
        },
      },
      GameTuning.spawn.minDelayMs
    );

    // 14. LootDropSystem (depends on ctx, buffSystem, callbacks)
    this.lootDropSystem = new LootDropSystem({
      getIsActive: () => ctx.getIsActive(),
      getTimeNow: () => ctx.getTimeNow(),
      getPlayerPos: () => ({ x: ctx.player.x, y: ctx.player.y }),
      getScene: () => ctx.scene,
      getLootGroup: () => ctx.lootGroup,
      isBuffActive: (type: "rapid" | "double" | "freeze") => {
        return this.buffSystem.isActive(type);
      },
      isWeaponDropAllowed: () => {
        // TODO: migrate to ctx later
        return true; // Will be set via callback
      },
      onBuffPicked: (type: "rapid" | "double" | "freeze") => {
        this.buffSystem.startBuff(type);
      },
      getStage: () => this.stageSystem.getStage(),
      getCurrentWeaponId: () => this.weaponSystem.getCurrentWeaponId(),
      onWeaponDropPicked: (weaponId) => {
        this.callbacks.onWeaponDropPicked(weaponId);
      },
      log: (msg: string) => ctx.log?.(msg),
    });
  }

  /**
   * Initialize systems (create overlaps, subscriptions, etc.)
   * Must be called after all groups are created
   */
  init(): void {
    // Initialize projectile system overlaps
    this.projectileSystem.initOverlaps();

    // Initialize player pickup radius from PlayerStateSystem
    this.callbacks.updatePlayerPickupRadius();
  }

  /**
   * Reset all systems for a new match
   * Must be called in correct order to avoid dependency issues
   */
  resetMatch(): void {
    // Close any open overlays
    this.overlaySystem.close();

    const timeNow = this.ctx.getTimeNow();

    // Reset systems in dependency order (reverse of initialization)
    // MatchStateSystem must be reset first
    this.matchStateSystem.reset();
    this.buffSystem.reset();
    // Reset stage system state (does not start - start() is called explicitly in startGameFromOverlay())
    this.stageSystem.reset();
    this.lootDropSystem.reset();
    this.matchStatsSystem.reset(timeNow);
    this.perkSystem.reset();
    this.playerStateSystem.reset();
    this.weaponSystem.reset();
    this.enemySystem.reset();
    this.projectileSystem.reset();
    this.combatSystem.reset();
    this.callbacks.updatePlayerPickupRadius();
  }

  /**
   * Update all systems
   * Must be called in correct order
   * @param dt Optional delta time, if not provided reads from ctx.getTimeNow()
   */
  update(dt?: number): void {
    const time = dt ?? this.ctx.getTimeNow();
    const isStarted = this.ctx.getIsStarted();
    const gameOver = this.ctx.getIsGameOver();
    const isStageClear = this.ctx.getIsStageClear();

    // Update stage system (if game is started and not over)
    if (isStarted && !gameOver) {
      this.stageSystem.update(time);
    }

    // Update buff system
    this.buffSystem.update();

    // Update projectile system
    this.projectileSystem.update();

    // Clean up expired buff loot
    this.lootDropSystem.cleanupExpiredBuffLoot();

    // Update weapon system (if not stage clear)
    if (!isStageClear) {
      this.weaponSystem.update();
    }
  }
}
