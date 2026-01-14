import { Bullet } from "../entities/Bullet";
import { Enemy } from "../entities/Enemy";
import { Player } from "../entities/Player";
import { PlayerStateSystem } from "./PlayerStateSystem";

export interface CombatSystemCallbacks {
  getIsActive: () => boolean;
  getPlayer: () => Player;
  getTimeNow: () => number;
  getPlayerStateSystem: () => PlayerStateSystem;
  onEnemyKilled: (type: "runner" | "tank") => void;
  onEnemyKilledTotalOnly: () => void;
  onPlayerDamaged: (amount: number) => void;
  onEnemyKilledCallback: (enemy: Enemy) => void; // For loot drops, XP, score UI update, etc.
  pausePhysics: () => void;
  resumePhysics: (delayMs: number) => void;
  log?: (msg: string) => void;
}

/**
 * CombatSystem manages combat logic: damage, death, effects
 */
export class CombatSystem {
  private callbacks: CombatSystemCallbacks;

  constructor(callbacks: CombatSystemCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Reset combat system state
   */
  reset(): void {
    // No state to reset
  }

  /**
   * Handle bullet hitting enemy
   * Manages damage, death, and effects
   */
  onBulletHitEnemy(bullet: Bullet, enemy: Enemy): void {
    if (!this.callbacks.getIsActive()) {
      return;
    }

    // Визуальный фидбек до уничтожения пули
    enemy.applyHitFeedback(bullet.x, bullet.y, this.callbacks.getTimeNow());

    // Наносим урон (урон игрока, без бонуса оружия)
    const totalDamage = this.callbacks.getPlayer().getDamage();
    const killed = enemy.takeDamage(totalDamage);

    if (killed) {
      // Микро hit-stop
      this.callbacks.pausePhysics();
      this.callbacks.resumePhysics(14);

      enemy.die(bullet.x, bullet.y);

      // Статистика: убийство (score обновляется внутри MatchStatsSystem)
      if (enemy.type === "runner" || enemy.type === "tank") {
        this.callbacks.onEnemyKilled(enemy.type as "runner" | "tank");
      } else {
        // fast/heavy count as total kills only
        this.callbacks.onEnemyKilledTotalOnly();
      }

      // Callback for additional logic (loot drops, XP, score UI update, etc.)
      // Score is updated inside MatchStatsSystem.onEnemyKilled/onEnemyKilledTotalOnly
      this.callbacks.onEnemyKilledCallback(enemy);
    }
  }

  /**
   * Handle enemy hitting player
   * Manages player damage, knockback, invulnerability
   */
  onEnemyHitPlayer(enemy: Enemy): void {
    if (!this.callbacks.getIsActive()) {
      return;
    }

    const player = this.callbacks.getPlayer();

    if (!player.isAlive()) {
      return;
    }

    // Если игрок неуязвим — просто игнорируем контакт
    if (player.isInvulnerable()) {
      return;
    }

    // 1) Наносим урон
    player.takeDamage(1);
    this.callbacks.onPlayerDamaged(1);

    // 2) Запускаем i-frames
    player.startInvulnerability(player.getIFramesMs());

    // 3) Отбрасываем игрока
    const strength = enemy.type === "tank" ? 320 : 260; // Чуть сильнее от танка
    const knockbackMult = this.callbacks.getPlayerStateSystem().getKnockbackMultiplier();
    player.applyKnockback(enemy.x, enemy.y, strength, 140, knockbackMult); // 140ms knockback

    // Врага НЕ уничтожаем!
  }
}

