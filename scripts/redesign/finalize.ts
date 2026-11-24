// Usage: npx tsx scripts/redesign/finalize.ts
// Puts the tuned levels (scripts/redesign/out/<id>.json) into src/data/levelPack.ts in the sheet's format,
// writes src/data/levelNotes.ts, and writes scripts/redesign/out/report.json (bot tiers for all levels).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import LEVEL_PACK_RAW from '../../src/data/levelPack';
import { CleanLevelData } from '../../src/types/level';
import { normalizeCleanLevel } from '../../src/utils/levelIO';
import { auditLevel, botTiers, difficultyScore, layoutSimilarity } from '../../src/utils/levelAudit';
import { SPECS } from './specs';
import { levelSvg } from './svg';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = new URL('./out/', import.meta.url).pathname;
const pack = JSON.parse(JSON.stringify(LEVEL_PACK_RAW)) as CleanLevelData[];

// Notes for the levels that were kept as they were
const KEPT: Record<number, { name: string; challenge: string }> = {
  1: { name: 'Tutorial', challenge: '6 box, 3 màu: học luật đường ra và slot' },
  2: { name: 'Kim cương đối xứng', challenge: 'Box hướng ra 4 phía, 7 màu, tập chọn màu theo đầu rồng' },
  3: { name: 'Khung Box10', challenge: 'Nhiều Box10 chiếm slot lâu; mở khóa booster Remove' },
  4: { name: 'Khối nhỏ hai cánh', challenge: 'Box ngang hai bên mở dần vào giữa' },
  5: { name: 'Khối lớn 7 màu', challenge: 'Khối rộng hơn, nhiều màu hơn, nhịp nhanh hơn' },
  6: { name: 'Khối đặc 49 box', challenge: 'Nhiều tầng box, kiểm tra kỹ năng trước khi có element; mở khóa Shuffle' },
  7: { name: 'Giới thiệu Tunnel', challenge: '1 tunnel giữa khối nhỏ: lấy bus ở miệng để bus sau ra' },
  9: { name: 'Khung vuông rỗng', challenge: 'Khung 43 box quanh lỗ giữa, 4 màu; mở khóa Boost' },
  12: { name: 'Giới thiệu Conveyor', challenge: 'Băng chuyền chạy dưới khối box, chỉ lấy box trong vùng giữa' },
  16: { name: 'Hoa văn 8 hướng', challenge: 'Box xoay 45°, đường ra chéo' },
  17: { name: 'Giới thiệu Frozen Box', challenge: 'Lưới Box6 hướng lên, hàng trên đóng băng: bắn box bên dưới vào để phá' },
  18: { name: 'Luyện phá băng', challenge: 'Khối nhỏ với 5 box băng ở hai bên' },
  32: { name: 'Băng chuyền trên', challenge: 'Băng chuyền ở trên, khối bên dưới hướng xuống và ngang' },
  36: { name: 'Kim cương 45°', challenge: 'Khối kim cương xoay chéo, đường ra theo đường chéo' },
  39: { name: 'Hai tháp song song', challenge: 'Hai cột tháp nhiều Box10, nghỉ trước level cuối' },
};

const replaced = new Set<number>();
for (const spec of SPECS) {
  const f = `${OUT}${spec.id}.json`;
  if (!existsSync(f)) {
    console.error('missing', f);
    continue;
  }
  const gen = JSON.parse(readFileSync(f, 'utf8')) as CleanLevelData;
  const i = pack.findIndex((l) => l.levelId === spec.id);
  const orig = pack[i];
  // sheet format: same key order, track kept as the original track id, no catPositions
  pack[i] = {
    version: '1.0',
    levelId: orig.levelId,
    levelType: orig.levelType,
    camera: orig.camera,
    slots: orig.slots,
    dragon: { speed: orig.dragon.speed, track: orig.dragon.track, sections: gen.dragon.sections },
    boxes: gen.boxes,
    tunnels: gen.tunnels ?? [],
    conveyors: gen.conveyors ?? [],
  } as unknown as CleanLevelData;
  replaced.add(spec.id);
}

