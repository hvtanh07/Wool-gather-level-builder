// Level checks used by the Check view and by scripts/audit-levels.ts.
// They work on the box sizes in colors.ts (matched to the game build).
import { BoxItem, CleanLevelData, TunnelSetup, isBoxFrozen } from '../types/level';
import { BOX_DIMENSIONS } from './colors';
import { checkExitPath, getBoxCorners, getTunnelReadyBox, Point2D } from './collision';

export type IssueKind =
  | 'overlap'
  | 'tunnel-blocked'
  | 'wool-mismatch'
  | 'deadlock'
  | 'too-hard'
  | 'similar';

export interface AuditIssue {
  kind: IssueKind;
  severity: 'error' | 'warn';
  message: string;
  boxIds?: number[];
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

function corners(b: BoxItem, shrink = 0): Point2D[] {
  const c = getBoxCorners(b);
  const hw = c.width / 2 - shrink;
  const hl = c.length / 2 - shrink;
  const d = c.direction;
  const r = c.right;
  return [
    { x: b.x + d.x * hl - r.x * hw, z: b.z + d.z * hl - r.z * hw },
    { x: b.x + d.x * hl + r.x * hw, z: b.z + d.z * hl + r.z * hw },
    { x: b.x - d.x * hl + r.x * hw, z: b.z - d.z * hl + r.z * hw },
    { x: b.x - d.x * hl - r.x * hw, z: b.z - d.z * hl - r.z * hw },
  ];
}

/** Overlap depth of two oriented boxes (0 = touching or apart), by separating axes. */
export function overlapDepth(a: BoxItem, b: BoxItem): number {
  const pa = corners(a);
  const pb = corners(b);
  let minDepth = Infinity;
  for (const poly of [pa, pb]) {
    for (let i = 0; i < 2; i++) {
      const e = { x: poly[i + 1].x - poly[i].x, z: poly[i + 1].z - poly[i].z };
      const len = Math.hypot(e.x, e.z) || 1;
      const ax = { x: -e.z / len, z: e.x / len };
      const proj = (p: Point2D[]) => p.map((q) => q.x * ax.x + q.z * ax.z);
      const A = proj(pa);
      const B = proj(pb);
      const depth = Math.min(Math.max(...A), Math.max(...B)) - Math.max(Math.min(...A), Math.min(...B));
      if (depth <= 0) return 0;
      minDepth = Math.min(minDepth, depth);
    }
  }
  return minDepth;
}

function tunnelBody(t: TunnelSetup): BoxItem {
  return { id: -t.id * 100, x: t.x, z: t.z, angle: t.angle, numType: 'Box6', capacity: 0, color: 0 };
}

// World units. Below 0.02 is rounding in the level data; 0.02-0.05 reads as touching in the
// game (rounded corners), above 0.05 the boxes visibly overlap.
const OVERLAP_TOLERANCE = 0.02;
const OVERLAP_CLEAR = 0.05;

// ---------------------------------------------------------------------------
// Static design checks
// ---------------------------------------------------------------------------

export function checkOverlaps(level: CleanLevelData): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const boxes = level.boxes;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const d = overlapDepth(boxes[i], boxes[j]);
      if (d > OVERLAP_TOLERANCE) {
        issues.push({
          kind: 'overlap',
          severity: d > OVERLAP_CLEAR ? 'error' : 'warn',
          message: `Box #${boxes[i].id} and box #${boxes[j].id} ${d > OVERLAP_CLEAR ? 'overlap' : 'touch'} by ${d.toFixed(2)}`,
          boxIds: [boxes[i].id, boxes[j].id],
        });
      }
    }
  }
  return issues;
}

