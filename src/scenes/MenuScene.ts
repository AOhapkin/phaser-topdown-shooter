import Phaser from "phaser";

interface MenuSceneData {
  open?: "campaign";
  chapterId?: string;
}

type MenuState = "main" | "campaign";

interface ButtonOptions {
  label: string;
  action: () => void;
  color?: number;
  hoverColor?: number;
  textColor?: string;
  textHoverColor?: string;
  fontSize?: number;
}

/**
 * MenuScene - minimalistic arcade-style menu
 * Single root container, state-based rendering
 */
export class MenuScene extends Phaser.Scene {
  private root?: Phaser.GameObjects.Container;
  private overlay?: Phaser.GameObjects.Rectangle;
  private panel?: Phaser.GameObjects.Container;
  private state: MenuState = "main";
  private clickLocked = false;
  private selectedChapter: number = 1;
  private unlockedMissionByChapter: Record<number, number> = { 1: 1 }; // chapter -> highest unlocked mission
  private escKey?: Phaser.Input.Keyboard.Key;
  private lockTimer?: Phaser.Time.TimerEvent;

  // Style constants
  private readonly STYLES = {
    titleSize: 60,
    buttonSize: 32,
    subtitleSize: 18,
    buttonPaddingX: 18,
    buttonPaddingY: 12,
    buttonSpacing: 18,
    buttonRadius: 8,
    buttonBgColor: 0x2a2a2a,
    buttonHoverColor: 0x3a3a3a,
    buttonTextColor: "#ffffff",
    buttonTextHoverColor: "#ffff00",
    titleColor: "#ffffff",
    subtitleColor: "#aaaaaa",
  };

  constructor() {
    super("MenuScene");
  }

  create(data?: MenuSceneData) {
    // Reset click lock on every entry
    this.resetClickLock();
    console.log("[MENU] create/reset lock=false");

    // Initialize state from data
    if (data?.open === "campaign") {
      this.state = "campaign";
    } else {
      this.state = "main";
    }

    // Build UI structure once
    this.buildUI();

    // Initial render
    this.render();

    // ESC key handler
    this.escKey = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.ESC
    );
    this.escKey?.on("down", () => {
      if (this.state === "campaign") {
        this.setState("main");
      }
    });

    // Resize handler
    let resizeLogThrottle = 0;
    this.scale.on("resize", () => {
      const w = this.scale.width;
      const h = this.scale.height;
      // Throttle resize logs (only log once per resize event)
      if (resizeLogThrottle === 0) {
        console.log(`[MENU] resize w=${w} h=${h}`);
        resizeLogThrottle = 1;
        this.time.delayedCall(100, () => {
          resizeLogThrottle = 0;
        });
      }
      this.layout();
    });

    // Initial layout
    this.layout();

    // Log active scenes
    const activeScenes = this.scene.manager
      .getScenes(true)
      .map((s) => s.scene.key)
      .join(", ");
    console.log(`[MENU] state=${this.state}, active scenes: [${activeScenes}]`);

