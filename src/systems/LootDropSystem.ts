import Phaser from "phaser";
import { LootPickup, LootType } from "../entities/LootPickup";

export type LootKind = "buff" | "weapon";
export type BuffLootId = "buff-freeze" | "buff-rapid" | "buff-double";
export type WeaponLootId = "weapon-drop";

// Buff drop parameters (moved from GameScene)
const BUFF_DROP_COOLDOWN_MS = 12000; // Global cooldown for buff drops (ms)
const BUFF_DROP_CHANCE = 0.18; // Chance to attempt buff drop on event (e.g., enemy kill)
const BUFF_MAX_ON_MAP = 1; // Maximum buff loot items on map simultaneously

// Buff type weights (for selection when drop is attempted)
// Total: 100% (freeze: 45%, rapid: 35%, double: 20%)
const BUFF_FREEZE_WEIGHT = 0.45;
const BUFF_RAPID_WEIGHT = 0.35;
const BUFF_DOUBLE_WEIGHT = 0.2;

// Weapon-drop spawn constraints (moved from GameScene)
const WEAPON_DROP_BASE_CHANCE = 0.003; // 0.3% per enemy death
const WEAPON_DROP_COOLDOWN_MS = 30000; // 30 seconds cooldown

export interface LootDropSystemCallbacks {
  getIsActive: () => boolean;
  getTimeNow: () => number;
  getPlayerPos: () => { x: number; y: number };
  getScene: () => Phaser.Scene;
  getLootGroup: () => Phaser.Physics.Arcade.Group;
  isBuffActive: (type: "rapid" | "double" | "freeze") => boolean;
  isWeaponDropAllowed: () => boolean;
  onBuffPicked: (type: "rapid" | "double" | "freeze") => void;
  onWeaponDropPicked: () => void;
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
    if (dropRoll >= BUFF_DROP_CHANCE) {
      return; // No drop attempt, no log
    }

    // 2) Check cooldown (if on cooldown, count as skip for throttled logs)
    if (now - this.lastBuffDropAtMs < BUFF_DROP_COOLDOWN_MS) {
      // Throttle cooldown logs: log at most once per 3 seconds, or every 10th skip
      this.cooldownLogSkipCount++;
      const timeSinceLastLog = now - this.lastCooldownLogTime;
      if (timeSinceLastLog >= 3000 || this.cooldownLogSkipCount >= 10) {
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
    if (activeBuffLootCount >= BUFF_MAX_ON_MAP) {
      this.callbacks.log(`[LOOT] buff drop skipped (limit)`);
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
    if (this.callbacks.isBuffActive(buffKey)) {
      this.callbacks.log(`[LOOT] buff drop skipped (active: ${buffKey})`);
      return;
    }

    // 6) Spawn buff loot
    const ttlMs = Phaser.Math.Between(8000, 12000);
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

    // Проверка cooldown
    if (now - this.lastWeaponDropTime < WEAPON_DROP_COOLDOWN_MS) {
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
    if (Math.random() >= WEAPON_DROP_BASE_CHANCE) {
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

    // Log weapon drop with TTL
    const ttlMs = Phaser.Math.Between(8000, 12000);
    this.callbacks.log(`[LOOT] weapon-drop dropped: ttl=${ttlMs}ms`);
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
        this.callbacks.onWeaponDropPicked();
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

