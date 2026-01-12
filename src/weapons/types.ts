import Phaser from "phaser";

export type WeaponKey = "pistol" | "shotgun";

export type WeaponStats = {
  name: string; // "PISTOL" / "SHOTGUN"
  magazineSize: number;
  reloadTimeMs: number;
  fireRateMs: number;
};

export interface Weapon {
  key: WeaponKey;
  getStats(): WeaponStats;

  getAmmoInMag(): number;
  getMagazineSize(): number;
  isReloading(): boolean;
  getReloadProgress(): number; // 0..1

  tryFire(args: {
    scene: Phaser.Scene;
    time: number;
    playerX: number;
    playerY: number;
    aimAngle: number;
    bullets: Phaser.Physics.Arcade.Group;
    onBulletSpawned?: (bullet: import("../entities/Bullet").Bullet) => void;
  }): void;

  refillAndReset(): void; // после смены оружия/рестарта
}

