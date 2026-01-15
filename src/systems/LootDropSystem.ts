import Phaser from "phaser";
import { LootPickup, LootType } from "../entities/LootPickup";
import { GameTuning } from "../config/GameTuning";
import type { WeaponId } from "../config/WeaponsConfig";
import { pickWeaponDropId } from "../config/WeaponDropsConfig";

export type LootKind = "buff" | "weapon";
export type BuffLootId = "buff-freeze" | "buff-rapid" | "buff-double";
export type WeaponLootId = "weapon-drop";

export interface LootDropSystemCallbacks {
  getIsActive: () => boolean;
  getTimeNow: () => number;
  getPlayerPos: () => { x: number; y: number };
  getScene: () => Phaser.Scene;
  getLootGroup: () => Phaser.Physics.Arcade.Group;
  isBuffActive: (type: "rapid" | "double" | "freeze") => boolean;
  isWeaponDropAllowed: () => boolean;
  onBuffPicked: (type: "rapid" | "double" | "freeze") => void;
  getStage: () => number;
  getCurrentWeaponId: () => WeaponId | null;
  onWeaponDropPicked: (weaponId: WeaponId | null) => void;
  log: (msg: string) => void;
}

/**
 * LootDropSystem manages buff and weapon loot drops
 */
export class LootDropSystem {
  private callbacks: LootDropSystemCallbacks;

  // State
  private lastBuffDropAtMs = 0;
  private lastWeaponDropTime = 0; // Time when weapon-drop was spawned or picked
  private activeBuffLoot = new Set<LootPickup>(); // Track active buff loot items
  private lastCooldownLogTime = 0; // Throttle cooldown logs (log at most once per 3 seconds, or every 10th skip)
  private cooldownLogSkipCount = 0; // Count skipped cooldown logs

  constructor(callbacks: LootDropSystemCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.lastBuffDropAtMs = 0;
    this.lastWeaponDropTime = 0;
    this.activeBuffLoot.clear();
    this.lastCooldownLogTime = 0;
    this.cooldownLogSkipCount = 0;
  }

