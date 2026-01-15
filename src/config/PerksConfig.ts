import { PerkId, PerkDef } from "../types/perks";
import { GameTuning } from "./GameTuning";

/**
 * PerksConfig - data-driven perk definitions
 * Single source of truth for perk metadata and effects
 * Balance values come from GameTuning.perks
 */
export const PERKS_CONFIG: PerkDef[] = [
  {
    id: "pierce",
    title: "PIERCE +1",
    desc: "",
    // No maxLevel - can be upgraded unlimited times
    effect: {
      kind: "add_pierce",
      amountPerLevel: GameTuning.perks.pierce.amountPerLevel,
    },
  },
  {
    id: "knockback",
    title: "KNOCKBACK +25%",
    desc: "",
    // No maxLevel - can be upgraded unlimited times
    effect: {
      kind: "mul_knockback",
      factorPerLevel: GameTuning.perks.knockback.factorPerLevel,
    },
  },
  {
    id: "magnet",
    title: "MAGNET +20%",
    desc: "",
    // No maxLevel - can be upgraded unlimited times
    effect: {
      kind: "mul_magnet",
      factorPerLevel: GameTuning.perks.magnet.factorPerLevel,
      afterApply: "updatePickupRadius",
    },
  },
  {
    id: "heal_on_clear",
    title: "HEAL ON CLEAR",
    desc: "",
    maxLevel: 1, // Can only be picked once
    // Effect enabled via GameTuning.perks.healOnClear.enabled (always true, structure consistency)
    effect: {
      kind: "enable_heal_on_clear",
    },
  },
  {
    id: "bullet_size",
    title: "BULLET SIZE +30%",
    desc: "",
    // No maxLevel - can be upgraded unlimited times
    effect: {
      kind: "mul_bullet_size",
      factorPerLevel: GameTuning.perks.bulletSize.factorPerLevel,
    },
  },
];

/**
 * Map of perks by ID for O(1) lookup
 * Built once from PERKS_CONFIG
 */
export const PERKS_BY_ID = new Map<PerkId, PerkDef>(
  PERKS_CONFIG.map((def) => [def.id, def])
);
