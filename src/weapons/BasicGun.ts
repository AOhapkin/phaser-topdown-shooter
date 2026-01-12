import Phaser from "phaser";
import { Weapon, WeaponStats } from "./types";
import { Bullet } from "../entities/Bullet";

export class BasicGun implements Weapon {
  public readonly key: "pistol" = "pistol";

  private fireRate: number;
  private lastShotTime = 0;

  private magazineSize: number;
  private ammo: number;

  private reloadTime: number;
  private _isReloading = false;
  private reloadStartTime = 0;

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

  getStats(): WeaponStats {
    return {
      name: "PISTOL",
      magazineSize: this.magazineSize,
      reloadTimeMs: this.reloadTime,
      fireRateMs: this.fireRate,
    };
  }

  getAmmoInMag(): number {
    return this.ammo;
  }

  getMagazineSize(): number {
    return this.magazineSize;
  }

  isReloading(): boolean {
    return this._isReloading;
  }

  getReloadProgress(): number {
    // Этот метод не используется, используем getReloadProgressWithTime
    return 0;
  }

  getReloadProgressWithTime(currentTime: number): number {
    if (!this.isReloading) {
      return 0;
    }
    const elapsed = currentTime - this.reloadStartTime;
    return Math.min(1, Math.max(0, elapsed / this.reloadTime));
  }

  refillAndReset(): void {
    this.ammo = this.magazineSize;
    this._isReloading = false;
    this.reloadStartTime = 0;
    this.lastShotTime = 0;
  }

  // Методы для улучшений с проверкой капов
  decreaseFireRate(amount: number): boolean {
    const newRate = this.fireRate - amount;
    if (newRate < 140) {
      return false; // Минимум 140ms
    }
    this.fireRate = newRate;
    return true;
  }

  canDecreaseFireRate(amount: number): boolean {
    return this.fireRate - amount >= 140;
  }

  decreaseReloadTime(amount: number): boolean {
    const newTime = this.reloadTime - amount;
    if (newTime < 600) {
      return false; // Минимум 600ms
    }
    this.reloadTime = newTime;
    return true;
  }

  canDecreaseReloadTime(amount: number): boolean {
    return this.reloadTime - amount >= 600;
  }

  increaseMagazine(amount: number): boolean {
    const newSize = this.magazineSize + amount;
    if (newSize > 10) {
      return false;
    }
    this.magazineSize = newSize;
    // Если перезарядка не идет, обновляем текущий магазин
    if (!this._isReloading) {
      this.ammo = Math.min(this.ammo + amount, this.magazineSize);
    }
    return true;
  }

  canIncreaseMagazine(amount: number): boolean {
    return this.magazineSize + amount <= 10;
  }

  private startReload(time: number) {
    if (this._isReloading) {
      return;
    }

    this._isReloading = true;
    this.reloadStartTime = time;
  }

  private updateReload(time: number) {
    if (!this._isReloading) {
      return;
    }

    if (time >= this.reloadStartTime + this.reloadTime) {
      this._isReloading = false;
      this.ammo = this.magazineSize;
      this.reloadStartTime = 0;
    }
  }

  tryFire(args: {
    scene: Phaser.Scene;
    time: number;
    playerX: number;
    playerY: number;
    aimAngle: number;
    bullets: Phaser.Physics.Arcade.Group;
    onBulletSpawned?: (bullet: import("../entities/Bullet").Bullet) => void;
    bypassAmmo?: boolean; // DOUBLE buff: infinite ammo
  }): void {
    const { scene, time, playerX, playerY, aimAngle, bullets, onBulletSpawned, bypassAmmo } = args;

    this.updateReload(time);

    if (this._isReloading && !bypassAmmo) {
      return;
    }

    if (time < this.lastShotTime + this.fireRate) {
      return;
    }

    if (this.ammo <= 0 && !bypassAmmo) {
      this.startReload(time);
      return;
    }

    const bullet = new Bullet(scene, playerX, playerY);
    bullets.add(bullet);
    onBulletSpawned?.(bullet);

    const speed = bullet.speed;
    const vx = Math.cos(aimAngle) * speed;
    const vy = Math.sin(aimAngle) * speed;

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(vx, vy);
    body.setAllowGravity(false);

    this.lastShotTime = time;
    
    // DOUBLE buff: не тратим патроны и не запускаем перезарядку
    if (!bypassAmmo) {
      this.ammo -= 1;
      if (this.ammo <= 0) {
        this.startReload(time);
      }
    }
  }
}
