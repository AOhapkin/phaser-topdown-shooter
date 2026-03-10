/**
 * Campaign types - type definitions for campaign/mission system
 */

/**
 * Campaign identifier
 */
export type CampaignId = string & { readonly __brand: "CampaignId" };

/**
 * Chapter identifier
 */
export type ChapterId = string & { readonly __brand: "ChapterId" };

/**
 * Mission identifier
 */
export type MissionId = string & { readonly __brand: "MissionId" };

/**
 * Mission objective - discriminated union for type-safe objective handling
 */
export type MissionObjective =
  | { kind: "survive"; durationSec: number }
  | { kind: "kill_count"; kills: number }
  | { kind: "boss"; bossId: string };

/**
 * Mission definition
 */
export interface MissionDef {
  id: MissionId;
  title: string;
  description?: string;
  objective: MissionObjective;
  durationSec?: number; // Optional override for survive objectives
  difficultyTier?: number;
  unlocks?: MissionId[]; // Missions unlocked after completion
  rewardsStub?: unknown; // Placeholder for future rewards
}

/**
 * Chapter definition
 */
export interface ChapterDef {
  id: ChapterId;
  title: string;
  missions: MissionId[];
}

/**
 * Campaign definition
 */
export interface CampaignDef {
  id: CampaignId;
  title: string;
  chapters: ChapterId[];
}

/**
 * Mission result
 */
export type MissionResult = "none" | "success" | "fail";
