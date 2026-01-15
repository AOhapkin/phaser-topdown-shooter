/**
 * GameTuning - unified configuration for test/balance parameters
 * Single source of truth for match tuning values
 */
export const GameTuning = {
  /**
   * Debug overrides for testing
   * Only active when debug.enabled === true
   * Set to false for release builds
   */
  debug: {
    enabled: false,
    weaponDropTest: {
      forceHighChance: true,
      baseChance: 0.25,
      cooldownMs: 2000,
      ttlMinMs: 15000,
      ttlMaxMs: 20000,
    },
  },
  /**
   * Stage duration in seconds
   * Reduced to 15s for faster testing (was 25s in production)
   */
  stageDurationSec: 15,

  /**
   * Burst cycle parameters
   * Burst cycle: idle -> burst -> recovery -> idle
   */
  burst: {
    /**
     * Interval before next burst starts (random range in seconds)
     * Time in idle state before burst begins
     */
    intervalMinSec: 12,
    intervalMaxSec: 15,

    /**
     * Burst duration (random range in seconds)
     * How long the burst phase lasts
     */
    durationMinSec: 4,
    durationMaxSec: 6,

    /**
     * Recovery duration (random range in seconds)
     * How long the recovery phase lasts after burst
     */
    recoveryMinSec: 2,
    recoveryMaxSec: 3,
  },

  /**
   * Perk effect parameters
   * Balance values for perk effects
   */
  perks: {
    pierce: {
      amountPerLevel: 1,
    },
    knockback: {
      factorPerLevel: 1.25,
    },
    magnet: {
      factorPerLevel: 1.2,
    },
    bulletSize: {
      factorPerLevel: 1.3,
    },
    healOnClear: {
      enabled: true, // Flag for heal on clear perk (structure consistency)
    },
  },

  /**
   * Loot drop parameters
   * TTL, cooldowns, limits, chances for loot items
   */
  loot: {
    /**
     * Buff loot parameters
     */
    buff: {
      ttlMinMs: 8000,
      ttlMaxMs: 12000,
      cooldownMs: 12000, // Global cooldown for buff drops
      maxActive: 1, // Maximum buff loot items on map simultaneously
      dropChance: 0.18, // Chance to attempt buff drop on event (e.g., enemy kill)
      weights: {
        freeze: 0.45, // 45% chance
        rapid: 0.35, // 35% chance
        double: 0.2, // 20% chance
      },
    },
    /**
     * Weapon drop parameters
     */
    weaponDrop: {
      ttlMinMs: 8000,
      ttlMaxMs: 12000,
      cooldownMs: 30000, // 30 seconds cooldown
      baseChance: 0.003, // 0.3% per enemy death
    },
    /**
     * Visual parameters for loot items
     */
    visual: {
      blinkLastMs: 1500, // Blink starts 1.5 seconds before expiration
      blinkIntervalMs: 120,
    },
    /**
     * Log throttling parameters
     */
    logThrottle: {
      cooldownLogIntervalMs: 3000, // Log at most once per 3 seconds
      cooldownLogSkipThreshold: 10, // Or every 10th skip
    },
  },

  /**
   * Buff effect parameters
   * Durations and limits for active buffs
   */
  buffs: {
    rapid: {
      durationMs: 8000,
      maxDurationMs: 20000, // Cap for stacking
      /**
       * Fire rate multiplier when RAPID buff is active
       * Applied to base fire rate: effectiveFireRate = baseFireRate * fireRateMultiplier
       * 0.5 = 50% of base fire rate = 2x faster shooting
       */
      fireRateMultiplier: 0.5,
      /**
       * Reload time multiplier when RAPID buff is active
       * Applied to base reload time: effectiveReloadTime = baseReloadTime * reloadTimeMultiplier
       * 1.0 = no change (default, reserved for future use)
       */
      reloadTimeMultiplier: 1.0,
      /**
       * If true, bypasses reload mechanism (infinite ammo) while RAPID is active
       * Similar to DOUBLE buff behavior
       */
      bypassReload: true,
    },
    double: {
      durationMs: 10000,
      maxDurationMs: 20000, // Cap for stacking (though double doesn't stack)
      /**
       * If true, bypasses reload mechanism (infinite ammo) while DOUBLE is active
       */
      bypassReload: true,
    },
    freeze: {
      durationMs: 6000,
      maxDurationMs: 20000, // Cap for stacking
    },
  },

  /**
   * Enemy parameters
   * Base stats, scaling, and movement configs
   */
  enemies: {
    /**
     * Base stats by enemy type
     */
    types: {
      runner: {
        baseSpeed: 110,
        baseHp: 1,
        scale: 1.0,
        tint: undefined, // No tint
      },
      tank: {
        baseSpeed: 60,
        baseHp: 3,
        scale: 1.3,
        tint: 0x4fc3f7, // Light blue
      },
      fast: {
        baseSpeed: 150,
        baseHp: 1,
        scale: 0.9,
        tint: 0xffeb3b, // Yellow
      },
      heavy: {
        baseSpeed: 40,
        baseHp: 5,
        scale: 1.5,
        tint: 0x9c27b0, // Purple
      },
    },
    /**
     * HP scaling thresholds by stage
     */
    hpScaling: {
      /**
       * Runner HP scaling: 1 HP until stage 4, then 2 HP until stage 7, then 3 HP
       */
      runner: {
        stage4: 2,
        stage7: 3,
      },
      /**
       * Tank HP scaling: 3 HP until stage 4, then 4 HP until stage 7, then 5 HP
       */
      tank: {
        stage4: 4,
        stage7: 5,
      },
    },
    /**
     * Speed scaling by stage
     */
    speedScaling: {
      /**
       * Speed multiplier per stage: +2% per stage, capped at 1.3
       */
      perStagePercent: 2, // 2% per stage
      maxMultiplier: 1.3, // Cap at 1.3x speed
    },
    /**
     * Tank weight scaling by stage
     */
    tankWeightScaling: {
      /**
       * Tank weight multiplier per stage: +8% per stage (power-based)
       */
      perStagePercent: 8, // 8% per stage
    },
    /**
     * Movement configs for steering behavior
     */
    movement: {
      runner: {
        orbitRadius: 90,
        separationRadius: 32,
        orbitStrength: 55,
        separationStrength: 140,
        steeringSharpness: 10,
      },
      tank: {
        orbitRadius: 110,
        separationRadius: 44,
        orbitStrength: 35,
        separationStrength: 110,
        steeringSharpness: 8,
      },
      fast: {
        orbitRadius: 90,
        separationRadius: 32,
        orbitStrength: 55,
        separationStrength: 140,
        steeringSharpness: 10,
      },
      heavy: {
        orbitRadius: 110,
        separationRadius: 44,
        orbitStrength: 35,
        separationStrength: 110,
        steeringSharpness: 8,
      },
    },
  },

  /**
   * Spawn system parameters
   * Spawn intervals, limits, burst modifiers, and phase settings
   */
  spawn: {
    /**
     * Minimum spawn delay (hard cap)
     */
    minDelayMs: 560,
    /**
     * Spawn tick interval (how often to check for spawn)
     */
    tickIntervalMs: 200,
    /**
     * Retry delay when max enemies reached
     */
    retryDelayMs: 500,
    /**
     * Burst modifiers
     */
    burst: {
      /**
       * Spawn delay reduction during burst (45% reduction = 55% of normal delay)
       */
      spawnReduction: 0.45, // 45% reduction (spawn 55% faster)
      /**
       * Runner weight boost during burst
       */
      runnerWeightBoost: 1.3, // 30% boost to runner weight
      /**
       * Speed boost for enemies during burst
       */
      speedBoost: 1.12, // 12% speed increase
    },
    /**
     * Recovery phase modifier
     */
    recovery: {
      /**
       * Spawn delay multiplier during recovery (20% slower spawn)
       */
      spawnMultiplier: 1.2, // 20% slower spawn
    },
    /**
     * Phase settings
     * Each phase defines spawn parameters
     */
    phases: [
      {
        phase: 1,
        durationSec: 45,
        maxAliveEnemies: 10,
        spawnDelayMs: 900,
        weights: { runner: 100, tank: 0 },
        tankCap: 0,
      },
      {
        phase: 2,
        durationSec: 45,
        maxAliveEnemies: 12,
        spawnDelayMs: 850,
        weights: { runner: 90, tank: 10 },
        tankCap: 1,
      },
      {
        phase: 3,
        durationSec: 45,
        maxAliveEnemies: 14,
        spawnDelayMs: 800,
        weights: { runner: 80, tank: 20 },
        tankCap: 2,
      },
      {
        phase: 4,
        durationSec: 45,
        maxAliveEnemies: 16,
        spawnDelayMs: 760,
        weights: { runner: 70, tank: 30 },
        tankCap: 3,
      },
      {
        phase: 5,
        durationSec: 45,
        maxAliveEnemies: 18,
        spawnDelayMs: 720,
        weights: { runner: 60, tank: 40 },
        tankCap: 4,
      },
    ],
  },

  /**
   * Projectile parameters (defaults, weapon-specific values in WeaponsConfig)
   */
  projectiles: {
    defaultSpeed: 500,
    defaultLifetimeMs: 1200,
    defaultBaseRadius: 4,
  },
} as const;
