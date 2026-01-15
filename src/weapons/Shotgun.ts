import Phaser from "phaser";
import { Weapon, WeaponStats } from "./types";
import { Bullet } from "../entities/Bullet";
import { WEAPONS_BY_ID } from "../config/WeaponsConfig";

export class Shotgun implements Weapon {
  public readonly key: "shotgun" = "shotgun";

  private fireRate: number;
  private lastShotTime = 0;

  private magazineSize: number;
  private ammo: number;

  private reloadTime: number;
  private _isReloading = false;
  private reloadStartTime = 0;

  private weaponDef = WEAPONS_BY_ID.get("SHOTGUN");
  private spreadAngles: number[];
  private projectileConfig: {
    speed: number;
    lifetimeMs: number;
    baseRadius: number;
  };

  constructor() {
    if (!this.weaponDef) {
      throw new Error("SHOTGUN weapon definition not found in WeaponsConfig");
    }

    this.fireRate = this.weaponDef.fireRateMs;
    this.magazineSize = this.weaponDef.magazineSize;
    this.reloadTime = this.weaponDef.reloadTimeMs;

    this.ammo = this.magazineSize;

    // Spread для конуса выстрела (в радианах) - из WeaponsConfig
    this.spreadAngles = this.weaponDef.spread?.angles ?? [-0.3, -0.15, 0, 0.15, 0.3];

    // Store projectile config for bullet creation
    this.projectileConfig = {
      speed: this.weaponDef.projectile.speed,
      lifetimeMs: this.weaponDef.projectile.lifetimeMs,
      baseRadius: this.weaponDef.projectile.baseRadius,
    };
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

    // Создаём пули в конусе (количество из spreadAngles)
    for (const spreadOffset of this.spreadAngles) {
      const bulletAngle = aimAngle + spreadOffset;
      const bullet = new Bullet(scene, playerX, playerY, this.projectileConfig);
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

