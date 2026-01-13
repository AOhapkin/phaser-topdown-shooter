import { Enemy } from "../entities/Enemy";

export type BuffType = "rapid" | "double" | "freeze";

export interface BuffDef {
  type: BuffType;
  durationMs: number;
}

// Buff durations (ms) - matching GameScene constants
const BUFF_RAPID_DURATION_MS = 8000;
const BUFF_DOUBLE_DURATION_MS = 10000;
const BUFF_FREEZE_DURATION_MS = 6000;
const BUFF_MAX_DURATION_MS = 20000; // Cap for stacking

export interface BuffSystemCallbacks {
  getIsActive: () => boolean; // game is running, not paused, not gameOver
  getTimeNow: () => number; // scene.time.now
  getEnemies: () => Enemy[]; // only alive/active enemies
  onReloadBypassEnabled: (enabled: boolean) => void; // for DOUBLE
  onRapidFireMultiplierChanged: (mult: number) => void; // for RAPID (0.5 when active, 1.0 when inactive)
  applyFreezeToEnemy: (enemy: Enemy) => void;
  removeFreezeFromEnemy: (enemy: Enemy) => void;
  isEnemyFreezable?: (enemy: Enemy) => boolean; // optional check
  log: (msg: string) => void; // for [BUFF] logs
}

export class BuffSystem {
  private callbacks: BuffSystemCallbacks;
  private active: Map<BuffType, { endTime: number }> = new Map();

  constructor(callbacks: BuffSystemCallbacks) {
    this.callbacks = callbacks;
  }

  reset(): void {
    // Remove all active buffs and their effects
    const activeTypes = Array.from(this.active.keys());
    for (const type of activeTypes) {
      this.removeBuff(type);
    }
    this.active.clear();
  }

  update(): void {
    if (!this.callbacks.getIsActive()) {
      return;
    }

    const now = this.callbacks.getTimeNow();
    const expired: BuffType[] = [];

    for (const [type, buff] of this.active.entries()) {
      if (now >= buff.endTime) {
        expired.push(type);
      }
    }

    for (const type of expired) {
      this.removeBuff(type);
      this.active.delete(type);
    }
  }

  startBuff(type: BuffType): void {
    const now = this.callbacks.getTimeNow();
    const existing = this.active.get(type);

    // Get duration for this buff type
    let durationMs: number;
    switch (type) {
      case "rapid":
        durationMs = BUFF_RAPID_DURATION_MS;
        break;
      case "double":
        durationMs = BUFF_DOUBLE_DURATION_MS;
        break;
      case "freeze":
        durationMs = BUFF_FREEZE_DURATION_MS;
        break;
      default:
        durationMs = 8000; // fallback
    }

    if (existing) {
      // DOUBLE: refresh duration only (no stacking)
      // Other buffs: extend duration (cap at BUFF_MAX_DURATION_MS)
      if (type === "double") {
        const newEndTime = now + durationMs;
        const remaining = durationMs;
        this.active.set(type, { endTime: newEndTime });
        this.callbacks.log(
          `[BUFF] refresh type=${type} remain=${remaining.toFixed(0)}ms`
        );
      } else {
        const newEndTime = Math.min(
          existing.endTime + durationMs,
          now + BUFF_MAX_DURATION_MS
        );
        const remaining = newEndTime - now;
        this.active.set(type, { endTime: newEndTime });
        this.callbacks.log(
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
      this.active.set(type, { endTime });
      this.callbacks.log(`[BUFF] start type=${type} dur=${durationMs}ms`);

      // Apply immediate effects
      if (type === "freeze") {
        this.applyFreezeToAllEnemies();
      } else if (type === "double") {
        this.callbacks.log(`[BUFF] double: reload bypass enabled`);
        this.callbacks.onReloadBypassEnabled(true);
      } else if (type === "rapid") {
        this.callbacks.onRapidFireMultiplierChanged(0.5); // 50% fire rate
      }
    }
  }

  isActive(type: BuffType): boolean {
    return this.active.has(type);
  }

  getActiveBuffs(): Map<BuffType, { endTime: number }> {
    // Return a copy of active buffs for HUD display
    return new Map(this.active);
  }

  onEnemySpawned(enemy: Enemy): void {
    if (this.isActive("freeze")) {
      if (!this.callbacks.isEnemyFreezable || this.callbacks.isEnemyFreezable(enemy)) {
        this.callbacks.applyFreezeToEnemy(enemy);
        this.callbacks.log(`[BUFF] freeze applied to spawned enemy`);
      }
    }
  }

  private removeBuff(type: BuffType): void {
    this.callbacks.log(`[BUFF] end type=${type}`);

    // Remove effects
    if (type === "freeze") {
      this.removeFreezeFromAllEnemies();
    } else if (type === "double") {
      this.callbacks.onReloadBypassEnabled(false);
    } else if (type === "rapid") {
      this.callbacks.onRapidFireMultiplierChanged(1.0); // restore normal fire rate
    }
  }

  private applyFreezeToAllEnemies(): void {
    try {
      let count = 0;
      const enemies = this.callbacks.getEnemies();
      for (const enemy of enemies) {
        if (enemy && enemy.active) {
          // Check if enemy is freezable (not dying)
          if (!this.callbacks.isEnemyFreezable || this.callbacks.isEnemyFreezable(enemy)) {
            this.callbacks.applyFreezeToEnemy(enemy);
            count++;
          }
        }
      }
      this.callbacks.log(`[BUFF] freeze applied to ${count} enemies`);
    } catch (e) {
      // Enemies group not fully initialized, ignore
    }
  }

  private removeFreezeFromAllEnemies(): void {
    try {
      let count = 0;
      const enemies = this.callbacks.getEnemies();
      for (const enemy of enemies) {
        if (enemy && enemy.active) {
          this.callbacks.removeFreezeFromEnemy(enemy);
          count++;
        }
      }
      if (count > 0) {
        this.callbacks.log(`[BUFF] freeze removed from ${count} enemies`);
      }
    } catch (e) {
      // Enemies group not fully initialized, ignore
    }
  }
}

