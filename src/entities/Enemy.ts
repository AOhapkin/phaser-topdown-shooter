import Phaser from "phaser";
import { Player } from "./Player";
import { HealthBar } from "../ui/HealthBar";

export type EnemyType = "runner" | "tank" | "fast" | "heavy";

type EnemyMovementConfig = {
  // дистанции
  orbitRadius: number; // если ближе — начинает обходить
  separationRadius: number; // радиус отталкивания от соседей

  // силы (в пикселях/сек^2 условно, мы работаем с velocity напрямую)
  orbitStrength: number;
  separationStrength: number;

  // сглаживание
  steeringSharpness: number; // чем больше, тем быстрее velocity стремится к desired

  // чтобы половина врагов крутилась слева, половина справа
  orbitSign: 1 | -1;
};

const MOVEMENT_CONFIGS: Record<EnemyType, Omit<EnemyMovementConfig, "orbitSign">> = {
  runner: {
    orbitRadius: 90,
    separationRadius: 32,
    orbitStrength: 55,
    separationStrength: 140,
    steeringSharpness: 10,
  },
  tank: {
    orbitRadius: 110,
    separationRadius: 44,
    orbitStrength: 35,
    separationStrength: 110,
    steeringSharpness: 8,
  },
  fast: {
    orbitRadius: 90,
    separationRadius: 32,
    orbitStrength: 55,
    separationStrength: 140,
    steeringSharpness: 10,
  },
  heavy: {
    orbitRadius: 110,
    separationRadius: 44,
    orbitStrength: 35,
    separationStrength: 110,
    steeringSharpness: 8,
  },
};

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  private target: Player;
  private speed = 80;

  private enemyType: EnemyType;
  private maxHealth = 1;
  private health = 1;

  public getType(): EnemyType {
    return this.enemyType;
  }

  // Система движения
  private enemiesGroup: Phaser.Physics.Arcade.Group;
  private moveCfg: EnemyMovementConfig;
  private desiredVx = 0;
  private desiredVy = 0;

  // Реакция на попадание
  private hitFlashUntil = 0;
  private knockbackUntil = 0;
  private knockbackVx = 0;
  private knockbackVy = 0;
  private baseTint?: number;
  private baseAlpha = 1;

  // Health bar
  private healthBar: HealthBar;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    target: Player,
    type: EnemyType = "runner",
    level: number = 1,
    enemiesGroup: Phaser.Physics.Arcade.Group
  ) {
    super(scene, x, y, "enemy");

    this.target = target;
    this.enemyType = type;
    this.enemiesGroup = enemiesGroup;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 0.5);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);

    // Базовые характеристики по типу
    if (this.enemyType === "runner") {
      this.maxHealth = 1;
      this.speed = 110;
      this.setScale(1);
      this.clearTint();
      this.baseTint = undefined;
    } else if (this.enemyType === "tank") {
      this.maxHealth = 3;
      this.speed = 60;
      this.setScale(1.3);
      this.setTint(0x4fc3f7);
      this.baseTint = 0x4fc3f7;
    } else if (this.enemyType === "fast") {
      this.maxHealth = 1;
      this.speed = 150;
      this.setScale(0.9);
      this.setTint(0xffeb3b); // Жёлтый
      this.baseTint = 0xffeb3b;
    } else if (this.enemyType === "heavy") {
      this.maxHealth = 5;
      this.speed = 40;
      this.setScale(1.5);
      this.setTint(0x9c27b0); // Фиолетовый
      this.baseTint = 0x9c27b0;
    }

    this.baseAlpha = 1;

    // Масштабирование по уровню: +5% HP и скорости каждые 3 уровня (начиная с уровня 4)
    // Уровень 1-3: без бонуса, 4-6: +5%, 7-9: +10%, 10-12: +15% и т.д.
    if (level >= 4) {
      const scalingMultiplier = Math.floor((level - 1) / 3) * 0.05; // +5% каждые 3 уровня
      const levelScaling = 1 + scalingMultiplier;
      this.maxHealth = Math.floor(this.maxHealth * levelScaling);
      this.speed = Math.round(this.speed * levelScaling);
    }

    this.health = this.maxHealth;

    // Создаём health bar (скрыт по умолчанию)
    this.healthBar = new HealthBar(scene, x, y - 20, 28, 4);
    this.healthBar.setHealth(this.health, this.maxHealth);
    this.healthBar.setVisible(false);

    // Инициализация конфигурации движения
    const baseConfig = MOVEMENT_CONFIGS[this.enemyType];
    this.moveCfg = {
      ...baseConfig,
      orbitSign: Phaser.Math.Between(0, 1) === 0 ? -1 : 1, // Случайно 1 или -1
    };

    // Настройка hitbox по типу врага
    if (this.enemyType === "runner" || this.enemyType === "fast") {
      // Маленькие враги
      this.setCircle(10);
    } else {
      // Tank и heavy - крупные враги
      this.setCircle(16);
    }
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);

    if (!this.scene || !this.active || !this.target || !this.target.active) {
      return;
    }

    // Снимаем flash и восстанавливаем базовый tint
    if (this.hitFlashUntil > 0 && time > this.hitFlashUntil) {
      this.hitFlashUntil = 0;
      if (this.baseTint !== undefined) {
        this.setTint(this.baseTint);
      } else {
        this.clearTint();
      }
      this.setAlpha(this.baseAlpha);
    }

    // Обновляем позицию health bar
    if (this.healthBar && this.healthBar.active) {
      const offset = this.enemyType === "tank" || this.enemyType === "heavy" ? 30 : 22;
      this.healthBar.setPositionAbove(this.x, this.y, offset);
    }

    const body = this.body as Phaser.Physics.Arcade.Body;

    // Если активен knockback - применяем его и не делаем steer
    if (this.knockbackUntil > time) {
      body.setVelocity(this.knockbackVx, this.knockbackVy);
      return;
    }

    // 1) Рассчитать dt в секундах
    const dt = delta / 1000;

    // 2) Рассчитать unit-направление на игрока
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.max(0.0001, Math.hypot(dx, dy));
    const dirX = dx / dist;
    const dirY = dy / dist;

    // 3) Pursuit velocity
    let desiredVelX = dirX * this.speed;
    let desiredVelY = dirY * this.speed;

    // 4) Separation
    let pushX = 0;
    let pushY = 0;

    const children = this.enemiesGroup.getChildren();
    for (let i = 0; i < children.length; i += 1) {
      const other = children[i] as Enemy;
      if (!other || !other.active || other === this) {
        continue;
      }

      const offsetX = this.x - other.x;
      const offsetY = this.y - other.y;
      const d = Math.hypot(offsetX, offsetY);

      if (d > 0 && d < this.moveCfg.separationRadius) {
        const normalizedX = offsetX / d;
        const normalizedY = offsetY / d;
        const strength = 1 - d / this.moveCfg.separationRadius;
        pushX += normalizedX * strength;
        pushY += normalizedY * strength;
      }
    }

    // Применяем separation strength
    pushX *= this.moveCfg.separationStrength;
    pushY *= this.moveCfg.separationStrength;

    // Ограничиваем push по величине
    const pushMag = Math.hypot(pushX, pushY);
    const maxSep = this.speed * 1.2;
    if (pushMag > maxSep) {
      pushX = (pushX / pushMag) * maxSep;
      pushY = (pushY / pushMag) * maxSep;
    }

    // 5) Orbit на ближней дистанции
    let orbitX = 0;
    let orbitY = 0;

    if (dist < this.moveCfg.orbitRadius) {
      // Перпендикуляр к направлению на игрока
      const perpX = -dirY * this.moveCfg.orbitSign;
      const perpY = dirX * this.moveCfg.orbitSign;
      const orbitFactor = 1 - dist / this.moveCfg.orbitRadius;
      orbitX = perpX * this.moveCfg.orbitStrength * orbitFactor;
      orbitY = perpY * this.moveCfg.orbitStrength * orbitFactor;
    }

    // 6) Итоговое desiredVelocity
    desiredVelX += pushX + orbitX;
    desiredVelY += pushY + orbitY;

    // 7) FPS-независимое сглаживание скорости
    const t = 1 - Math.exp(-this.moveCfg.steeringSharpness * dt);
    this.desiredVx = Phaser.Math.Linear(this.desiredVx, desiredVelX, t);
    this.desiredVy = Phaser.Math.Linear(this.desiredVy, desiredVelY, t);

    // Ограничиваем максимальную скорость
    const currentSpeed = Math.hypot(this.desiredVx, this.desiredVy);
    const maxSpeed = this.speed * 1.35;
    if (currentSpeed > maxSpeed) {
      const factor = maxSpeed / currentSpeed;
      this.desiredVx *= factor;
      this.desiredVy *= factor;
    }

    // 8) Применить velocity
    body.setVelocity(this.desiredVx, this.desiredVy);
  }

  public applyHitFeedback(fromX: number, fromY: number, time: number): void {
    // 1) Flash
    this.hitFlashUntil = time + 90;
    this.setTint(0xffffff);
    this.setAlpha(0.85);

    // 2) Knockback: от точки удара "наружу"
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const dist = Math.max(0.0001, Math.hypot(dx, dy));
    const nx = dx / dist;
    const ny = dy / dist;

    // Разная сила knockback для разных типов
    const strength =
      this.enemyType === "tank" || this.enemyType === "heavy" ? 140 : 220;
    this.knockbackVx = nx * strength;
    this.knockbackVy = ny * strength;
    this.knockbackUntil = time + 80; // 80ms
  }

  public takeDamage(amount: number): boolean {
    if (!this.active) {
      return false;
    }

    this.health -= amount;

    // Обновляем health bar и показываем его, если враг получил урон
    if (this.healthBar && this.healthBar.active) {
      this.healthBar.setHealth(this.health, this.maxHealth);
      if (this.health < this.maxHealth) {
        this.healthBar.setVisible(true);
      }
    }

    if (this.health <= 0) {
      this.destroy();
      return true;
    }

    return false;
  }

  destroy(fromScene?: boolean): void {
    if (this.healthBar && this.healthBar.active) {
      this.healthBar.destroy();
    }
    super.destroy(fromScene);
  }
}
