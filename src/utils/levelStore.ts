import { CleanLevelData } from '../types/level';
import LEVEL_PACK_RAW from '../data/levelPack';
import { normalizeCleanLevel } from './levelIO';

const STORAGE_KEY = 'wool-gather-level-list-v1';

export interface LevelListState {
  levels: CleanLevelData[];
  activeIndex: number;
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
        const levels = saved.levels.map(normalizeCleanLevel);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota / private mode errors; the list still works for this session.
  }
}
