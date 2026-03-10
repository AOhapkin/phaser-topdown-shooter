import Phaser from "phaser";
import type { MissionId } from "../types/campaign";
import {
  CAMPAIGN_MAIN,
  CHAPTERS_BY_ID,
  MISSIONS_BY_ID,
} from "../config/CampaignConfig";

export interface CampaignMenuUICallbacks {
  onStartMission: (missionId: MissionId) => void;
  onStartSandbox: () => void;
  log?: (msg: string) => void;
}

/**
 * CampaignMenuUI - UI for campaign mission selection
 * Idempotent: show()/hide() can be called multiple times safely
 */
export class CampaignMenuUI {
  private scene: Phaser.Scene;
  private callbacks: CampaignMenuUICallbacks;

  // Single root container
  private root?: Phaser.GameObjects.Container;
  private backdrop?: Phaser.GameObjects.Rectangle;
  private panel?: Phaser.GameObjects.Container;
  private chapterList?: Phaser.GameObjects.Container;
  private missionList?: Phaser.GameObjects.Container;
  private title?: Phaser.GameObjects.Text;
  private sandboxButton?: Phaser.GameObjects.Text;

  private visible = false;
  private selectedChapterId: string | null = null;
  private clickLocked = false;
  private uiBuilt = false;

  constructor(scene: Phaser.Scene, callbacks: CampaignMenuUICallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
  }

  /**
   * Show campaign menu (idempotent)
   */
  show(): void {
    if (this.visible) {
      return; // Already visible
    }

    // Build UI once if not built
    if (!this.uiBuilt) {
      this.buildUIOnce();
      this.uiBuilt = true;
    }

    // Show root
    if (this.root) {
      this.root.setVisible(true);
      this.root.setDepth(20000);
    }

    // Render chapters list
    this.renderChapters();

    this.visible = true;
    this.clickLocked = false;
    this.callbacks.log?.("[CAMPAIGN] open menu");
  }

  /**
   * Hide campaign menu (idempotent)
   */
  hide(): void {
    if (!this.visible) {
      return; // Already hidden
    }

    if (this.root) {
      this.root.setVisible(false);
    }

    this.visible = false;
    this.selectedChapterId = null;
    this.clickLocked = false;
  }

