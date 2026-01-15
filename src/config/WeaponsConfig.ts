/**
 * WeaponsConfig - data-driven weapon definitions
 * Single source of truth for weapon parameters and projectile settings
 */

export type WeaponId = "PISTOL" | "SHOTGUN" | "SMG";

export type WeaponDef = {
  id: WeaponId;
  title: string;
  fireRateMs: number;
  magazineSize: number;
  reloadTimeMs: number;
  projectile: {
    speed: number;
    lifetimeMs: number;
    baseRadius: number;
  };
  spread?: {
    /**
     * Spread angles for multi-projectile weapons (in radians)
     * For shotgun: 5 bullets with spread
     */
    angles?: number[];
    /**
     * Double shot spread for pistol (in radians)
     */
    doubleShotRad?: number;
  };
  /**
   * Double buff: delay for second shot (ms)
   * Only for shotgun
   */
  doubleShotDelayMs?: number;
  /**
   * Upgrade limits
   */
  limits?: {
    minFireRateMs: number;
    minReloadTimeMs: number;
    maxMagazineSize: number;
  };
};

export const WEAPONS_CONFIG: WeaponDef[] = [
  {
    id: "PISTOL",
    title: "PISTOL",
    fireRateMs: 600,
    magazineSize: 6,
    reloadTimeMs: 1500,
    projectile: {
      speed: 500,
      lifetimeMs: 1200,
      baseRadius: 4,
    },
    spread: {
      doubleShotRad: 0.08, // +/- 0.08 rad for double shot
    },
    limits: {
      minFireRateMs: 140,
      minReloadTimeMs: 600,
      maxMagazineSize: 10,
    },
  },
  {
    id: "SHOTGUN",
    title: "SHOTGUN",
    fireRateMs: 800,
    magazineSize: 2,
    reloadTimeMs: 1400,
    projectile: {
      speed: 500,
      lifetimeMs: 1200,
      baseRadius: 4,
    },
    spread: {
      angles: [-0.3, -0.15, 0, 0.15, 0.3], // 5 bullets
    },
    doubleShotDelayMs: 100, // Delay for second shot in DOUBLE buff
  },
  {
    id: "SMG",
    title: "SMG",
    fireRateMs: 140,
    magazineSize: 24,
    reloadTimeMs: 1600,
    projectile: {
      speed: 520,
      lifetimeMs: 1100,
      baseRadius: 3,
    },
    spread: {
      doubleShotRad: 0.08, // Same as pistol for double shot
    },
    limits: {
      minFireRateMs: 80,
      minReloadTimeMs: 800,
      maxMagazineSize: 40,
    },
  },
];

/**
 * Map of weapons by ID for O(1) lookup
 */
export const WEAPONS_BY_ID = new Map<WeaponId, WeaponDef>(
  WEAPONS_CONFIG.map((def) => [def.id, def])
);
