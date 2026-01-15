import { PerkId, PerkEffect } from "../types/perks";
import { PlayerStateSystem } from "./PlayerStateSystem";
import { PERKS_BY_ID } from "../config/PerksConfig";

/**
 * PerkEffectsSystem - encapsulates perk effect application logic
 * Data-driven: uses PerkDef.effect from PerksConfig instead of hardcoded if/else
 */
export class PerkEffectsSystem {
  private playerStateSystem: PlayerStateSystem;
  private updatePlayerPickupRadius: () => void;

  constructor(
    playerStateSystem: PlayerStateSystem,
    updatePlayerPickupRadius: () => void
  ) {
    this.playerStateSystem = playerStateSystem;
    this.updatePlayerPickupRadius = updatePlayerPickupRadius;
  }

  /**
   * Apply perk effect by ID (data-driven from PerksConfig)
   * @param perkId - Perk identifier
   * @param delta - Level change (typically +1 per apply)
   */
  apply(perkId: PerkId, delta: number): void {
    const def = PERKS_BY_ID.get(perkId);
    if (!def) {
      throw new Error(`Perk not found: ${perkId}`);
    }

    const effect = def.effect;
    this.applyEffect(effect, delta);
  }

  /**
   * Apply perk effect (exhaustive switch with type safety)
   */
  private applyEffect(effect: PerkEffect, delta: number): void {
    switch (effect.kind) {
      case "add_pierce":
        // PIERCE: add pierce bonus (delta is always +1 per apply)
        // amountPerLevel is typically 1, so we multiply to allow future flexibility
        this.playerStateSystem.addPierce(delta * effect.amountPerLevel);
        break;

      case "mul_knockback":
        // KNOCKBACK: multiply knockback (level-based, so repeat delta times)
        for (let i = 0; i < delta; i++) {
          this.playerStateSystem.mulKnockback(effect.factorPerLevel);
        }
        break;

      case "mul_magnet":
        // MAGNET: multiply magnet (level-based, so repeat delta times)
        for (let i = 0; i < delta; i++) {
          this.playerStateSystem.mulMagnet(effect.factorPerLevel);
        }
        // Update pickup radius after magnet change (once per apply, not in loop)
        if (effect.afterApply === "updatePickupRadius") {
          this.updatePlayerPickupRadius();
        }
        break;

      case "mul_bullet_size":
        // BULLET_SIZE: multiply bullet size (level-based, so repeat delta times)
        for (let i = 0; i < delta; i++) {
          this.playerStateSystem.mulBulletSize(effect.factorPerLevel);
        }
        // WeaponSystem will apply bulletSizeMultiplier from getStats() to new bullets automatically
        break;

      case "enable_heal_on_clear":
        // HEAL_ON_CLEAR: enable heal on clear flag (one-time, no level stacking)
        if (delta > 0) {
          this.playerStateSystem.enableHealOnClear();
        }
        break;

      default:
        assertNever(effect);
    }
  }
}

/**
 * Type-safe exhaustive check helper
 * Ensures all PerkEffect variants are handled in switch
 */
function assertNever(x: never): never {
  throw new Error("Unhandled perk effect: " + JSON.stringify(x));
}

