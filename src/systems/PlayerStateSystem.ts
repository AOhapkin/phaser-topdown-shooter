export interface PlayerStateSystemCallbacks {
  getDebugEnabled?: () => boolean;
  log?: (msg: string) => void;
}

/**
 * PlayerStateSystem manages player state and modifiers
 * Currently only handles pierce bonus (minimal increment)
 */
export class PlayerStateSystem {
  private callbacks: PlayerStateSystemCallbacks;
  private pierceBonus = 0;
  private knockbackLevel = 0; // Level of knockback perk (0, 1, 2, ...)

  constructor(callbacks: PlayerStateSystemCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Reset all player state
   */
  reset(): void {
    this.pierceBonus = 0;
    this.knockbackLevel = 0;
    this.debugLog();
  }

  /**
   * Get current pierce bonus
   */
  getPierceBonus(): number {
    return this.pierceBonus;
  }

  /**
   * Add pierce bonus (typically +1 per perk selection)
   */
  addPierce(amount: number = 1): void {
    this.pierceBonus += amount;
    this.debugLog();
  }

  /**
   * Get current knockback multiplier
   * Formula: 1.0 + level * 0.25 (matches current behavior: += 0.25 per perk)
   */
  getKnockbackMultiplier(): number {
    return 1.0 + this.knockbackLevel * 0.25;
  }

  /**
   * Multiply knockback multiplier
   * For +25% per perk: mult = 1.25
   * This increments level to maintain 1:1 behavior with current += 0.25 logic
   */
  mulKnockback(mult: number): void {
    // Current behavior: each perk adds 0.25 (knockbackMultiplier += 0.25)
    // To maintain 1:1: increment level, multiplier = 1.0 + level * 0.25
    // For mult = 1.25 (which represents +25%): increment level by 1
    if (mult === 1.25) {
      this.knockbackLevel++;
    } else {
      // For other multipliers, calculate equivalent level increment
      // This maintains backward compatibility
      const currentMult = this.getKnockbackMultiplier();
      const newMult = currentMult * mult;
      this.knockbackLevel = Math.round((newMult - 1.0) / 0.25);
    }
    this.debugLog();
  }

  /**
   * Debug log current player state
   */
  private debugLog(): void {
    if (this.callbacks.getDebugEnabled?.()) {
      this.callbacks.log?.(
        `[PLAYER_STATE] pierceBonus=${this.pierceBonus} knockbackMult=${this.getKnockbackMultiplier().toFixed(2)}`
      );
    }
  }
}

