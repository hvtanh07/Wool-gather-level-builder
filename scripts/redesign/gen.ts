// Level generator used to redesign the broken, too-hard and look-alike levels (2026-11-24).
// A level is described by a spec (shape parts, tunnels, conveyors, ice, colors, dragon style);
// the generator fills the shape with game-size boxes, picks arrow directions so the board is
// always solvable, builds the dragon from a play order, then the tuner picks the candidate whose
// bot win rates match the target difficulty.
import { BoxItem, BoxNumType, CleanLevelData, ConveyorSetup, DragonSection, TunnelSetup } from '../../src/types/level';
import { BOX_DIMENSIONS } from '../../src/utils/colors';
import { getTunnelReadyBox } from '../../src/utils/collision';
import { Board, overlapDepth } from '../../src/utils/levelAudit';
import { enforceDragonSegmentConstraints } from '../../src/utils/dragonSolver';

export type Mask = (x: number, z: number) => boolean;
export type Dir = 'in' | 'out' | 'random' | 'up' | 'down' | 'left' | 'right';

export interface Part {
  mask: Mask;
  orient: 'V' | 'H';
  /** weights of Box4, Box6, Box10 */
  w?: [number, number, number];
  dir?: Dir;
  /** for in/out: chance to point in */
  pin?: number;
  /** centre used by in/out (default: centre of all boxes) */
  c?: [number, number];
  /** grid phase 0..1 of the pitch */
  phase?: number;
  tag?: string;
  /** share of boxes dropped at random for breathing room */
  drop?: number;
}

export interface TunnelSpec {
  x: number;
  z: number;
  /** direction the bus leaves: up/down/left/right */
  out: 'up' | 'down' | 'left' | 'right';
  n: number;
  w?: [number, number, number];
}

export interface ConveyorSpec {
  z: number;
  n: number;
  dir: 'left-to-right' | 'right-to-left';
  speed?: number;
  /** angle of the boxes on the belt (0 = up) */
  angle?: number;
  w?: [number, number, number];
}

export interface Spec {
  id: number;
  name: string;
  challenge: string;
  target: number;
  parts: Part[];
  tunnels?: TunnelSpec[];
  conveyors?: ConveyorSpec[];
  /** number of ice boxes, optionally only from parts with this tag */
  ice?: number;
  iceTag?: string;
  /** prefer deep (late) boxes for ice */
  iceDeep?: boolean;
  colors: number;
  /** 0..1 spatial clustering of colors */
  cluster?: number;
  /** dragon chunk size range */
  chunk: [number, number];
  /** order noise, as a share of the box count */
  sigma?: number[];
  /** tags whose wool goes to the back of the dragon (decoys) */
  late?: string[];
  minExpert?: number;
}

export const PITCH = 0.66;
const GAP = 0.03;
const TYPES: BoxNumType[] = ['Box4', 'Box6', 'Box10'];
const CAP: Record<BoxNumType, number> = { Box4: 4, Box6: 6, Box10: 10 };

// ---------------------------------------------------------------------------
// masks
export const rect = (x1: number, z1: number, x2: number, z2: number): Mask => (x, z) =>
  x >= Math.min(x1, x2) - 1e-6 && x <= Math.max(x1, x2) + 1e-6 && z >= Math.min(z1, z2) - 1e-6 && z <= Math.max(z1, z2) + 1e-6;
export const circle = (cx: number, cz: number, r: number): Mask => (x, z) => Math.hypot(x - cx, z - cz) <= r + 1e-6;
export const diamond = (cx: number, cz: number, r: number): Mask => (x, z) => Math.abs(x - cx) + Math.abs(z - cz) <= r + 1e-6;
export const union = (...m: Mask[]): Mask => (x, z) => m.some((f) => f(x, z));
export const diff = (a: Mask, ...b: Mask[]): Mask => (x, z) => a(x, z) && !b.some((f) => f(x, z));
export const inter = (...m: Mask[]): Mask => (x, z) => m.every((f) => f(x, z));
export const poly = (pts: [number, number][]): Mask => (x, z) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};

