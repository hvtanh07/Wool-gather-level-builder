// Usage: npx tsx scripts/space-boxes.ts [gap] [ids...]
// Spreads each level so neighbouring boxes have at least `gap` world units between them (default 0.14).
// Tunnels move with the boxes around them (body + the spot where a bus comes out); conveyor belts
// stay where they are and push boxes away. Writes src/data/levelPack.ts and prints what changed.
import { readFileSync, writeFileSync } from 'node:fs';
import LEVEL_PACK_RAW from '../src/data/levelPack';
import { BoxItem, CleanLevelData, TunnelSetup } from '../src/types/level';
import { getBoxCorners, getTunnelReadyBox, Point2D } from '../src/utils/collision';
import { BOX_DIMENSIONS } from '../src/utils/colors';
import { auditLevel } from '../src/utils/levelAudit';
import { normalizeCleanLevel } from '../src/utils/levelIO';

const GAP = Number(process.argv[2] || 0.14);
const only = process.argv.slice(3).map(Number);
// Levels to stretch instead of spread, because spreading changed how hard they are (checked with npm run tiers)
const STRETCH = (process.env.STRETCH ?? '28,31').split(',').filter(Boolean).map(Number);

function corners(b: BoxItem): Point2D[] {
  const c = getBoxCorners(b);
  return [c.frontLeft, c.frontRight, c.backRight, c.backLeft];
}
function rectCorners(r: { x0: number; x1: number; z0: number; z1: number }): Point2D[] {
  return [{ x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 }, { x: r.x1, z: r.z1 }, { x: r.x0, z: r.z1 }];
}

/** Largest separation over the edge axes (negative = overlap) and that axis, pointing from a to b. */
function separation(pa: Point2D[], pb: Point2D[]): { sep: number; ax: Point2D } {
  let best = { sep: -Infinity, ax: { x: 1, z: 0 } };
  const ca = pa.reduce((s, p) => ({ x: s.x + p.x / 4, z: s.z + p.z / 4 }), { x: 0, z: 0 });
  const cb = pb.reduce((s, p) => ({ x: s.x + p.x / 4, z: s.z + p.z / 4 }), { x: 0, z: 0 });
  for (const poly of [pa, pb]) {
    for (let i = 0; i < 2; i++) {
      const e = { x: poly[i + 1].x - poly[i].x, z: poly[i + 1].z - poly[i].z };
      const len = Math.hypot(e.x, e.z) || 1;
      let ax = { x: -e.z / len, z: e.x / len };
      if ((cb.x - ca.x) * ax.x + (cb.z - ca.z) * ax.z < 0) ax = { x: -ax.x, z: -ax.z };
      const A = pa.map((q) => q.x * ax.x + q.z * ax.z);
      const B = pb.map((q) => q.x * ax.x + q.z * ax.z);
      const sep = Math.min(...B) - Math.max(...A);
      if (sep > best.sep) best = { sep, ax };
    }
  }
  return best;
}

interface Body {
  polys: () => Point2D[][];
  move: (dx: number, dz: number) => void;
  fixed: boolean;
}

function boxBody(b: BoxItem): Body {
  return { fixed: false, polys: () => [corners(b)], move: (dx, dz) => { b.x += dx; b.z += dz; } };
}
function tunnelBody(t: TunnelSetup): Body {
  return {
    fixed: false,
    polys: () => {
      const body: BoxItem = { id: 0, x: t.x, z: t.z, angle: t.angle, numType: 'Box6', capacity: 0, color: 0 };
      // the spot in front of the mouth, sized for the longest bus still in the queue
      const longest = [...t.queue].sort((a, b) => BOX_DIMENSIONS[b.numType].length - BOX_DIMENSIONS[a.numType].length)[0];
      const ready = longest ? getTunnelReadyBox({ ...t, queue: [longest] }) : null;
      return ready ? [corners(body), corners(ready)] : [corners(body)];
    },
    move: (dx, dz) => {
      t.x += dx; t.z += dz;
      t.queue.forEach((q) => { q.x += dx; q.z += dz; });
    },
  };
}