export function checkTunnels(level: CleanLevelData): AuditIssue[] {
  const issues: AuditIssue[] = [];
  for (const t of level.tunnels || []) {
    if (!t.queue?.length) continue;
    const body = tunnelBody(t);
    const ready = getTunnelReadyBox(t);
    for (const b of level.boxes) {
      const d1 = overlapDepth(body, b);
      if (d1 > OVERLAP_TOLERANCE) {
        issues.push({
          kind: 'tunnel-blocked',
          severity: 'error',
          message: `Box #${b.id} sits on tunnel #${t.id}`,
          boxIds: [b.id],
        });
      }
      if (ready) {
        // Every bus of the queue comes out at the ready spot, so check the longest one
        for (const q of t.queue) {
          const spot = { ...getTunnelReadyBox({ ...t, queue: [q] })!, id: -1 };
          const d2 = overlapDepth(spot, b);
          if (d2 > OVERLAP_TOLERANCE) {
            issues.push({
              kind: 'tunnel-blocked',
              severity: 'error',
              message: `Box #${b.id} blocks the mouth of tunnel #${t.id} (a ${q.numType} bus coming out would overlap it)`,
              boxIds: [b.id],
            });
            break;
          }
        }
      }
    }
    // Ready box pointing straight back into another tunnel or off nothing is fine; a ready box
    // whose exit is blocked only by the tunnel itself can never leave.
    if (ready) {
      const res = checkExitPath(ready, [body]);
      if (res.isBlocked) {
        issues.push({
          kind: 'tunnel-blocked',
          severity: 'error',
          message: `Tunnel #${t.id}: its bus points back into the tunnel and can never leave`,
        });
      }
    }
  }
  return issues;
}

export function woolTotals(level: CleanLevelData) {
  const boxes = new Map<number, number>();
  const add = (b: BoxItem) => boxes.set(b.color, (boxes.get(b.color) || 0) + b.capacity);
  level.boxes.forEach(add);
  (level.tunnels || []).forEach((t) => t.queue.forEach(add));
  (level.conveyors || []).forEach((c) => c.boxes.forEach(add));
  const dragon = new Map<number, number>();
  for (const s of level.dragon.sections) dragon.set(s.color, (dragon.get(s.color) || 0) + s.count);
  return { boxes, dragon };
}

export function checkWool(level: CleanLevelData): AuditIssue[] {
  const { boxes, dragon } = woolTotals(level);
  const colors = new Set([...boxes.keys(), ...dragon.keys()]);
  const off: string[] = [];
  for (const c of [...colors].sort((a, b) => a - b)) {
    const nb = boxes.get(c) || 0;
    const nd = dragon.get(c) || 0;
    if (nb !== nd) off.push(`color ${c}: boxes ${nb} / dragon ${nd}`);
  }
  return off.length
    ? [{ kind: 'wool-mismatch', severity: 'error', message: `Wool does not match: ${off.join(', ')}` }]
    : [];
}

// ---------------------------------------------------------------------------
// Board state shared by the deadlock check and the bot
// ---------------------------------------------------------------------------

interface Pickable {
  key: string;
  box: BoxItem;
  take: () => void;
}

class Board {
  boxes: BoxItem[];
  tunnels: TunnelSetup[];
  conveyorBoxes: { box: BoxItem; z: number; minX: number; maxX: number }[];
  private cache: Pickable[] | null = null;

  constructor(level: CleanLevelData) {
    this.boxes = level.boxes.map((b) => ({ ...b }));
    this.tunnels = (level.tunnels || []).map((t) => ({ ...t, queue: t.queue.map((q) => ({ ...q })) }));
    this.conveyorBoxes = (level.conveyors || []).flatMap((c) =>
      c.boxes.map((b) => ({
        box: { ...b },
        z: c.z,
        minX: Math.min(c.activeZoneMinX, c.activeZoneMaxX),
        maxX: Math.max(c.activeZoneMinX, c.activeZoneMaxX),
      }))
    );
  }

  get empty() {
    return this.boxes.length === 0 && this.tunnels.every((t) => t.queue.length === 0) && this.conveyorBoxes.length === 0;
  }

  /** Board boxes, tunnel bodies and tunnel ready boxes. Conveyor boxes move, so they never block for long. */
  obstacles(): BoxItem[] {
    const obs: BoxItem[] = [...this.boxes];
    for (const t of this.tunnels) {
      if (!t.queue.length) continue;
      obs.push(tunnelBody(t));
      obs.push(getTunnelReadyBox(t)!);
    }
    return obs;
  }

  changed() {
    this.cache = null;
  }

