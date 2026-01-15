import Phaser from "phaser";
import { Weapon, WeaponStats } from "./types";
import { Bullet } from "../entities/Bullet";
import { WEAPONS_BY_ID } from "../config/WeaponsConfig";

export class SMG implements Weapon {
  public readonly key: "smg" = "smg";

  private fireRate: number;
  private lastShotTime = 0;

  private magazineSize: number;
  private ammo: number;

  private reloadTime: number;
  private _isReloading = false;
  private reloadStartTime = 0;

  private weaponDef = WEAPONS_BY_ID.get("SMG");
  private projectileConfig: {
    speed: number;
    lifetimeMs: number;
    baseRadius: number;
  };

  constructor(options?: {
    fireRate?: number;
    magazineSize?: number;
    reloadTime?: number;
  }) {
    if (!this.weaponDef) {
      throw new Error("SMG weapon definition not found in WeaponsConfig");
    }

    this.fireRate = options?.fireRate ?? this.weaponDef.fireRateMs;
    this.magazineSize = options?.magazineSize ?? this.weaponDef.magazineSize;
    this.reloadTime = options?.reloadTime ?? this.weaponDef.reloadTimeMs;

    this.ammo = this.magazineSize;

    // Store projectile config for bullet creation
    this.projectileConfig = {
      speed: this.weaponDef.projectile.speed,
      lifetimeMs: this.weaponDef.projectile.lifetimeMs,
      baseRadius: this.weaponDef.projectile.baseRadius,
    };
  }

  getStats(): WeaponStats {
    return {
      name: "SMG",
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

  // Методы для улучшений с проверкой капов (из WeaponsConfig)
  decreaseFireRate(amount: number): boolean {
    const minFireRate = this.weaponDef?.limits?.minFireRateMs ?? 80;
    const newRate = this.fireRate - amount;
    if (newRate < minFireRate) {
      return false;
    }
    this.fireRate = newRate;
    return true;
  }

  decreaseReloadTime(amount: number): boolean {
    const minReloadTime = this.weaponDef?.limits?.minReloadTimeMs ?? 800;
    const newTime = this.reloadTime - amount;
    if (newTime < minReloadTime) {
      return false;
    }
    this.reloadTime = newTime;
    return true;
  }

  increaseMagazine(amount: number): boolean {
    const maxMagazine = this.weaponDef?.limits?.maxMagazineSize ?? 40;
    const newSize = this.magazineSize + amount;
    if (newSize > maxMagazine) {
      return false;
    }
    this.magazineSize = newSize;
    // Если перезарядка не идет, обновляем текущий магазин
    if (!this._isReloading) {
      this.ammo = Math.min(this.ammo + amount, this.magazineSize);
    }
    return true;
  }

  canDecreaseFireRate(amount: number): boolean {
    const minFireRate = this.weaponDef?.limits?.minFireRateMs ?? 80;
    return this.fireRate - amount >= minFireRate;
  }

  canDecreaseReloadTime(amount: number): boolean {
    const minReloadTime = this.weaponDef?.limits?.minReloadTimeMs ?? 800;
    return this.reloadTime - amount >= minReloadTime;
  }

  canIncreaseMagazine(amount: number): boolean {
    const maxMagazine = this.weaponDef?.limits?.maxMagazineSize ?? 40;
    return this.magazineSize + amount <= maxMagazine;
  }

  tryFire(args: {
    scene: Phaser.Scene;
    time: number;
    playerX: number;
    playerY: number;
    aimAngle: number;
    bullets: Phaser.Physics.Arcade.Group;
    onBulletSpawned?: (bullet: Bullet) => void;
    bypassAmmo?: boolean;
  }): void {
    const { scene, time, playerX, playerY, aimAngle, bullets, onBulletSpawned, bypassAmmo } = args;

    this.updateReload(time);

    // Check fire rate
    if (time < this.lastShotTime + this.fireRate) {
      return;
    }

    // Check ammo (unless bypassed by DOUBLE buff)
    if (!bypassAmmo && this.ammo <= 0) {
      if (!this._isReloading) {
        this.startReload(time);
      }
      return;
    }

    // Check if reloading (unless bypassed)
    if (this._isReloading && !bypassAmmo) {
      return;
    }

    // Fire single bullet
    const bullet = new Bullet(scene, playerX, playerY, this.projectileConfig);
    bullets.add(bullet);
    onBulletSpawned?.(bullet);

    // Set velocity
    const speed = bullet.speed;
    const vx = Math.cos(aimAngle) * speed;
    const vy = Math.sin(aimAngle) * speed;
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(vx, vy);
    body.setAllowGravity(false);

    // Update state
    if (!bypassAmmo) {
      this.ammo--;
    }
    this.lastShotTime = time;

    // Auto-reload when empty
    if (!bypassAmmo && this.ammo <= 0 && !this._isReloading) {
      this.startReload(time);
    }
  }

  private startReload(time: number): void {
    if (this._isReloading) {
      return;
    }
    this._isReloading = true;
    this.reloadStartTime = time;
  }

  updateReload(time: number): void {
    if (!this._isReloading) {
      return;
    }
    if (time >= this.reloadStartTime + this.reloadTime) {
      this.ammo = this.magazineSize;
      this._isReloading = false;
      this.reloadStartTime = 0;
    }
  }
}
