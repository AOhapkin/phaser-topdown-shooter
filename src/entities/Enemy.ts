import Phaser from "phaser";
import { Player } from "./Player";

export type EnemyType = "runner" | "tank";

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  private target: Player;
  private speed = 80;

  private enemyType: EnemyType;
  private maxHealth: number;
  private health: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    target: Player,
    type: EnemyType = "runner"
  ) {
    super(scene, x, y, "enemy");

    this.target = target;
    this.enemyType = type;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 0.5);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);

    if (this.enemyType === "runner") {
      this.maxHealth = 1;
      this.speed = 110;
      this.setScale(1);
      this.clearTint();
    } else {
      this.maxHealth = 3;
      this.speed = 60;
      this.setScale(1.3);
      this.setTint(0x4fc3f7);
    }

    this.health = this.maxHealth;
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);

    if (!this.scene || !this.active) {
      return;
    }

    this.scene.physics.moveToObject(this, this.target, this.speed);
  }

  public takeDamage(amount: number): boolean {
    if (!this.active) {
      return false;
    }

    this.health -= amount;

    if (this.health <= 0) {
      this.destroy();
      return true;
    }

    return false;
  }
}

