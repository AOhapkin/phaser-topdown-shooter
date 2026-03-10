import type { MissionId, MissionObjective, MissionResult } from "../types/campaign";

/**
 * MissionStateSystem - manages mission state (active mission, progress, result)
 * Pure logic, no Phaser dependencies
 */
export class MissionStateSystem {
  private active = false;
  private campaignId: string | null = null;
  private chapterId: string | null = null;
  private missionId: MissionId | null = null;
  private objective: MissionObjective | null = null;
  private startTimeMs = 0;
  private elapsedSec = 0;
  private result: MissionResult = "none";

  /**
   * Start a mission
   */
  startMission(
    missionId: MissionId,
    campaignId: string,
    chapterId: string,
    objective: MissionObjective,
    startTimeMs: number
  ): void {
    this.active = true;
    this.missionId = missionId;
    this.campaignId = campaignId;
    this.chapterId = chapterId;
    this.objective = objective;
    this.startTimeMs = startTimeMs;
    this.elapsedSec = 0;
    this.result = "none";
  }

  /**
   * Update mission state (called every frame)
   */
  update(currentTimeMs: number): void {
    if (!this.active || this.startTimeMs === 0) {
      return;
    }

    this.elapsedSec = (currentTimeMs - this.startTimeMs) / 1000;
  }

  /**
   * Complete mission with success
   */
  completeSuccess(): void {
    if (!this.active) {
      return;
    }

    this.result = "success";
    this.active = false;
  }

  /**
   * Complete mission with failure
   */
  completeFail(): void {
    if (!this.active) {
      return;
    }

    this.result = "fail";
    this.active = false;
  }

  /**
   * Reset mission state
   */
  reset(): void {
    this.active = false;
    this.campaignId = null;
    this.chapterId = null;
    this.missionId = null;
    this.objective = null;
    this.startTimeMs = 0;
    this.elapsedSec = 0;
    this.result = "none";
  }

  /**
   * Check if mission is active
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Get elapsed time in seconds
   */
  getElapsedSec(): number {
    return this.elapsedSec;
  }

  /**
   * Get current objective
   */
  getObjective(): MissionObjective | null {
    return this.objective;
  }

  /**
   * Get current mission ID
   */
  getMissionId(): MissionId | null {
    return this.missionId;
  }

  /**
   * Get mission result
   */
  getResult(): MissionResult {
    return this.result;
  }

  /**
   * Get campaign ID
   */
  getCampaignId(): string | null {
    return this.campaignId;
  }

  /**
   * Get chapter ID
   */
  getChapterId(): string | null {
    return this.chapterId;
  }
}
