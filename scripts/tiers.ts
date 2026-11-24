// Usage: npx tsx scripts/tiers.ts [levels.json] — bot win rate per skill tier for every level
import { readFileSync } from 'node:fs';
import LEVEL_PACK_RAW from '../src/data/levelPack';
import { normalizeCleanLevel } from '../src/utils/levelIO';
import { CleanLevelData } from '../src/types/level';
import { botTiers, difficultyScore } from '../src/utils/levelAudit';

const src = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : LEVEL_PACK_RAW;
const levels: CleanLevelData[] = (src as CleanLevelData[]).map((l) => normalizeCleanLevel(JSON.parse(JSON.stringify(l))));
const runs = Number(process.env.RUNS || 40);
const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
for (const l of levels) {
  if (only && !only.includes(l.levelId)) continue;
  const t = botTiers(l, runs);
  console.log(
    [l.levelId, l.levelType, ...t.map((x) => Math.round(x.winRate * 100)), difficultyScore(t)].join('\t')
  );
}
