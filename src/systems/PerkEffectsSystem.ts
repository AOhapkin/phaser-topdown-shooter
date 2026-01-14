import { PerkId } from "./PerkSystem";
import { PlayerStateSystem } from "./PlayerStateSystem";

/**
 * PerkEffectsSystem - encapsulates perk effect application logic
 * Separated from GameSystems to reduce coupling and improve maintainability
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
   * Apply perk effect by ID
   * @param perkId - Perk identifier
   * @param delta - Level change (typically +1 per apply)
   */
  apply(perkId: PerkId, delta: number): void {
    if (perkId === "pierce") {
      // PIERCE: add pierce bonus (delta is always +1 per apply)
      this.playerStateSystem.addPierce(delta);
    } else if (perkId === "knockback") {
      // KNOCKBACK: multiply knockback (level-based, so repeat delta times)
      for (let i = 0; i < delta; i++) {
        this.playerStateSystem.mulKnockback(1.25);
      }
    } else if (perkId === "magnet") {
      // MAGNET: multiply magnet (level-based, so repeat delta times)
      for (let i = 0; i < delta; i++) {
        this.playerStateSystem.mulMagnet(1.2);
      }
      // Update pickup radius after magnet change (once per apply, not in loop)
      this.updatePlayerPickupRadius();
    } else if (perkId === "bullet_size") {
      // BULLET_SIZE: multiply bullet size (level-based, so repeat delta times)
      for (let i = 0; i < delta; i++) {
        this.playerStateSystem.mulBulletSize(1.3);
      }
      // WeaponSystem will apply bulletSizeMultiplier from getStats() to new bullets automatically
    } else if (perkId === "heal_on_clear") {
      // HEAL_ON_CLEAR: enable heal on clear flag (one-time, no level stacking)
      if (delta > 0) {
        this.playerStateSystem.enableHealOnClear();
      }
    }
  }
}

