/**
 * MatchStatsSystem manages match statistics (shots, hits, kills, damage, etc.)
 */
export class MatchStatsSystem {
  // Time tracking
  private startedAtMs = 0;
  private endedAtMs: number | null = null;

  // Combat stats
  private shotsFiredProjectiles = 0;
  private shotsHitProjectiles = 0;
  private shotsFired = 0; // Legacy
  private shotsHit = 0; // Legacy

  // Kill stats
  private killsTotal = 0;
  private killsRunner = 0;
  private killsTank = 0;

  // Player stats
  private damageTaken = 0;
  private healsPicked = 0;
  private speedPicked = 0;

  // Score
  private score = 0;

  /**
   * Reset all statistics and start new match
   */
  reset(startTimeMs: number): void {
    this.startedAtMs = startTimeMs;
    this.endedAtMs = null;
    this.shotsFiredProjectiles = 0;
    this.shotsHitProjectiles = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.killsTotal = 0;
    this.killsRunner = 0;
    this.killsTank = 0;
    this.damageTaken = 0;
    this.healsPicked = 0;
    this.speedPicked = 0;
    this.score = 0;
  }

  /**
   * Called when shot is fired
   */
  onShotFired(projectilesCount: number): void {
    this.shotsFiredProjectiles += projectilesCount;
    // Legacy: keep shotsFired for backward compatibility
    this.shotsFired += projectilesCount;
  }

  /**
   * Called when projectile hits enemy
   */
  onProjectileHit(): void {
    this.shotsHitProjectiles++;
    // Legacy: keep shotsHit for backward compatibility
    this.shotsHit++;
  }

  /**
   * Called when enemy is killed
   */
  onEnemyKilled(type: "runner" | "tank"): void {
    this.killsTotal++;
    if (type === "runner") {
      this.killsRunner++;
    } else if (type === "tank") {
      this.killsTank++;
    }
    this.score += 1;
  }

  /**
   * Called when enemy is killed (total only, no type tracking)
   */
  onEnemyKilledTotalOnly(): void {
    this.killsTotal++;
    this.score += 1;
  }

  /**
   * Called when player takes damage
   */
  onPlayerDamaged(amount: number): void {
    this.damageTaken += amount;
  }

  /**
   * Called when player picks up heal
   */
  onPlayerHealed(amount: number): void {
    this.healsPicked += amount;
  }

  /**
   * Called when player picks up speed boost
   */
  onPlayerSpeedChanged(level: number): void {
    this.speedPicked += level;
  }

  /**
   * End match and fix end time
   */
  endMatch(endTimeMs: number): void {
    if (this.endedAtMs === null) {
      this.endedAtMs = endTimeMs;
    }
  }

  /**
   * Get summary for logging (includes all fields needed for printMatchSummary)
   */
  getSummary(): {
    durationSec: number;
    shotsFired: number;
    shotsHit: number;
    accuracy: number;
    killsTotal: number;
    killsRunner: number;
    killsTank: number;
    damageTaken: number;
    heals: number;
    speed: number;
    score: number;
    // Additional fields for logging
    shotsFiredProjectiles: number;
    shotsHitProjectiles: number;
  } {
    const endTime = this.endedAtMs ?? this.startedAtMs;
    const durationSec = (endTime - this.startedAtMs) / 1000;

    const fired = this.shotsFiredProjectiles;
    const hit = this.shotsHitProjectiles;

    // TODO: With pierce, hit can be >= fired (one projectile can hit multiple enemies)
    // hit = количество попаданий, fired = количество выпущенных снарядов
    // After fix: hit should never exceed fired due to duplicate overlaps/callbacks
    // If hit > fired, it indicates a bug (duplicate hit counting), not pierce behavior

    const accuracy = fired > 0 ? (hit / fired) * 100 : 0;

    // Clamp accuracy to 0-100% (safety measure)
    const clampedAccuracy = Math.min(100.0, Math.max(0, accuracy));

    return {
      durationSec,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      accuracy: clampedAccuracy,
      killsTotal: this.killsTotal,
      killsRunner: this.killsRunner,
      killsTank: this.killsTank,
      damageTaken: this.damageTaken,
      heals: this.healsPicked,
      speed: this.speedPicked,
      score: this.score,
      shotsFiredProjectiles: this.shotsFiredProjectiles,
      shotsHitProjectiles: this.shotsHitProjectiles,
    };
  }
}