// ---------------------------------------------------------------------------
export function rng32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickW = (w: number[], r: () => number) => {
  const tot = w.reduce((a, b) => a + b, 0);
  let x = r() * tot;
  for (let i = 0; i < w.length; i++) {
    x -= w[i];
    if (x <= 0) return i;
  }
  return w.length - 1;
};
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());

type GBox = BoxItem & { tag?: string; part: number };

function footprintInside(b: BoxItem, m: Mask) {
  const d = BOX_DIMENSIONS[b.numType];
  const vert = b.angle === 0 || b.angle === 180;
  const hx = (vert ? d.width : d.length) / 2 - 0.02;
  const hz = (vert ? d.length : d.width) / 2 - 0.02;
  for (const [sx, sz] of [
    [-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0], [0, 1], [0, -1], [1, 0], [-1, 0],
  ])
    if (!m(b.x + sx * hx, b.z + sz * hz)) return false;
  return true;
}

const hits = (b: BoxItem, others: BoxItem[], tol = 0.015) => others.some((o) => overlapDepth(b, o) > tol);

function tunnelAngle(out: TunnelSpec['out']) {
  // the bus leaves at tunnel.angle + 180
  return { up: 180, down: 0, left: 90, right: 270 }[out];
}

export function reservedFor(tunnels: TunnelSetup[], conveyors: ConveyorSetup[]): BoxItem[] {
  const res: BoxItem[] = [];
  for (const t of tunnels) {
    res.push({ id: -1, x: t.x, z: t.z, angle: t.angle, numType: 'Box6', capacity: 0, color: 0 });
    for (const q of t.queue) res.push({ ...getTunnelReadyBox({ ...t, queue: [q] })!, id: -2 });
  }
  for (const c of conveyors) {
    for (let x = -3.4; x <= 3.4; x += 0.6) res.push({ id: -3, x, z: c.boxes[0]?.z ?? c.z, angle: 0, numType: 'Box10', capacity: 0, color: 0 });
  }
  return res;
}

function fillPart(part: Part, pi: number, r: () => number, placed: GBox[], reserved: BoxItem[]) {
  const w = part.w ?? [3, 3, 2];
  const phase = (part.phase ?? 0) * PITCH;
  const out: GBox[] = [];
  const lines: number[] = [];
  for (let k = -12; k <= 12; k++) lines.push(k * PITCH + phase);
  for (const line of lines) {
    let cur = 1.5; // walk from top (z) or left (x)
    const end = part.orient === 'V' ? -6.5 : 3.6;
    if (part.orient === 'H') cur = -3.6;
    while (part.orient === 'V' ? cur > end : cur < end) {
      const order = [pickW(w, r), 0, 1, 2];
      let done = false;
      for (const ti of order) {
        const t = TYPES[ti];
        const L = BOX_DIMENSIONS[t].length;
        const b: GBox =
          part.orient === 'V'
            ? { id: 0, x: line, z: cur - L / 2, angle: 0, numType: t, capacity: CAP[t], color: 1, boxType: 'Normal', part: pi, tag: part.tag }
            : { id: 0, x: cur + L / 2, z: line, angle: 90, numType: t, capacity: CAP[t], color: 1, boxType: 'Normal', part: pi, tag: part.tag };
        if (!footprintInside(b, part.mask)) continue;
        if (hits(b, placed) || hits(b, out) || hits(b, reserved, 0.0)) continue;
        out.push(b);
        cur = part.orient === 'V' ? cur - L - GAP : cur + L + GAP;
        done = true;
        break;
      }
      if (!done) cur = part.orient === 'V' ? cur - 0.11 : cur + 0.11;
    }
  }
  const drop = part.drop ?? 0;
  return out.filter(() => r() >= drop);
}

