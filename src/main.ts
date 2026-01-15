import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';

const designWidth = 800;
const designHeight = 600;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: designWidth,
  height: designHeight,
  backgroundColor: '#1e1e1e',
  parent: 'game',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: designWidth,
    height: designHeight,
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false, // По умолчанию выключен, можно включить через F1 в игре
    },
  },
  scene: [MenuScene, GameScene], // MenuScene is the starting scene
};

const game = new Phaser.Game(config);
console.log(`[BOOT] scale mode=RESIZE base=${designWidth}x${designHeight}`);

