import Phaser from 'phaser';

export class Bullet extends Phaser.Physics.Arcade.Image {
  public speed = 500;
  public pierceLeft = 0; // Сколько врагов может пробить
  private hitEnemyIds = new Set<number>(); // IDs врагов, в которых уже попали (stable IDs, not references)

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'bullet');

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 0.5);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);

    // Маленький круглый hitbox для точного попадания
    this.setCircle(4);

    // Пуля живёт ограниченное время, чтобы не тащить хвост из объектов
    scene.time.delayedCall(1200, () => {
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

