import Phaser from "phaser";
import { Weapon, WeaponFireContext } from "./Weapon";
import { Bullet } from "../entities/Bullet";

export class BasicGun implements Weapon {
  private fireRate: number;
  private lastShotTime = 0;

  private magazineSize: number;
  private ammo: number;

  private reloadTime: number;
  private isReloading = false;
  private reloadEndTime = 0;

  constructor(options?: {
    fireRate?: number;
    magazineSize?: number;
    reloadTime?: number;
  }) {
    this.fireRate = options?.fireRate ?? 600;
    this.magazineSize = options?.magazineSize ?? 6;
    this.reloadTime = options?.reloadTime ?? 1500;

    this.ammo = this.magazineSize;
  }

  getFireRate(): number {
    return this.fireRate;
  }

  setFireRate(value: number) {
    this.fireRate = value;
  }

  private startReload(time: number) {
    if (this.isReloading) {
      return;
    }

    this.isReloading = true;
    this.reloadEndTime = time + this.reloadTime;
  }

  private updateReload(time: number) {
    if (!this.isReloading) {
      return;
    }

    if (time >= this.reloadEndTime) {
      this.isReloading = false;
      this.ammo = this.magazineSize;
    }
  }

  tryFire(context: WeaponFireContext): void {
    const { scene, player, bullets, pointer, time } = context;

    this.updateReload(time);

    if (!player.isAlive()) {
      return;
    }

    if (this.isReloading) {
      return;
    }

    if (!pointer.isDown) {
      return;
    }

    if (time < this.lastShotTime + this.fireRate) {
      return;
    }

    if (this.ammo <= 0) {
      this.startReload(time);
      return;
    }

    const angle = Phaser.Math.Angle.Between(
      player.x,
      player.y,
      pointer.worldX,
      pointer.worldY
    );

    const bullet = new Bullet(scene, player.x, player.y);
    bullets.add(bullet);

    const speed = bullet.speed;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(vx, vy);
    body.setAllowGravity(false);

    this.lastShotTime = time;
    this.ammo -= 1;

    if (this.ammo <= 0) {
      this.startReload(time);
    }
  }
}


