import { LevelUpOption } from "../ui/LevelUpOverlay";

export type PerkId = "pierce" | "knockback" | "magnet" | "heal_on_clear" | "bullet_size";

export interface PerkDef {
  id: PerkId;
  title: string;
  description: string;
}

export interface PerkSystemCallbacks {
  onPierceChanged: (level: number) => void;
  onKnockbackChanged: (multiplier: number) => void;
  onMagnetChanged: (multiplier: number) => void;
  onHealOnClear: () => void;
  onBulletSizeChanged: (multiplier: number) => void;
}

/**
 * PerkSystem manages stage clear perks
 */
export class PerkSystem {
  private callbacks: PerkSystemCallbacks;

  // Perk levels
  private pierceLevel = 0;
  private knockbackLevel = 0;
  private magnetLevel = 0;
  private bulletSizeLevel = 0;

  constructor(callbacks: PerkSystemCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Get available perks for selection (returns 3 random perks)
   */
  getAvailablePerks(): LevelUpOption[] {
    const all: LevelUpOption[] = [];

    // 1) PIERCE +1
    all.push({
      title: "PIERCE +1",
      description: "",
      apply: () => {
        this.applyPerk("pierce");
      },
    });

    // 2) KNOCKBACK +25%
    all.push({
      title: "KNOCKBACK +25%",
      description: "",
      apply: () => {
        this.applyPerk("knockback");
      },
    });

    // 3) MAGNET +20%
    all.push({
      title: "MAGNET +20%",
      description: "",
      apply: () => {
        this.applyPerk("magnet");
      },
    });

    // 4) HEAL ON CLEAR
    all.push({
      title: "HEAL ON CLEAR",
      description: "",
      apply: () => {
        this.applyPerk("heal_on_clear");
      },
    });

    // 5) BULLET SIZE +30%
    all.push({
      title: "BULLET SIZE +30%",
      description: "",
      apply: () => {
        this.applyPerk("bullet_size");
      },
    });

    // Перемешиваем и берём 3 уникальных перка
    Phaser.Utils.Array.Shuffle(all);
    return all.slice(0, 3);
  }

  /**
   * Apply a perk by ID
   */
  applyPerk(perkId: PerkId): void {
    switch (perkId) {
      case "pierce":
        this.pierceLevel++;
        this.callbacks.onPierceChanged(this.pierceLevel);
        break;
      case "knockback":
        this.knockbackLevel++;
        this.callbacks.onKnockbackChanged(0.25);
        break;
      case "magnet":
        this.magnetLevel++;
        this.callbacks.onMagnetChanged(0.2);
        break;
      case "heal_on_clear":
        this.callbacks.onHealOnClear();
        break;
      case "bullet_size":
        this.bulletSizeLevel++;
        this.callbacks.onBulletSizeChanged(0.3);
        break;
    }
  }

  /**
   * Reset all perk levels
   */
  reset(): void {
    this.pierceLevel = 0;
    this.knockbackLevel = 0;
    this.magnetLevel = 0;
    this.bulletSizeLevel = 0;
  }

  /**
   * Get current perk level
   */
  getPerkLevel(perkId: PerkId): number {
    switch (perkId) {
      case "pierce":
        return this.pierceLevel;
      case "knockback":
        return this.knockbackLevel;
      case "magnet":
        return this.magnetLevel;
      case "bullet_size":
        return this.bulletSizeLevel;
      case "heal_on_clear":
        return 0; // Heal on clear doesn't have a level
    }
  }
}

