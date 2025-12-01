import Phaser from "phaser";
import { Weapon, WeaponFireContext } from "./Weapon";
import { Bullet } from "../entities/Bullet";

export class BasicGun implements Weapon {
  private fireRate: number;
  private lastShotTime = 0;

  private bulletCount: number;
  private bulletSpread: number;

  constructor(options?: {
    fireRate?: number;
    bulletCount?: number;
    bulletSpread?: number;
  }) {
    this.fireRate = options?.fireRate ?? 150;
    this.bulletCount = options?.bulletCount ?? 1;
    this.bulletSpread = options?.bulletSpread ?? 0.15;
  }

  getFireRate(): number {
    return this.fireRate;
  }

  setFireRate(value: number) {
    this.fireRate = value;
  }

  setPattern(bulletCount: number, bulletSpread: number) {
    this.bulletCount = bulletCount;
    this.bulletSpread = bulletSpread;
  }

  tryFire(context: WeaponFireContext): void {
    const { scene, player, bullets, pointer, time } = context;

    if (!player.isAlive()) {
      return;
    }
    if (!pointer.isDown) {
      return;
    }

    if (time < this.lastShotTime + this.fireRate) {
      return;
    }

    const baseAngle = Phaser.Math.Angle.Between(
      player.x,
      player.y,
      pointer.worldX,
      pointer.worldY
    );

    const count = this.bulletCount;
    const spread = this.bulletSpread;

    for (let i = 0; i < count; i += 1) {
      const offsetIndex = i - (count - 1) / 2;
      const angle = baseAngle + offsetIndex * spread;

      const bullet = new Bullet(scene, player.x, player.y);
      bullets.add(bullet);

      const speed = bullet.speed;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      const body = bullet.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(vx, vy);
      body.setAllowGravity(false);
    }

    this.lastShotTime = time;
  }
}


