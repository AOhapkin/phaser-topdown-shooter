import Phaser from "phaser";
import { Enemy, EnemyType } from "../entities/Enemy";
import { Player } from "../entities/Player";

// Burst speed boost constant (moved from GameScene)
// Note: BURST_SPEED_BOOST is passed via getBurstSpeedMultiplier callback

export interface EnemySystemCallbacks {
  getIsActive: () => boolean;
  getScene: () => Phaser.Scene;
  getEnemiesGroup: () => Phaser.Physics.Arcade.Group;
  getPlayer: () => Player;
  getPlayerPos: () => { x: number; y: number };
  onEnemyHitPlayer: (enemy: Enemy) => void;
  onEnemyKilled: (type: EnemyType) => void;
  isBurstActive: () => boolean;
  getBurstSpeedMultiplier: () => number;
  isFreezeActive: () => boolean;
  applyFreezeToEnemy: (enemy: Enemy) => void;
  getStageSpeedMultiplier: (stage: number) => number;
  getCurrentPhase: () => number;
  getPhaseSettings: (phase: number) => {
    phase: number;
    durationSec: number;
    maxAliveEnemies: number;
    spawnDelayMs: number;
    weights: { runner: number; tank: number };
    tankCap: number;
  };
  getStage: () => number;
  getEnemySpeedMultiplier: () => number;
  log?: (msg: string) => void;
}

/**
 * EnemySystem manages enemy spawning, tracking, and lifecycle
 */
export class EnemySystem {
  private callbacks: EnemySystemCallbacks;

  constructor(callbacks: EnemySystemCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Reset enemy system state
   */
  reset(): void {
    // State is managed through the enemies group, no additional state to reset
  }

  /**
   * Spawn an enemy of the specified type
   * Logic is identical to GameScene.spawnEnemyByType()
   */
  spawn(chosenType: EnemyType): Enemy | null {
    if (!this.callbacks.getIsActive()) {
      return null;
    }

    const player = this.callbacks.getPlayer();
    if (!player.isAlive()) {
      return null;
    }

    const scene = this.callbacks.getScene();
    const currentPhase = this.callbacks.getCurrentPhase();
    const settings = this.callbacks.getPhaseSettings(currentPhase);

    // Проверка tankCap для фазы 1 (только runner)
    let finalType = chosenType;
    if (settings.tankCap === 0 && chosenType !== "runner") {
      finalType = "runner";
    }

    // Спавн
    const { width, height } = scene.scale;
    const side = Phaser.Math.Between(0, 3);
    let x = 0;
    let y = 0;

    switch (side) {
      case 0: // top
        x = Phaser.Math.Between(0, width);
        y = -20;
        break;
      case 1: // bottom
        x = Phaser.Math.Between(0, width);
        y = height + 20;
        break;
      case 2: // left
        x = -20;
        y = Phaser.Math.Between(0, height);
        break;
      case 3: // right
        x = width + 20;
        y = Phaser.Math.Between(0, height);
        break;
    }

    const enemy = new Enemy(
      scene,
      x,
      y,
      player,
      finalType,
      currentPhase,
      this.callbacks.getEnemiesGroup(),
      this.callbacks.getStage()
    );
    this.callbacks.getEnemiesGroup().add(enemy);

    // Применяем stage speed multiplier
    const stageSpeedMult = this.callbacks.getStageSpeedMultiplier(
      this.callbacks.getStage()
    );
    const burstMult = this.callbacks.isBurstActive()
      ? this.callbacks.getBurstSpeedMultiplier()
      : 1.0;
    const enemySpeedMult = this.callbacks.getEnemySpeedMultiplier();
    enemy.setSpeedMultiplier(
      stageSpeedMult * burstMult * enemySpeedMult
    );

    // Если FREEZE активен - замораживаем нового врага
    if (this.callbacks.isFreezeActive()) {
      this.callbacks.applyFreezeToEnemy(enemy);
    }

    return enemy;
  }

  /**
   * Get count of alive enemies
   */
  getAliveCount(): number {
    const group = this.callbacks.getEnemiesGroup();
    return group.countActive(true);
  }

  /**
   * Get count of alive tank enemies
   */
  getTankAliveCount(): number {
    let count = 0;
    const children = this.callbacks.getEnemiesGroup().getChildren();
    children.forEach((obj) => {
      const enemy = obj as Enemy;
      if (enemy.active && enemy.type === "tank") {
        count++;
      }
    });
    return count;
  }

  /**
   * Apply function to all alive enemies
   */
  forEachAlive(fn: (enemy: Enemy) => void): void {
    const children = this.callbacks.getEnemiesGroup().getChildren();
    children.forEach((obj) => {
      const enemy = obj as Enemy;
      if (enemy && enemy.active) {
        fn(enemy);
      }
    });
  }

  /**
   * Apply speed multiplier to all alive enemies
   * Logic is identical to GameScene.applyBurstSpeedToEnemies()
   */
  applySpeedMultiplier(mult: number): void {
    const stageMult = this.callbacks.getStageSpeedMultiplier(
      this.callbacks.getStage()
    );
    const children = this.callbacks.getEnemiesGroup().getChildren();
    for (let i = 0; i < children.length; i++) {
      const enemy = children[i] as Enemy;
      if (enemy && enemy.active) {
        // Проверяем isDying через приватное поле (через any для доступа)
        const isDying = (enemy as any).isDying;
        if (!isDying) {
          const baseMult = stageMult;
          const finalMult = mult;
          enemy.setSpeedMultiplier(baseMult * finalMult);
        }
      }
    }
  }

  /**
   * Clean up dead enemies (if needed)
   */
  cleanupDead(): void {
    // Phaser group handles cleanup automatically, but can be extended if needed
  }
}

