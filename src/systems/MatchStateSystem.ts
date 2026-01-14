/**
 * MatchStateSystem manages match state flags (started, gameOver, stageClear)
 * Single source of truth for match state
 */
export class MatchStateSystem {
  private started = false;
  private gameOver = false;
  private stageClear = false;

  /**
   * Reset all state flags to initial values
   */
  reset(): void {
    this.started = false;
    this.gameOver = false;
    this.stageClear = false;
  }

  /**
   * Set started flag
   */
  setStarted(value: boolean): void {
    this.started = value;
  }

  /**
   * Set gameOver flag
   */
  setGameOver(value: boolean): void {
    this.gameOver = value;
  }

  /**
   * Set stageClear flag
   */
  setStageClear(value: boolean): void {
    this.stageClear = value;
  }

  /**
   * Get started flag
   */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * Get gameOver flag
   */
  isGameOver(): boolean {
    return this.gameOver;
  }

  /**
   * Get stageClear flag
   */
  isStageClear(): boolean {
    return this.stageClear;
  }
}

