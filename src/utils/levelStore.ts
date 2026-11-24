import { CleanLevelData } from '../types/level';
import LEVEL_PACK_RAW from '../data/levelPack';
import { normalizeCleanLevel } from './levelIO';
import { LEVEL_NOTES } from '../data/levelNotes';

const STORAGE_KEY = 'wool-gather-level-list-v1';
// Bump when the built-in pack changes. A list saved with an older pack gets the redesigned levels
// swapped in (other levels and edits stay); the old list is kept under a backup key.
const PACK_VERSION = '2026-11-24';

export interface LevelListState {
  levels: CleanLevelData[];
  activeIndex: number;
  packVersion?: string;
}

export function getDefaultLevelPack(): CleanLevelData[] {
  return LEVEL_PACK_RAW.map((l) => normalizeCleanLevel(JSON.parse(JSON.stringify(l)) as CleanLevelData));
}

/** Loads the saved level list from this browser, or the built-in 40-level pack. */
export function loadLevelList(): LevelListState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as LevelListState;
      if (Array.isArray(saved.levels) && saved.levels.length > 0) {
        let levels = saved.levels.map(normalizeCleanLevel);
        if (saved.packVersion !== PACK_VERSION) {
          localStorage.setItem(`${STORAGE_KEY}-backup-${saved.packVersion ?? 'old'}`, raw);
          const pack = getDefaultLevelPack();
          levels = levels.map((l) =>
            LEVEL_NOTES[l.levelId]?.redesigned ? pack.find((p) => p.levelId === l.levelId) ?? l : l
          );
        }
        const activeIndex = Math.min(Math.max(0, saved.activeIndex | 0), levels.length - 1);
        return { levels, activeIndex };
      }
    }
  } catch {
    // Storage unavailable or corrupt: fall back to the built-in pack.
  }
  return { levels: getDefaultLevelPack(), activeIndex: 0 };
}

export function saveLevelList(state: LevelListState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, packVersion: PACK_VERSION }));
  } catch {
    // Ignore quota / private mode errors; the list still works for this session.
  }
}
