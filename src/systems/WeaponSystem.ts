import { Weapon, WeaponKey } from "../weapons/types";
import { BasicGun } from "../weapons/BasicGun";
import { Shotgun } from "../weapons/Shotgun";
import { Bullet } from "../entities/Bullet";
import Phaser from "phaser";

export type WeaponId = "PISTOL" | "SHOTGUN";

export interface WeaponSystemCallbacks {
  getIsActive: () => boolean; // game is running, not paused, not gameOver
  getTimeNow: () => number; // scene.time.now
  getPlayerPos: () => { x: number; y: number };
  getAimAngle: () => number; // aim angle in radians
  isBuffActive: (type: "rapid" | "double") => boolean;
  canBypassReload: () => boolean; // isBuffActive("double")
  getScene: () => Phaser.Scene;
  getBulletsGroup: () => Phaser.Physics.Arcade.Group;
  getPlayerPierceLevel: () => number; // pierce level from Stage Clear perk
  scheduleDelayedCall: (delayMs: number, callback: () => void) => void;
  onShotFired: (count: number) => void; // for match stats
  onShotHit?: () => void; // for match stats (optional)
  log?: (msg: string) => void; // optional logging
}

export class WeaponSystem {
  private callbacks: WeaponSystemCallbacks;
  private currentWeapon: Weapon;
  private currentWeaponId: WeaponId = "PISTOL";
  private suppressShootingUntil = 0; // timestamp to suppress shooting after start

  constructor(callbacks: WeaponSystemCallbacks) {
    this.callbacks = callbacks;
    this.currentWeapon = new BasicGun({});
    this.currentWeapon.refillAndReset();
  }

  reset(): void {
    // Reset to starting weapon (PISTOL)
    this.currentWeapon = new BasicGun({});
    this.currentWeapon.refillAndReset();
    this.currentWeaponId = "PISTOL";
    this.suppressShootingUntil = 0;
  }

  getState(): {
    weaponId: WeaponId;
    ammoInMag: number;
    magazineSize: number;
    isReloading: boolean;
    reloadProgress01: number;
  } {
    const now = this.callbacks.getTimeNow();
    let reloadProgress = 0;

    if (this.currentWeapon.isReloading()) {
      if (this.currentWeapon.key === "pistol") {
        reloadProgress = (this.currentWeapon as BasicGun).getReloadProgressWithTime(
          now
        );
      } else if (this.currentWeapon.key === "shotgun") {
        reloadProgress = (this.currentWeapon as Shotgun).getReloadProgressWithTime(
          now
        );
      }
    }

    return {
      weaponId: this.currentWeaponId,
      ammoInMag: this.currentWeapon.getAmmoInMag(),
      magazineSize: this.currentWeapon.getMagazineSize(),
      isReloading: this.currentWeapon.isReloading(),
      reloadProgress01: reloadProgress,
    };
  }

  switchWeapon(nextWeaponId: WeaponId): void {
    const nextKey: WeaponKey = nextWeaponId === "PISTOL" ? "pistol" : "shotgun";

    if (this.currentWeapon.key === nextKey) {
      return; // Already using this weapon
    }

    // Create new weapon
    if (nextKey === "pistol") {
      this.currentWeapon = new BasicGun({});
    } else if (nextKey === "shotgun") {
      this.currentWeapon = new Shotgun();
    }

    this.currentWeapon.refillAndReset();
    this.currentWeaponId = nextWeaponId;
  }

  update(): void {
    // Weapon reload is handled internally by Weapon classes
    // This method can be used for future updates if needed
  }

  setSuppressShootingUntil(time: number): void {
    this.suppressShootingUntil = time;
  }

