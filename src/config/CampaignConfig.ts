import type {
  CampaignDef,
  CampaignId,
  ChapterDef,
  ChapterId,
  MissionDef,
  MissionId,
} from "../types/campaign";

/**
 * Campaign configuration - data-driven campaign/mission definitions
 */

// Helper to create branded IDs
const createCampaignId = (id: string): CampaignId => id as CampaignId;
const createChapterId = (id: string): ChapterId => id as ChapterId;
const createMissionId = (id: string): MissionId => id as MissionId;

/**
 * Main campaign definition
 */
export const CAMPAIGN_MAIN: CampaignDef = {
  id: createCampaignId("main"),
  title: "Main Campaign",
  chapters: [
    createChapterId("chapter_1"),
  ],
};

/**
 * Chapter definitions
 */
export const CHAPTERS: ChapterDef[] = [
  {
    id: createChapterId("chapter_1"),
    title: "Chapter 1",
    missions: [
      createMissionId("1-1"),
      createMissionId("1-2"),
      createMissionId("1-3"),
    ],
  },
];

/**
 * Mission definitions
 */
export const MISSIONS: MissionDef[] = [
  {
    id: createMissionId("1-1"),
    title: "First Steps",
    description: "Survive for 30 seconds",
    objective: { kind: "survive", durationSec: 30 },
  },
  {
    id: createMissionId("1-2"),
    title: "Endurance Test",
    description: "Survive for 45 seconds",
    objective: { kind: "survive", durationSec: 45 },
  },
  {
    id: createMissionId("1-3"),
    title: "The Challenge",
    description: "Survive for 60 seconds",
    objective: { kind: "survive", durationSec: 60 },
  },
];

/**
 * Map of chapters by ID for O(1) lookup
 */
export const CHAPTERS_BY_ID = new Map<ChapterId, ChapterDef>(
  CHAPTERS.map((def) => [def.id, def])
);

/**
 * Map of missions by ID for O(1) lookup
 */
export const MISSIONS_BY_ID = new Map<MissionId, MissionDef>(
  MISSIONS.map((def) => [def.id, def])
);

/**
 * Get next mission ID in campaign
 * Returns undefined if no next mission
 */
export function getNextMissionId(
  currentMissionId: MissionId
): MissionId | undefined {
  const currentMission = MISSIONS_BY_ID.get(currentMissionId);
  if (!currentMission) {
    return undefined;
  }

  // Find mission in chapter
  for (const chapter of CHAPTERS) {
    const missionIndex = chapter.missions.indexOf(currentMissionId);
    if (missionIndex >= 0) {
      // Check if there's next mission in same chapter
      if (missionIndex < chapter.missions.length - 1) {
        return chapter.missions[missionIndex + 1];
      }
      // Check if there's next chapter
      const chapterIndex = CHAPTERS.findIndex((c) => c.id === chapter.id);
      if (chapterIndex >= 0 && chapterIndex < CHAPTERS.length - 1) {
        const nextChapter = CHAPTERS[chapterIndex + 1];
        if (nextChapter.missions.length > 0) {
          return nextChapter.missions[0];
        }
      }
      // No next mission
      return undefined;
    }
  }

  return undefined;
}
