import Phaser from "phaser";

type WASDKeys = {
  W: Phaser.Input.Keyboard.Key;
  A: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
};

export class Player extends Phaser.Physics.Arcade.Sprite {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd: WASDKeys;

  private baseSpeed = 220;
  private speedMultiplier = 1;

  private baseMaxHealth = 3;
  private maxHealth = this.baseMaxHealth;
  private health = this.maxHealth;

  private damage = 1;

  private alive = true;

  private speedBoostEndTime = 0;
  private armorEndTime = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "player");

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 0.5);
    this.setDepth(1);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);

    this.cursors = scene.input.keyboard!.createCursorKeys();
    this.wasd = {
      W: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
  }

  getHealth(): number {
    return this.health;
  }

  getMaxHealth(): number {
    return this.maxHealth;
  }

  isAlive(): boolean {
    return this.alive;
  }

  getDamage(): number {
    return this.damage;
  }

  takeDamage(amount: number): void {
    if (!this.alive) {
      return;
    }

    if (this.hasArmor()) {
      return;
    }

    this.health = Math.max(0, this.health - amount);

    if (this.health <= 0) {
      this.alive = false;
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0, 0);
    }
  }

  applyHeal(amount: number): void {
    if (!this.alive) {
      return;
    }

    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  applySpeedBoost(multiplier: number, durationMs: number): void {
    if (!this.alive) {
      return;
    }

    this.speedMultiplier = multiplier;
    this.speedBoostEndTime = this.scene.time.now + durationMs;
  }

  applyArmor(durationMs: number): void {
    if (!this.alive) {
      return;
    }

    this.armorEndTime = this.scene.time.now + durationMs;
  }

  onLevelUp(level: number): void {
    let changed = false;

    if (level % 2 === 0) {
      this.maxHealth += 1;
      this.health = this.maxHealth;
      changed = true;
    }

    if (level % 3 === 0) {
      this.damage += 1;
      changed = true;
    }

    if (changed) {
      // Можно добавить визуальный эффект или лог
      // console.log(`Player leveled up to ${level}: hp=${this.maxHealth}, dmg=${this.damage}`);
    }
  }

  update() {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!body) {
      return;
    }

    if (!this.alive) {
      body.setVelocity(0, 0);
      return;
    }

    this.updateBuffs();

    let vx = 0;
    let vy = 0;

    if (this.cursors.left?.isDown || this.wasd.A.isDown) {
      vx -= 1;
    }
    if (this.cursors.right?.isDown || this.wasd.D.isDown) {
      vx += 1;
    }

    if (this.cursors.up?.isDown || this.wasd.W.isDown) {
      vy -= 1;
    }
    if (this.cursors.down?.isDown || this.wasd.S.isDown) {
      vy += 1;
    }

    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy) || 1;
      const speed = this.baseSpeed * this.speedMultiplier;
      vx = (vx / len) * speed;
      vy = (vy / len) * speed;
    }

    body.setVelocity(vx, vy);

    const pointer = this.scene.input.activePointer;
    const angle = Phaser.Math.Angle.Between(
      this.x,
      this.y,
      pointer.worldX,
      pointer.worldY
    );
    this.setRotation(angle);
  }

  private updateBuffs() {
    const now = this.scene.time.now;

    if (this.speedBoostEndTime > 0 && now > this.speedBoostEndTime) {
      this.speedBoostEndTime = 0;
      this.speedMultiplier = 1;
    }

    if (this.armorEndTime > 0 && now > this.armorEndTime) {
      this.armorEndTime = 0;
    }
  }

  private hasArmor(): boolean {
    return this.armorEndTime > this.scene.time.now;
  }
}
