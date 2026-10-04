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

  // Pass 3: Reverse-Unpeeling Topological Angle Assignment & Clearance Order
  // Simulates clearing the board backwards to guarantee 100% solvability
  let remaining = [...boxes];
  const chosenAngles = new Map<number, number>();
  const exitOrder: number[] = [];

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
          exitOrder.push(b.id);
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
      exitOrder.push(fallback.id);
      remaining.splice(0, 1);
    }
  }

  // Pass 4: 3-Layer Color Palette Assignment (Outer, Middle, Inner)
  // Outer layer: 3 colors
  // Middle layer: 3 colors (shares 1 or 2 with outer)
  // Inner layer: 3 colors (shares 1 or 2 with middle)
  const cx = (minX + maxX) / 2; // 0
  const cz = (minZ + maxZ) / 2; // -2.4
  const hw = (maxX - minX) / 2; // 2.85
  const hh = (maxZ - minZ) / 2; // 3.05
  const N = boxes.length;

  const boxScores = boxes.map((b) => {
    const rank = exitOrder.indexOf(b.id);
    const dTopo = N > 1 ? 1 - (rank >= 0 ? rank : N - 1) / (N - 1) : 1;
    const dx = Math.abs(b.x - cx) / hw;
    const dz = Math.abs(b.z - cz) / hh;
    const dGeo = Math.max(dx, dz);
    const layerScore = 0.55 * dTopo + 0.45 * dGeo;
    return { box: b, layerScore };
  });

  // Sort descending: highest layerScore is outermost, lowest is innermost
  boxScores.sort((a, b) => b.layerScore - a.layerScore);

  const outerCount = Math.floor(N / 3);
  const middleCount = Math.floor(N / 3);
  const outerBoxes = boxScores.slice(0, outerCount).map((item) => item.box);
  const middleBoxes = boxScores.slice(outerCount, outerCount + middleCount).map((item) => item.box);
  const innerBoxes = boxScores.slice(outerCount + middleCount).map((item) => item.box);

  // Palettes generation:
  const allShuffled = [1, 2, 3, 4, 5, 6, 7, 8].sort(() => Math.random() - 0.5);
  const outerColors = [allShuffled[0], allShuffled[1], allShuffled[2]];

  const shareOuterMiddle = Math.random() < 0.5 ? 1 : 2;
  const shuffledOuter = [...outerColors].sort(() => Math.random() - 0.5);
  const sharedFromOuter = shuffledOuter.slice(0, shareOuterMiddle);
  const neededForMiddle = 3 - shareOuterMiddle;
  const unusedForMiddle = allShuffled.slice(3);
  const middleNew = unusedForMiddle.slice(0, neededForMiddle);
  const middleColors = [...sharedFromOuter, ...middleNew];

  const shareMiddleInner = Math.random() < 0.5 ? 1 : 2;
  const shuffledMiddle = [...middleColors].sort(() => Math.random() - 0.5);
  const sharedFromMiddle = shuffledMiddle.slice(0, shareMiddleInner);
  const neededForInner = 3 - shareMiddleInner;
  const remainingUnused = allShuffled.filter(
    (c) => !middleColors.includes(c) && !sharedFromMiddle.includes(c)
  );
  let innerNew = remainingUnused.slice(0, neededForInner);
  if (innerNew.length < neededForInner) {
    const fallbackPool = [1, 2, 3, 4, 5, 6, 7, 8].filter(
      (c) => !sharedFromMiddle.includes(c) && !innerNew.includes(c)
    );
    fallbackPool.sort(() => Math.random() - 0.5);
    innerNew = [...innerNew, ...fallbackPool.slice(0, neededForInner - innerNew.length)];
  }
  const innerColors = [...sharedFromMiddle, ...innerNew];

  function createLayerColorArray(count: number, colors: number[]): number[] {
    const result: number[] = [];
    const baseCount = Math.floor(count / colors.length);
    const remainder = count % colors.length;
    for (let i = 0; i < colors.length; i++) {
      const num = baseCount + (i < remainder ? 1 : 0);
      for (let k = 0; k < num; k++) {
        result.push(colors[i]);
      }
    }
    result.sort(() => Math.random() - 0.5);
    return result;
  }

  const outerColorList = createLayerColorArray(outerBoxes.length, outerColors);
  const middleColorList = createLayerColorArray(middleBoxes.length, middleColors);
  const innerColorList = createLayerColorArray(innerBoxes.length, innerColors);

  const boxColorMap = new Map<number, number>();
  outerBoxes.forEach((b, i) => boxColorMap.set(b.id, outerColorList[i]));
  middleBoxes.forEach((b, i) => boxColorMap.set(b.id, middleColorList[i]));
  innerBoxes.forEach((b, i) => boxColorMap.set(b.id, innerColorList[i]));

  const finalBoxes: BoxItem[] = boxes.map((b, idx) => {
    const angle = chosenAngles.get(b.id) ?? (b.isVert ? 0 : 90);
    return {
      id: idx + 1,
      x: b.x,
      z: b.z,
      angle,
      numType: b.numType,
      capacity: b.capacity,
      color: boxColorMap.get(b.id) ?? 1,
      boxType: 'Normal',
    };
  });

  return finalBoxes;
}
