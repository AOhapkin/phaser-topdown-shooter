import { PerkDef, PerkId } from "../systems/PerkSystem";

/**
 * PerksConfig - data-driven perk definitions
 * Single source of truth for perk metadata
 */
export const PERKS_CONFIG: PerkDef[] = [
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