  /** Everything the player can send to a slot right now. */
  pickable(): Pickable[] {
    if (this.cache) return this.cache;
    const obs = this.obstacles();
    const out: Pickable[] = [];
    for (const b of this.boxes) {
      if (isBoxFrozen(b)) continue;
      if (!checkExitPath(b, obs).isBlocked) {
        out.push({
          key: `b${b.id}`,
          box: b,
          take: () => {
            this.boxes = this.boxes.filter((x) => x !== b);
            this.changed();
          },
        });
      }
    }
    for (const t of this.tunnels) {
      if (!t.queue.length) continue;
      const ready = getTunnelReadyBox(t)!;
      if (!checkExitPath(ready, obs).isBlocked) {
        out.push({
          key: `t${t.id}`,
          box: ready,
          take: () => {
            t.queue.shift();
            this.changed();
          },
        });
      }
    }
    for (const cb of this.conveyorBoxes) {
      // Free if the way out is clear somewhere in the active zone
      const steps = 6;
      let free = false;
      for (let i = 0; i <= steps && !free; i++) {
        const x = cb.minX + ((cb.maxX - cb.minX) * i) / steps;
        free = !checkExitPath({ ...cb.box, x, z: cb.z }, obs).isBlocked;
      }
      if (free) {
        out.push({
          key: `c${cb.box.id}`,
          box: cb.box,
          take: () => {
            this.conveyorBoxes = this.conveyorBoxes.filter((x) => x !== cb);
            this.changed();
          },
        });
      }
    }
    this.cache = out;
    return out;
  }

  /** If nothing is free, an unfrozen box blocked by an Ice box cracks it. Returns true if one cracked. */
  crackIce(): boolean {
    const obs = this.obstacles();
    const shooters: BoxItem[] = [
      ...this.boxes.filter((b) => !isBoxFrozen(b)),
      ...this.tunnels.filter((t) => t.queue.length).map((t) => getTunnelReadyBox(t)!),
    ];
    for (const s of shooters) {
      const hit = checkExitPath(s, obs);
      if (hit.isBlocked && hit.blockingBoxId !== undefined) {
        const target = this.boxes.find((b) => b.id === hit.blockingBoxId);
        if (target && isBoxFrozen(target)) {
          target.boxType = 'Normal';
          this.changed();
          return true;
        }
      }
    }
    return false;
  }
}

