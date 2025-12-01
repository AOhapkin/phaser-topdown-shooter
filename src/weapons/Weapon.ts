import Phaser from "phaser";
import { Player } from "../entities/Player";

export type WeaponFireContext = {
  scene: Phaser.Scene;
  player: Player;
  bullets: Phaser.Physics.Arcade.Group;
  pointer: Phaser.Input.Pointer;
  time: number;
};

export interface Weapon {
  tryFire(context: WeaponFireContext): void;
  getFireRate(): number;
}


