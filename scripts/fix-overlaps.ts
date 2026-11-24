// Usage: npx tsx scripts/fix-overlaps.ts [ids...]
// Pushes overlapping boxes apart (any overlap > 0.001) along the axis of least overlap, a little at a
// time, until no pair overlaps. Writes src/data/levelPack.ts and prints the levels and boxes it moved.
import { writeFileSync, readFileSync } from 'node:fs';
import LEVEL_PACK_RAW from '../src/data/levelPack';
import { BoxItem } from '../src/types/level';
import { getBoxCorners, Point2D } from '../src/utils/collision';

const EPS = 0.0002;
const GAP = 0.004;

function corners(b: BoxItem): Point2D[] {
  const c = getBoxCorners(b);
  const hw = c.width / 2;
  const hl = c.length / 2;
  const d = c.direction;
  const r = c.right;
  return [
    { x: b.x + d.x * hl - r.x * hw, z: b.z + d.z * hl - r.z * hw },
    { x: b.x + d.x * hl + r.x * hw, z: b.z + d.z * hl + r.z * hw },
    { x: b.x - d.x * hl + r.x * hw, z: b.z - d.z * hl + r.z * hw },
    { x: b.x - d.x * hl - r.x * hw, z: b.z - d.z * hl - r.z * hw },
  ];
}

/** Smallest overlap and its axis (pointing from a to b), or null when apart. */
function sat(a: BoxItem, b: BoxItem): { depth: number; ax: Point2D } | null {
  const pa = corners(a);
  const pb = corners(b);
  let best: { depth: number; ax: Point2D } | null = null;
  for (const poly of [pa, pb]) {
    for (let i = 0; i < 2; i++) {
      const e = { x: poly[i + 1].x - poly[i].x, z: poly[i + 1].z - poly[i].z };
      const len = Math.hypot(e.x, e.z) || 1;
      let ax = { x: -e.z / len, z: e.x / len };
      const proj = (p: Point2D[]) => p.map((q) => q.x * ax.x + q.z * ax.z);
      const A = proj(pa);
      const B = proj(pb);
      const depth = Math.min(Math.max(...A), Math.max(...B)) - Math.max(Math.min(...A), Math.min(...B));
      if (depth <= EPS) return null;
      if (!best || depth < best.depth) {
        if ((b.x - a.x) * ax.x + (b.z - a.z) * ax.z < 0) ax = { x: -ax.x, z: -ax.z };
        best = { depth, ax };
      }
    }
  }
  return best;
}

const only = process.argv.slice(2).map(Number);
const pack = JSON.parse(JSON.stringify(LEVEL_PACK_RAW)) as { levelId: number; boxes: BoxItem[] }[];
const changed: number[] = [];
for (const level of pack) {
  if (only.length && !only.includes(level.levelId)) continue;
  const start = new Map(level.boxes.map((b) => [b.id, { x: b.x, z: b.z }]));
  for (let iter = 0; iter < 500; iter++) {
    let any = false;
    for (let i = 0; i < level.boxes.length; i++) {
      for (let j = i + 1; j < level.boxes.length; j++) {
        const a = level.boxes[i];
        const b = level.boxes[j];
        const s = sat(a, b);
        if (!s) continue;
        any = true;
        const m = (s.depth + GAP) / 2;
        a.x -= s.ax.x * m; a.z -= s.ax.z * m;
        b.x += s.ax.x * m; b.z += s.ax.z * m;
      }
    }
    if (!any) break;
  }
  const moved = level.boxes.filter((b) => {
    b.x = Math.round(b.x * 1000) / 1000;
    b.z = Math.round(b.z * 1000) / 1000;
    const o = start.get(b.id)!;
    return Math.abs(o.x - b.x) > 1e-9 || Math.abs(o.z - b.z) > 1e-9;
  });
  if (moved.length) {
    changed.push(level.levelId);
    const maxMove = Math.max(...moved.map((b) => Math.hypot(b.x - start.get(b.id)!.x, b.z - start.get(b.id)!.z)));
    console.log(`L${level.levelId}: moved ${moved.length} boxes, max ${maxMove.toFixed(3)}`);
  }
}
const file = new URL('../src/data/levelPack.ts', import.meta.url).pathname;
const src = readFileSync(file, 'utf8');
const head = src.slice(0, src.indexOf('= [') + 2);
writeFileSync(file, `${head}${JSON.stringify(pack)};\n\nexport default LEVEL_PACK_RAW;\n`);
console.log('changed', changed.join(','));
