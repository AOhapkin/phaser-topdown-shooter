import Phaser from "phaser";
import { Weapon, WeaponStats } from "./types";
import { Bullet } from "../entities/Bullet";

export class Shotgun implements Weapon {
  public readonly key: "shotgun" = "shotgun";

  private fireRate: number;
  private lastShotTime = 0;

  private magazineSize: number;
  private ammo: number;

  private reloadTime: number;
  private _isReloading = false;
  private reloadStartTime = 0;

  // Spread для конуса выстрела (в радианах)
  private readonly spreadAngles = [-0.3, -0.15, 0, 0.15, 0.3]; // 5 пуль

  constructor() {
    this.fireRate = 800;
    this.magazineSize = 2;
    this.reloadTime = 1400;

    this.ammo = this.magazineSize;
  }

  getStats(): WeaponStats {
    return {
      name: "SHOTGUN",
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
    if (!this._isReloading) {
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

    // Создаём 5 пуль в конусе
    for (const spreadOffset of this.spreadAngles) {
      const bulletAngle = aimAngle + spreadOffset;
      const bullet = new Bullet(scene, playerX, playerY);
      bullets.add(bullet);
      onBulletSpawned?.(bullet);

      const speed = bullet.speed;
      const vx = Math.cos(bulletAngle) * speed;
      const vy = Math.sin(bulletAngle) * speed;

      const body = bullet.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(vx, vy);
      body.setAllowGravity(false);
    }

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