export function spaceLevel(level: CleanLevelData, gap: number): { iters: number; minGap: number } {
  const bodies: Body[] = [...level.boxes.map(boxBody), ...(level.tunnels ?? []).map(tunnelBody)];
  for (const c of level.conveyors ?? []) {
    const zs = c.boxes.flatMap((b) => corners(b).map((p) => p.z));
    const band = { x0: c.startX, x1: c.endX, z0: Math.min(...zs, c.z - 0.3), z1: Math.max(...zs, c.z + 0.3) };
    bodies.push({ fixed: true, polys: () => [rectCorners(band)], move: () => {} });
  }
  let iters = 0;
  for (; iters < 3000; iters++) {
    let worst = 0;
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        if (a.fixed && b.fixed) continue;
        let s = { sep: Infinity, ax: { x: 1, z: 0 } };
        for (const pa of a.polys()) for (const pb of b.polys()) {
          const t = separation(pa, pb);
          if (t.sep < s.sep) s = t;
        }
        const need = gap - s.sep;
        if (need <= 0.0005) continue;
        worst = Math.max(worst, need);
        const step = need * 0.5 + 0.0005;
        if (a.fixed) b.move(s.ax.x * step, s.ax.z * step);
        else if (b.fixed) a.move(-s.ax.x * step, -s.ax.z * step);
        else {
          a.move((-s.ax.x * step) / 2, (-s.ax.z * step) / 2);
          b.move((s.ax.x * step) / 2, (s.ax.z * step) / 2);
        }
      }
    }
    if (worst <= 0.0005) break;
  }
  const r = (v: number) => Math.round(v * 1000) / 1000;
  level.boxes.forEach((b) => { b.x = r(b.x); b.z = r(b.z); });
  (level.tunnels ?? []).forEach((t) => { t.x = r(t.x); t.z = r(t.z); t.queue.forEach((q) => { q.x = t.x; q.z = t.z; }); });
  let minGap = Infinity;
  for (let i = 0; i < level.boxes.length; i++)
    for (let j = i + 1; j < level.boxes.length; j++)
      minGap = Math.min(minGap, separation(corners(level.boxes[i]), corners(level.boxes[j])).sep);
  return { iters, minGap };
}

function minBoxGap(level: CleanLevelData): number {
  let m = Infinity;
  for (let i = 0; i < level.boxes.length; i++)
    for (let j = i + 1; j < level.boxes.length; j++)
      m = Math.min(m, separation(corners(level.boxes[i]), corners(level.boxes[j])).sep);
  return m;
}

export function errors(level: CleanLevelData): string[] {
  return auditLevel(normalizeCleanLevel(JSON.parse(JSON.stringify(level)))).filter((i) => i.severity === 'error').map((i) => i.message);
}

/** Stretches the layout around its centre (x and z separately). Keeps rows and corridors as they are,
 * so a level that is solvable stays solvable. Picks the smallest stretch that reaches the gap. */
export function stretchLevel(level: CleanLevelData, gap: number): { sx: number; sz: number; minGap: number } | null {
  const orig = JSON.stringify(level);
  const e0 = extent(level);
  const cx = (e0.x0 + e0.x1) / 2;
  const cz = (e0.z0 + e0.z1) / 2;
  let best: { sx: number; sz: number; minGap: number; score: number } | null = null;
  for (let sx = 1; sx <= 1.4001; sx += 0.02) {
    for (let sz = 1; sz <= 1.4001; sz += 0.02) {
      const l = JSON.parse(orig) as CleanLevelData;
      const r = (v: number) => Math.round(v * 1000) / 1000;
      l.boxes.forEach((b) => { b.x = r(cx + (b.x - cx) * sx); b.z = r(cz + (b.z - cz) * sz); });
      (l.tunnels ?? []).forEach((t) => {
        t.x = r(cx + (t.x - cx) * sx); t.z = r(cz + (t.z - cz) * sz);
        t.queue.forEach((q) => { q.x = t.x; q.z = t.z; });
      });
      const e = extent(l);
      if (e.x0 < -3.5 || e.x1 > 3.5 || e.z1 > 1.2 || e.z0 < -6.5) continue;
      const g = minBoxGap(l);
      // reach the gap with the least stretch; otherwise get as close as possible
      const score = (g >= gap - 0.001 ? 0 : 10 * (gap - g)) + (sx - 1) + (sz - 1);
      if (best && score >= best.score) continue;
      if (errors(l).length) continue;
      best = { sx, sz, minGap: g, score };
      Object.assign(level, l);
    }
  }
  if (!best) Object.assign(level, JSON.parse(orig));
  return best;
}

