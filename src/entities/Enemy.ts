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

// Global counter for enemy IDs
let enemyIdCounter = 0;

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  private target: Player;
  private speed!: number; // Инициализируется в конструкторе
  private baseSpeed = 80;
  private speedMultiplier = 1.0; // Множитель скорости (для burst)

  public readonly type: EnemyType;
  public readonly id: number; // Stable unique ID for hit tracking
  private maxHealth!: number; // Инициализируется в конструкторе
  private health!: number; // Инициализируется в конструкторе
  private baseMaxHealth = 1;
  private stage = 1; // Используется для HP scaling

  public getType(): EnemyType {
    return this.type;
  }

  public setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = multiplier;
  }

  public setFrozen(isFrozen: boolean): void {
    this.frozen = isFrozen;
    const body = this.body as Phaser.Physics.Arcade.Body;
    
    if (isFrozen) {
      // Замораживаем: останавливаем движение и применяем визуальный эффект
      body.setVelocity(0, 0);
      this.setTint(0x88ccff); // Ледяной цвет
      this.setAlpha(0.7);
    } else {
      // Размораживаем: восстанавливаем нормальный вид
      if (this.baseTint !== undefined) {
        this.setTint(this.baseTint);
      } else {
        this.clearTint();
      }
      this.setAlpha(this.baseAlpha);
    }
  }

  public isFrozen(): boolean {
    return this.frozen;
  }

  private computeMaxHealth(): number {
    // Используем stage для HP scaling (каждые 3 стадии)
    if (this.type === "runner") {
      if (this.stage >= 7) return 3;
      if (this.stage >= 4) return 2;
      return 1;
    }

    if (this.type === "tank") {
      if (this.stage >= 7) return 5;
      if (this.stage >= 4) return 4;
      return 3; // Минимум 3 HP для tank
    }

    // fast и heavy пока не скейлятся
    if (this.type === "fast") {
      return 1;
    }

    if (this.type === "heavy") {
      return 5;
    }

    return this.baseMaxHealth;
  }

  private computeSpeed(): number {
    // Базовая скорость по типу
    return this.baseSpeed;
  }

  public getStageSpeedMultiplier(): number {
    // Возвращаем множитель скорости для стадии (будет применён в GameScene)
    // Базовая скорость уже установлена, множитель применяется отдельно
    return 1.0;
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

  // Death animation
  private isDying = false;

  // Freeze state
  private frozen = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    target: Player,
    type: EnemyType = "runner",
    _phase: number = 1, // Оставлен для совместимости, но не используется
    enemiesGroup: Phaser.Physics.Arcade.Group,
    stage: number = 1
  ) {
    super(scene, x, y, "enemy");

    // Assign stable unique ID
    this.id = ++enemyIdCounter;

    this.target = target;
    this.type = type;
    this.enemiesGroup = enemiesGroup;
    this.stage = stage;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 0.5);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);

    // Базовые характеристики по типу
    if (this.type === "runner") {
      this.baseMaxHealth = 1;
      this.baseSpeed = 110;
      this.setScale(1);
      this.clearTint();
      this.baseTint = undefined;
    } else if (this.type === "tank") {
      this.baseMaxHealth = 3;
      this.baseSpeed = 60;
      this.setScale(1.3);
      this.setTint(0x4fc3f7);
      this.baseTint = 0x4fc3f7;
    } else if (this.type === "fast") {
      this.baseMaxHealth = 1;
      this.baseSpeed = 150;
      this.setScale(0.9);
      this.setTint(0xffeb3b); // Жёлтый
      this.baseTint = 0xffeb3b;
    } else if (this.type === "heavy") {
      this.baseMaxHealth = 5;
      this.baseSpeed = 40;
      this.setScale(1.5);
      this.setTint(0x9c27b0); // Фиолетовый
      this.baseTint = 0x9c27b0;
    }

    this.baseAlpha = 1;

    // Фазовый скейлинг - ВАЖНО: сначала maxHealth, потом health
    this.maxHealth = this.computeMaxHealth();
    this.health = this.maxHealth; // Всегда равен maxHealth при создании
    this.speed = this.computeSpeed();

    // Создаём health bar (скрыт по умолчанию) - только после установки health
    this.healthBar = new HealthBar(scene, x, y - 20, 28, 4);
    this.healthBar.setHealth(this.health, this.maxHealth);
    this.healthBar.setVisible(false);

    // Временный лог для отладки (только если debugLogs включен)
    // Убрано для уменьшения шума в консоли

    // Инициализация конфигурации движения
    const baseConfig = MOVEMENT_CONFIGS[this.type];
    this.moveCfg = {
      ...baseConfig,
      orbitSign: Phaser.Math.Between(0, 1) === 0 ? -1 : 1, // Случайно 1 или -1
    };

    // Настройка hitbox по типу врага
    if (this.type === "runner" || this.type === "fast") {
      // Маленькие враги
      this.setCircle(10);
    } else {
      // Tank и heavy - крупные враги
      this.setCircle(16);
    }
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);

    // Если умирает - не обрабатываем движение
    if (this.isDying) {
      return;
    }

    if (!this.scene || !this.active || !this.target || !this.target.active) {
      return;
    }

    // Если заморожен - не обрабатываем движение (velocity уже установлен в 0 в setFrozen)
    if (this.frozen) {
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0, 0);
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
      const offset = this.type === "tank" || this.type === "heavy" ? 30 : 22;
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

    // 3) Pursuit velocity (с учётом speed multiplier для burst)
    const effectiveSpeed = this.speed * this.speedMultiplier;
    let desiredVelX = dirX * effectiveSpeed;
    let desiredVelY = dirY * effectiveSpeed;

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

    // Ограничиваем максимальную скорость (с учётом multiplier)
    const currentSpeed = Math.hypot(this.desiredVx, this.desiredVy);
    const maxSpeed = effectiveSpeed * 1.35;
    if (currentSpeed > maxSpeed) {
      const factor = maxSpeed / currentSpeed;
      this.desiredVx *= factor;
      this.desiredVy *= factor;
    }

    // 8) Применить velocity
    body.setVelocity(this.desiredVx, this.desiredVy);
  }

  public applyHitFeedback(fromX: number, fromY: number, time: number): void {
    // Если умирает - не обрабатываем попадание
    if (this.isDying) {
      return;
    }

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
    const strength = this.type === "tank" || this.type === "heavy" ? 140 : 220;
    this.knockbackVx = nx * strength;
    this.knockbackVy = ny * strength;
    this.knockbackUntil = time + 80; // 80ms
  }

  public takeDamage(amount: number): boolean {
    if (this.isDying) {
      return false;
    }

    if (!this.active) {
      return false;
    }

    this.health = Math.max(0, this.health - amount);

    // Временный лог для отладки (только если debugLogs включен)
    // Убрано для уменьшения шума в консоли

    // Обновляем health bar и показываем его, если враг получил урон
    if (this.healthBar && this.healthBar.active) {
      this.healthBar.setHealth(this.health, this.maxHealth);
      if (this.health < this.maxHealth) {
        this.healthBar.setVisible(true);
      }
    }

    // Возвращаем true только если health <= 0 (смерть обрабатывается снаружи)
    return this.health <= 0;
  }

  private spawnDeathDebris(fromX: number, fromY: number): void {
    const scene = this.scene;

    const isTank = this.type === "tank" || this.type === "heavy";
    const count = isTank
      ? Phaser.Math.Between(7, 10)
      : Phaser.Math.Between(4, 6);
    const baseColor = isTank ? 0xffdddd : 0xdddddd;

    // направление наружу от удара
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const dist = Math.max(0.0001, Math.hypot(dx, dy));
    const nx = dx / dist;
    const ny = dy / dist;

    for (let i = 0; i < count; i++) {
      const size = isTank
        ? Phaser.Math.Between(4, 7)
        : Phaser.Math.Between(3, 5);

      const px = this.x + Phaser.Math.Between(-6, 6);
      const py = this.y + Phaser.Math.Between(-6, 6);

      const rect = scene.add.rectangle(px, py, size, size, baseColor, 1);
      rect.setDepth(1500);

      scene.physics.add.existing(rect);
      const body = rect.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);

      // скорость: наружу + немного рандома
      const spread = 0.9;
      const rx = nx + Phaser.Math.FloatBetween(-spread, spread);
      const ry = ny + Phaser.Math.FloatBetween(-spread, spread);
      const rlen = Math.max(0.0001, Math.hypot(rx, ry));
      const vxDir = rx / rlen;
      const vyDir = ry / rlen;

      const speed = isTank
        ? Phaser.Math.Between(140, 240)
        : Phaser.Math.Between(180, 320);
      body.setVelocity(vxDir * speed, vyDir * speed);

      body.setDrag(700, 700);
      body.setAngularVelocity(Phaser.Math.Between(-360, 360));

      const life = isTank
        ? Phaser.Math.Between(320, 460)
        : Phaser.Math.Between(260, 380);

      scene.tweens.add({
        targets: rect,
        alpha: 0,
        scale: 0.6,
        duration: life,
        ease: "Quad.easeOut",
        onComplete: () => rect.destroy(),
      });
    }
  }

  public die(fromX: number, fromY: number): void {
    if (this.isDying) {
      return;
    }
    this.isDying = true;

    // Спавним осколки сразу
    this.spawnDeathDebris(fromX, fromY);

    // Отключаем физику и столкновения
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
    body.setVelocity(0, 0);

    // Убираем хитбоксы/интеракции
    this.setActive(false);

    // Убираем health bar (если есть)
    if (this.healthBar && this.healthBar.active) {
      this.healthBar.destroy();
    }

    // Death pop параметры по типу
    const popScale = this.type === "tank" || this.type === "heavy" ? 1.18 : 1.12;
    const duration = this.type === "tank" || this.type === "heavy" ? 180 : 120;

    // Вектор "наружу" от последнего удара (лёгкий визуальный сдвиг)
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const dist = Math.max(0.0001, Math.hypot(dx, dy));
    const nx = dx / dist;
    const ny = dy / dist;

    this.scene.tweens.add({
      targets: this,
      scale: popScale,
      alpha: 0,
      x: this.x + nx * 8,
      y: this.y + ny * 8,
      duration,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.destroy();
      },
    });
  }

  destroy(fromScene?: boolean): void {
    if (this.healthBar && this.healthBar.active) {
      this.healthBar.destroy();
    }
    super.destroy(fromScene);
  }
}
