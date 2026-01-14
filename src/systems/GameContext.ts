import Phaser from "phaser";
import { Player } from "../entities/Player";
import { MatchStateSystem } from "./MatchStateSystem";

/**
 * GameContext provides runtime access to core game objects and utilities
 * Used by systems to access scene, groups, player, time, etc. without tight coupling to GameScene
 * All getters are functions to ensure fresh values are read each time
 */
export interface GameContext {
  scene: Phaser.Scene;
  player: Player;
  bulletsGroup: Phaser.Physics.Arcade.Group;
  enemiesGroup: Phaser.Physics.Arcade.Group;
  lootGroup: Phaser.Physics.Arcade.Group;
  
  // Match state system (single source of truth for match state flags)
  getMatchStateSystem(): MatchStateSystem;
  
  // Time and state getters (functions to read fresh values)
  getTimeNow(): number;
  getIsActive(): boolean; // game is running, not paused, not gameOver, not stageClear
  getIsStarted(): boolean;
  getIsGameOver(): boolean;
  getIsStageClear(): boolean;
  
  // Debug utilities (optional)
  debugEnabled?(): boolean;
  log?(msg: string): void;
}

