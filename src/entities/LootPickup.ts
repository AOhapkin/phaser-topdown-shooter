import Phaser from "phaser";

export type LootType = "heal" | "speed" | "armor";

export class LootPickup extends Phaser.Physics.Arcade.Sprite {
  public lootType: LootType;

  constructor(scene: Phaser.Scene, x: number, y: number, lootType: LootType) {
    super(scene, x, y, "bullet");

    this.lootType = lootType;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 0.5);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);

    switch (lootType) {
      case "heal":
        this.setTint(0x4caf50);
        this.setScale(1.2);
        break;
      case "speed":
        this.setTint(0xffc107);
        this.setScale(1.2);
        break;
      case "armor":
        this.setTint(0x29b6f6);
        this.setScale(1.2);
        break;
    }
  }
}