  /**
   * Build UI structure once (called only once)
   */
  private buildUIOnce(): void {
    const { width, height } = this.scene.scale;

    // Root container
    this.root = this.scene.add.container(0, 0);
    this.root.setDepth(20000);
    this.root.setScrollFactor(0);
    this.root.setVisible(false);

    // Backdrop - blocks input to game
    this.backdrop = this.scene.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.9)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20001)
      .setInteractive({ useHandCursor: false });

    // Stop event propagation
    this.backdrop.on("pointerdown", (_pointer: any, _lx: number, _ly: number, event: any) => {
      if (event?.stopPropagation) {
        event.stopPropagation();
      }
    });

    this.root.add(this.backdrop);

    // Panel container (centered)
    this.panel = this.scene.add.container(width / 2, height / 2);
    this.panel.setScrollFactor(0);
    this.root.add(this.panel);

    // Title
    this.title = this.scene.add
      .text(0, -height / 2 + 80, "CAMPAIGN", {
        fontSize: "64px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20002);

    this.panel.add(this.title);

    // Chapter list container
    this.chapterList = this.scene.add.container(0, -height / 2 + 180);
    this.chapterList.setScrollFactor(0);
    this.panel.add(this.chapterList);

    // Mission list container
    this.missionList = this.scene.add.container(0, -height / 2 + 180);
    this.missionList.setScrollFactor(0);
    this.missionList.setVisible(false);
    this.panel.add(this.missionList);

    // Sandbox button (will be added to panel)
    const sandboxY = -height / 2 + 180 + CAMPAIGN_MAIN.chapters.length * 60 + 40;
    this.sandboxButton = this.scene.add
      .text(0, sandboxY, "SANDBOX MODE", {
        fontSize: "28px",
        color: "#888888",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20002)
      .setInteractive({ useHandCursor: true });

    this.sandboxButton.on("pointerover", () => {
      if (this.sandboxButton) {
        this.sandboxButton.setColor("#aaaaaa");
        this.sandboxButton.setScale(1.1);
      }
    });
    this.sandboxButton.on("pointerout", () => {
      if (this.sandboxButton) {
        this.sandboxButton.setColor("#888888");
        this.sandboxButton.setScale(1.0);
      }
    });
    this.sandboxButton.on("pointerdown", () => {
      if (!this.clickLocked) {
        this.lockClicks(150);
        this.callbacks.onStartSandbox();
      }
    });

    this.panel.add(this.sandboxButton);
  }

  /**
   * Render chapters list
   */
  private renderChapters(): void {
    if (!this.chapterList || !this.missionList) {
      return;
    }

    // Clear existing
    this.chapterList.removeAll(true);
    this.missionList.removeAll(true);
    this.missionList.setVisible(false);
    this.chapterList.setVisible(true);

    this.selectedChapterId = null;

    // Create chapter buttons
    const chapterSpacing = 60;
    CAMPAIGN_MAIN.chapters.forEach((chapterId, index) => {
      const chapterDef = CHAPTERS_BY_ID.get(chapterId as any);
      if (!chapterDef) {
        return;
      }

      const chapterY = index * chapterSpacing;
      const chapterText = this.scene.add
        .text(0, chapterY, chapterDef.title, {
          fontSize: "32px",
          color: "#ffff00",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(20002)
        .setInteractive({ useHandCursor: true });

      // Hover effect
      chapterText.on("pointerover", () => {
        chapterText.setColor("#ffffff");
        chapterText.setScale(1.1);
      });
      chapterText.on("pointerout", () => {
        chapterText.setColor("#ffff00");
        chapterText.setScale(1.0);
      });

      // Click handler
      chapterText.on("pointerdown", () => {
        if (!this.clickLocked && this.chapterList) {
          this.onChapterClicked(chapterId);
        }
      });

      if (this.chapterList) {
        this.chapterList.add(chapterText);
      }
    });
  }

  /**
   * Handle chapter click
   */
  private onChapterClicked(chapterId: string): void {
    if (this.clickLocked) {
      return;
    }

    this.lockClicks(150);
    this.selectedChapterId = chapterId;
    this.renderMissionsForSelectedChapter();
  }

  /**
   * Render missions for selected chapter
   */
  private renderMissionsForSelectedChapter(): void {
    if (!this.chapterList || !this.missionList || !this.selectedChapterId) {
      return;
    }

    const chapterDef = CHAPTERS_BY_ID.get(this.selectedChapterId as any);
    if (!chapterDef) {
      return;
    }

    // Hide chapter list, show mission list
    this.chapterList.setVisible(false);
    this.missionList.setVisible(true);
    this.missionList.removeAll(true);

    // Back button
    const backText = this.scene.add
      .text(0, -60, "< Back to Chapters", {
        fontSize: "24px",
        color: "#888888",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20002)
      .setInteractive({ useHandCursor: true });

    backText.on("pointerover", () => {
      backText.setColor("#aaaaaa");
    });
    backText.on("pointerout", () => {
      backText.setColor("#888888");
    });
      backText.on("pointerdown", () => {
        if (!this.clickLocked && this.missionList) {
          this.lockClicks(150);
          this.renderChapters();
        }
      });

      if (this.missionList) {
        this.missionList.add(backText);
      }

    // Chapter title
    const chapterTitle = this.scene.add
      .text(0, -20, chapterDef.title, {
        fontSize: "40px",
        color: "#ffff00",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20002);

    if (this.missionList) {
      this.missionList.add(chapterTitle);
    }

    // Mission buttons
    const missionsStartY = 20;
    const missionSpacing = 50;

    chapterDef.missions.forEach((missionId, index) => {
      const missionDef = MISSIONS_BY_ID.get(missionId);
      if (!missionDef) {
        return;
      }

      const missionY = missionsStartY + index * missionSpacing;
      const missionText = this.scene.add
        .text(0, missionY, missionDef.title, {
          fontSize: "28px",
          color: "#ffffff",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(20002)
        .setInteractive({ useHandCursor: true });

      // Description
      if (missionDef.description && this.missionList) {
        const descText = this.scene.add
          .text(0, missionY + 25, missionDef.description, {
            fontSize: "18px",
            color: "#cccccc",
          })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(20002);

        this.missionList.add(descText);
      }

      // Hover effect
      missionText.on("pointerover", () => {
        missionText.setColor("#ffff00");
        missionText.setScale(1.1);
      });
      missionText.on("pointerout", () => {
        missionText.setColor("#ffffff");
        missionText.setScale(1.0);
      });

      // Click handler
      missionText.on("pointerdown", () => {
        if (!this.clickLocked && this.missionList) {
          this.lockClicks(150);
          this.callbacks.onStartMission(missionId);
        }
      });

      if (this.missionList) {
        this.missionList.add(missionText);
      }
    });
  }

  /**
   * Lock clicks for debounce
   */
  private lockClicks(ms: number): void {
    this.clickLocked = true;
    this.scene.time.delayedCall(ms, () => {
      this.clickLocked = false;
    });
  }

  /**
   * Destroy menu
   */
  destroy(): void {
    this.hide();
    if (this.root) {
      this.root.destroy(true);
      this.root = undefined;
    }
    this.uiBuilt = false;
  }
}