export function extent(level: CleanLevelData) {
  const ps = [
    ...level.boxes.flatMap(corners),
    ...(level.tunnels ?? []).flatMap((t) => tunnelBody(t).polys().flat()),
  ];
  return {
    x0: Math.min(...ps.map((p) => p.x)), x1: Math.max(...ps.map((p) => p.x)),
    z0: Math.min(...ps.map((p) => p.z)), z1: Math.max(...ps.map((p) => p.z)),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pack = JSON.parse(JSON.stringify(LEVEL_PACK_RAW)) as CleanLevelData[];
  for (const level of pack) {
    if (only.length && !only.includes(level.levelId)) continue;
    const before = extent(level);
    const orig = JSON.stringify(level);
    let gap = GAP;
    let res = spaceLevel(level, gap);
    let e = extent(level);
    // Too wide for the board: centre it, and use a slightly smaller gap if it still does not fit.
    const fits = () => e.x1 - e.x0 <= 6.98 && e.z1 - e.z0 <= 7.68;
    while (!fits() && gap > 0.1) {
      Object.assign(level, JSON.parse(orig));
      gap = Math.round((gap - 0.01) * 100) / 100;
      res = spaceLevel(level, gap);
      e = extent(level);
    }
    const dx = e.x0 < -3.5 ? -3.5 - e.x0 + 0.01 : e.x1 > 3.5 ? 3.5 - e.x1 - 0.01 : 0;
    const dz = e.z1 > 1.2 ? 1.2 - e.z1 - 0.01 : e.z0 < -6.5 ? -6.5 - e.z0 + 0.01 : 0;
    if (dx || dz) {
      const r = (v: number) => Math.round(v * 1000) / 1000;
      level.boxes.forEach((b) => { b.x = r(b.x + dx); b.z = r(b.z + dz); });
      (level.tunnels ?? []).forEach((t) => { t.x = r(t.x + dx); t.z = r(t.z + dz); t.queue.forEach((q) => { q.x = t.x; q.z = t.z; }); });
      e = extent(level);
    }
    let { iters, minGap } = res;
    let how = 'spread';
    if (errors(level).length || STRETCH.includes(level.levelId)) {
      Object.assign(level, JSON.parse(orig));
      gap = GAP;
      const st = stretchLevel(level, GAP);
      how = st ? `stretch x${st.sx.toFixed(2)} z${st.sz.toFixed(2)}` : 'unchanged';
      minGap = st ? st.minGap : minBoxGap(level);
      iters = 0;
      if (minGap < GAP - 0.001) {
        // stretching could not reach the gap either: spread with the largest gap that keeps it solvable
        const stretched = JSON.stringify(level);
        for (let g = GAP - 0.01; g >= 0.0799; g -= 0.01) {
          if (g <= minGap) break;
          Object.assign(level, JSON.parse(orig));
          const sp = spaceLevel(level, g);
          if (!errors(level).length && extent(level).x1 - extent(level).x0 <= 7) {
            gap = Math.round(g * 100) / 100; minGap = sp.minGap; iters = sp.iters; how = 'spread (smaller gap)';
            break;
          }
          Object.assign(level, JSON.parse(stretched));
        }
      }
      e = extent(level);
    }
    const left = errors(level);
    const out = e.x0 < -3.5 || e.x1 > 3.5 || e.z1 > 1.2 || e.z0 < -6.5;
    console.log(
      `L${level.levelId}\t${how}${left.length ? ' ERRORS ' + left.join('; ') : ''}\titers ${iters}\tgap ${gap} (min ${minGap.toFixed(3)})\tx ${before.x0.toFixed(2)}..${before.x1.toFixed(2)} -> ${e.x0.toFixed(2)}..${e.x1.toFixed(2)}\tz ${before.z0.toFixed(2)}..${before.z1.toFixed(2)} -> ${e.z0.toFixed(2)}..${e.z1.toFixed(2)}${out ? '\tOUTSIDE BOARD' : ''}`
    );
  }
  if (process.env.WRITE) {
    const file = new URL('../src/data/levelPack.ts', import.meta.url).pathname;
    const src = readFileSync(file, 'utf8');
    writeFileSync(file, `${src.slice(0, src.indexOf('= [') + 2)}${JSON.stringify(pack)};\n\nexport default LEVEL_PACK_RAW;\n`);
  }
}
