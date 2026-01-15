import type { WeaponId } from "./WeaponsConfig";

export type WeaponDropEntry = {
  weaponId: WeaponId;
  weight: number;
  minStage?: number;
  maxStage?: number;
  allowIfCurrentWeapon?: boolean;
};

export const WEAPON_DROP_POOL: WeaponDropEntry[] = [
  {
    weaponId: "PISTOL",
    weight: 1,
    allowIfCurrentWeapon: false,
  },
  {
    weaponId: "SHOTGUN",
    weight: 1,
    allowIfCurrentWeapon: false,
  },
  {
    weaponId: "SMG",
    weight: 1,
    minStage: 3,
    allowIfCurrentWeapon: false,
  },
];

export function pickWeaponDropId(args: {
  stage: number;
  currentWeaponId: WeaponId | null;
  rng?: () => number;
}): WeaponId | null {
  const { stage, currentWeaponId, rng } = args;
  const roll = rng ?? Math.random;

  const candidates = WEAPON_DROP_POOL.filter((entry) => {
    if (entry.minStage !== undefined && stage < entry.minStage) {
      return false;
    }
    if (entry.maxStage !== undefined && stage > entry.maxStage) {
      return false;
    }
    if (
      entry.allowIfCurrentWeapon === false &&
      currentWeaponId !== null &&
      entry.weaponId === currentWeaponId
    ) {
      return false;
    }
    return entry.weight > 0;
  });

  if (candidates.length === 0) {
    return null;
  }

  const totalWeight = candidates.reduce(
    (sum, entry) => sum + entry.weight,
    0
  );

  if (totalWeight <= 0) {
    return null;
  }

  let r = roll() * totalWeight;

  for (const entry of candidates) {
    r -= entry.weight;
    if (r <= 0) {
      return entry.weaponId;
    }
  }

  return candidates[candidates.length - 1]?.weaponId ?? null;
}