writeFileSync(
  `${ROOT}src/data/levelPack.ts`,
  `// Levels 1-40 from the "Level Data" tab of the Wool Gather level sheet (imported 2026-11-16).
// Levels ${[...replaced].sort((a, b) => a - b).join(', ')} were redesigned on 2026-11-24 (scripts/redesign).
// Raw sheet format: dragon.track is a track ID number and catPositions is missing;
// normalizeCleanLevel() fills those in when the pack is loaded.
const LEVEL_PACK_RAW: unknown[] = ${JSON.stringify(pack)};

export default LEVEL_PACK_RAW;
`
);

const notes: Record<number, { name: string; challenge: string; redesigned: boolean }> = {};
for (const l of pack) {
  const s = SPECS.find((x) => x.id === l.levelId && replaced.has(x.id));
  notes[l.levelId] = s ? { name: s.name, challenge: s.challenge, redesigned: true } : { ...(KEPT[l.levelId] ?? { name: '', challenge: '' }), redesigned: false };
}
writeFileSync(
  `${ROOT}src/data/levelNotes.ts`,
  `// Design notes per level (name and the challenge it brings), shown in the Check tab.
// Written by scripts/redesign/finalize.ts.
export interface LevelNote {
  name: string;
  challenge: string;
  redesigned: boolean;
}

export const LEVEL_NOTES: Record<number, LevelNote> = ${JSON.stringify(notes, null, 2)};
`
);

// Report for every level
const runs = Number(process.env.RUNS || 40);
const norm = pack.map((l) => normalizeCleanLevel(JSON.parse(JSON.stringify(l))));
const report = norm.map((l, i) => {
  const tiers = botTiers(l, runs);
  const issues = auditLevel(l);
  let sim = { id: 0, s: 0 };
  norm.forEach((o, j) => {
    if (j === i) return;
    const s = layoutSimilarity(l, o);
    if (s > sim.s) sim = { id: o.levelId, s };
  });
  const r = {
    levelId: l.levelId,
    levelType: l.levelType,
    redesigned: replaced.has(l.levelId),
    ...notes[l.levelId],
    boxes: l.boxes.length,
    tunnels: l.tunnels?.length ?? 0,
    tunnelBuses: (l.tunnels ?? []).reduce((a, t) => a + t.queue.length, 0),
    conveyorBoxes: (l.conveyors ?? []).reduce((a, c) => a + c.boxes.length, 0),
    conveyors: l.conveyors?.length ?? 0,
    ice: l.boxes.filter((b) => b.boxType === 'Ice').length,
    colors: new Set(l.dragon.sections.map((s) => s.color)).size,
    wool: l.dragon.sections.reduce((a, s) => a + s.count, 0),
    sections: l.dragon.sections.length,
    errors: issues.filter((x) => x.severity === 'error').map((x) => x.message),
    warnings: issues.filter((x) => x.severity === 'warn').length,
    tiers: tiers.map((t) => ({ key: t.key, winRate: t.winRate })),
    difficulty: difficultyScore(tiers),
    similar: sim,
  };
  console.log([r.levelId, r.levelType, r.redesigned ? 'NEW' : '   ', r.difficulty, tiers.map((t) => Math.round(t.winRate * 100)).join('/'), `err ${r.errors.length}`, `sim L${sim.id} ${sim.s.toFixed(2)}`, r.name].join('\t'));
  return r;
});
writeFileSync(`${OUT}report.json`, JSON.stringify(report, null, 1));
for (const l of norm) writeFileSync(`${OUT}final-${l.levelId}.svg`, levelSvg(l, `L${l.levelId}${l.levelType === 'Hard' ? ' HARD' : ''} ${notes[l.levelId].name}`));
