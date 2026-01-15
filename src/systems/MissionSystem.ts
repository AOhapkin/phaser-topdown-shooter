import type { MissionId, MissionObjective } from "../types/campaign";
import { MissionStateSystem } from "./MissionStateSystem";
import { MISSIONS_BY_ID } from "../config/CampaignConfig";

export interface MissionSystemCallbacks {
  getTimeNowMs: () => number;
  getPlayerIsDead: () => boolean;
  getKillCount: () => number;
  pauseGameplay: () => void;
  resumeGameplay: () => void;
  showMissionComplete: (
    result: "success" | "fail",
    missionId: MissionId
  ) => void;
  log?: (msg: string) => void;
}

/**
 * MissionSystem - manages mission logic and objectives
 */
export class MissionSystem {
  public callbacks: MissionSystemCallbacks;
  private missionState: MissionStateSystem;

  constructor(
    callbacks: MissionSystemCallbacks,
    missionState: MissionStateSystem
  ) {
    this.callbacks = callbacks;
    this.missionState = missionState;
  }

  /**
   * Start a mission
   */
  startMission(
    missionId: MissionId,
    campaignId: string,
    chapterId: string
  ): void {
    const missionDef = MISSIONS_BY_ID.get(missionId);
    if (!missionDef) {
      this.callbacks.log?.(`[MISSION] failed to start: mission ${missionId} not found`);
      return;
    }

    const objective = missionDef.objective;
    const startTimeMs = this.callbacks.getTimeNowMs();

    this.missionState.startMission(
      missionId,
      campaignId,
      chapterId,
      objective,
      startTimeMs
    );

    // Log mission start
    const objectiveStr = this.formatObjective(objective);
    this.callbacks.log?.(
      `[CAMPAIGN] start mission=${missionId} objective=${objectiveStr}`
    );

    // Resume gameplay (mission is active)
    this.callbacks.resumeGameplay();
  }

  /**
   * Update mission system (called every frame)
   */
  update(): void {
    if (!this.missionState.isActive()) {
      return;
    }

    const currentTimeMs = this.callbacks.getTimeNowMs();
    this.missionState.update(currentTimeMs);

    // Check objective completion
    const objective = this.missionState.getObjective();
    if (!objective) {
      return;
    }

    // Check for failure (player dead)
    if (this.callbacks.getPlayerIsDead()) {
      this.completeMission("fail", "player_dead");
      return;
    }

    // Check objective-specific conditions
    switch (objective.kind) {
      case "survive":
        const elapsed = this.missionState.getElapsedSec();
        if (elapsed >= objective.durationSec) {
          this.completeMission("success", "objective_complete");
        }
        break;

      case "kill_count":
        const kills = this.callbacks.getKillCount();
        if (kills >= objective.kills) {
          this.completeMission("success", "objective_complete");
        }
        break;

      case "boss":
        // Stub: boss objectives not implemented yet
        break;
    }
  }

  /**
   * Complete mission with result
   */
  private completeMission(
    result: "success" | "fail",
    reason: string
  ): void {
    if (!this.missionState.isActive()) {
      return;
    }

    const missionId = this.missionState.getMissionId();
    if (!missionId) {
      return;
    }

    const elapsed = this.missionState.getElapsedSec();

    if (result === "success") {
      this.missionState.completeSuccess();
      this.callbacks.log?.(
        `[MISSION] success mission=${missionId} time=${elapsed.toFixed(1)}s`
      );
    } else {
      this.missionState.completeFail();
      this.callbacks.log?.(
        `[MISSION] fail mission=${missionId} time=${elapsed.toFixed(1)}s reason=${reason}`
      );
    }

    // Pause gameplay
    this.callbacks.pauseGameplay();

    // Show completion UI
    this.callbacks.showMissionComplete(result, missionId);
  }

  /**
   * Format objective for logging
   */
  private formatObjective(objective: MissionObjective): string {
    switch (objective.kind) {
      case "survive":
        return `survive(${objective.durationSec}s)`;
      case "kill_count":
        return `kill_count(${objective.kills})`;
      case "boss":
        return `boss(${objective.bossId})`;
    }
  }

  /**
   * Reset mission system
   */
  reset(): void {
    this.missionState.reset();
  }
}
