import Phaser from "phaser";
import { GameTuning } from "../config/GameTuning";

export type EnemyType = "runner" | "tank";

export type BurstState = "idle" | "burst" | "recovery";

export interface PhaseSettings {
  phase: number;
  durationSec: number;
  maxAliveEnemies: number;
  spawnDelayMs: number;
  weights: { runner: number; tank: number };
  tankCap: number;
}

export interface SpawnSystemCallbacks {
  getIsActive: () => boolean; // true when game started and not gameOver
  getCurrentPhase: () => number;
  getPhaseSettings: (phase: number) => PhaseSettings;
  getBurstState: () => BurstState;
  getSpawnDelayMultiplier: () => number; // burst/recovery multiplier
  getEffectiveWeights: (
    settings: PhaseSettings,
    burstState: BurstState
  ) => { runner: number; tank: number }; // weights with burst/stage modifiers
  getAliveEnemiesCount: () => number; // current alive enemies count
  getAliveTanksCount: () => number; // current alive tanks count
  spawnEnemy: (chosenType: EnemyType) => void; // callback to create enemy
  logSpawnDebug?: (msg: string) => void; // optional debug logging
}

export class SpawnSystem {
  private scene: Phaser.Scene;
  private callbacks: SpawnSystemCallbacks;
  private minSpawnDelayMs: number;

  private spawnTickEvent?: Phaser.Time.TimerEvent;
  private currentSpawnDelay: number = 0;
  private nextSpawnAtMs: number = 0;
  private isEnabled: boolean = false;

  constructor(
    scene: Phaser.Scene,
    callbacks: SpawnSystemCallbacks,
    minSpawnDelayMs: number
  ) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.minSpawnDelayMs = minSpawnDelayMs;
  }

  start(time: number): void {
    this.stop();
    this.isEnabled = true;
    this.updateSpawnTimer(time);
  }

  stop(): void {
    this.isEnabled = false;
    if (this.spawnTickEvent) {
      this.spawnTickEvent.remove(false);
      this.spawnTickEvent = undefined;
    }
    this.nextSpawnAtMs = 0;
    this.currentSpawnDelay = 0;
  }

  reset(time: number): void {
    this.stop();
    this.start(time);
  }

  onParamsChanged(time: number): void {
    if (!this.isEnabled) {
      return;
    }
    this.updateSpawnTimer(time);
  }

  private updateSpawnTimer(time: number): void {
    if (!this.callbacks.getIsActive()) {
      return;
    }

    const phase = this.callbacks.getCurrentPhase();
    const settings = this.callbacks.getPhaseSettings(phase);
    const baseDelay = settings.spawnDelayMs;
    const mult = this.callbacks.getSpawnDelayMultiplier();
    const delay = Math.max(
      this.minSpawnDelayMs,
      baseDelay * mult
    );

    // Если delay не изменился и таймер уже работает - ничего не делаем
    if (
      this.spawnTickEvent &&
      Math.abs(this.currentSpawnDelay - delay) < 1
    ) {
      return;
    }

    // Удаляем старый таймер
    if (this.spawnTickEvent) {
      this.spawnTickEvent.remove(false);
      this.spawnTickEvent = undefined;
    }

    this.currentSpawnDelay = delay;
    this.nextSpawnAtMs = time + delay;

    // Создаём новый таймер, который тикает каждые tickIntervalMs (из GameTuning)
    this.spawnTickEvent = this.scene.time.addEvent({
      delay: GameTuning.spawn.tickIntervalMs,
      loop: true,
      callback: () => this.spawnTick(),
    });
  }

  private spawnTick(): void {
    if (!this.callbacks.getIsActive()) {
      return;
    }

    const now = this.scene.time.now;

    // Проверяем, пора ли спавнить
    if (now < this.nextSpawnAtMs) {
      return;
    }

    // Проверяем лимит врагов
    const phase = this.callbacks.getCurrentPhase();
    const settings = this.callbacks.getPhaseSettings(phase);
    const alive = this.callbacks.getAliveEnemiesCount();
    if (alive >= settings.maxAliveEnemies) {
      // Если достигнут лимит, откладываем следующий спавн на короткое время
      this.nextSpawnAtMs = now + GameTuning.spawn.retryDelayMs;
      return;
    }

    // Выбираем тип врага
    const burstState = this.callbacks.getBurstState();
    const effectiveWeights = this.callbacks.getEffectiveWeights(
      settings,
      burstState
    );

    const totalWeight = effectiveWeights.runner + effectiveWeights.tank;
    const roll = Phaser.Math.Between(1, totalWeight);
    let chosenType: EnemyType =
      roll <= effectiveWeights.runner ? "runner" : "tank";

    // Применяем tankCap: если выбран tank, но достигнут лимит - меняем на runner
    const tanksAlive = this.callbacks.getAliveTanksCount();
    if (chosenType === "tank" && tanksAlive >= settings.tankCap) {
      chosenType = "runner";
    }

    // Вызываем callback для создания врага
    this.callbacks.spawnEnemy(chosenType);

    // Обновляем таймер для следующего спавна
    this.updateSpawnTimer(now);
  }
}

