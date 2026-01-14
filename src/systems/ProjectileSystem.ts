import Phaser from "phaser";
import { Bullet } from "../entities/Bullet";
import { Enemy } from "../entities/Enemy";
import { CombatSystem } from "./CombatSystem";

export interface ProjectileSystemCallbacks {
  getIsActive: () => boolean;
  getScene: () => Phaser.Scene;
  getBulletsGroup: () => Phaser.Physics.Arcade.Group;
  getEnemiesGroup: () => Phaser.Physics.Arcade.Group;
  getCombatSystem: () => CombatSystem;
  onProjectileHit: () => void;
  log?: (msg: string) => void;
}

/**
 * ProjectileSystem manages bullet/projectile lifecycle and collisions with enemies
 */
export class ProjectileSystem {
  private callbacks: ProjectileSystemCallbacks;
  private bulletsEnemiesOverlap: Phaser.Physics.Arcade.Collider | null = null;

  constructor(callbacks: ProjectileSystemCallbacks) {
    this.callbacks = callbacks;
    this.initOverlaps();
  }

  /**
   * Initialize physics overlaps (bullets vs enemies)
   * Must be called once after bullets and enemies groups are created
   */
  initOverlaps(): void {
    // Удаляем старый overlap, если он существует (защита от дублей при restart)
    if (this.bulletsEnemiesOverlap) {
      this.bulletsEnemiesOverlap.destroy();
      this.bulletsEnemiesOverlap = null;
    }
    // Создаем overlap только один раз
    this.bulletsEnemiesOverlap = this.callbacks
      .getScene()
      .physics.add.overlap(
        this.callbacks.getBulletsGroup(),
        this.callbacks.getEnemiesGroup(),
        this.handleBulletHitEnemy.bind(this) as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
        undefined,
        this
      );
  }

  /**
   * Reset projectile system state
   */
  reset(): void {
    // Overlap is managed through initOverlaps(), no additional state to reset
  }

  /**
   * Update projectile system (called from GameScene.update())
   */
  update(): void {
    // Bullets are managed by Phaser group, no per-frame update needed
    // TTL and cleanup are handled by Bullet constructor (delayedCall)
  }

  /**
   * Handle bullet hitting enemy
   * Logic is identical to GameScene.handleBulletHitEnemy()
   */
  private handleBulletHitEnemy(
    bulletObj:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Tilemaps.Tile,
    enemyObj:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Tilemaps.Tile
  ): void {
    const bullet = bulletObj as Bullet;
    const enemy = enemyObj as Enemy;

    // Guard 1: bullet must exist and be active
    if (!bullet || !bullet.active) {
      return;
    }

    // Guard 2: bullet must have enabled body
    if (!bullet.body) {
      return;
    }
    const bulletBody = bullet.body as Phaser.Physics.Arcade.Body;
    if (!bulletBody.enable) {
      return;
    }

    // Guard 3: enemy must exist, be active and not dying
    if (!enemy || !enemy.active || (enemy as any).isDying) {
      return;
    }

    // Guard 4: защита от повторного попадания в того же врага (для pierce) - используем стабильный ID
    // Это критически важно: проверяем ДО любых других операций
    if (bullet.hasHitEnemy(enemy.id)) {
      return; // Уже обработано - игнорируем дубль
    }

    // Guard 5: помечаем врага как обработанного СРАЗУ (до любых других операций) - используем стабильный ID
    // Это защищает от двойного overlap в одном кадре или при повторных вызовах
    // ДОЛЖНО быть вызвано ДО onProjectileHit(), чтобы защита работала
    bullet.markEnemyHit(enemy.id);

    // Статистика: попадание (каждое попадание пули в врага = +1)
    // Вызывается ТОЛЬКО после успешного guard и markEnemyHit
    this.callbacks.onProjectileHit();

    // Делегируем боевую логику в CombatSystem
    this.callbacks.getCombatSystem().onBulletHitEnemy(bullet, enemy);

    // Проверяем pierce: если пуля может пробить, уменьшаем счётчик и не уничтожаем
    if (bullet.pierceLeft > 0) {
      bullet.pierceLeft--;
      // Пуля продолжает полёт и может попасть в другого врага
    } else {
      // Пуля не может пробить - отключаем коллайдер и уничтожаем немедленно
      // Делаем это СРАЗУ, чтобы предотвратить повторную обработку в том же кадре
      bulletBody.enable = false;
      bullet.setActive(false);
      bullet.setVisible(false);
      bullet.destroy();
    }
  }
}

