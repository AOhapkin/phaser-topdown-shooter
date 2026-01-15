/**
 * Perk types - shared type definitions for perks system
 * Extracted to break circular dependencies between PerksConfig and PerkSystem
 */

/**
 * Perk identifier - union of all perk IDs
 */
export type PerkId = "pierce" | "knockback" | "magnet" | "heal_on_clear" | "bullet_size";

/**
 * Perk effect definition - discriminated union for type-safe effect handling
 */
export type PerkEffect =
  | { kind: "add_pierce"; amountPerLevel: number }
  | { kind: "mul_knockback"; factorPerLevel: number }
  | { kind: "mul_magnet"; factorPerLevel: number; afterApply?: "updatePickupRadius" }
  | { kind: "mul_bullet_size"; factorPerLevel: number }
  | { kind: "enable_heal_on_clear" };

/**
 * Perk definition interface
 */
export interface PerkDef {
  id: PerkId;
  title: string;
  desc: string;
  maxLevel?: number;
  effect: PerkEffect;
}