function dirFor(b: GBox, part: Part, c: [number, number], r: () => number) {
  const vert = part.orient === 'V';
  const mode = part.dir ?? 'random';
  if (mode === 'up') return 0;
  if (mode === 'down') return 180;
  if (mode === 'left') return 270;
  if (mode === 'right') return 90;
  if (mode === 'random') return vert ? (r() < 0.5 ? 0 : 180) : r() < 0.5 ? 90 : 270;
  const cc = part.c ?? c;
  const inward = mode === 'in' ? r() < (part.pin ?? 0.8) : r() < (part.pin ?? 0.2);
  if (vert) {
    const towardC = b.z > cc[1] ? 180 : 0;
    return inward ? towardC : (towardC + 180) % 360;
  }
  const towardC = b.x > cc[0] ? 270 : 90;
  return inward ? towardC : (towardC + 180) % 360;
}

export interface Layout {
  boxes: GBox[];
  tunnels: TunnelSetup[];
  conveyors: ConveyorSetup[];
  order: { box: BoxItem; round: number; tag?: string }[];
}

function makeLevelShell(boxes: BoxItem[], tunnels: TunnelSetup[], conveyors: ConveyorSetup[]): CleanLevelData {
  return {
    version: '1.0',
    levelId: 0,
    levelType: 'Normal',
    camera: { cameraSize: 7.796, boxRootX: 0, boxRootZ: -1.597, boxRootAngle: 0, boxRootDisperse: -0.039 },
    slots: { count: 4, unlockedCount: 4 },
    dragon: { speed: 0.015, track: [], catPositions: [], sections: [] },
    boxes,
    tunnels,
    conveyors,
  };
}

/** Takes everything out in rounds (all free items each round, ice cracked when stuck). */
export function peel(level: CleanLevelData) {
  const board = new Board(level);
  const order: { box: BoxItem; round: number }[] = [];
  let round = 0;
  let guard = 0;
  while (!board.empty && guard++ < 400) {
    const free = board.pickable();
    if (!free.length) {
      if (board.crackIce()) {
        round++;
        continue;
      }
      return { ok: false, order, stuck: board.boxes.map((b) => b.id), rounds: round };
    }
    for (const f of free) {
      order.push({ box: { ...f.box }, round });
      f.take();
    }
    round++;
  }
  return { ok: board.empty, order, stuck: board.boxes.map((b) => b.id), rounds: round };
}