/** Can every box, tunnel bus and conveyor box be taken out in some order? (slots ignored) */
export function checkDeadlock(level: CleanLevelData): AuditIssue[] {
  const board = new Board(level);
  let guard = 0;
  while (!board.empty && guard++ < 2000) {
    const free = board.pickable();
    if (free.length) {
      free[0].take();
      continue;
    }
    if (board.crackIce()) continue;
    const stuck = board.boxes.map((b) => b.id);
    return [
      {
        kind: 'deadlock',
        severity: 'error',
        message: `Boxes block each other: ${stuck.length} boxes${
          board.tunnels.some((t) => t.queue.length) ? ' and tunnel buses' : ''
        }${board.conveyorBoxes.length ? ' and conveyor boxes' : ''} can never leave`,
        boxIds: stuck,
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Bot play test (same rules and numbers as the Playtest view)
// ---------------------------------------------------------------------------

const START_POINT = 1 / 3;
const FOG_BOUNDARY = 1 / 3;
const SEG_STEP = 0.012;
const GATHER_TICK = 0.09;
const RECONNECT_SPEED = 0.16;
const DEFAULT_LOSE_AT = 0.95;

export interface BotResult {
  won: boolean;
  time: number;
  /** Closest the dragon came to the robot, as track progress left (0 = caught). */
  margin: number;
  stuckReason?: string;
}

interface Slot {
  color: number;
  capacity: number;
  filled: number;
  fly: number;
  leaving?: number;
}

/**
 * One run of a simple bot. temperature 0 = always the best-looking box; higher = more random.
 * The bot sees the board like a player: it prefers boxes whose color is close to the dragon head.
 */
export function playOnce(level: CleanLevelData, temperature: number, rng: () => number): BotResult {
  const board = new Board(level);
  const sections = level.dragon.sections.map((s) => ({ ...s }));
  const slotCount = level.slots?.unlockedCount ?? level.slots?.count ?? 4;
  const slots: (Slot | null)[] = Array(slotCount).fill(null);
  const cats = level.dragon.catPositions?.length ? level.dragon.catPositions : [{ id: 1, progress: DEFAULT_LOSE_AT }];
  const loseAt = cats[cats.length - 1].progress;
  const speed = level.dragon.speed || 0.015;

  let p = START_POINT;
  let peak = START_POINT;
  let reconnect: { tail: number; front: number } | null = null;
  let gather = 0;
  let tapCooldown = 0;
  const dt = 1 / 30;
  let t = 0;

  const colorScore = (color: number) => {
    // knots in front of the first emerged section of this color, or a large number
    let run = 0;
    for (const s of sections) {
      const startP = p - run * SEG_STEP;
      if (s.color === color && s.count > 0) {
        const emerged = startP >= FOG_BOUNDARY;
        return emerged ? run : run + 40;
      }
      run += s.count;
    }
    return 999; // color no longer on the dragon
  };

  while (t < 900) {
    t += dt;

    // Dragon movement
    if (reconnect) {
      if (p > START_POINT) p = Math.max(START_POINT, p - RECONNECT_SPEED * dt);
      else {
        p = START_POINT;
        reconnect.tail += RECONNECT_SPEED * dt;
      }
      if (p - reconnect.front * SEG_STEP <= reconnect.tail) {
        p = Math.max(START_POINT, reconnect.tail + reconnect.front * SEG_STEP);
        reconnect = null;
      }
    } else {
      p += speed * dt;
      peak = Math.max(peak, p);
      if (p >= loseAt) return { won: false, time: t, margin: loseAt - p, stuckReason: stuckText(slots, sections) };
    }

    // Slots: fly in, leave when full
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s) continue;
      if (s.fly < 1) s.fly = Math.min(1, s.fly + dt * 4);
      if (s.leaving !== undefined) {
        s.leaving += dt * 3.5;
        if (s.leaving >= 1) slots[i] = null;
      }
    }

    // Wool gathering: one transfer per tick, first eligible slot in order
    if (!reconnect) {
      gather += dt;
      if (gather >= GATHER_TICK) {
        gather = 0;
        for (const s of slots) {
          if (!s || s.fly < 1 || s.leaving !== undefined || s.filled >= s.capacity) continue;
          let run = 0;
          let idx = -1;
          let avail = 0;
          for (let i = 0; i < sections.length; i++) {
            const sec = sections[i];
            const startP = p - run * SEG_STEP;
            if (startP >= FOG_BOUNDARY && sec.color === s.color && sec.count > 0) {
              const em = Math.min(sec.count, Math.floor((startP - FOG_BOUNDARY) / SEG_STEP) + 1);
              if (em > 0) {
                idx = i;
                avail = em;
                break;
              }
            }
            run += sec.count;
          }
          if (idx === -1) continue;
          let front = 0;
          for (let i = 0; i < idx; i++) front += sections[i].count;
          const take = Math.min(s.capacity - s.filled, avail);
          const secStart = p - front * SEG_STEP;
          sections[idx].count -= take;
          s.filled += take;
          if (s.filled >= s.capacity) s.leaving = 0.01;
          if (sections[idx].count <= 0) {
            sections.splice(idx, 1);
            if (idx < sections.length) reconnect = { tail: secStart - take * SEG_STEP, front };
          }
          break;
        }
      }
    }

    if (sections.length === 0 && board.empty && slots.every((s) => s === null)) {
      return { won: true, time: t, margin: loseAt - peak };
    }

    // Player taps
    tapCooldown -= dt;
    const freeSlot = slots.findIndex((s) => s === null);
    if (tapCooldown <= 0 && freeSlot !== -1) {
      let options = board.pickable();
      if (!options.length && board.crackIce()) {
        tapCooldown = 0.4;
        continue;
      }
      // Don't fill a slot with a color the dragon has no more of
      options = options.filter((o) => colorScore(o.box.color) < 999);
      if (options.length) {
        const scored = options.map((o) => ({ o, s: colorScore(o.box.color) }));
        // Wait rather than parking a box whose color is still deep in the fog, unless slots are mostly empty
        const used = slots.filter(Boolean).length;
        const best = Math.min(...scored.map((x) => x.s));
        if (best < 40 || used <= 1) {
          let pick = scored[0];
          if (temperature <= 0) {
            pick = scored.reduce((a, b) => (b.s < a.s ? b : a));
          } else {
            const w = scored.map((x) => Math.exp(-(x.s - best) / (temperature * 10)));
            let r = rng() * w.reduce((a, b) => a + b, 0);
            for (let i = 0; i < scored.length; i++) {
              r -= w[i];
              if (r <= 0) {
                pick = scored[i];
                break;
              }
            }
          }
          pick.o.take();
          slots[freeSlot] = { color: pick.o.box.color, capacity: pick.o.box.capacity, filled: 0, fly: 0 };
          tapCooldown = 0.35;
        }
      }
    }
  }
  return { won: false, time: t, margin: loseAt - p, stuckReason: 'time limit' };
}

function stuckText(slots: (Slot | null)[], sections: { color: number; count: number }[]) {
  const s = slots.filter(Boolean) as Slot[];
  if (s.length === slots.length) return `slots full (${s.map((x) => x.color).join(',')}), ${sections.length} segments left`;
  return `${sections.length} segments left`;
}

export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BotSummary {
  runs: number;
  wins: number;
  bestMargin: number;
  avgTime: number;
  typicalLoss?: string;
}

export function botEstimate(level: CleanLevelData, runs = 40, seed = 1): BotSummary {
  const rng = mulberry32(seed);
  let wins = 0;
  let bestMargin = -Infinity;
  let tSum = 0;
  const losses = new Map<string, number>();
  for (let i = 0; i < runs; i++) {
    const r = playOnce(level, i === 0 ? 0 : 0.3 + (i % 5) * 0.3, rng);
    if (r.won) wins++;
    else if (r.stuckReason) {
      const k = r.stuckReason.replace(/\(.*?\)/, '').trim();
      losses.set(k, (losses.get(k) || 0) + 1);
    }
    bestMargin = Math.max(bestMargin, r.margin);
    tSum += r.time;
  }
  const typicalLoss = [...losses.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return { runs, wins, bestMargin, avgTime: tSum / runs, typicalLoss };
}

// ---------------------------------------------------------------------------
// Similar layouts across levels
// ---------------------------------------------------------------------------

interface Sig {
  t: string;
  axis: number;
  x: number;
  z: number;
}

function signature(level: CleanLevelData, mirror: boolean): Sig[] {
  const bs = level.boxes;
  if (!bs.length) return [];
  const cx = (Math.min(...bs.map((b) => b.x)) + Math.max(...bs.map((b) => b.x))) / 2;
  const cz = (Math.min(...bs.map((b) => b.z)) + Math.max(...bs.map((b) => b.z))) / 2;
  return bs.map((b) => ({
    t: b.numType,
    axis: Math.round(((b.angle % 180) + 180) % 180),
    x: (b.x - cx) * (mirror ? -1 : 1),
    z: b.z - cz,
  }));
}

/** Share of boxes (0..1) with the same type, axis and place, after centering (and mirroring). */
export function layoutSimilarity(a: CleanLevelData, b: CleanLevelData): number {
  const n = Math.max(a.boxes.length, b.boxes.length);
  if (!n) return 0;
  let best = 0;
  for (const mirror of [false, true]) {
    const A = signature(a, false);
    const B = signature(b, mirror);
    const used = new Set<number>();
    let match = 0;
    for (const s of A) {
      let bi = -1;
      let bd = 0.25;
      B.forEach((q, i) => {
        if (used.has(i) || q.t !== s.t || q.axis !== s.axis) return;
        const d = Math.hypot(q.x - s.x, q.z - s.z);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      if (bi >= 0) {
        used.add(bi);
        match++;
      }
    }
    best = Math.max(best, match / n);
  }
  return best;
}

// ---------------------------------------------------------------------------

export function auditLevel(level: CleanLevelData): AuditIssue[] {
  return [...checkWool(level), ...checkOverlaps(level), ...checkTunnels(level), ...checkDeadlock(level)];
}

export { BOX_DIMENSIONS };
