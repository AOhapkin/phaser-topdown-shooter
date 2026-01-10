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

  private damageBonus = 0;

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

  getAmmo(): number {
    return this.ammo;
  }

  getMagazineSize(): number {
    return this.magazineSize;
  }

  getIsReloading(): boolean {
    return this.isReloading;
  }

  getReloadProgress(time: number): number {
    if (!this.isReloading) {
      return 0;
    }

    const elapsed = time - (this.reloadEndTime - this.reloadTime);
    const progress = Math.min(1, Math.max(0, elapsed / this.reloadTime));
    return progress;
  }

  getDamageBonus(): number {
    return this.damageBonus;
  }

  // Методы для улучшений с проверкой капов
  increaseDamage(): boolean {
    if (this.damageBonus >= 2) {
      return false;
    }
    this.damageBonus += 1;
    return true;
  }

  canIncreaseDamage(): boolean {
    return this.damageBonus < 2;
  }

  decreaseFireRate(amount: number): boolean {
    const newRate = this.fireRate - amount;
    if (newRate < 420) {
      return false;
    }
    this.fireRate = newRate;
    return true;
  }

  canDecreaseFireRate(amount: number): boolean {
    return this.fireRate - amount >= 420;
  }

  decreaseReloadTime(amount: number): boolean {
    const newTime = this.reloadTime - amount;
    if (newTime < 900) {
      return false;
    }
    this.reloadTime = newTime;
    return true;
  }

  canDecreaseReloadTime(amount: number): boolean {
    return this.reloadTime - amount >= 900;
  }

  increaseMagazine(amount: number): boolean {
    const newSize = this.magazineSize + amount;
    if (newSize > 10) {
      return false;
    }
    this.magazineSize = newSize;
    // Если перезарядка не идет, обновляем текущий магазин
    if (!this.isReloading) {
      this.ammo = Math.min(this.ammo + amount, this.magazineSize);
    }
    return true;
  }

  canIncreaseMagazine(amount: number): boolean {
    return this.magazineSize + amount <= 10;
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


