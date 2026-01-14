import Phaser from "phaser";
import { PERKS_CONFIG } from "../config/PerksConfig";

export type PerkId = "pierce" | "knockback" | "magnet" | "heal_on_clear" | "bullet_size";

export interface PerkDef {
  id: PerkId;
  title: string;
  desc: string;
  maxLevel?: number;
}

export interface PerkSystemCallbacks {
  /**
   * Unified callback for perk application
   * Called after perk level is incremented
   */
  onPerkApplied?: (perkId: PerkId, newLevel: number, delta: number) => void;
  log?: (msg: string) => void;
}

/**
 * PerkSystem manages stage clear perks
 */
export class PerkSystem {
  private callbacks: PerkSystemCallbacks;

  // Perk levels stored as Record<PerkId, number>
  private levels: Record<PerkId, number> = {
    pierce: 0,
    knockback: 0,
    magnet: 0,
    heal_on_clear: 0,
    bullet_size: 0,
  };

  constructor(callbacks: PerkSystemCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Get all perk definitions
   * Now reads from PerksConfig (data-driven)
   */
  getAllDefs(): PerkDef[] {
    return PERKS_CONFIG;
  }

  /**
   * Get random unique perks that haven't reached maxLevel
   * @param count Number of perks to return (default: 3)
   * @param rng Optional random number generator (default: Phaser's shuffle)
   */
  getRandomPick(count: number = 3, rng?: () => number): PerkDef[] {
    const allDefs = this.getAllDefs();

    // Filter out perks that have reached maxLevel
    const available = allDefs.filter((def) => {
      const currentLevel = this.levels[def.id];
      if (def.maxLevel !== undefined) {
        return currentLevel < def.maxLevel;
      }
      return true; // No maxLevel means always available
    });

    // Shuffle using provided RNG or Phaser's default
    if (rng) {
      // Custom RNG: Fisher-Yates shuffle
      const shuffled = [...available];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled.slice(0, count);
    } else {
      // Use Phaser's shuffle
      Phaser.Utils.Array.Shuffle(available);
      return available.slice(0, count);
    }
  }

  /**
   * Apply a perk by ID
   * Increases level and applies effect through callbacks
   * If maxLevel is reached, level is not increased further
   */
  apply(id: PerkId): void {
    const def = this.getAllDefs().find((d) => d.id === id);
    if (!def) {
      return;
    }

    // Check maxLevel
    const currentLevel = this.levels[id];
    if (def.maxLevel !== undefined && currentLevel >= def.maxLevel) {
      return; // Already at max level
    }

    // Increase level
    this.levels[id]++;
    const newLevel = this.levels[id];
    const delta = 1; // Always +1 per apply

    // Call unified callback first
    this.callbacks.onPerkApplied?.(id, newLevel, delta);

    // Log perk selection (legacy log)
    this.callbacks.log?.(`[PERK] picked ${def.title}`);

    // All perks are now handled via onPerkApplied, no legacy callbacks remain
  }

  /**
   * Reset all perk levels
   */
  reset(): void {
    this.levels = {
      pierce: 0,
      knockback: 0,
      magnet: 0,
      heal_on_clear: 0,
      bullet_size: 0,
    };
  }

  /**
   * Get current perk level
   */
  getLevel(id: PerkId): number {
    return this.levels[id];
  }

  /**
   * @deprecated Use getLevel() instead
   */
  getPerkLevel(id: PerkId): number {
    return this.getLevel(id);
  }
}
