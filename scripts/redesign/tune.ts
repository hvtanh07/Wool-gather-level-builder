// Usage: npx tsx scripts/redesign/tune.ts [ids]   (e.g. 8,11)  → scripts/redesign/out/<id>.json + .svg
// Builds candidates for each spec and keeps the one whose bot tiers match the target difficulty.
import { mkdirSync, writeFileSync } from 'node:fs';
import LEVEL_PACK_RAW from '../../src/data/levelPack';
import { CleanLevelData } from '../../src/types/level';
import { normalizeCleanLevel } from '../../src/utils/levelIO';
import { auditLevel, botTiers, difficultyScore, layoutSimilarity } from '../../src/utils/levelAudit';
import { buildDragon, buildLayout, paint, toLevel } from './gen';
import { SPECS } from './specs';
import { levelSvg } from './svg';

const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const pack = LEVEL_PACK_RAW as CleanLevelData[];
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
const LAYOUTS = Number(process.env.LAYOUTS || 4);
const COMBOS: [number, number][] = [[0, 0], [0.1, 0], [0.25, 0], [0.1, 0.3], [0.15, 0.5], [0.1, 0.7]];

/** Copies the original level's settings (camera, slots, speed, track id) onto a generated level. */
function withMeta(gen: CleanLevelData, orig: CleanLevelData): CleanLevelData {
  const o = JSON.parse(JSON.stringify(orig));
  return {
    ...gen,
    levelId: o.levelId,
    levelType: o.levelType,
    camera: o.camera,
    slots: o.slots,
    dragon: { speed: o.dragon.speed, track: o.dragon.track, sections: gen.dragon.sections } as CleanLevelData['dragon'],
  };
}
const forBot = (l: CleanLevelData) => normalizeCleanLevel(JSON.parse(JSON.stringify(l)));

for (const spec of SPECS) {
  if (only && !only.includes(spec.id)) continue;
  const orig = pack.find((l) => l.levelId === spec.id)!;
  const minExpert = spec.minExpert ?? 0.95;
  type Cand = { level: CleanLevelData; score: number; expert: number; tiers: ReturnType<typeof botTiers>; seed: string };
  const cands: Cand[] = [];
  for (let ls = 1; ls <= LAYOUTS; ls++) {
    const lay = buildLayout(spec, spec.id * 1000 + ls);
    if (!lay) continue;
    for (let ps = 1; ps <= 2; ps++) {
      paint(spec, lay, spec.id * 77 + ls * 13 + ps);
      for (const [sigma, rev] of COMBOS) {
        const sections = buildDragon(spec, lay, sigma, ls * 31 + ps * 7 + Math.round(sigma * 100), rev);
        const level = withMeta(toLevel(lay, sections), orig);
        if (auditLevel(forBot(level)).some((i) => i.severity === 'error')) continue;
        const tiers = botTiers(forBot(level), 8, 11);
        const score = difficultyScore(tiers);
        cands.push({ level, score, expert: tiers[0].winRate, tiers, seed: `${ls}/${ps}/${sigma}/${rev}` });
      }
    }
  }
  if (!cands.length) {
    console.log(spec.id, 'NO CANDIDATE');
    continue;
  }
  const ok = cands.filter((c) => c.expert >= minExpert);
  console.error(spec.id, "score range (expert ok):", Math.min(...ok.map((c) => c.score)), "-", Math.max(...ok.map((c) => c.score)), "all max", Math.max(...cands.map((c) => c.score)));
  // an average player must still win some games (hard, never impossible)
  const rank = (c: Cand) => Math.abs(c.score - spec.target) + (c.expert < minExpert ? 5 : 0) + (c.tiers[2].winRate < 0.1 ? 1 : 0);
  cands.sort((a, b) => rank(a) - rank(b));
  // confirm the best few with more runs
  let best: Cand | null = null;
  let bestRank = Infinity;
  for (const c of cands.slice(0, Number(process.env.CONFIRM || 4))) {
    const tiers = botTiers(forBot(c.level), 30, 5);
    const score = difficultyScore(tiers);
    const r = Math.abs(score - spec.target) + (tiers[0].winRate < minExpert ? 5 : 0) + (tiers[1].winRate < minExpert - 0.15 ? 1 : 0) + (tiers[2].winRate < 0.15 ? 3 : 0);
    if (process.env.DEBUG) console.error("  confirm", c.seed, score, tiers.map((t) => Math.round(t.winRate * 100)).join("/"), r.toFixed(2));
    if (r < bestRank) {
      bestRank = r;
      best = { ...c, tiers, score, expert: tiers[0].winRate };
    }
  }
  const b = best!;
  const sims = pack
    .filter((l) => l.levelId !== spec.id)
    .map((l) => ({ id: l.levelId, s: layoutSimilarity(forBot(b.level), forBot(l)) }))
    .sort((x, y) => y.s - x.s)[0];
  writeFileSync(`${OUT}${spec.id}.json`, JSON.stringify(b.level, null, 2));
  writeFileSync(`${OUT}${spec.id}.svg`, levelSvg(b.level, `L${spec.id} ${spec.name}`));
  console.log(
    [spec.id, spec.name, `target ${spec.target}`, `score ${b.score}`, b.tiers.map((t) => Math.round(t.winRate * 100)).join('/'),
      `boxes ${b.level.boxes.length}`, `ice ${b.level.boxes.filter((x) => x.boxType === 'Ice').length}`,
      `wool ${b.level.dragon.sections.reduce((a, s) => a + s.count, 0)}`, `cands ${cands.length}`, `seed ${b.seed}`, `sim L${sims.id} ${sims.s.toFixed(2)}`].join(' | ')
  );
}
