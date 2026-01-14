export type PerkId = "pierce" | "knockback" | "magnet" | "heal_on_clear" | "bullet_size";

export interface PerkDef {
  id: PerkId;
  title: string;
  desc: string;
  maxLevel?: number;
}

export interface PerkSystemCallbacks {
  onPierceChanged: (level: number) => void;
  onKnockbackChanged: (multiplier: number) => void;
  onMagnetChanged: (multiplier: number) => void;
  onHealOnClear: () => void;
  onBulletSizeChanged: (multiplier: number) => void;
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
   */
  getAllDefs(): PerkDef[] {
    return [
      {
        id: "pierce",
        title: "PIERCE +1",
        desc: "",
        // No maxLevel - can be upgraded unlimited times
      },
      {
        id: "knockback",
        title: "KNOCKBACK +25%",
        desc: "",
        // No maxLevel - can be upgraded unlimited times
      },
      {
        id: "magnet",
        title: "MAGNET +20%",
        desc: "",
        // No maxLevel - can be upgraded unlimited times
      },
      {
        id: "heal_on_clear",
        title: "HEAL ON CLEAR",
        desc: "",
        maxLevel: 1, // Can only be picked once
      },
      {
        id: "bullet_size",
        title: "BULLET SIZE +30%",
        desc: "",
        // No maxLevel - can be upgraded unlimited times
      },
    ];
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

    // Log perk selection
    this.callbacks.log?.(`[PERK] picked ${def.title}`);

    // Apply effect through callbacks
    switch (id) {
      case "pierce":
        this.callbacks.onPierceChanged(this.levels[id]);
        break;
      case "knockback":
        this.callbacks.onKnockbackChanged(0.25);
        break;
      case "magnet":
        this.callbacks.onMagnetChanged(0.2);
        break;
      case "heal_on_clear":
        this.callbacks.onHealOnClear();
        break;
      case "bullet_size":
        this.callbacks.onBulletSizeChanged(0.3);
        break;
    }
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
