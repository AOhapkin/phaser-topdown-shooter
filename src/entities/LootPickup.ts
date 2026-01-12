import Phaser from "phaser";

export type LootType = "heal" | "speed" | "weapon-drop" | "buff-rapid" | "buff-double" | "buff-pierce" | "buff-freeze";

// Loot TTL constants
const LOOT_TTL_MIN_MS = 8000;
const LOOT_TTL_MAX_MS = 12000;
const LOOT_BLINK_LAST_MS = 2000;
const LOOT_BLINK_INTERVAL_MS = 120;

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

  constructor(scene: Phaser.Scene, x: number, y: number, lootType: LootType) {
    const textureKey =
      lootType === "heal"
        ? "loot-heal"
        : lootType === "speed"
        ? "loot-speed"
        : "loot-heal"; // weapon-drop использует временную текстуру

    super(scene, x, y, textureKey);

    this.lootType = lootType;

    // TTL tracking: random 8-12 seconds
    this.spawnTime = scene.time.now;
    const ttlMs = Phaser.Math.Between(LOOT_TTL_MIN_MS, LOOT_TTL_MAX_MS);
    this.expireTime = this.spawnTime + ttlMs;
    this.blinkStartTime = this.expireTime - LOOT_BLINK_LAST_MS;
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
      if (time - this.lastBlinkToggle >= LOOT_BLINK_INTERVAL_MS) {
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
      // Log despawn for buff loot
      if (this.lootType.startsWith("buff-") || this.lootType === "weapon-drop") {
        console.log(`[LOOT] despawned: ${this.lootType}`);
      }
      this.destroy();
    }
  }
}

