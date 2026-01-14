import Phaser from "phaser";

// Stage system constants
const STAGE_DURATION_SEC = 15; // Reduced for faster testing (was 25)
const BURST_INTERVAL_MIN_SEC = 12;
const BURST_INTERVAL_MAX_SEC = 15;
const BURST_DURATION_MIN_SEC = 4;
const BURST_DURATION_MAX_SEC = 6;
const RECOVERY_DURATION_MIN_SEC = 2;
const RECOVERY_DURATION_MAX_SEC = 3;

export type BurstState = "idle" | "burst" | "recovery";

export interface StageSystemCallbacks {
  onStageStart: (stage: number) => void;
  onStageEnd: (stage: number, survived: boolean) => void;
  onBurstStart: (stageElapsedSec: number, durationSec: number) => void;
  onBurstEnd: () => void;
  onBurstStateChanged: (state: BurstState) => void;
  log?: (msg: string) => void;
}

export class StageSystem {
  private callbacks: StageSystemCallbacks;

  private currentStage = 1;
  private stageStartTime = 0;
  private stageElapsedSec = 0;

  private burstState: BurstState = "idle";
  private nextBurstTime = 0;
  private burstEndTime = 0;
  private recoveryEndTime = 0;

  constructor(_scene: Phaser.Scene, callbacks: StageSystemCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Reset stage system state without starting
   * Only resets fields/timers/state, does not log or trigger callbacks
   */
  reset(): void {
    this.currentStage = 1;
    this.stageStartTime = 0;
    this.stageElapsedSec = 0;
    this.burstState = "idle";
    this.nextBurstTime = 0;
    this.burstEndTime = 0;
    this.recoveryEndTime = 0;
  }

  /**
   * Start stage system (first stage)
   * This is the only place where [STAGE] START is logged
   */
  start(timeMs: number): void {
    this.currentStage = 1;
    this.stageStartTime = timeMs;
    this.stageElapsedSec = 0;
    this.burstState = "idle";
    this.scheduleNextBurst(timeMs);
    // Logging: StageSystem is the single source of truth for stage logs
    this.callbacks.log?.(`[STAGE] START stage=${this.currentStage} duration=${STAGE_DURATION_SEC}s`);
    this.callbacks.onStageStart(this.currentStage);
  }

  update(timeMs: number): void {
    // Обновляем время стадии
    this.stageElapsedSec = (timeMs - this.stageStartTime) / 1000;

    // Проверяем завершение стадии
    if (this.stageElapsedSec >= STAGE_DURATION_SEC) {
      // Logging: StageSystem is the single source of truth for stage logs
      this.callbacks.log?.(`[STAGE] END stage=${this.currentStage} survived=true`);
      this.callbacks.onStageEnd(this.currentStage, true);
      // StageSystem сам инкрементирует стадию
      this.currentStage++;
      this.stageStartTime = timeMs;
      this.stageElapsedSec = 0;
      this.burstState = "idle";
      this.scheduleNextBurst(timeMs);
      // Logging: StageSystem is the single source of truth for stage logs
      this.callbacks.log?.(`[STAGE] START stage=${this.currentStage} duration=${STAGE_DURATION_SEC}s`);
      this.callbacks.onStageStart(this.currentStage);
      return;
    }

    // Обновляем burst cycle
    this.updateBurstCycle(timeMs);
  }

  getStage(): number {
    return this.currentStage;
  }

  getStageElapsedSec(): number {
    return this.stageElapsedSec;
  }

  getBurstState(): BurstState {
    return this.burstState;
  }

  private scheduleNextBurst(timeMs: number): void {
    const intervalSec = Phaser.Math.Between(
      BURST_INTERVAL_MIN_SEC,
      BURST_INTERVAL_MAX_SEC
    );
    this.nextBurstTime = timeMs + intervalSec * 1000;
  }

  private updateBurstCycle(timeMs: number): void {
    if (this.burstState === "idle") {
      // Проверяем, пора ли начать burst
      if (timeMs >= this.nextBurstTime) {
        this.startBurst(timeMs);
      }
    } else if (this.burstState === "burst") {
      // Проверяем, пора ли закончить burst
      if (timeMs >= this.burstEndTime) {
        this.endBurst(timeMs);
      }
    } else if (this.burstState === "recovery") {
      // Проверяем, пора ли закончить recovery
      if (timeMs >= this.recoveryEndTime) {
        this.endRecovery(timeMs);
      }
    }
  }

  private startBurst(timeMs: number): void {
    this.burstState = "burst";
    const durationSec = Phaser.Math.Between(
      BURST_DURATION_MIN_SEC,
      BURST_DURATION_MAX_SEC
    );
    this.burstEndTime = timeMs + durationSec * 1000;

    this.callbacks.onBurstStateChanged(this.burstState);
    this.callbacks.onBurstStart(this.stageElapsedSec, durationSec);
  }

  private endBurst(timeMs: number): void {
    this.burstState = "recovery";
    const recoverySec = Phaser.Math.Between(
      RECOVERY_DURATION_MIN_SEC,
      RECOVERY_DURATION_MAX_SEC
    );
    this.recoveryEndTime = timeMs + recoverySec * 1000;

    this.callbacks.onBurstStateChanged(this.burstState);
    this.callbacks.onBurstEnd();
  }

  private endRecovery(timeMs: number): void {
    this.burstState = "idle";
    this.scheduleNextBurst(timeMs);
    this.callbacks.onBurstStateChanged(this.burstState);
  }
}