export function buildLayout(spec: Spec, seed: number): Layout | null {
  const r = rng32(seed);
  // tunnels and conveyors first, so boxes keep clear of them
  let nid = 1;
  const tunnels: TunnelSetup[] = (spec.tunnels ?? []).map((t, i) => {
    const angle = tunnelAngle(t.out);
    const queue: BoxItem[] = [];
    for (let k = 0; k < t.n; k++) {
      const ty = TYPES[pickW(t.w ?? [3, 4, 2], r)];
      queue.push({ id: 1000 + i * 100 + k + 1, x: t.x, z: t.z, angle: (angle + 180) % 360, numType: ty, capacity: CAP[ty], color: 1, boxType: 'Normal' });
    }
    return { id: i + 1, x: t.x, z: t.z, angle, queue };
  });
  const conveyors: ConveyorSetup[] = (spec.conveyors ?? []).map((c, i) => {
    const boxes: BoxItem[] = [];
    const span = 9;
    const step = span / c.n;
    for (let k = 0; k < c.n; k++) {
      const ty = TYPES[pickW(c.w ?? [3, 3, 2], r)];
      boxes.push({ id: 2000 + i * 100 + k + 1, x: Number((-4.5 + step * (k + 0.5)).toFixed(3)), z: Number((c.z + 0.2).toFixed(3)), angle: c.angle ?? 0, numType: ty, capacity: CAP[ty], color: 1, boxType: 'Normal' });
    }
    return { id: i + 1, z: c.z, startX: -4.5, endX: 4.5, activeZoneMinX: -2.6, activeZoneMaxX: 2.6, direction: c.dir, speed: c.speed ?? 0.6, boxes };
  });
  const reserved = reservedFor(tunnels, conveyors);
  const placed: GBox[] = [];
  spec.parts.forEach((p, pi) => {
    if (p.phase !== undefined) {
      placed.push(...fillPart(p, pi, r, placed, reserved));
      return;
    }
    // try grid phases, keep the one that fits the most wool
    let best: GBox[] = [];
    let bestW = -1;
    for (let k = 0; k < 10; k++) {
      const rr = rng32(seed * 31 + pi * 7 + k);
      const got = fillPart({ ...p, phase: k / 10 }, pi, rr, placed, reserved);
      const wsum = got.reduce((a, b) => a + b.capacity, 0) + got.length * 2;
      if (wsum > bestW) {
        bestW = wsum;
        best = got;
      }
    }
    placed.push(...best);
  });
  if (placed.length < 6) return null;
  placed.forEach((b) => (b.id = nid++));
  const cx = (Math.min(...placed.map((b) => b.x)) + Math.max(...placed.map((b) => b.x))) / 2;
  const cz = (Math.min(...placed.map((b) => b.z)) + Math.max(...placed.map((b) => b.z))) / 2;
  placed.forEach((b) => (b.angle = dirFor(b, spec.parts[b.part], [cx, cz], r)));

  // repair: flip stuck boxes until everything can leave
  for (let it = 0; it < 400; it++) {
    const res = peel(makeLevelShell(placed, tunnels, conveyors));
    if (res.ok) break;
    const stuck = placed.filter((b) => res.stuck.includes(b.id));
    if (!stuck.length) return null; // tunnel or conveyor stuck behind nothing we can flip
    const b = stuck[Math.floor(r() * stuck.length)];
    b.angle = (b.angle + 180) % 360;
    if (it === 399) return null;
  }

  // ice: boxes that some other box runs into first
  if (spec.ice) {
    const base = peel(makeLevelShell(placed, tunnels, conveyors));
    const roundOf = new Map(base.order.map((o) => [o.box.id, o.round]));
    let cands = placed.filter((b) => !spec.iceTag || b.tag === spec.iceTag);
    cands = cands.sort((a, b) => (spec.iceDeep ? (roundOf.get(b.id) ?? 0) - (roundOf.get(a.id) ?? 0) : 0) || r() - 0.5);
    let made = 0;
    for (const c of cands) {
      if (made >= spec.ice) break;
      c.boxType = 'Ice';
      const res = peel(makeLevelShell(placed, tunnels, conveyors));
      if (!res.ok) c.boxType = 'Normal';
      else made++;
    }
  }
  const fin = peel(makeLevelShell(placed, tunnels, conveyors));
  if (!fin.ok) return null;
  const tagOf = new Map(placed.map((b) => [b.id, b.tag]));
  return { boxes: placed, tunnels, conveyors, order: fin.order.map((o) => ({ ...o, tag: tagOf.get(o.box.id) })) };
}

