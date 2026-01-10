import Phaser from "phaser";

export class HealthBar extends Phaser.GameObjects.Container {
  private bgBar: Phaser.GameObjects.Rectangle;
  private healthBar: Phaser.GameObjects.Rectangle;
  private maxWidth: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number
  ) {
    super(scene, x, y);

    this.maxWidth = width;

    // Красный фон (полная полоска)
    this.bgBar = scene.add.rectangle(0, 0, width, height, 0x8b0000, 1);
    this.bgBar.setOrigin(0.5, 0.5);

    // Зелёная полоска здоровья
    this.healthBar = scene.add.rectangle(
      -width / 2,
      0,
      width,
      height,
      0x4caf50,
      1
    );
    this.healthBar.setOrigin(0, 0.5);

    this.add([this.bgBar, this.healthBar]);

    scene.add.existing(this);
    this.setDepth(1000); // Выше врагов, но ниже UI
  }

  public setHealth(current: number, max: number): void {
    const ratio = Math.max(0, Math.min(1, current / max));
    const newWidth = this.maxWidth * ratio;
    this.healthBar.setSize(newWidth, this.healthBar.height);
    this.healthBar.setPosition(-this.maxWidth / 2, 0);
  }

  public setPositionAbove(x: number, y: number, offset: number): void {
    this.setPosition(x, y - offset);
  }

  public destroy(): void {
    if (this.bgBar) this.bgBar.destroy();
    if (this.healthBar) this.healthBar.destroy();
    super.destroy();
  }
}

