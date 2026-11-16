import { CleanLevelData, LegacyLvMap } from '../types/level';
import { convertLegacyLvMapToClean, DEFAULT_TRACK, DEFAULT_CAT_POSITIONS } from '../data/demoLevel';

const isPointList = (v: unknown): boolean =>
  Array.isArray(v) &&
  v.length >= 2 &&
  v.every((p) => p && typeof p.x === 'number' && typeof p.y === 'number');

// Fill in dragon fields the builder needs but the imported JSON lacks or stores
// in another shape (e.g. "track": 2 instead of a list of points, or no
// "catPositions"). Without this, Playtest crashes and the page goes blank.
// A numeric track is kept as dragon.trackId so the value is not lost on export.
export function normalizeCleanLevel(level: CleanLevelData): CleanLevelData {
  const dragon = (level.dragon ?? {}) as Partial<CleanLevelData['dragon']> & { track?: unknown };
  const rawTrack = dragon.track;
  const trackId =
    typeof rawTrack === 'number' ? rawTrack : typeof dragon.trackId === 'number' ? dragon.trackId : undefined;
  return {
    ...level,
    tunnels: Array.isArray(level.tunnels) ? level.tunnels : [],
    conveyors: Array.isArray(level.conveyors) ? level.conveyors : [],
    dragon: {
      ...dragon,
      ...(trackId !== undefined ? { trackId } : {}),
      speed: typeof dragon.speed === 'number' ? dragon.speed : 0.015,
      track: isPointList(rawTrack)
        ? (rawTrack as CleanLevelData['dragon']['track'])
        : DEFAULT_TRACK.map((p) => ({ ...p })),
      catPositions: Array.isArray(dragon.catPositions)
        ? dragon.catPositions
        : DEFAULT_CAT_POSITIONS.map((c) => ({ ...c })),
      sections: Array.isArray(dragon.sections) ? dragon.sections : [],
    },
  };
}

function toCleanLevel(parsed: unknown): CleanLevelData {
  const obj = parsed as { boxes?: unknown[] };
  if (!obj || !Array.isArray(obj.boxes)) {
    throw new Error('Unrecognized JSON format. Must contain a "boxes" array.');
  }
  // Legacy format (boxes with pos.x, numType etc.)
  if (obj.boxes.length > 0 && (obj.boxes[0] as { pos?: unknown }).pos) {
    return convertLegacyLvMapToClean(parsed as LegacyLvMap);
  }
  return normalizeCleanLevel(parsed as CleanLevelData);
}

export function parseLevelJson(jsonText: string): CleanLevelData {
  return toCleanLevel(JSON.parse(jsonText));
}

/**
 * Parses either a single level, an array of levels, or a level pack object
 * ({ levels: [...] }) into a list of clean levels.
 */
export function parseLevelListJson(jsonText: string): CleanLevelData[] {
  const parsed = JSON.parse(jsonText);
  if (Array.isArray(parsed)) return parsed.map(toCleanLevel);
  if (parsed && Array.isArray(parsed.levels)) return parsed.levels.map(toCleanLevel);
  return [toCleanLevel(parsed)];
}
