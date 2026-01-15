import Phaser from "phaser";
import { GameTuning } from "../config/GameTuning";

export type LootType =
  | "heal"
  | "speed"
  | "weapon-drop"
  | "buff-rapid"
  | "buff-double"
  | "buff-pierce"
  | "buff-freeze";

export class LootPickup extends Phaser.Physics.Arcade.Sprite {
  public lootType: LootType;

  private weaponDropText?: Phaser.GameObjects.Text;
  private buffText?: Phaser.GameObjects.Text;
  private buffBg?: Phaser.GameObjects.Rectangle;
  private spawnTime: number;
  private expireTime: number;
  private blinkStartTime: number;
  private lastBlinkToggle = 0;
  private isBlinking = false;
  private log?: (msg: string) => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    lootType: LootType,
    log?: (msg: string) => void
  ) {
    const textureKey =
      lootType === "heal"
        ? "loot-heal"
        : lootType === "speed"
        ? "loot-speed"
        : "loot-heal"; // weapon-drop использует временную текстуру

    super(scene, x, y, textureKey);

    this.lootType = lootType;
    this.log = log;

    // TTL tracking: random range from GameTuning
    // Use appropriate TTL range based on loot type
    this.spawnTime = scene.time.now;
    let ttlMs: number;
    if (lootType === "weapon-drop") {
      ttlMs = Phaser.Math.Between(
        GameTuning.loot.weaponDrop.ttlMinMs,
        GameTuning.loot.weaponDrop.ttlMaxMs
      );
    } else {
      // For buff loot and other types, use buff TTL range
      ttlMs = Phaser.Math.Between(
        GameTuning.loot.buff.ttlMinMs,
        GameTuning.loot.buff.ttlMaxMs
      );
    }
    this.expireTime = this.spawnTime + ttlMs;
    this.blinkStartTime = this.expireTime - GameTuning.loot.visual.blinkLastMs;
    this.lastBlinkToggle = 0;
    this.isBlinking = false;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 0.5);
    this.setScale(0.9);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);

    // Для weapon-drop создаём текстовую метку вместо спрайта
    if (lootType === "weapon-drop") {
      this.setAlpha(0); // Скрываем спрайт
      this.weaponDropText = scene.add
        .text(x, y, "WEAPON DROP", {
          fontSize: "16px",
          color: "#ffaa00",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(500);
    }

    // Для баффов создаём текстовую метку и фон
    if (lootType.startsWith("buff-")) {
      this.setAlpha(0); // Скрываем спрайт
      const buffName = lootType.replace("buff-", "").toUpperCase();
      const buffColors: Record<string, number> = {
        rapid: 0x00ff00,
        double: 0x0088ff,
        pierce: 0xff8800,
        freeze: 0x00ffff,
      };
      const color = buffColors[buffName.toLowerCase()] || 0xffffff;

      this.buffBg = scene.add
        .rectangle(x, y, 60, 20, 0x000000, 0.7)
        .setOrigin(0.5)
        .setDepth(500)
        .setStrokeStyle(2, color, 1);

      this.buffText = scene.add
        .text(x, y, buffName, {
          fontSize: "12px",
          color: `#${color.toString(16).padStart(6, "0")}`,
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(501);
    }

    scene.tweens.add({
      targets: this,
      y: this.y - 5,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    });

    // Для weapon-drop также анимируем текст
    if (lootType === "weapon-drop" && this.weaponDropText) {
      scene.tweens.add({
        targets: this.weaponDropText,
        y: this.weaponDropText.y - 5,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
      });
    }

    // Для баффов также анимируем текст и фон
    if (lootType.startsWith("buff-") && this.buffText && this.buffBg) {
      scene.tweens.add({
        targets: [this.buffText, this.buffBg],
        y: this.buffText.y - 5,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
      });
    }
  }

  destroy(fromScene?: boolean): void {
    // Уничтожаем текстовую метку для weapon-drop
    if (this.lootType === "weapon-drop" && this.weaponDropText) {
      this.weaponDropText.destroy();
      this.weaponDropText = undefined;
    }
    // Уничтожаем элементы для баффов
    if (this.lootType.startsWith("buff-")) {
      if (this.buffText) {
        this.buffText.destroy();
        this.buffText = undefined;
      }
      if (this.buffBg) {
        this.buffBg.destroy();
        this.buffBg = undefined;
      }
    }
    super.destroy(fromScene);
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);

    // Обновляем позицию текста для weapon-drop
    if (this.lootType === "weapon-drop" && this.weaponDropText) {
      this.weaponDropText.setPosition(this.x, this.y);
    }

    // Обновляем позицию элементов для баффов
    if (this.lootType.startsWith("buff-")) {
      if (this.buffText) {
        this.buffText.setPosition(this.x, this.y);
      }
      if (this.buffBg) {
        this.buffBg.setPosition(this.x, this.y);
      }
    }

    // TTL: мигание перед исчезновением
    if (time >= this.blinkStartTime && time < this.expireTime) {
      if (
        time - this.lastBlinkToggle >=
        GameTuning.loot.visual.blinkIntervalMs
      ) {
        this.isBlinking = !this.isBlinking;
        this.lastBlinkToggle = time;
        const alpha = this.isBlinking ? 0.3 : 1.0;
        this.setAlpha(alpha);
        if (this.weaponDropText) {
          this.weaponDropText.setAlpha(alpha);
        }
        if (this.buffText) {
          this.buffText.setAlpha(alpha);
        }
        if (this.buffBg) {
          this.buffBg.setAlpha(alpha);
        }
      }
    }

    // TTL: уничтожение после истечения времени
    if (time >= this.expireTime) {
      // Log expiration for buff loot
      if (this.lootType.startsWith("buff-")) {
        if (this.log) {
          this.log(`[LOOT] buff expired: ${this.lootType}`);
        } else {
          // Fallback for backward compatibility (should not happen in normal flow)
          console.log(`[LOOT] buff expired: ${this.lootType}`);
        }
      } else if (this.lootType === "weapon-drop") {
        if (this.log) {
          this.log(`[LOOT] weapon-drop expired`);
        } else {
          // Fallback for backward compatibility (should not happen in normal flow)
          console.log(`[LOOT] weapon-drop expired`);
        }
      }
      this.destroy();
    }
  }
}
