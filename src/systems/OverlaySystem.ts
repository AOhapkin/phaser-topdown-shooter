/**
 * OverlaySystem manages game overlays (start, gameover, stageclear, levelup)
 * and provides input blocking functionality.
 */
export type OverlayId = "start" | "gameover" | "stageclear" | "levelup" | null;

export class OverlaySystem {
  private isOpen = false;
  private activeOverlayId: OverlayId = null;

  /**
   * Open an overlay
   */
  open(id: OverlayId): void {
    if (id === null) {
      this.close();
      return;
    }
    this.isOpen = true;
    this.activeOverlayId = id;
  }

  /**
   * Close the current overlay
   */
  close(): void {
    this.isOpen = false;
    this.activeOverlayId = null;
  }

  /**
   * Check if any overlay is blocking gameplay input
   */
  isBlockingInput(): boolean {
    return this.isOpen;
  }

  /**
   * Get the currently active overlay ID
   */
  getActiveId(): OverlayId {
    return this.activeOverlayId;
  }

  /**
   * Check if a specific overlay is open
   */
  isOverlayOpen(id: OverlayId): boolean {
    return this.isOpen && this.activeOverlayId === id;
  }
}

