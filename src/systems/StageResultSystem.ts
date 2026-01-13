import { MatchStatsSystem } from "./MatchStatsSystem";
import { StageSystem } from "./StageSystem";

/**
 * StageResultSystem aggregates data for Stage Clear and Game Over screens
 */
export class StageResultSystem {
  private matchStatsSystem: MatchStatsSystem;
  private stageSystem: StageSystem;

  // Snapshot at stage end
  private stageSnapshot: {
    stage: number;
    durationSec: number;
    killsTotal: number;
    killsRunner: number;
    killsTank: number;
    damageTaken: number;
    heals: number;
  } | null = null;

  // Snapshot at match end
  private matchSnapshot: {
    durationSec: number;
    score: number;
    shotsFired: number;
    shotsHit: number;
    accuracy: number;
    killsTotal: number;
    killsRunner: number;
    killsTank: number;
    damageTaken: number;
    heals: number;
    speed: number;
  } | null = null;

  constructor(matchStatsSystem: MatchStatsSystem, stageSystem: StageSystem) {
    this.matchStatsSystem = matchStatsSystem;
    this.stageSystem = stageSystem;
  }

  /**
   * Called when stage ends - capture snapshot for stage summary
   */
  onStageEnd(stageIndex: number): void {
    if (!this.stageSystem || !this.matchStatsSystem) {
      return; // Systems not initialized yet
    }
    const matchSummary = this.matchStatsSystem.getSummary();
    const stageElapsedSec = this.stageSystem.getStageElapsedSec();

    this.stageSnapshot = {
      stage: stageIndex,
      durationSec: stageElapsedSec,
      killsTotal: matchSummary.killsTotal,
      killsRunner: matchSummary.killsRunner,
      killsTank: matchSummary.killsTank,
      damageTaken: matchSummary.damageTaken,
      heals: matchSummary.heals,
    };
  }

  /**
   * Called when match ends - capture snapshot for match summary
   */
  onMatchEnd(endTimeMs: number): void {
    if (!this.matchStatsSystem) {
      return; // System not initialized yet
    }
    this.matchStatsSystem.endMatch(endTimeMs);
    const matchSummary = this.matchStatsSystem.getSummary();

    this.matchSnapshot = {
      durationSec: matchSummary.durationSec,
      score: matchSummary.score,
      shotsFired: matchSummary.shotsFiredProjectiles,
      shotsHit: matchSummary.shotsHitProjectiles,
      accuracy: matchSummary.accuracy,
      killsTotal: matchSummary.killsTotal,
      killsRunner: matchSummary.killsRunner,
      killsTank: matchSummary.killsTank,
      damageTaken: matchSummary.damageTaken,
      heals: matchSummary.heals,
      speed: matchSummary.speed,
    };
  }

  /**
   * Get stage summary (for Stage Clear overlay)
   */
  getStageSummary(): {
    stage: number;
    durationSec: number;
    killsTotal: number;
    killsRunner: number;
    killsTank: number;
    damageTaken: number;
    heals: number;
  } {
    if (this.stageSnapshot === null) {
      // Fallback: return current values
      if (!this.stageSystem || !this.matchStatsSystem) {
        // Return default values if systems not initialized
        return {
          stage: 1,
          durationSec: 0,
          killsTotal: 0,
          killsRunner: 0,
          killsTank: 0,
          damageTaken: 0,
          heals: 0,
        };
      }
      const matchSummary = this.matchStatsSystem.getSummary();
      return {
        stage: this.stageSystem.getStage(),
        durationSec: this.stageSystem.getStageElapsedSec(),
        killsTotal: matchSummary.killsTotal,
        killsRunner: matchSummary.killsRunner,
        killsTank: matchSummary.killsTank,
        damageTaken: matchSummary.damageTaken,
        heals: matchSummary.heals,
      };
    }
    return this.stageSnapshot;
  }

  /**
   * Get match summary (for Game Over logs)
   */
  getMatchSummary(): {
    durationSec: number;
    score: number;
    shotsFired: number;
    shotsHit: number;
    accuracy: number;
    killsTotal: number;
    killsRunner: number;
    killsTank: number;
    damageTaken: number;
    heals: number;
    speed: number;
  } {
    if (this.matchSnapshot === null) {
      // Fallback: return current values (should not happen if onMatchEnd was called)
      if (!this.matchStatsSystem) {
        // Return default values if system not initialized
        return {
          durationSec: 0,
          score: 0,
          shotsFired: 0,
          shotsHit: 0,
          accuracy: 0,
          killsTotal: 0,
          killsRunner: 0,
          killsTank: 0,
          damageTaken: 0,
          heals: 0,
          speed: 0,
        };
      }
      const matchSummary = this.matchStatsSystem.getSummary();
      return {
        durationSec: matchSummary.durationSec,
        score: matchSummary.score,
        shotsFired: matchSummary.shotsFiredProjectiles,
        shotsHit: matchSummary.shotsHitProjectiles,
        accuracy: matchSummary.accuracy,
        killsTotal: matchSummary.killsTotal,
        killsRunner: matchSummary.killsRunner,
        killsTank: matchSummary.killsTank,
        damageTaken: matchSummary.damageTaken,
        heals: matchSummary.heals,
        speed: matchSummary.speed,
      };
    }
    return this.matchSnapshot;
  }
}

