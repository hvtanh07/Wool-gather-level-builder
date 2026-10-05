import { BoxItem, TunnelSetup } from '../types/level';
import { BOX_DIMENSIONS } from './colors';

export interface Point2D {
  x: number;
  z: number;
}

export interface BoxCorners {
  frontLeft: Point2D;
  frontRight: Point2D;
  backLeft: Point2D;
  backRight: Point2D;
  center: Point2D;
  direction: Point2D;
  right: Point2D;
  width: number;
  length: number;
}

// Convert angle (degrees) to normalized 2D direction vector
// 0 deg = Up (+Z), 90 deg = Right (+X), 180 deg = Down (-Z), 270 deg = Left (-X)
export function angleToDirection(angleDeg: number): Point2D {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.sin(rad),
    z: Math.cos(rad),
  };
}

// Get the 4 corners of an oriented bounding box
export function getBoxCorners(box: BoxItem): BoxCorners {
  const dim = BOX_DIMENSIONS[box.numType] || BOX_DIMENSIONS.Box4;
  const dir = angleToDirection(box.angle);
  const right = { x: dir.z, z: -dir.x }; // Perpendicular vector (rotated 90 deg clockwise)

  const hw = dim.width / 2;
  const hl = dim.length / 2;

  // Front center is offset by +hl in dir, corners by +/- hw in right
  const frontCenter = { x: box.x + dir.x * hl, z: box.z + dir.z * hl };
  const backCenter = { x: box.x - dir.x * hl, z: box.z - dir.z * hl };

  return {
    center: { x: box.x, z: box.z },
    direction: dir,
    right,
    width: dim.width,
    length: dim.length,
    frontLeft: { x: frontCenter.x - right.x * hw, z: frontCenter.z - right.z * hw },
    frontRight: { x: frontCenter.x + right.x * hw, z: frontCenter.z + right.z * hw },
    backLeft: { x: backCenter.x - right.x * hw, z: backCenter.z - right.z * hw },
    backRight: { x: backCenter.x + right.x * hw, z: backCenter.z + right.z * hw },
  };
}

// Check if a 2D line segment AB intersects line segment CD
export function lineSegmentIntersection(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D
): { intersects: boolean; t?: number; point?: Point2D } {
  const d = (p2.x - p1.x) * (p4.z - p3.z) - (p2.z - p1.z) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-8) return { intersects: false };

  const t = ((p3.x - p1.x) * (p4.z - p3.z) - (p3.z - p1.z) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.z - p1.z) - (p3.z - p1.z) * (p2.x - p1.x)) / d;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      intersects: true,
      t,
      point: {
        x: p1.x + t * (p2.x - p1.x),
        z: p1.z + t * (p2.z - p1.z),
      },
    };
  }
  return { intersects: false };
}

// Raycast against a box's 4 boundary segments
export function raycastBox(
  rayOrigin: Point2D,
  rayDir: Point2D,
  maxDist: number,
  targetBox: BoxItem
): { hit: boolean; distance: number; point?: Point2D } {
  const targetCorners = getBoxCorners(targetBox);
  const segments = [
    [targetCorners.frontLeft, targetCorners.frontRight],
    [targetCorners.frontRight, targetCorners.backRight],
    [targetCorners.backRight, targetCorners.backLeft],
    [targetCorners.backLeft, targetCorners.frontLeft],
  ];

  const rayEnd: Point2D = {
    x: rayOrigin.x + rayDir.x * maxDist,
    z: rayOrigin.z + rayDir.z * maxDist,
  };

  let closestDist = Infinity;
  let closestPoint: Point2D | undefined;

  for (const [p1, p2] of segments) {
    const inter = lineSegmentIntersection(rayOrigin, rayEnd, p1, p2);
    if (inter.intersects && inter.t !== undefined) {
      const dist = inter.t * maxDist;
      if (dist < closestDist) {
        closestDist = dist;
        closestPoint = inter.point;
      }
    }
  }

  if (closestDist < maxDist) {
    return { hit: true, distance: closestDist, point: closestPoint };
  }
  return { hit: false, distance: maxDist };
}

export interface ExitPathResult {
  isBlocked: boolean;
  blockingBoxId?: number;
  distanceToBlocker?: number;
  hitPoint?: Point2D;
}

/**
 * Tests whether `sourceBox` can exit cleanly in its arrow direction without hitting any other box.
 * Sweeps the entire width of the box along its direction.
 */
