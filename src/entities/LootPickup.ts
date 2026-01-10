import Phaser from "phaser";

export type LootType = "heal" | "speed";

export class LootPickup extends Phaser.Physics.Arcade.Sprite {
  public lootType: LootType;

  constructor(scene: Phaser.Scene, x: number, y: number, lootType: LootType) {
    const textureKey =
      lootType === "heal" ? "loot-heal" : "loot-speed";

    super(scene, x, y, textureKey);

    this.lootType = lootType;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 0.5);
    this.setScale(0.9);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);

    scene.tweens.add({
      targets: this,
      y: this.y - 5,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    });
  }
}