  /**
   * Maybe spawn buff loot at position (x, y)
   */
  maybeSpawnBuffLoot(x: number, y: number): void {
    if (!this.callbacks.getIsActive()) {
      return;
    }

    const now = this.callbacks.getTimeNow();

    // 1) Roll for drop chance (if chance fails, don't log anything)
    const dropRoll = Math.random();
    if (dropRoll >= GameTuning.loot.buff.dropChance) {
      return; // No drop attempt, no log
    }

    // 2) Check cooldown (if on cooldown, count as skip for throttled logs)
    if (now - this.lastBuffDropAtMs < GameTuning.loot.buff.cooldownMs) {
      // Throttle cooldown logs: log at most once per interval, or every Nth skip
      this.cooldownLogSkipCount++;
      const timeSinceLastLog = now - this.lastCooldownLogTime;
      if (
        timeSinceLastLog >= GameTuning.loot.logThrottle.cooldownLogIntervalMs ||
        this.cooldownLogSkipCount >=
          GameTuning.loot.logThrottle.cooldownLogSkipThreshold
      ) {
        this.callbacks.log(
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
    if (activeBuffLootCount >= GameTuning.loot.buff.maxActive) {
      this.callbacks.log(`[LOOT] buff drop skipped (limit)`);
      return;
    }

    // 4) Roll for buff type using weights from GameTuning
    const typeRoll = Math.random();
    let buffType: LootType | null = null;
    const weights = GameTuning.loot.buff.weights;

    if (typeRoll < weights.freeze) {
      buffType = "buff-freeze";
    } else if (typeRoll < weights.freeze + weights.rapid) {
      buffType = "buff-rapid";
    } else if (typeRoll < weights.freeze + weights.rapid + weights.double) {
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
    if (this.callbacks.isBuffActive(buffKey)) {
      this.callbacks.log(`[LOOT] buff drop skipped (active: ${buffKey})`);
      return;
    }

    // 6) Spawn buff loot
    const ttlMs = Phaser.Math.Between(
      GameTuning.loot.buff.ttlMinMs,
      GameTuning.loot.buff.ttlMaxMs
    );
    const buffLoot = new LootPickup(
      this.callbacks.getScene(),
      x,
      y,
      buffType,
      this.callbacks.log
    );
    this.callbacks.getLootGroup().add(buffLoot);
    this.activeBuffLoot.add(buffLoot);

    // Reset cooldown log counter on successful spawn
    this.cooldownLogSkipCount = 0;

    // Log spawn with TTL
    this.callbacks.log(`[LOOT] buff dropped: ${buffType} ttl=${ttlMs}ms`);

    // Update cooldown
    this.lastBuffDropAtMs = now;
  }

  /**
   * Maybe spawn weapon loot at position (x, y)
   */
  maybeSpawnWeaponLoot(x: number, y: number): void {
    if (!this.callbacks.getIsActive()) {
      return;
    }

    const now = this.callbacks.getTimeNow();

    // Use debug overrides if enabled
    const useDebug =
      GameTuning.debug.enabled &&
      GameTuning.debug.weaponDropTest.forceHighChance;
    const cooldownMs = useDebug
      ? GameTuning.debug.weaponDropTest.cooldownMs
      : GameTuning.loot.weaponDrop.cooldownMs;
    const baseChance = useDebug
      ? GameTuning.debug.weaponDropTest.baseChance
      : GameTuning.loot.weaponDrop.baseChance;

    // Проверка cooldown
    if (now - this.lastWeaponDropTime < cooldownMs) {
      return;
    }

    // Проверка: уже есть активный weapon-drop на карте
    if (this.hasLootOfType("weapon-drop")) {
      return;
    }

    // Проверка: разрешен ли weapon-drop (через callback)
    if (!this.callbacks.isWeaponDropAllowed()) {
      return;
    }

    // Базовый шанс выпадения
    if (Math.random() >= baseChance) {
      return;
    }

    // Спавним weapon-drop (also has TTL via LootPickup)
    const weaponLoot = new LootPickup(
      this.callbacks.getScene(),
      x,
      y,
      "weapon-drop",
      this.callbacks.log
    );
    this.callbacks.getLootGroup().add(weaponLoot);
    this.lastWeaponDropTime = now;

    // Log weapon drop with TTL (use debug TTL if enabled)
    const ttlMinMs = useDebug
      ? GameTuning.debug.weaponDropTest.ttlMinMs
      : GameTuning.loot.weaponDrop.ttlMinMs;
    const ttlMaxMs = useDebug
      ? GameTuning.debug.weaponDropTest.ttlMaxMs
      : GameTuning.loot.weaponDrop.ttlMaxMs;
    const ttlMs = Phaser.Math.Between(ttlMinMs, ttlMaxMs);
    this.callbacks.log(`[LOOT] weapon-drop dropped: ttl=${ttlMs}ms`);
  }

  /**
   * Debug method: manually spawn weapon-drop at specified position
   * Bypasses all checks (cooldown, chance, limits) for testing
   */
  spawnWeaponLootDebug(x: number, y: number): void {
    if (!this.callbacks.getIsActive()) {
      return;
    }

    // Use debug TTL if enabled, otherwise use normal TTL
    const useDebug =
      GameTuning.debug.enabled &&
      GameTuning.debug.weaponDropTest.forceHighChance;
    const ttlMinMs = useDebug
      ? GameTuning.debug.weaponDropTest.ttlMinMs
      : GameTuning.loot.weaponDrop.ttlMinMs;
    const ttlMaxMs = useDebug
      ? GameTuning.debug.weaponDropTest.ttlMaxMs
      : GameTuning.loot.weaponDrop.ttlMaxMs;

    // Спавним weapon-drop (bypasses all checks)
    const weaponLoot = new LootPickup(
      this.callbacks.getScene(),
      x,
      y,
      "weapon-drop",
      this.callbacks.log
    );
    this.callbacks.getLootGroup().add(weaponLoot);
    this.lastWeaponDropTime = this.callbacks.getTimeNow();

    const ttlMs = Phaser.Math.Between(ttlMinMs, ttlMaxMs);
    // Only log [DEBUG] if debug is enabled
    if (useDebug) {
      this.callbacks.log(
        `[DEBUG] spawn weapon-drop at x=${x.toFixed(1)} y=${y.toFixed(
          1
        )} ttl=${ttlMs}ms`
      );
    }
  }

  /**
   * Handle pickup of loot item
   */
  onPickup(pickup: LootPickup): void {
    const lootType = pickup.lootType;

    switch (lootType) {
      case "weapon-drop":
        this.callbacks.log("[LOOT] weapon-drop picked");
        this.lastWeaponDropTime = this.callbacks.getTimeNow(); // Обновляем cooldown при подборе
        {
          const weaponId = pickWeaponDropId({
            stage: this.callbacks.getStage(),
            currentWeaponId: this.callbacks.getCurrentWeaponId(),
          });
          this.callbacks.onWeaponDropPicked(weaponId);
        }
        break;
      case "buff-rapid":
        this.callbacks.log(`[LOOT] buff picked: buff-rapid`);
        this.callbacks.onBuffPicked("rapid");
        break;
      case "buff-double":
        this.callbacks.log(`[LOOT] buff picked: buff-double`);
        this.callbacks.onBuffPicked("double");
        break;
      case "buff-freeze":
        this.callbacks.log(`[LOOT] buff picked: buff-freeze`);
        this.callbacks.onBuffPicked("freeze");
        break;
    }

    // Remove from tracking if it's a buff loot or weapon-drop
    if (lootType.startsWith("buff-") || lootType === "weapon-drop") {
      this.activeBuffLoot.delete(pickup);
    }
  }

  /**
   * Check if loot of specific type exists on map
   */
  private hasLootOfType(type: LootType): boolean {
    const lootGroup = this.callbacks.getLootGroup();
    const children = lootGroup?.getChildren?.() ?? [];
    return children.some((obj) => {
      const loot = obj as LootPickup;
      return loot.active && loot.lootType === type;
    });
  }

  /**
   * Clean up expired buff loot items (called from outside)
   */
  cleanupExpiredBuffLoot(): void {
    this.activeBuffLoot.forEach((loot) => {
      if (!loot || !loot.active) {
        this.activeBuffLoot.delete(loot);
        return;
      }
      // Check if loot has expired (via LootPickup's internal TTL)
      // LootPickup handles its own expiration and logs "[LOOT] buff expired: ..."
      // We just clean up the tracking set
      if (!loot.active) {
        this.activeBuffLoot.delete(loot);
      }
    });
  }
}