    // Setup shutdown handlers
    this.setupShutdownHandlers();
  }

  /**
   * Build UI structure once (root, overlay, panel)
   */
  private buildUI(): void {
    const { width, height } = this.scale;

    // Root container (at 0,0 - elements use absolute coords)
    this.root = this.add.container(0, 0);
    this.root.setDepth(1000);
    this.root.setScrollFactor(0);

    // Overlay (semi-transparent dark background) - will be resized by layout
    this.overlay = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.85)
      .setOrigin(0.5)
      .setScrollFactor(0);
    this.root.add(this.overlay);

    // Panel container (for current screen content)
    this.panel = this.add.container(0, 0);
    this.panel.setScrollFactor(0);
    this.root.add(this.panel);
  }

  /**
   * Layout UI on resize
   */
  private layout(): void {
    const { width, height } = this.scale;

    // Update overlay size (root stays at 0,0, panel elements use absolute coords)
    if (this.overlay) {
      this.overlay.setSize(width, height);
      this.overlay.setPosition(width / 2, height / 2);
    }

    // Re-render current state (will use new scale.width/height for positioning)
    this.render();
  }

  /**
   * Set state and re-render
   */
  private setState(newState: MenuState): void {
    if (this.state === newState) {
      return;
    }

    const oldState = this.state;
    this.state = newState;

    // No state-specific cleanup needed

    if (newState === "campaign") {
      console.log("[MENU] enter campaign");
    } else if (oldState === "campaign" && newState === "main") {
      console.log("[MENU] click back");
    }

    console.log(`[MENU] state=${oldState} -> ${newState}`);
    this.render();
  }

  /**
   * Render current state (clears panel and rebuilds)
   */
  private render(): void {
    if (!this.panel) {
      return;
    }

    // Reset click lock before rendering (safe state)
    this.resetClickLock();

    // Clear panel completely
    this.panel.removeAll(true);

    // Render based on state
    if (this.state === "main") {
      this.renderMain();
    } else if (this.state === "campaign") {
      this.renderCampaign();
    }
  }

  /**
   * Render main menu screen
   */
  private renderMain(): void {
    if (!this.panel) {
      return;
    }

    // Two-zone layout constants
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const headerTop = Math.max(40, h * 0.1);
    const headerGap = 28;
    const safeBottom = Math.max(40, h * 0.08);

    // Title in header zone
    const title = this.add
      .text(cx, headerTop, "Swarm Run", {
        fontSize: `${this.STYLES.titleSize}px`,
        color: this.STYLES.titleColor,
        fontFamily: "monospace",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0);

    this.panel.add(title);

    // Content area
    const contentTop = headerTop + this.STYLES.titleSize / 2 + headerGap;
    const contentBottom = h - safeBottom;
    const contentMid = (contentTop + contentBottom) / 2;

    console.log(
      `[MENU] layout w=${w} h=${h} contentTop=${contentTop} contentBottom=${contentBottom}`
    );

    // Build content stack
    const buttonHeight =
      this.STYLES.buttonSize + this.STYLES.buttonPaddingY * 2;
    const buttonGap = 22;

    // Campaign button
    const campaignBtn = this.createButton({
      label: "Campaign",
      action: () => {
        this.setState("campaign");
      },
      fontSize: this.STYLES.buttonSize,
    });
    const campaignHeight = buttonHeight;

    // Sandbox button
    const sandboxBtn = this.createButton({
      label: "Sandbox",
      action: () => {
        this.startSandbox();
      },
      fontSize: this.STYLES.buttonSize,
      color: 0x1a1a1a,
      hoverColor: 0x2a2a2a,
      textColor: "#888888",
      textHoverColor: "#aaaaaa",
    });
    const sandboxHeight = buttonHeight;

    // Calculate stack height
    const stackHeight = campaignHeight + buttonGap + sandboxHeight;

    // Center stack in content area
    let y = contentMid - stackHeight / 2;

    // Position Campaign button
    campaignBtn.setPosition(cx, y + campaignHeight / 2);
    this.panel.add(campaignBtn);
    y += campaignHeight + buttonGap;

    // Position Sandbox button
    sandboxBtn.setPosition(cx, y + sandboxHeight / 2);
    this.panel.add(sandboxBtn);
  }

  /**
   * Render campaign menu screen (minimal structure)
   */
  private renderCampaign(): void {
    if (!this.panel) {
      return;
    }

    console.log("[MENU] render campaign");

    // Two-zone layout constants (same as renderMain)
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const headerTop = Math.max(40, h * 0.1);
    const headerGap = 28;
    const safeBottom = Math.max(40, h * 0.08);

    // Title in header zone (same position as main)
    const title = this.add
      .text(cx, headerTop, "Swarm Run", {
        fontSize: `${this.STYLES.titleSize}px`,
        color: this.STYLES.titleColor,
        fontFamily: "monospace",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0);

    this.panel.add(title);

    // Content area
    const contentTop = headerTop + this.STYLES.titleSize / 2 + headerGap;
    const contentBottom = h - safeBottom;
    const contentMid = (contentTop + contentBottom) / 2;

    console.log(
      `[MENU] layout w=${w} h=${h} contentTop=${contentTop} contentBottom=${contentBottom}`
    );

    // Build content stack
    const subtitleSize = Math.round(this.STYLES.buttonSize * 0.75);
    const blockGap = 28;

    // Create subtitle
    const subtitle = this.add
      .text(cx, 0, "Campaign", {
        fontSize: `${subtitleSize}px`,
        color: this.STYLES.subtitleColor,
        fontFamily: "monospace",
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0);
    const subtitleHeight = subtitleSize;

    // Create chapters row
    const chaptersRow = this.renderChaptersRow();
    const chaptersHeight =
      this.STYLES.buttonSize + this.STYLES.buttonPaddingY * 2;

    // Create missions grid
    const missionsGrid = this.renderMissionGrid();
    const gridHeight =
      (this.STYLES.buttonSize + this.STYLES.buttonPaddingY * 2) * 2 + 12; // 2 rows + spacing

    // Create back button
    const backBtn = this.createButton({
      label: "Back",
      action: () => {
        console.log("[MENU] click back");
        this.setState("main");
      },
      fontSize: this.STYLES.subtitleSize,
      color: 0x1a1a1a,
      hoverColor: 0x2a2a2a,
      textColor: this.STYLES.subtitleColor,
      textHoverColor: "#cccccc",
    });
    const backHeight =
      this.STYLES.subtitleSize + this.STYLES.buttonPaddingY * 2;

    // Calculate stack height
    const stackHeight =
      subtitleHeight +
      blockGap +
      chaptersHeight +
      blockGap +
      gridHeight +
      blockGap +
      backHeight;

    // Center stack in content area
    let y = contentMid - stackHeight / 2;

    // Position subtitle
    subtitle.setPosition(cx, y + subtitleHeight / 2);
    this.panel.add(subtitle);
    y += subtitleHeight + blockGap;

    // Position chapters row
    chaptersRow.setPosition(cx, y + chaptersHeight / 2);
    this.panel.add(chaptersRow);
    y += chaptersHeight + blockGap;

    // Position missions grid
    missionsGrid.setPosition(cx, y + gridHeight / 2);
    this.panel.add(missionsGrid);
    y += gridHeight + blockGap;

    // Position back button
    backBtn.setPosition(cx, y + backHeight / 2);
    this.panel.add(backBtn);
  }

  /**
   * Render row of chapter buttons (1-5)
   */
  private renderChaptersRow(): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    container.setScrollFactor(0);

    const buttonCount = 5;
    const buttonSpacing = 12;
    const buttonLabel = "Ch"; // Compact label
    const buttonFontSize = this.STYLES.subtitleSize;

    // Calculate total width and starting X
    const tempText = this.add.text(0, 0, `${buttonLabel} 1`, {
      fontSize: `${buttonFontSize}px`,
      fontFamily: "monospace",
    });
    const buttonWidth = tempText.width + this.STYLES.buttonPaddingX * 2;
    tempText.destroy();

    const totalWidth =
      buttonCount * buttonWidth + (buttonCount - 1) * buttonSpacing;
    const startX = -totalWidth / 2 + buttonWidth / 2;

    // Create chapter buttons
    for (let i = 1; i <= buttonCount; i++) {
      const isSelected = i === this.selectedChapter;
      const isEnabled = i === 1; // Only chapter 1 is enabled for now

      const x = startX + (i - 1) * (buttonWidth + buttonSpacing);

      const chapterBtn = this.createMenuButton(`${buttonLabel} ${i}`, x, 0, {
        fontSize: buttonFontSize,
        enabled: isEnabled,
        selected: isSelected,
        action: () => {
          if (isEnabled) {
            this.selectedChapter = i;
            console.log(`[MENU] click chapter=${i}`);
            // Re-render to update selection
            this.render();
          }
        },
      });

      container.add(chapterBtn);
    }

    return container;
  }

  /**
   * Get unlocked mission number for a chapter
   */
  private getUnlockedMission(chapter: number): number {
    return this.unlockedMissionByChapter[chapter] || 0;
  }

  /**
   * Check if mission is unlocked for a chapter
   */
  private isMissionUnlocked(chapter: number, mission: number): boolean {
    const unlocked = this.getUnlockedMission(chapter);
    return mission <= unlocked;
  }

  /**
   * Render grid of mission buttons (1-10, 2 rows of 5)
   */
  private renderMissionGrid(): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    container.setScrollFactor(0);

    const missionCount = 10;
    const missionsPerRow = 5;
    const buttonSpacing = 12;
    const rowSpacing = 12;
    const buttonFontSize = this.STYLES.subtitleSize;

    // Calculate button width
    const tempText = this.add.text(0, 0, "10", {
      fontSize: `${buttonFontSize}px`,
      fontFamily: "monospace",
    });
    const buttonWidth = tempText.width + this.STYLES.buttonPaddingX * 2;
    tempText.destroy();

    // Calculate row width
    const rowWidth =
      missionsPerRow * buttonWidth + (missionsPerRow - 1) * buttonSpacing;
    const startX = -rowWidth / 2 + buttonWidth / 2;

    let maxY = 0;

    // Create mission buttons
    for (let missionIndex = 1; missionIndex <= missionCount; missionIndex++) {
      const row = Math.floor((missionIndex - 1) / missionsPerRow);
      const col = (missionIndex - 1) % missionsPerRow;

      const x = startX + col * (buttonWidth + buttonSpacing);
      const y =
        row *
        (this.STYLES.buttonSize + this.STYLES.buttonPaddingY * 2 + rowSpacing);

      const isUnlocked = this.isMissionUnlocked(
        this.selectedChapter,
        missionIndex
      );

      const missionBtn = this.createMenuButton(`${missionIndex}`, x, y, {
        fontSize: buttonFontSize,
        enabled: isUnlocked,
        selected: false, // Missions are not selected, only chapters
        action: () => {
          if (isUnlocked) {
            console.log(
              `[MENU] click mission chapter=${this.selectedChapter} mission=${missionIndex} (start)`
            );
            this.startCampaignMission(this.selectedChapter, missionIndex);
          }
        },
      });

      container.add(missionBtn);
      maxY = Math.max(
        maxY,
        y + this.STYLES.buttonSize + this.STYLES.buttonPaddingY * 2
      );
    }

    // Set container height for positioning
    (container as any).height = maxY;

    return container;
  }

  /**
   * Start campaign mission
   */
  private startCampaignMission(chapter: number, mission: number): void {
    console.log(`[MENU] start campaign chapter=${chapter} mission=${mission}`);
    // TODO: Implement mission start logic
    // For now, just log - will be implemented later
  }

  /**
   * Create a menu button with enabled/selected states
   */
  private createMenuButton(
    label: string,
    x: number,
    y: number,
    opts: {
      fontSize: number;
      enabled: boolean;
      selected: boolean;
      action: () => void;
    }
  ): Phaser.GameObjects.Container {
    const { fontSize, enabled, selected, action } = opts;

    const container = this.add.container(x, y);
    container.setScrollFactor(0);

    // Measure text width
    const textObj = this.add.text(0, 0, label, {
      fontSize: `${fontSize}px`,
      fontFamily: "monospace",
    });
    const textWidth = textObj.width;
    textObj.destroy();

    // Button dimensions
    const buttonWidth = textWidth + this.STYLES.buttonPaddingX * 2;
    const buttonHeight = fontSize + this.STYLES.buttonPaddingY * 2;

    // Background color based on state
    let bgColor = this.STYLES.buttonBgColor;
    let textColor = this.STYLES.buttonTextColor;
    let hoverColor = this.STYLES.buttonHoverColor;
    let textHoverColor = this.STYLES.buttonTextHoverColor;

    if (selected) {
      // Selected: brighter
      bgColor = this.STYLES.buttonHoverColor;
      textColor = this.STYLES.buttonTextHoverColor;
    }

    // Background (rounded rect)
    const bg = this.add.graphics();
    bg.fillStyle(bgColor, 1.0);
    bg.fillRoundedRect(
      -buttonWidth / 2,
      -buttonHeight / 2,
      buttonWidth,
      buttonHeight,
      this.STYLES.buttonRadius
    );
    container.add(bg);

    // Label text
    const labelText = this.add
      .text(0, 0, label, {
        fontSize: `${fontSize}px`,
        color: textColor,
        fontFamily: "monospace",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0.5);
    container.add(labelText);

    // Set interactive area
    container.setSize(buttonWidth, buttonHeight);

    if (enabled) {
      container.setInteractive({ useHandCursor: true });

      // Hover handlers
      container.on("pointerover", () => {
        bg.clear();
        bg.fillStyle(hoverColor, 1.0);
        bg.fillRoundedRect(
          -buttonWidth / 2,
          -buttonHeight / 2,
          buttonWidth,
          buttonHeight,
          this.STYLES.buttonRadius
        );
        labelText.setColor(textHoverColor);
      });

      container.on("pointerout", () => {
        bg.clear();
        bg.fillStyle(bgColor, 1.0);
        bg.fillRoundedRect(
          -buttonWidth / 2,
          -buttonHeight / 2,
          buttonWidth,
          buttonHeight,
          this.STYLES.buttonRadius
        );
        labelText.setColor(textColor);
      });

      // Click handler
      container.on(
        "pointerdown",
        (
          _pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: any
        ) => {
          if (event?.stopPropagation) {
            event.stopPropagation();
          }

          if (this.clickLocked) {
            return;
          }

          this.lockClicks(180);

          // Press animation
          this.tweens.add({
            targets: container,
            scaleX: 0.98,
            scaleY: 0.98,
            duration: 50,
            yoyo: true,
            ease: "Power2",
            onComplete: () => {
              action();
            },
          });
        }
      );
    } else {
      // Disabled: lower alpha and no interaction
      container.setAlpha(0.4);
      container.disableInteractive();
    }

    return container;
  }

  /**
   * Create a button (UI toolkit)
   */
  private createButton(opts: ButtonOptions): Phaser.GameObjects.Container {
    const {
      label,
      action,
      color = this.STYLES.buttonBgColor,
      hoverColor = this.STYLES.buttonHoverColor,
      textColor = this.STYLES.buttonTextColor,
      textHoverColor = this.STYLES.buttonTextHoverColor,
      fontSize = this.STYLES.buttonSize,
    } = opts;

    const container = this.add.container(0, 0);
    container.setScrollFactor(0);

    // Measure text width
    const textObj = this.add.text(0, 0, label, {
      fontSize: `${fontSize}px`,
      fontFamily: "monospace",
    });
    const textWidth = textObj.width;
    textObj.destroy();

    // Button dimensions
    const buttonWidth = textWidth + this.STYLES.buttonPaddingX * 2;
    const buttonHeight = fontSize + this.STYLES.buttonPaddingY * 2;

    // Background (rounded rect)
    const bg = this.add.graphics();
    bg.fillStyle(color, 1.0);
    bg.fillRoundedRect(
      -buttonWidth / 2,
      -buttonHeight / 2,
      buttonWidth,
      buttonHeight,
      this.STYLES.buttonRadius
    );
    container.add(bg);

    // Label text
    const labelText = this.add
      .text(0, 0, label, {
        fontSize: `${fontSize}px`,
        color: textColor,
        fontFamily: "monospace",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0.5);
    container.add(labelText);

    // Set interactive area - use simple approach for containers
    container.setSize(buttonWidth, buttonHeight);
    container.setInteractive({ useHandCursor: true });

    // Hover handlers
    container.on("pointerover", () => {
      bg.clear();
      bg.fillStyle(hoverColor, 1.0);
      bg.fillRoundedRect(
        -buttonWidth / 2,
        -buttonHeight / 2,
        buttonWidth,
        buttonHeight,
        this.STYLES.buttonRadius
      );
      labelText.setColor(textHoverColor);
    });

    container.on("pointerout", () => {
      bg.clear();
      bg.fillStyle(color, 1.0);
      bg.fillRoundedRect(
        -buttonWidth / 2,
        -buttonHeight / 2,
        buttonWidth,
        buttonHeight,
        this.STYLES.buttonRadius
      );
      labelText.setColor(textColor);
    });

    // Click handler
    container.on(
      "pointerdown",
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: any
      ) => {
        // Stop event propagation to prevent issues
        if (event?.stopPropagation) {
          event.stopPropagation();
        }

        if (this.clickLocked) {
          return;
        }

        this.lockClicks(180);

        // Press animation: scale down
        this.tweens.add({
          targets: container,
          scaleX: 0.98,
          scaleY: 0.98,
          duration: 50,
          yoyo: true,
          ease: "Power2",
          onComplete: () => {
            action();
          },
        });
      }
    );

    return container;
  }

  /**
   * Reset click lock (cancel any pending timers)
   */
  private resetClickLock(): void {
    // Cancel any pending lock timer
    if (this.lockTimer) {
      this.time.removeEvent(this.lockTimer);
      this.lockTimer = undefined;
    }
    this.clickLocked = false;
  }

  /**
   * Lock clicks for debounce
   */
  private lockClicks(ms: number): void {
    // Cancel any existing timer
    if (this.lockTimer) {
      this.time.removeEvent(this.lockTimer);
    }
    this.clickLocked = true;
    this.lockTimer = this.time.delayedCall(ms, () => {
      this.clickLocked = false;
      this.lockTimer = undefined;
    });
  }

  /**
   * Setup shutdown handlers for cleanup
   */
  private setupShutdownHandlers(): void {
    // Shutdown: cleanup before scene stops
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      console.log("[MENU] shutdown - cleaning up");
      this.cleanup();
    });

    // Destroy: final cleanup
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      console.log("[MENU] destroy - final cleanup");
      this.cleanup();
    });
  }

  /**
   * Cleanup all resources
   */
  private cleanup(): void {
    // Reset click lock and cancel timer
    this.resetClickLock();

    // Remove ESC key listener
    if (this.escKey) {
      this.escKey.off("down");
      this.escKey = undefined;
    }

    // Remove resize handler
    this.scale.off("resize", this.layout, this);

    // Clear UI
    if (this.root) {
      this.root.removeAll(true);
      this.root = undefined;
    }
    if (this.panel) {
      this.panel.removeAll(true);
      this.panel = undefined;
    }
    this.overlay = undefined;
  }

  /**
   * Start sandbox mode
   */
  private startSandbox(): void {
    console.log("[MENU] leaving menu -> start GameScene (stop MenuScene)");
    // Stop MenuScene before starting GameScene
    this.scene.stop("MenuScene");
    this.scene.start("GameScene", { mode: "sandbox" });
  }
}
