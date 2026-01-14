/**
 * GameTuning - unified configuration for test/balance parameters
 * Single source of truth for match tuning values
 */
export const GameTuning = {
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
} as const;