  tryShoot(): boolean {
    if (!this.callbacks.getIsActive()) {
      return false;
    }

    const now = this.callbacks.getTimeNow();

    // Block shooting for short time after start
    if (now < this.suppressShootingUntil) {
      return false;
    }

    // Apply RAPID buff: reduce fire rate by 50%
    const rapidActive = this.callbacks.isBuffActive("rapid");
    const baseFireRate = this.currentWeapon.getStats().fireRateMs;
    const effectiveFireRate = rapidActive ? baseFireRate * 0.5 : baseFireRate;

    // Check fire rate with buff
    const weaponLastShot = (this.currentWeapon as any).lastShotTime || 0;
    if (now < weaponLastShot + effectiveFireRate) {
      return false;
    }

    // DOUBLE buff: weapon-specific behavior
    const doubleActive = this.callbacks.isBuffActive("double");
    const isShotgun = this.currentWeapon.key === "shotgun";
    const weapon = this.currentWeapon as any;

    // Track if first shot succeeded
    let firstShotSucceeded = false;

    // DOUBLE buff: bypass ammo/reload (infinite ammo)
    const bypassAmmo = this.callbacks.canBypassReload();

    // Get player position and aim angle
    const playerPos = this.callbacks.getPlayerPos();
    const aimAngle = this.callbacks.getAimAngle();
    const scene = this.callbacks.getScene();
    const bullets = this.callbacks.getBulletsGroup();
    const pierceLevel = this.callbacks.getPlayerPierceLevel();

    // First shot: use weapon.tryFire (handles ammo, reload, fireRate update)
    this.currentWeapon.tryFire({
      scene: scene,
      time: now,
      playerX: playerPos.x,
      playerY: playerPos.y,
      aimAngle: aimAngle,
      bullets: bullets,
      bypassAmmo: bypassAmmo,
      onBulletSpawned: (bullet: Bullet) => {
        firstShotSucceeded = true;
        this.callbacks.onShotFired(1);
        // Apply pierce perk to bullet (only from Stage Clear perk)
        if (pierceLevel > 0) {
          bullet.pierceLeft = pierceLevel;
        }
      },
    });

    // DOUBLE buff: weapon-specific second shot
    if (doubleActive && firstShotSucceeded && !weapon._isReloading) {
      if (isShotgun) {
        // Shotgun: schedule second shot after 100ms delay (bypassAmmo for DOUBLE)
        this.callbacks.scheduleDelayedCall(100, () => {
          // Check buff still active and weapon still ready
          if (
            !this.callbacks.isBuffActive("double") ||
            (weapon._isReloading && !bypassAmmo)
          ) {
            return;
          }
          // Fire second shotgun shot (bypassAmmo=true for DOUBLE)
          this.currentWeapon.tryFire({
            scene: scene,
            time: this.callbacks.getTimeNow(),
            playerX: playerPos.x,
            playerY: playerPos.y,
            aimAngle: aimAngle,
            bullets: bullets,
            bypassAmmo: true, // DOUBLE buff: infinite ammo
            onBulletSpawned: (bullet: Bullet) => {
              this.callbacks.onShotFired(1);
              // Apply pierce perk (only from Stage Clear perk)
              if (pierceLevel > 0) {
                bullet.pierceLeft = pierceLevel;
              }
            },
          });
        });
      } else {
        // Pistol: spawn second bullet immediately with spread (no extra ammo cost)
        const spreadAngle = 0.08; // +/- 0.08 rad for double shot
        const bulletAngle = aimAngle + spreadAngle;
        const bullet = new Bullet(scene, playerPos.x, playerPos.y);
        bullets.add(bullet);

        // Count as fired
        this.callbacks.onShotFired(1);

        // Apply pierce perk (only from Stage Clear perk)
        if (pierceLevel > 0) {
          bullet.pierceLeft = pierceLevel;
        }

        // Set velocity
        const speed = bullet.speed;
        const vx = Math.cos(bulletAngle) * speed;
        const vy = Math.sin(bulletAngle) * speed;
        const body = bullet.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(vx, vy);
        body.setAllowGravity(false);
      }
    }

    return firstShotSucceeded;
  }

  getCurrentWeaponId(): WeaponId {
    return this.currentWeaponId;
  }

  getCurrentWeapon(): Weapon {
    return this.currentWeapon;
  }
}

