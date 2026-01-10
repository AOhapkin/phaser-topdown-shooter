import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#1e1e1e',
  physics: {
    default: 'arcade',
    arcade: {
      debug: false, // По умолчанию выключен, можно включить через F1 в игре
    },
  },
  scene: [GameScene],
};

new Phaser.Game(config);

