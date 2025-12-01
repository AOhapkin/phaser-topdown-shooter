import Phaser from 'phaser';
import { Player } from './Player';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  private target: Player;
  private speed = 80;

  constructor(scene: Phaser.Scene, x: number, y: number, target: Player) {
    super(scene, x, y, 'enemy');

    this.target = target;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 0.5);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);

    if (!this.scene || !this.active) return;

    // Двигаемся к игроку
    this.scene.physics.moveToObject(this, this.target, this.speed);
  }
}

