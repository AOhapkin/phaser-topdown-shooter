import Phaser from 'phaser';
import { GameTuning } from '../config/GameTuning';

export class Bullet extends Phaser.Physics.Arcade.Image {
  public speed: number;
  public pierceLeft = 0; // Сколько врагов может пробить
  private hitEnemyIds = new Set<number>(); // IDs врагов, в которых уже попали (stable IDs, not references)
  private lifetimeMs: number;
  private baseRadius: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    projectileConfig?: {
      speed?: number;
      lifetimeMs?: number;
      baseRadius?: number;
    }
  ) {
    super(scene, x, y, 'bullet');

    // Use provided config or defaults from GameTuning
    // Actual weapon-specific values come from WeaponsConfig
    this.speed = projectileConfig?.speed ?? GameTuning.projectiles.defaultSpeed;
    this.lifetimeMs = projectileConfig?.lifetimeMs ?? GameTuning.projectiles.defaultLifetimeMs;
    this.baseRadius = projectileConfig?.baseRadius ?? GameTuning.projectiles.defaultBaseRadius;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 0.5);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);

    // Маленький круглый hitbox для точного попадания
    this.setCircle(this.baseRadius);

    // Пуля живёт ограниченное время, чтобы не тащить хвост из объектов
    scene.time.delayedCall(this.lifetimeMs, () => {
      if (!this.active) return;
      this.destroy();
    });
  }

  public hasHitEnemy(enemyId: number): boolean {
    return this.hitEnemyIds.has(enemyId);
  }

  public markEnemyHit(enemyId: number): void {
    this.hitEnemyIds.add(enemyId);
  }
}

