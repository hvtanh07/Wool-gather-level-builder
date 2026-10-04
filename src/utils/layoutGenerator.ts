import { BoxItem, BoxNumType } from '../types/level';
import { BOX_DIMENSIONS } from './colors';
import { checkExitPath } from './collision';

interface BoxAABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function getBoxAABB(b: BoxItem, margin = 0, angleOverride?: number): BoxAABB {
  const angle = angleOverride !== undefined ? angleOverride : b.angle;
  const isH = Math.round(angle) === 90 || Math.round(angle) === 270;
  const dim = BOX_DIMENSIONS[b.numType] || BOX_DIMENSIONS.Box4;
  const bw = isH ? dim.length : dim.width;
  const bl = isH ? dim.width : dim.length;
  return {
    minX: b.x - bw / 2 - margin,
    maxX: b.x + bw / 2 + margin,
    minZ: b.z - bl / 2 - margin,
    maxZ: b.z + bl / 2 + margin,
  };
}

function aabbOverlaps(a: BoxAABB, b: BoxAABB): boolean {
  return !(a.maxX <= b.minX || a.minX >= b.maxX || a.maxZ <= b.minZ || a.minZ >= b.maxZ);
}

/**
 * Fast orthogonal raycast test for unpeeling
 */
function canBoxExitInDirection(box: BoxItem, angle: number, obstacles: BoxItem[]): boolean {
  const a = Math.round(angle);
  const aabb = getBoxAABB(box, 0, a);

  for (const other of obstacles) {
    if (other.id === box.id) continue;
    const o = getBoxAABB(other);

    if (a === 0) {
      // Up (+Z)
      if (o.minZ >= aabb.maxZ - 0.01 && !(o.maxX <= aabb.minX + 0.04 || o.minX >= aabb.maxX - 0.04)) {
        return false;
      }
    } else if (a === 180) {
      // Down (-Z)
      if (o.maxZ <= aabb.minZ + 0.01 && !(o.maxX <= aabb.minX + 0.04 || o.minX >= aabb.maxX - 0.04)) {
        return false;
      }
    } else if (a === 90) {
      // Right (+X)
      if (o.minX >= aabb.maxX - 0.01 && !(o.maxZ <= aabb.minZ + 0.04 || o.minZ >= aabb.maxZ - 0.04)) {
        return false;
      }
    } else if (a === 270) {
      // Left (-X)
      if (o.maxX <= aabb.minX + 0.01 && !(o.maxZ <= aabb.minZ + 0.04 || o.minZ >= aabb.maxZ - 0.04)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Generates an organic, tightly-packed 49-box puzzle layout.
 * Does not copy preset levels; generates a fresh, snug, interlocking configuration every time.
 */
export function generateRandomTightLayout(targetCount = 49): BoxItem[] {
  const minX = -2.85;
  const maxX = 2.85;
  const minZ = -5.45;
  const maxZ = 0.65;
  const rowCount = 8;
  const rowHeight = (maxZ - minZ) / (rowCount - 1);

  const boxes: (BoxItem & { isVert?: boolean })[] = [];
  let nextId = 1;

  // Add subtle, natural row Z jitter (+-0.03) to recreate the organic hand-crafted look of lvmap_110089
  const rowZs: number[] = [];
  for (let r = 0; r < rowCount; r++) {
    const jitter = r > 0 && r < rowCount - 1 ? (Math.random() - 0.5) * 0.05 : 0;
    rowZs.push(minZ + r * rowHeight + jitter);
  }

  // Pass 1: Row by row tight packing
  for (let r = 0; r < rowCount; r++) {
    const rowZ = rowZs[r];
    let currX = minX;

    while (currX < maxX - 0.2) {
      if (boxes.length >= targetCount) break;

      // Check if currX is blocked by an existing vertical box extending into this row
      const testPoint: BoxItem = {
        id: -999,
        x: currX + 0.27,
        z: rowZ,
        angle: 0,
        numType: 'Box4',
        capacity: 4,
        color: 1,
      };
      const testAABB = getBoxAABB(testPoint, 0.02);
      const blocker = boxes.find((b) => aabbOverlaps(getBoxAABB(b), testAABB));
      if (blocker) {
        const blockerAABB = getBoxAABB(blocker);
        currX = blockerAABB.maxX + 0.065;
        continue;
      }

      const remainingX = maxX - currX;
      if (remainingX < 0.5) break;

      // Randomly choose horizontal vs vertical block
      const isHorizontal = Math.random() > 0.44;
      const candidates: { numType: BoxNumType; isVert: boolean; w: number; l: number }[] = [];

      if (isHorizontal) {
        if (remainingX >= 0.54) candidates.push({ numType: 'Box4', isVert: false, w: 0.54, l: 0.54 });
        if (remainingX >= 0.76) candidates.push({ numType: 'Box6', isVert: false, w: 0.54, l: 0.76 });
        if (remainingX >= 0.98) candidates.push({ numType: 'Box10', isVert: false, w: 0.54, l: 0.98 });
      } else {
        if (remainingX >= 0.54) candidates.push({ numType: 'Box4', isVert: true, w: 0.54, l: 0.54 });
        if (remainingX >= 0.54) candidates.push({ numType: 'Box6', isVert: true, w: 0.54, l: 0.76 });
        if (r < rowCount - 1 && remainingX >= 0.54) candidates.push({ numType: 'Box10', isVert: true, w: 0.54, l: 0.98 });
      }

      candidates.sort(() => Math.random() - 0.5);

      let placed = false;
      for (const cand of candidates) {
        const spanX = cand.isVert ? cand.w : cand.l;
        const boxX = currX + spanX / 2;
        const tempAngle = cand.isVert ? 0 : 90;
        const newBox: BoxItem & { isVert?: boolean } = {
          id: nextId,
          x: Number(boxX.toFixed(3)),
          z: Number(rowZ.toFixed(3)),
          angle: tempAngle,
          isVert: cand.isVert,
          numType: cand.numType,
          capacity: BOX_DIMENSIONS[cand.numType].capacity,
          color: 1,
          boxType: 'Normal',
        };

        const newAABB = getBoxAABB(newBox, 0.025);
        const collides = boxes.some((b) => aabbOverlaps(getBoxAABB(b), newAABB));

        if (!collides) {
          boxes.push(newBox);
          nextId++;
          currX += spanX + 0.065; // snug tight fit spacing
          placed = true;
          break;
        }
      }

      if (!placed) currX += 0.15;
    }
  }

  // Pass 2: Secondary pocket fill if slightly under targetCount
  if (boxes.length < targetCount) {
    for (let r = 0; r < rowCount && boxes.length < targetCount; r++) {
      const rowZ = rowZs[r];
      for (let x = minX; x <= maxX - 0.54 && boxes.length < targetCount; x += 0.22) {
        const cand: BoxItem & { isVert?: boolean } = {
          id: nextId,
          x: Number((x + 0.27).toFixed(3)),
          z: Number(rowZ.toFixed(3)),
          angle: 0,
          isVert: true,
          numType: 'Box4',
          capacity: 4,
          color: 1,
          boxType: 'Normal',
        };
        const candAABB = getBoxAABB(cand, 0.025);
        if (!boxes.some((b) => aabbOverlaps(getBoxAABB(b), candAABB))) {
          boxes.push(cand);
          nextId++;
        }
      }
    }
  }

  // Pass 3: Reverse-Unpeeling Topological Angle Assignment
  // Simulates clearing the board backwards to guarantee 100% solvability
  let remaining = [...boxes];
  const chosenAngles = new Map<number, number>();

  while (remaining.length > 0) {
    let found = false;
    const order = [...remaining].sort(() => Math.random() - 0.5);

    for (const b of order) {
      const allowedAngles = b.isVert ? [0, 180] : [90, 270];
      // Randomize which allowed angle to try first
      allowedAngles.sort(() => Math.random() - 0.5);

      for (const ang of allowedAngles) {
        if (canBoxExitInDirection(b, ang, remaining)) {
          chosenAngles.set(b.id, ang);
          remaining = remaining.filter((item) => item.id !== b.id);
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      // Fallback in case of a dense interior cycle: choose the best outward orientation
      const fallback = remaining[0];
      const fallbackAngle = fallback.isVert
        ? fallback.z > -2.4 ? 0 : 180
        : fallback.x > 0 ? 90 : 270;
      chosenAngles.set(fallback.id, fallbackAngle);
      remaining.splice(0, 1);
    }
  }

  // Pass 4: Balanced Wool Color Palette Assignment
  const palette: number[] = [];
  const countPerColor = Math.ceil(boxes.length / 8);
  for (let c = 1; c <= 8; c++) {
    for (let i = 0; i < countPerColor; i++) {
      palette.push(c);
    }
  }
  palette.sort(() => Math.random() - 0.5);

  const finalBoxes: BoxItem[] = boxes.map((b, idx) => {
    const angle = chosenAngles.get(b.id) ?? (b.isVert ? 0 : 90);
    return {
      id: idx + 1,
      x: b.x,
      z: b.z,
      angle,
      numType: b.numType,
      capacity: b.capacity,
      color: palette[idx % palette.length],
      boxType: 'Normal',
    };
  });

  return finalBoxes;
}