/** Colors for every box, tunnel bus and conveyor box. */
export function paint(spec: Spec, lay: Layout, seed: number) {
  const r = rng32(seed);
  const palette = [1, 2, 3, 4, 5, 6, 7, 8].sort(() => r() - 0.5).slice(0, spec.colors);
  const all: BoxItem[] = [...lay.boxes, ...lay.tunnels.flatMap((t) => t.queue), ...lay.conveyors.flatMap((c) => c.boxes)];
  const seeds = palette.map(() => ({ x: -2.6 + r() * 5.2, z: -5 + r() * 5 }));
  const cl = spec.cluster ?? 0.3;
  const count = new Map<number, number>();
  for (const b of all) {
    let ci: number;
    if (r() < cl) {
      let best = 0;
      let bd = Infinity;
      seeds.forEach((s, i) => {
        const d = Math.hypot(s.x - b.x, s.z - b.z);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      ci = best;
    } else {
      // least used color, a bit random
      const sorted = [...palette.keys()].sort((a, b) => (count.get(a) ?? 0) - (count.get(b) ?? 0) + (r() - 0.5) * 3);
      ci = sorted[0];
    }
    b.color = palette[ci];
    count.set(ci, (count.get(ci) ?? 0) + 1);
  }
  // every color at least two boxes
  for (let i = 0; i < palette.length; i++) {
    while ((count.get(i) ?? 0) < 2) {
      const donorIdx = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const b = all.find((x) => x.color === palette[donorIdx])!;
      b.color = palette[i];
      count.set(donorIdx, count.get(donorIdx)! - 1);
      count.set(i, (count.get(i) ?? 0) + 1);
    }
  }
  return palette;
}

function validChunks(needed: number, max: number) {
  const v: number[] = [];
  for (let c = 2; c <= Math.min(needed, max); c++) if (needed - c === 0 || needed - c >= 2) v.push(c);
  return v;
}

/** Dragon from a play order: 4 virtual slots take the boxes in order and lay their wool in chunks. */
export function buildDragon(spec: Spec, lay: Layout, sigma: number, seed: number, rev = 0): DragonSection[] {
  const r = rng32(seed);
  const n = lay.order.length;
  const idOf = (b: BoxItem) => b.id;
  // current color of each item (paint() may have changed them after peel)
  const colorOf = new Map<number, BoxItem>();
  for (const b of [...lay.boxes, ...lay.tunnels.flatMap((t) => t.queue), ...lay.conveyors.flatMap((c) => c.boxes)]) colorOf.set(b.id, b);
  const late = new Set(spec.late ?? []);
  const keyed = lay.order.map((o, i) => ({
    box: colorOf.get(idOf(o.box))!,
    // rev > 0 asks the dragon for deeper boxes first (the player has to dig)
    key: (1 - rev) * i + rev * (n - i) + gauss(r) * sigma * n + (o.tag && late.has(o.tag) ? n * 0.6 : 0),
  }));
  keyed.sort((a, b) => a.key - b.key);
  const queue = keyed.map((k) => ({ color: k.box.color, need: k.box.capacity }));
  const active: { color: number; need: number }[] = [];
  const refill = () => {
    while (active.length < 4 && queue.length) active.push(queue.shift()!);
  };
  refill();
  const raw: DragonSection[] = [];
  const [cmin, cmax] = spec.chunk;
  while (active.length) {
    const last = raw[raw.length - 1];
    const diffC = active.filter((s) => !last || s.color !== last.color);
    const pool = diffC.length ? diffC : active;
    // big chunks take the oldest slot first (easy), small chunks pick any slot (mixed)
    const s = cmax >= 8 ? pool[0] : pool[Math.floor(r() * pool.length)];
    let v = validChunks(s.need, cmax).filter((c) => c >= cmin);
    if (!v.length) v = validChunks(s.need, 10);
    const c = v[Math.floor(r() * v.length)];
    if (last && last.color === s.color && last.count + c <= 10) last.count += c;
    else raw.push({ color: s.color, count: c });
    s.need -= c;
    if (s.need <= 0) {
      active.splice(active.indexOf(s), 1);
      refill();
    } else if (cmax < 8) {
      active.splice(active.indexOf(s), 1);
      active.push(s);
    }
  }
  return enforceDragonSegmentConstraints(raw);
}

export function toLevel(lay: Layout, sections: DragonSection[]): CleanLevelData {
  const round3 = (v: number) => Number(v.toFixed(3));
  const lvl = makeLevelShell(
    lay.boxes.map((b) => ({ id: b.id, x: round3(b.x), z: round3(b.z), angle: b.angle, numType: b.numType, capacity: b.capacity, color: b.color, boxType: b.boxType ?? 'Normal' })),
    lay.tunnels.map((t) => ({ ...t, queue: t.queue.map((q) => ({ ...q })) })),
    lay.conveyors.map((c) => ({ ...c, boxes: c.boxes.map((q) => ({ ...q })) }))
  );
  lvl.dragon.sections = sections;
  return lvl;
}
