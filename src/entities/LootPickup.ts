import Phaser from "phaser";

export type LootType = "heal" | "speed" | "weapon-drop";

export class LootPickup extends Phaser.Physics.Arcade.Sprite {
  public lootType: LootType;

  private weaponDropText?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, lootType: LootType) {
    const textureKey =
      lootType === "heal"
        ? "loot-heal"
        : lootType === "speed"
        ? "loot-speed"
        : "loot-heal"; // weapon-drop использует временную текстуру

    super(scene, x, y, textureKey);

    this.lootType = lootType;

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
  }

  destroy(fromScene?: boolean): void {
    // Уничтожаем текстовую метку для weapon-drop
    if (this.lootType === "weapon-drop" && this.weaponDropText) {
      this.weaponDropText.destroy();
      this.weaponDropText = undefined;
    }
    super.destroy(fromScene);
  }
  
  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    // Обновляем позицию текста для weapon-drop
    if (this.lootType === "weapon-drop" && this.weaponDropText) {
      this.weaponDropText.setPosition(this.x, this.y);
    }
  }
}

