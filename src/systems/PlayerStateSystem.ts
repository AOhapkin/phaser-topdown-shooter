export interface PlayerStateSystemCallbacks {
  getDebugEnabled?: () => boolean;
  log?: (msg: string) => void;
}

/**
 * PlayerStatsSnapshot - unified interface for all player stat modifiers
 * Single source of truth for reading player stats
 */
export interface PlayerStatsSnapshot {
  pierceBonus: number;
  knockbackMultiplier: number;
  bulletSizeMultiplier: number;
  magnetMultiplier: number;
  // Placeholders for future modifiers (not used yet, default to 1.0)
  damageMultiplier: number;
  reloadMultiplier: number;
  moveSpeedMultiplier: number;
}

/**
 * PlayerStateSystem manages player state and modifiers
 * Single source of truth for player stats
 */
export class PlayerStateSystem {
  private callbacks: PlayerStateSystemCallbacks;
  private pierceBonus = 0;
  private knockbackLevel = 0; // Level of knockback perk (0, 1, 2, ...)
  private bulletSizeLevel = 0; // Level of bullet size perk (0, 1, 2, ...)
  private magnetLevel = 0; // Level of magnet perk (0, 1, 2, ...)
  private healOnClearEnabled = false; // Heal on clear perk enabled (maxLevel: 1, so boolean is sufficient)

  constructor(callbacks: PlayerStateSystemCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Reset all player state
   */
  reset(): void {
    this.pierceBonus = 0;
    this.knockbackLevel = 0;
    this.bulletSizeLevel = 0;
    this.magnetLevel = 0;
    this.healOnClearEnabled = false;
    this.debugLog();
  }

  /**
   * Get unified player stats snapshot
   * This is the primary way to read player stats
   */
  getStats(): PlayerStatsSnapshot {
    return {
      pierceBonus: this.pierceBonus,
      knockbackMultiplier: this.getKnockbackMultiplier(),
      bulletSizeMultiplier: this.getBulletSizeMultiplier(),
      magnetMultiplier: this.getMagnetMultiplier(),
      // Placeholders for future modifiers
      damageMultiplier: 1.0,
      reloadMultiplier: 1.0,
      moveSpeedMultiplier: 1.0,
    };
  }

  /**
   * Get current pierce bonus
   * @deprecated Use getStats().pierceBonus instead
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
   * @deprecated Use getStats().knockbackMultiplier instead
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
   * Get current bullet size multiplier
   * Formula: 1.0 + level * 0.3 (matches current behavior: +30% per perk)
   * @deprecated Use getStats().bulletSizeMultiplier instead
   */
  getBulletSizeMultiplier(): number {
    return 1.0 + this.bulletSizeLevel * 0.3;
  }

  /**
   * Multiply bullet size multiplier
   * For +30% per perk: mult = 1.3
   * This increments level to maintain 1:1 behavior with current += 0.3 logic
   */
  mulBulletSize(mult: number): void {
    // Current behavior: each perk adds 0.3 (bulletSizeMultiplier += 0.3)
    // To maintain 1:1: increment level, multiplier = 1.0 + level * 0.3
    // For mult = 1.3 (which represents +30%): increment level by 1
    if (mult === 1.3) {
      this.bulletSizeLevel++;
    } else {
      // For other multipliers, calculate equivalent level increment
      // This maintains backward compatibility
      const currentMult = this.getBulletSizeMultiplier();
      const newMult = currentMult * mult;
      this.bulletSizeLevel = Math.round((newMult - 1.0) / 0.3);
    }
    this.debugLog();
  }

  /**
   * Get current magnet multiplier
   * Formula: 1.0 + level * 0.2 (matches current behavior: += 0.2 per perk)
   * @deprecated Use getStats().magnetMultiplier instead
   */
  getMagnetMultiplier(): number {
    return 1.0 + this.magnetLevel * 0.2;
  }

  /**
   * Multiply magnet multiplier
   * For +20% per perk: mult = 1.2
   * This increments level to maintain 1:1 behavior with current += 0.2 logic
   */
  mulMagnet(mult: number): void {
    // Current behavior: each perk adds 0.2 (magnetMultiplier += 0.2)
    // To maintain 1:1: increment level, multiplier = 1.0 + level * 0.2
    // For mult = 1.2 (which represents +20%): increment level by 1
    if (mult === 1.2) {
      this.magnetLevel++;
    } else {
      // For other multipliers, calculate equivalent level increment
      // This maintains backward compatibility
      const currentMult = this.getMagnetMultiplier();
      const newMult = currentMult * mult;
      this.magnetLevel = Math.round((newMult - 1.0) / 0.2);
    }
    this.debugLog();
  }

  /**
   * Enable heal on clear perk
   * This perk can only be selected once (maxLevel: 1)
   */
  enableHealOnClear(): void {
    this.healOnClearEnabled = true;
    this.debugLog();
  }

  /**
   * Check if heal on clear perk is enabled
   */
  hasHealOnClear(): boolean {
    return this.healOnClearEnabled;
  }

  /**
   * Debug log current player state
   */
  private debugLog(): void {
    if (this.callbacks.getDebugEnabled?.()) {
      this.callbacks.log?.(
        `[PLAYER_STATE] pierceBonus=${this.pierceBonus} knockbackMult=${this.getKnockbackMultiplier().toFixed(2)} bulletSizeMult=${this.getBulletSizeMultiplier().toFixed(2)} magnetMult=${this.getMagnetMultiplier().toFixed(2)} healOnClear=${this.healOnClearEnabled ? 1 : 0}`
      );
    }
  }
}

