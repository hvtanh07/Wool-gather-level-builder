// Usage: npx tsx scripts/audit-levels.ts [levels.json] > report.json
// Checks every level with the game-matched box sizes and prints a JSON report.
import { readFileSync } from 'node:fs';
import LEVEL_PACK_RAW from '../src/data/levelPack';
import { normalizeCleanLevel } from '../src/utils/levelIO';
import { CleanLevelData } from '../src/types/level';
import { auditLevel, botEstimate, layoutSimilarity } from '../src/utils/levelAudit';
import { BOX_DIMENSIONS } from '../src/utils/colors';

// OLD_SIZES=1 re-runs the checks with the builder's previous box sizes, for comparison
if (process.env.OLD_SIZES) {
  BOX_DIMENSIONS.Box4.width = BOX_DIMENSIONS.Box6.width = BOX_DIMENSIONS.Box10.width = 0.54;
  BOX_DIMENSIONS.Box4.length = 0.54;
  BOX_DIMENSIONS.Box6.length = 0.76;
  BOX_DIMENSIONS.Box10.length = 0.98;
}

const src = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : LEVEL_PACK_RAW;
const levels: CleanLevelData[] = (src as CleanLevelData[]).map((l) => normalizeCleanLevel(JSON.parse(JSON.stringify(l))));
const runs = Number(process.env.RUNS || 40);

const report = levels.map((l) => {
  const issues = auditLevel(l);
  const bot = botEstimate(l, runs);
  return {
    levelId: l.levelId,
    levelType: l.levelType,
    boxes: l.boxes.length,
    tunnels: l.tunnels?.length || 0,
    conveyors: l.conveyors?.length || 0,
    ice: l.boxes.filter((b) => b.boxType === 'Ice').length,
    wool: l.dragon.sections.reduce((a, s) => a + s.count, 0),
    issues,
    bot,
  };
});

const similar: { a: number; b: number; sim: number }[] = [];
for (let i = 0; i < levels.length; i++)
  for (let j = i + 1; j < levels.length; j++) {
    const sim = layoutSimilarity(levels[i], levels[j]);
    if (sim >= Number(process.env.SIM || 0.35)) similar.push({ a: levels[i].levelId, b: levels[j].levelId, sim: Number(sim.toFixed(2)) });
  }
similar.sort((x, y) => y.sim - x.sim);
console.log(JSON.stringify({ report, similar }, null, 1));
