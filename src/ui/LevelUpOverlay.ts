import Phaser from "phaser";

export type LevelUpOption = {
  title: string;
  description: string;
  apply: () => void;
};

export class LevelUpOverlay {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    options: LevelUpOption[],
    onSelect: () => void
  ) {
    this.scene = scene;
    const { width, height } = scene.scale;

    // Жёсткие размеры
    const panelW = 620;
    const titleH = 80; // зона под заголовок внутри панели
    const paddingY = 36;
    const cardW = 520;
    const cardH = 84;
    const cardGap = 22;

    // Высота панели рассчитывается
    const cardsBlockH =
      options.length * cardH + (options.length - 1) * cardGap;
    const panelH = paddingY + titleH + cardsBlockH + paddingY;

    // Панель всегда по центру
    const panelX = width / 2;
    const panelY = height / 2;
    const panelTop = panelY - panelH / 2;

    // Fullscreen overlay
    const overlay = scene.add
      .rectangle(panelX, panelY, width, height, 0x000000, 0.94)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20000)
      .setInteractive();

    // Центральная панель
    const panel = scene.add
      .rectangle(panelX, panelY, panelW, panelH, 0x111111, 0.96)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20001);

    // Заголовок внутри панели
    const titleY = panelTop + paddingY + titleH / 2;
    const title = scene.add
      .text(panelX, titleY, "LEVEL UP", {
        fontSize: "56px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20002);

    const cardObjects: Phaser.GameObjects.GameObject[] = [];

    // Начало карточек внутри панели
    const cardsStartY = panelTop + paddingY + titleH + cardH / 2;

    // Карточки улучшений
    options.forEach((opt, i) => {
      const y = cardsStartY + i * (cardH + cardGap);

      const card = scene.add
        .rectangle(panelX, y, cardW, cardH, 0x2a2a2a, 1)
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(20002)
        .setInteractive({ useHandCursor: true });

      // Тонкая рамка
      card.setStrokeStyle(1, 0xffffff, 0.15);

      // Текст карточки (только title, без description)
      const text = scene.add
        .text(panelX, y, opt.title, {
          fontSize: "28px",
          color: "#ffffff",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(20003);

      // Hover эффекты с scale
      card.on("pointerover", () => {
        card.setFillStyle(0x3a3a3a, 1);
        card.setScale(1.02);
      });
      card.on("pointerout", () => {
        card.setFillStyle(0x2a2a2a, 1);
        card.setScale(1);
      });

      // IMPORTANT: stopPropagation для предотвращения "проброса" клика
      card.on(
        "pointerdown",
        (
          _pointer: Phaser.Input.Pointer,
          _lx: number,
          _ly: number,
          event: any
        ) => {
          if (event?.stopPropagation) {
            event.stopPropagation();
          }

          opt.apply();
          this.close(() => {
            onSelect();
          });
        }
      );

      cardObjects.push(card, text);
    });

    this.container = scene.add.container(0, 0, [
      overlay,
      panel,
      title,
      ...cardObjects,
    ]);
    this.container.setDepth(20000);
    this.container.setScrollFactor(0);

    // Анимация появления
    this.container.setAlpha(0);
    this.container.setScale(0.96);

    scene.tweens.add({
      targets: this.container,
      alpha: 1,
      scale: 1,
      duration: 180,
      ease: "Sine.easeOut",
    });

    // Чтобы клик по overlay тоже не "протекал"
    overlay.on(
      "pointerdown",
      (
        _p: Phaser.Input.Pointer,
        _lx: number,
        _ly: number,
        event: any
      ) => {
        if (event?.stopPropagation) {
          event.stopPropagation();
        }
      }
    );
  }

  close(onClosed?: () => void) {
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      scale: 0.98,
      duration: 140,
      ease: "Sine.easeIn",
      onComplete: () => {
        this.destroy();
        onClosed?.();
      },
    });
  }

  destroy() {
    this.container.destroy(true);
  }
}