export function checkExitPath(
  sourceBox: BoxItem,
  allBoxes: BoxItem[],
  maxDistance = 18.0
): ExitPathResult {
  const src = getBoxCorners(sourceBox);
  const margin = 0.05; // Clearance margin from edges to prevent grazing false positives
  const hw = (src.width / 2) - margin;

  // Rays across front edge of sourceBox
  const rayOffsets = [-hw, -hw * 0.5, 0, hw * 0.5, hw];
  const frontCenter = {
    x: sourceBox.x + src.direction.x * (src.length / 2 + 0.02),
    z: sourceBox.z + src.direction.z * (src.length / 2 + 0.02),
  };

  let minHitDist = Infinity;
  let blockingBox: BoxItem | undefined;
  let hitPoint: Point2D | undefined;

  for (const target of allBoxes) {
    if (target.id === sourceBox.id) continue;

    // Fast distance culling: target must be in front and closer than current minimum hit distance
    const dx = target.x - sourceBox.x;
    const dz = target.z - sourceBox.z;
    const dotForward = dx * src.direction.x + dz * src.direction.z;
    if (dotForward < 0.01 || dotForward > minHitDist + 0.6) continue;

    // Fast lateral corridor culling: target must be within corridor width + target radius
    const dotSide = Math.abs(dx * src.right.x + dz * src.right.z);
    if (dotSide > hw + 0.55) continue;

    // Precalculate target segments once for all 5 rays
    const targetCorners = getBoxCorners(target);
    const p1 = targetCorners.frontLeft;
    const p2 = targetCorners.frontRight;
    const p3 = targetCorners.backRight;
    const p4 = targetCorners.backLeft;
    const segs = [
      [p1.x, p1.z, p2.x, p2.z],
      [p2.x, p2.z, p3.x, p3.z],
      [p3.x, p3.z, p4.x, p4.z],
      [p4.x, p4.z, p1.x, p1.z],
    ];

    const curMax = Math.min(maxDistance, minHitDist);

    // Check 5 rays across source front edge
    for (let r = 0; r < 5; r++) {
      const offset = rayOffsets[r];
      const rOx = frontCenter.x + src.right.x * offset;
      const rOz = frontCenter.z + src.right.z * offset;
      const rEx = rOx + src.direction.x * curMax;
      const rEz = rOz + src.direction.z * curMax;

      for (let s = 0; s < 4; s++) {
        const seg = segs[s];
        const x3 = seg[0], z3 = seg[1], x4 = seg[2], z4 = seg[3];
        const denom = (z4 - z3) * (rEx - rOx) - (x4 - x3) * (rEz - rOz);
        if (denom === 0) continue;

        const ua = ((x4 - x3) * (rOz - z3) - (z4 - z3) * (rOx - x3)) / denom;
        const ub = ((rEx - rOx) * (rOz - z3) - (rEz - rOz) * (rOx - x3)) / denom;

        if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
          const dist = ua * curMax;
          if (dist < minHitDist) {
            minHitDist = dist;
            blockingBox = target;
            hitPoint = {
              x: rOx + ua * (rEx - rOx),
              z: rOz + ua * (rEz - rOz),
            };
          }
        }
      }
    }
  }

  if (blockingBox && minHitDist < maxDistance) {
    return {
      isBlocked: true,
      blockingBoxId: blockingBox.id,
      distanceToBlocker: minHitDist,
      hitPoint,
    };
  }

  return {
    isBlocked: false,
  };
}

/**
 * Get all boxes that currently have a clear path to exit
 */
export function getAvailableBoxes(boxes: BoxItem[]): BoxItem[] {
  return boxes.filter((b) => !checkExitPath(b, boxes).isBlocked);
}

/**
 * Computes the ready box stationed directly in front of a tunnel.
 * Design rules:
 * 1. The tunnel element is shown as 2 objects: the tunnel structure itself and the ready box in front of it.
 * 2. The box direction is ALWAYS in the opposite direction of the tunnel object:
 *    boxAngle = (tunnel.angle + 180) % 360
 * 3. The ready box is positioned in front of the tunnel along this opposite exit direction.
 */
export function getTunnelReadyBox(tunnel: TunnelSetup): BoxItem | null {
  if (!tunnel.queue || tunnel.queue.length === 0) return null;
  const readyBus = tunnel.queue[0];
  const boxAngle = ((tunnel.angle || 0) + 180) % 360;
  const boxDir = angleToDirection(boxAngle);
  const tunDim = BOX_DIMENSIONS.Box6;
  const boxDim = BOX_DIMENSIONS[readyBus.numType] || BOX_DIMENSIONS.Box6;
  const offsetDist = (tunDim.length + boxDim.length) / 2;

  return {
    ...readyBus,
    id: readyBus.id || -(tunnel.id * 1000 + 1),
    x: Number((tunnel.x + boxDir.x * offsetDist).toFixed(3)),
    z: Number((tunnel.z + boxDir.z * offsetDist).toFixed(3)),
    angle: boxAngle,
  };
}

/**
 * Checks whether a 2D world point (wx, wz) is inside either the tunnel structure
 * or the ready box positioned in front of it.
 */
export function isPointInTunnelCompound(wx: number, wz: number, tunnel: TunnelSetup): boolean {
  // 1. Check tunnel structure bounds at (tunnel.x, tunnel.z)
  const dir = angleToDirection(tunnel.angle);
  const right = { x: dir.z, z: -dir.x };
  const dx = wx - tunnel.x;
  const dz = wz - tunnel.z;
  const u = dx * dir.x + dz * dir.z;
  const v = dx * right.x + dz * right.z;
  if (
    Math.abs(u) <= BOX_DIMENSIONS.Box6.length / 2 + 0.05 &&
    Math.abs(v) <= BOX_DIMENSIONS.Box6.width / 2 + 0.05
  ) {
    return true;
  }

  // 2. Check ready box stationed in front of the tunnel
  const readyBox = getTunnelReadyBox(tunnel);
  if (readyBox) {
    const bDir = angleToDirection(readyBox.angle);
    const bRight = { x: bDir.z, z: -bDir.x };
    const bdx = wx - readyBox.x;
    const bdz = wz - readyBox.z;
    const bu = bdx * bDir.x + bdz * bDir.z;
    const bv = bdx * bRight.x + bdz * bRight.z;
    const bDim = BOX_DIMENSIONS[readyBox.numType] || BOX_DIMENSIONS.Box6;
    if (
      Math.abs(bu) <= bDim.length / 2 + 0.05 &&
      Math.abs(bv) <= bDim.width / 2 + 0.05
    ) {
      return true;
    }
  }

  return false;
}

