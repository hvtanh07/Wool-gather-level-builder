import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { BoxItem, BoxNumType, DragonSetup } from '../types/level';
import { BOX_DIMENSIONS, getWoolColor, getBoxNumType } from '../utils/colors';
import { checkExitPath, getBoxCorners, angleToDirection } from '../utils/collision';
import { solveBoxLayout } from '../utils/dragonSolver';
import { sounds } from '../utils/audio';
import { CheckCircle2, AlertTriangle, ListOrdered, ShieldAlert, HelpCircle, Eye, EyeOff, Maximize2 } from 'lucide-react';

interface CanvasEditorProps {
  boxes: BoxItem[];
  selectedBoxIds: number[];
  onSelectBoxes: (ids: number[]) => void;
  onUpdateBoxes: (boxes: BoxItem[], commitToHistory?: boolean) => void;
  activeColor: number;
  activeNumType: BoxNumType;
  gridSnap: number; // 0 = off, 0.1, 0.25, 0.5, 1.0
  showRays: boolean;
  dragon?: DragonSetup;
  slots?: { count: number; unlockedCount?: number };
}

export const CanvasEditor: React.FC<CanvasEditorProps> = ({
  boxes,
  selectedBoxIds,
  onSelectBoxes,
  onUpdateBoxes,
  gridSnap,
  showRays,
  dragon,
  slots,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Viewport transform
  // World space: X is horizontal (-4 to +4), Z is vertical (-7 to +2)
  const [zoom, setZoom] = useState<number>(65); // pixels per world unit
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Hover detection for smooth grab cursor
  const [hoveredBoxId, setHoveredBoxId] = useState<number | null>(null);

  // Dragging boxes
  const [isDraggingBox, setIsDraggingBox] = useState(false);
  const hasDraggedRef = useRef<boolean>(false);
  const latestBoxesRef = useRef<BoxItem[]>(boxes);
  latestBoxesRef.current = boxes;

  const [dragStartPos, setDragStartPos] = useState<{
    mouseX: number;
    mouseY: number;
    boxPositions: Map<number, { x: number; z: number }>;
  }>({
    mouseX: 0,
    mouseY: 0,
    boxPositions: new Map(),
  });

  // Marquee selection
  const [isMarquee, setIsMarquee] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [marqueeEnd, setMarqueeEnd] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Help cheat sheet visibility
  const [showHelp, setShowHelp] = useState<boolean>(false);

  // Show Dragon Track toggle
  const [showDragonTrack, setShowDragonTrack] = useState<boolean>(true);

  // Real-time Solvability Check on every change
  const [showSolutionOrder, setShowSolutionOrder] = useState<boolean>(false);

  const solveResult = useMemo(() => {
    return solveBoxLayout(boxes);
  }, [boxes]);

  const deadlockedIds = useMemo(() => {
    return new Set(solveResult.unsolvableRemaining?.map((b) => b.id) || []);
  }, [solveResult]);

  const solutionOrderMap = useMemo(() => {
    const map = new Map<number, number>();
    solveResult.solutionOrder.forEach((b, idx) => {
      map.set(b.id, idx + 1);
    });
    return map;
  }, [solveResult]);

  // Spline interpolation for track in World (x, z) coordinates
  const getTrackPointAt = useCallback(
    (progress: number): { x: number; z: number; angle: number } => {
      const track = dragon?.track;
      if (!track || track.length < 2) return { x: 0, z: 5, angle: 0 };

      const clampedP = Math.max(0, Math.min(progress, 0.9999));
      const totalSegments = track.length - 1;
      const segIndex = Math.min(Math.floor(clampedP * totalSegments), totalSegments - 1);
      const segT = clampedP * totalSegments - segIndex;

      const p0 = track[segIndex];
      const p1 = track[segIndex + 1];

      const x = p0.x + (p1.x - p0.x) * segT;
      const z = p0.y + (p1.y - p0.y) * segT; // track[i].y is World Z
      const dx = p1.x - p0.x;
      const dz = p1.y - p0.y;
      const angle = Math.atan2(dz, dx);

      return { x, z, angle };
    },
    [dragon?.track]
  );

  // Center pan initially to show both the dragon track and the board boxes
  useEffect(() => {
    if (canvasRef.current) {
      const w = canvasRef.current.clientWidth;
      const h = canvasRef.current.clientHeight;
      setPan({ x: w / 2, y: h * 0.52 });
      setZoom(52);
    }
  }, []);

  // Convert World (x, z) to Screen (px, py)
  // Screen X increases with World X, Screen Y decreases with World Z (so +Z is Up)
  const worldToScreen = useCallback(
    (wx: number, wz: number): { x: number; y: number } => {
      return {
        x: pan.x + wx * zoom,
        y: pan.y - wz * zoom,
      };
    },
    [pan, zoom]
  );

  // Convert Screen (px, py) to World (x, z)
  const screenToWorld = useCallback(
    (sx: number, sy: number): { x: number; z: number } => {
      return {
        x: (sx - pan.x) / zoom,
        z: -(sy - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  // Snap coordinate if grid snap enabled
  const snapVal = useCallback(
    (val: number) => {
      if (gridSnap <= 0) return Number(val.toFixed(3));
      return Number((Math.round(val / gridSnap) * gridSnap).toFixed(3));
    },
    [gridSnap]
  );

  // Check if a point is inside an oriented box
  const isPointInBox = (wx: number, wz: number, box: BoxItem): boolean => {
    const dim = BOX_DIMENSIONS[box.numType] || BOX_DIMENSIONS.Box4;
    const dir = angleToDirection(box.angle);
    const right = { x: dir.z, z: -dir.x };

    const dx = wx - box.x;
    const dz = wz - box.z;

    const u = dx * dir.x + dz * dir.z;
    const v = dx * right.x + dz * right.z;

    return Math.abs(u) <= dim.length / 2 && Math.abs(v) <= dim.width / 2;
  };

  // Find box at world coordinate
  const findBoxAt = useCallback(
    (wx: number, wz: number): BoxItem | undefined => {
      for (let i = boxes.length - 1; i >= 0; i--) {
        if (isPointInBox(wx, wz, boxes[i])) {
          return boxes[i];
        }
      }
      return undefined;
    },
    [boxes]
  );

  // Draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#0b1120');
    bgGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.lineWidth = 1;
    const step = zoom * (gridSnap > 0 ? gridSnap : 0.5);
    const startX = pan.x % step;
    const startY = pan.y % step;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    for (let x = startX; x < width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = startY; y < height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // World origin axes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    // X axis (horizontal)
    ctx.moveTo(0, pan.y);
    ctx.lineTo(width, pan.y);
    // Z axis (vertical)
    ctx.moveTo(pan.x, 0);
    ctx.lineTo(pan.x, height);
    ctx.stroke();

    // Board reference perimeter
    const boardMin = worldToScreen(-3.5, 1.2);
    const boardMax = worldToScreen(3.5, -6.5);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(boardMin.x, boardMin.y, boardMax.x - boardMin.x, boardMax.y - boardMin.y);
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.font = '11px monospace';
    ctx.fillText('BOX PLAY AREA (-3.5 to +3.5)', boardMin.x + 8, boardMin.y - 6);

    // -------------------------------------------------------------
    // Spool Shelf Preview in Scene
    // -------------------------------------------------------------
    if (slots) {
      const shelfMin = worldToScreen(-3.5, 1.4);
      const shelfMax = worldToScreen(3.5, 0.4);
      const shelfW = shelfMax.x - shelfMin.x;
      const shelfH = shelfMax.y - shelfMin.y;

      ctx.save();
      ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(shelfMin.x, shelfMin.y, shelfW, shelfH, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(
        `SPOOL SHELF (${slots.unlockedCount || 4} ACTIVE SLOTS)`,
        shelfMin.x + 10,
        shelfMin.y + 14
      );

      // Slot indicators
      const totalSlots = slots.count || 5;
      const unlocked = slots.unlockedCount || 4;
      const slotBoxW = Math.min(42, (shelfW - 20) / totalSlots - 6);
      const slotTotalW = totalSlots * (slotBoxW + 6) - 6;
      const slotStartX = shelfMin.x + (shelfW - slotTotalW) / 2;

      for (let s = 0; s < totalSlots; s++) {
        const sx = slotStartX + s * (slotBoxW + 6);
        const sy = shelfMin.y + shelfH - 24;
        const isUnlocked = s < unlocked;

        ctx.fillStyle = isUnlocked ? 'rgba(15, 23, 42, 0.85)' : 'rgba(51, 65, 85, 0.4)';
        ctx.strokeStyle = isUnlocked ? 'rgba(56, 189, 248, 0.5)' : 'rgba(71, 85, 105, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(sx, sy, slotBoxW, 18, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isUnlocked ? '#38bdf8' : '#64748b';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(isUnlocked ? `S${s + 1}` : '🔒', sx + slotBoxW / 2, sy + 12);
      }
      ctx.restore();
    }

    // -------------------------------------------------------------
    // Dragon Track, Fog Area & Starting Line Preview in Scene
    // -------------------------------------------------------------
    if (showDragonTrack && dragon?.track && dragon.track.length > 1) {
      ctx.save();

      // 1. Road Track
      ctx.beginPath();
      const first = worldToScreen(dragon.track[0].x, dragon.track[0].y);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < dragon.track.length; i++) {
        const pt = worldToScreen(dragon.track[i].x, dragon.track[i].y);
        ctx.lineTo(pt.x, pt.y);
      }

      ctx.lineWidth = 26;
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.55)';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      ctx.lineWidth = 18;
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.75)';
      ctx.stroke();

      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.setLineDash([8, 8]);
      ctx.stroke();
      ctx.setLineDash([]);

      // 2. Fog Area Ribbon (0.0 to 1/3)
      const FOG_BOUNDARY = 1 / 3;
      const START_POINT = 1 / 3;

      ctx.beginPath();
      const fogSteps = 24;
      for (let i = 0; i <= fogSteps; i++) {
        const p = (i / fogSteps) * FOG_BOUNDARY;
        const pt = getTrackPointAt(p);
        const scr = worldToScreen(pt.x, pt.z);
        if (i === 0) ctx.moveTo(scr.x, scr.y);
        else ctx.lineTo(scr.x, scr.y);
      }
      ctx.lineWidth = 26;
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.lineCap = 'round';
      ctx.stroke();

      // Fog Region Badge
      const fogMidPt = getTrackPointAt(0.15);
      const fogMidScr = worldToScreen(fogMidPt.x, fogMidPt.z);
      ctx.fillStyle = 'rgba(30, 41, 59, 0.88)';
      ctx.beginPath();
      ctx.roundRect(fogMidScr.x - 38, fogMidScr.y - 18, 76, 16, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 8.5px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🌫️ FOG (0-33%)', fogMidScr.x, fogMidScr.y - 10);

      // 3. Start Point Gate Line & Badge (P = 1/3)
      const startPt = getTrackPointAt(START_POINT);
      const startScr = worldToScreen(startPt.x, startPt.z);
      const perpAngle = -startPt.angle + Math.PI / 2;
      const gateW = 15;
      ctx.beginPath();
      ctx.moveTo(startScr.x + Math.cos(perpAngle) * gateW, startScr.y + Math.sin(perpAngle) * gateW);
      ctx.lineTo(startScr.x - Math.cos(perpAngle) * gateW, startScr.y - Math.sin(perpAngle) * gateW);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#06b6d4';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(startScr.x + Math.cos(perpAngle) * gateW, startScr.y + Math.sin(perpAngle) * gateW);
      ctx.lineTo(startScr.x - Math.cos(perpAngle) * gateW, startScr.y - Math.sin(perpAngle) * gateW);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Start Badge
      const bX = startScr.x + Math.cos(perpAngle) * 24;
      const bY = startScr.y + Math.sin(perpAngle) * 24;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(bX - 22, bY - 8, 44, 16, 4);
      ctx.fill();
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 8.5px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🚩 START', bX, bY);

      // 4. Cat Checkpoints
      if (dragon.catPositions) {
        dragon.catPositions.forEach((cat, idx) => {
          const catPt = getTrackPointAt(cat.progress);
          const catScr = worldToScreen(catPt.x, catPt.z);

          ctx.beginPath();
          ctx.arc(catScr.x, catScr.y, 8, 0, Math.PI * 2);
          ctx.fillStyle = '#f59e0b';
          ctx.fill();
          ctx.strokeStyle = '#b45309';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = '#fef3c7';
          ctx.font = 'bold 8.5px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`🐱 CP${idx + 1}`, catScr.x, catScr.y - 12);
        });
      }

      // 5. Dragon Wool Body & Head Preview
      let dragProg = START_POINT;
      const segStep = 0.007;
      if (dragon.sections) {
        for (const sec of dragon.sections) {
          const col = getWoolColor(sec.color);
          const knotCount = Math.min(sec.count, 20);
          for (let k = 0; k < knotCount; k++) {
            dragProg -= segStep;
            if (dragProg < 0) break;
            const kPt = getTrackPointAt(dragProg);
            const kScr = worldToScreen(kPt.x, kPt.z);
            const inFog = dragProg < FOG_BOUNDARY;
            ctx.globalAlpha = inFog ? 0.35 : 0.9;
            ctx.beginPath();
            ctx.arc(kScr.x, kScr.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = col.hex;
            ctx.fill();
            ctx.strokeStyle = inFog ? 'rgba(255,255,255,0.4)' : col.darkHex;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          if (dragProg < 0) break;
        }
        ctx.globalAlpha = 1.0;
      }

      // Dragon Head Preview
      ctx.save();
      ctx.translate(startScr.x, startScr.y);
      ctx.rotate(-startPt.angle);
      ctx.beginPath();
      ctx.arc(3, 0, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#f97316';
      ctx.fill();
      ctx.strokeStyle = '#c2410c';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    }

    // Precalculate exit blockage for all boxes
    const exitStatus = new Map<number, ReturnType<typeof checkExitPath>>();
    boxes.forEach((b) => {
      exitStatus.set(b.id, checkExitPath(b, boxes));
    });

    // Draw exit rays if enabled or for selected box
    if (showRays || selectedBoxIds.length > 0) {
      boxes.forEach((b) => {
        const isSelected = selectedBoxIds.includes(b.id);
        if (!showRays && !isSelected) return;

        const corners = getBoxCorners(b);
        const status = exitStatus.get(b.id);
        const pStart = worldToScreen(
          b.x + corners.direction.x * (corners.length / 2),
          b.z + corners.direction.z * (corners.length / 2)
        );

        const rayDist = status?.isBlocked && status.distanceToBlocker ? status.distanceToBlocker : 15;
        const pEnd = worldToScreen(
          b.x + corners.direction.x * (corners.length / 2 + rayDist),
          b.z + corners.direction.z * (corners.length / 2 + rayDist)
        );

        ctx.beginPath();
        ctx.moveTo(pStart.x, pStart.y);
        ctx.lineTo(pEnd.x, pEnd.y);
        ctx.strokeStyle = status?.isBlocked ? 'rgba(239, 68, 68, 0.7)' : 'rgba(34, 197, 94, 0.85)';
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.setLineDash(status?.isBlocked ? [4, 4] : []);
        ctx.stroke();
        ctx.setLineDash([]);

        if (status?.isBlocked && status.hitPoint) {
          const hitScreen = worldToScreen(status.hitPoint.x, status.hitPoint.z);
          ctx.beginPath();
          ctx.arc(hitScreen.x, hitScreen.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#ef4444';
          ctx.fill();
        }
      });
    }

    // Draw Boxes
    boxes.forEach((b) => {
      const isSelected = selectedBoxIds.includes(b.id);
      const isHovered = hoveredBoxId === b.id;
      const isDeadlocked = deadlockedIds.has(b.id);
      const exitStep = solutionOrderMap.get(b.id);
      const status = exitStatus.get(b.id);
      const isClear = !status?.isBlocked;
      const colDef = getWoolColor(b.color);
      const dim = BOX_DIMENSIONS[b.numType] || BOX_DIMENSIONS.Box4;

      const screenCenter = worldToScreen(b.x, b.z);
      const screenW = dim.width * zoom;
      const screenL = dim.length * zoom;

      ctx.save();
      ctx.translate(screenCenter.x, screenCenter.y);
      const rad = (b.angle * Math.PI) / 180;
      ctx.rotate(rad);

      // Box shadow: glowing red if deadlocked, cyan if selected, subtle otherwise
      ctx.shadowColor = isDeadlocked
        ? 'rgba(239, 68, 68, 0.85)'
        : isSelected
        ? 'rgba(56, 189, 248, 0.7)'
        : isHovered
        ? 'rgba(255, 255, 255, 0.4)'
        : 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = isDeadlocked ? 14 : isSelected ? 12 : isHovered ? 8 : 6;
      ctx.shadowOffsetY = 3;

      // Box base rectangle with rounded corners
      const rx = -screenW / 2;
      const ry = -screenL / 2;
      const rw = screenW;
      const rh = screenL;
      const radius = 6;

      ctx.beginPath();
      ctx.roundRect(rx, ry, rw, rh, radius);

      // Knitted wool body gradient
      const bodyGrad = ctx.createLinearGradient(rx, ry, rx + rw, ry + rh);
      bodyGrad.addColorStop(0, colDef.lightHex);
      bodyGrad.addColorStop(0.5, colDef.hex);
      bodyGrad.addColorStop(1, colDef.darkHex);
      ctx.fillStyle = bodyGrad;
      ctx.fill();

      // Clear shadow for details
      ctx.shadowColor = 'transparent';

      // Knit texture lines (subtle diagonal ribs)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      const ribCount = Math.floor(rh / 8);
      for (let r = 0; r < ribCount; r++) {
        const lineY = ry + (r + 0.5) * (rh / ribCount);
        ctx.beginPath();
        ctx.moveTo(rx + 4, lineY);
        ctx.lineTo(rx + rw - 4, lineY);
        ctx.stroke();
      }

      // Box border: red if deadlocked, cyan if selected, white if hovered, green if clear
      ctx.lineWidth = isSelected ? 3 : isDeadlocked ? 2.5 : isHovered ? 2.5 : isClear ? 2 : 1;
      ctx.strokeStyle = isSelected
        ? '#38bdf8'
        : isDeadlocked
        ? '#f43f5e'
        : isHovered
        ? '#ffffff'
        : isClear
        ? '#4ade80' // Green hint if unblocked
        : 'rgba(0, 0, 0, 0.5)';
      if (isDeadlocked && !isSelected) {
        ctx.setLineDash([4, 2]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Forward arrow (pointing along +direction which is -Y in local space after rotation)
      const arrowLength = Math.min(screenL * 0.45, 18);
      const arrowWidth = Math.min(screenW * 0.4, 12);
      const arrowTipY = -screenL / 2 + 6;

      ctx.beginPath();
      ctx.moveTo(0, arrowTipY);
      ctx.lineTo(-arrowWidth / 2, arrowTipY + arrowLength * 0.6);
      ctx.lineTo(-arrowWidth / 5, arrowTipY + arrowLength * 0.6);
      ctx.lineTo(-arrowWidth / 5, arrowTipY + arrowLength);
      ctx.lineTo(arrowWidth / 5, arrowTipY + arrowLength);
      ctx.lineTo(arrowWidth / 5, arrowTipY + arrowLength * 0.6);
      ctx.lineTo(arrowWidth / 2, arrowTipY + arrowLength * 0.6);
      ctx.closePath();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Capacity badge pill (bottom center)
      const pillW = Math.min(screenW * 0.75, 28);
      const pillH = 14;
      const pillY = screenL / 2 - pillH - 4;

      ctx.beginPath();
      ctx.roundRect(-pillW / 2, pillY, pillW, pillH, 7);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${b.capacity}`, 0, pillY + pillH / 2);

      // Box ID small text
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.font = '9px monospace';
      ctx.fillText(`#${b.id}`, 0, 0);

      // Deadlock warning icon on box
      if (isDeadlocked) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(0, -screenL / 2 + 6, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', 0, -screenL / 2 + 6);
      }

      // High-contrast Solution exit order badge (1, 2, 3...)
      if (showSolutionOrder && exitStep !== undefined) {
        const textStr = `${exitStep}`;
        const isMultiDigit = exitStep >= 10;
        const badgeW = isMultiDigit ? 22 : 17;
        const badgeH = 16;
        const bx = -screenW / 2 + 2;
        const by = -screenL / 2 + 2;

        ctx.save();
        // Drop shadow for 3D elevation above any box color
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetY = 2;

        // Deep obsidian black pill background
        ctx.beginPath();
        ctx.roundRect(bx, by, badgeW, badgeH, 6);
        ctx.fillStyle = '#030712';
        ctx.fill();

        ctx.shadowColor = 'transparent';

        // High-contrast electric golden amber border
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#fbbf24';
        ctx.stroke();

        // High-contrast neon gold-yellow text
        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(textStr, bx + badgeW / 2, by + badgeH / 2 + 0.5);

        ctx.restore();
      }

      ctx.restore();
    });

    // Draw Marquee box if active
    if (isMarquee) {
      const mx = Math.min(marqueeStart.x, marqueeEnd.x);
      const my = Math.min(marqueeStart.y, marqueeEnd.y);
      const mw = Math.abs(marqueeEnd.x - marqueeStart.x);
      const mh = Math.abs(marqueeEnd.y - marqueeStart.y);

      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.fillRect(mx, my, mw, mh);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(mx, my, mw, mh);
      ctx.setLineDash([]);
    }

    ctx.restore();
  }, [
    boxes,
    selectedBoxIds,
    hoveredBoxId,
    deadlockedIds,
    solutionOrderMap,
    showSolutionOrder,
    pan,
    zoom,
    gridSnap,
    showRays,
    isMarquee,
    marqueeStart,
    marqueeEnd,
    worldToScreen,
  ]);

  // Handle Mouse Down
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Middle click or Space+click or Alt+click = Pan
    if (e.button === 1 || e.altKey || (e.button === 0 && e.shiftKey && e.ctrlKey)) {
      setIsPanning(true);
      setPanStart({ x: mouseX - pan.x, y: mouseY - pan.y });
      return;
    }

    // Left click
    if (e.button === 0) {
      const worldPos = screenToWorld(mouseX, mouseY);
      const clickedBox = findBoxAt(worldPos.x, worldPos.z);

      if (clickedBox) {
        sounds.playPop();

        let newSelected: number[];
        if (e.shiftKey) {
          // Toggle selection
          newSelected = selectedBoxIds.includes(clickedBox.id)
            ? selectedBoxIds.filter((id) => id !== clickedBox.id)
            : [...selectedBoxIds, clickedBox.id];
        } else {
          // If clicked box is already in selected group, keep group intact to allow group dragging!
          // If not in selected group, select just this box
          newSelected = selectedBoxIds.includes(clickedBox.id)
            ? selectedBoxIds
            : [clickedBox.id];
        }
        onSelectBoxes(newSelected);

        // Prepare drag positions for all selected boxes
        const boxPosMap = new Map<number, { x: number; z: number }>();
        boxes.forEach((b) => {
          if (newSelected.includes(b.id)) {
            boxPosMap.set(b.id, { x: b.x, z: b.z });
          }
        });

        hasDraggedRef.current = false;
        setIsDraggingBox(true);
        setDragStartPos({
          mouseX,
          mouseY,
          boxPositions: boxPosMap,
        });
      } else {
        // Clicked on empty space: clear selection unless shift is held, start marquee
        if (!e.shiftKey) {
          onSelectBoxes([]);
        }
        setIsMarquee(true);
        setMarqueeStart({ x: mouseX, y: mouseY });
        setMarqueeEnd({ x: mouseX, y: mouseY });
      }
    }
  };

  // Handle Mouse Move
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (isPanning) {
      setPan({
        x: mouseX - panStart.x,
        y: mouseY - panStart.y,
      });
      return;
    }

    if (isDraggingBox) {
      const dxScreen = mouseX - dragStartPos.mouseX;
      const dyScreen = mouseY - dragStartPos.mouseY;

      if (Math.hypot(dxScreen, dyScreen) > 3) {
        hasDraggedRef.current = true;
      }

      const dxWorld = dxScreen / zoom;
      const dzWorld = -dyScreen / zoom;

      const updated = boxes.map((b) => {
        const initPos = dragStartPos.boxPositions.get(b.id);
        if (!initPos) return b;
        return {
          ...b,
          x: snapVal(initPos.x + dxWorld),
          z: snapVal(initPos.z + dzWorld),
        };
      });

      // Update live positions smoothly without recording history snapshot on every pixel!
      onUpdateBoxes(updated, false);
      return;
    }

    if (isMarquee) {
      setMarqueeEnd({ x: mouseX, y: mouseY });
      return;
    }

    // Hover detection for smooth grab cursor
    const worldPos = screenToWorld(mouseX, mouseY);
    const boxUnderMouse = findBoxAt(worldPos.x, worldPos.z);
    setHoveredBoxId(boxUnderMouse ? boxUnderMouse.id : null);
  };

  // Handle Mouse Up
  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
    }

    if (isDraggingBox) {
      setIsDraggingBox(false);
      // If box actually moved, commit once to undo history
      if (hasDraggedRef.current) {
        onUpdateBoxes(latestBoxesRef.current, true);
        sounds.playPop();
      }
    }

    if (isMarquee) {
      setIsMarquee(false);
      const minX = Math.min(marqueeStart.x, marqueeEnd.x);
      const maxX = Math.max(marqueeStart.x, marqueeEnd.x);
      const minY = Math.min(marqueeStart.y, marqueeEnd.y);
      const maxY = Math.max(marqueeStart.y, marqueeEnd.y);

      if (maxX - minX > 5 || maxY - minY > 5) {
        const selected = boxes
          .filter((b) => {
            const sc = worldToScreen(b.x, b.z);
            return sc.x >= minX && sc.x <= maxX && sc.y >= minY && sc.y <= maxY;
          })
          .map((b) => b.id);
        onSelectBoxes(selected);
      }
    }
  };

  // Handle Wheel Zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 25), 180);

    const mouseWorldX = (mouseX - pan.x) / zoom;
    const mouseWorldZ = -(mouseY - pan.y) / zoom;

    const newPanX = mouseX - mouseWorldX * newZoom;
    const newPanY = mouseY + mouseWorldZ * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  // Keyboard Shortcuts (Rotate, Colors, Capacities, Delete, Duplicate)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      if (selectedBoxIds.length === 0) return;

      // R: Rotate 90 deg clockwise (Shift+R for counter-clockwise)
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        sounds.playPop();
        const delta = e.shiftKey ? -90 : 90;
        const updated = boxes.map((b) => {
          if (!selectedBoxIds.includes(b.id)) return b;
          let nextAngle = (b.angle + delta) % 360;
          if (nextAngle < 0) nextAngle += 360;
          return { ...b, angle: nextAngle };
        });
        onUpdateBoxes(updated, true);
      }

      // Keys 1 to 8 (WITHOUT Shift): Set color 1 to 8 cleanly without conflicting with capacity
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const numKey = parseInt(e.key, 10);
        if (numKey >= 1 && numKey <= 8) {
          e.preventDefault();
          sounds.playPop();
          const updated = boxes.map((b) => {
            if (!selectedBoxIds.includes(b.id)) return b;
            return { ...b, color: numKey };
          });
          onUpdateBoxes(updated, true);
          return;
        }
      }

      // Dedicated Box Capacity Shortcuts (C to cycle, Q=Box4, W=Box6, E=Box10)
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        sounds.playPop();
        const updated = boxes.map((b) => {
          if (!selectedBoxIds.includes(b.id)) return b;
          // Cycle: Box4 -> Box6 -> Box10 -> Box4
          const nextCap = b.capacity === 4 ? 6 : b.capacity === 6 ? 10 : 4;
          const nextType = getBoxNumType(nextCap);
          return { ...b, capacity: nextCap, numType: nextType };
        });
        onUpdateBoxes(updated, true);
        return;
      }

      if (e.key === 'q' || e.key === 'Q' || (e.shiftKey && e.key === '4')) {
        e.preventDefault();
        sounds.playPop();
        const updated = boxes.map((b) => {
          if (!selectedBoxIds.includes(b.id)) return b;
          return { ...b, capacity: 4, numType: 'Box4' as BoxNumType };
        });
        onUpdateBoxes(updated, true);
        return;
      }

      if (e.key === 'w' || e.key === 'W' || (e.shiftKey && e.key === '6')) {
        e.preventDefault();
        sounds.playPop();
        const updated = boxes.map((b) => {
          if (!selectedBoxIds.includes(b.id)) return b;
          return { ...b, capacity: 6, numType: 'Box6' as BoxNumType };
        });
        onUpdateBoxes(updated, true);
        return;
      }

      if (e.key === 'e' || e.key === 'E' || (e.shiftKey && e.key === '0')) {
        e.preventDefault();
        sounds.playPop();
        const updated = boxes.map((b) => {
          if (!selectedBoxIds.includes(b.id)) return b;
          return { ...b, capacity: 10, numType: 'Box10' as BoxNumType };
        });
        onUpdateBoxes(updated, true);
        return;
      }

      // Delete / Backspace: Remove selected boxes
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        sounds.playPop();
        const remaining = boxes.filter((b) => !selectedBoxIds.includes(b.id));
        onUpdateBoxes(remaining, true);
        onSelectBoxes([]);
        return;
      }

      // Ctrl + D: Duplicate selected boxes
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        sounds.playPop();
        const maxId = boxes.reduce((max, b) => Math.max(max, b.id), 0);
        let nextId = maxId + 1;
        const newBoxes: BoxItem[] = [];

        boxes.forEach((b) => {
          if (selectedBoxIds.includes(b.id)) {
            newBoxes.push({
              ...b,
              id: nextId++,
              x: snapVal(b.x + 0.4),
              z: snapVal(b.z + 0.4),
            });
          }
        });

        onUpdateBoxes([...boxes, ...newBoxes], true);
        onSelectBoxes(newBoxes.map((b) => b.id));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBoxIds, boxes, onUpdateBoxes, onSelectBoxes, snapVal]);

  // Determine dynamic canvas cursor
  const canvasCursor = isPanning
    ? 'cursor-grabbing'
    : isDraggingBox
    ? 'cursor-grabbing'
    : hoveredBoxId !== null
    ? 'cursor-grab'
    : isMarquee
    ? 'cursor-crosshair'
    : 'cursor-default';

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-slate-950">
      <canvas
        ref={canvasRef}
        className={`w-full h-full block ${canvasCursor}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* Floating Canvas Controls (Zoom, Reset View, Stats) - Bottom Left */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-slate-900/90 border border-slate-700/60 rounded-xl px-3 py-1.5 shadow-xl backdrop-blur-md text-xs text-slate-300 z-20">
        <span className="font-mono text-cyan-400">{boxes.length} boxes</span>
        <span className="text-slate-600">|</span>
        <span className="font-mono">{selectedBoxIds.length} selected</span>
        <span className="text-slate-600">|</span>
        <button
          onClick={() => {
            if (canvasRef.current) {
              setPan({ x: canvasRef.current.clientWidth / 2, y: canvasRef.current.clientHeight * 0.52 });
              setZoom(52);
            }
          }}
          className="hover:text-white px-1.5 py-0.5 rounded hover:bg-slate-800 transition flex items-center gap-1"
          title="Fit All (Show Dragon Track and Board)"
        >
          <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
          <span>Fit Scene</span>
        </button>
        <span className="text-slate-600">|</span>
        <button
          onClick={() => setShowDragonTrack(!showDragonTrack)}
          className={`px-1.5 py-0.5 rounded transition flex items-center gap-1 font-medium ${
            showDragonTrack
              ? 'text-cyan-400 bg-cyan-950/60 border border-cyan-800/40'
              : 'text-slate-500 hover:text-slate-300'
          }`}
          title="Toggle Dragon Track visibility in editor canvas"
        >
          {showDragonTrack ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span>Dragon Track</span>
        </button>
        <span className="text-slate-600">|</span>
        <button
          onClick={() => {
            if (canvasRef.current) {
              setPan({ x: canvasRef.current.clientWidth / 2, y: canvasRef.current.clientHeight / 2 + 100 });
              setZoom(65);
            }
          }}
          className="hover:text-white px-1 py-0.5 rounded hover:bg-slate-800 transition"
          title="Center on Box Board"
        >
          Focus Boxes
        </button>
        <span className="text-slate-600">|</span>
        <span>Zoom: {Math.round((zoom / 52) * 100)}%</span>
      </div>

      {/* Real-time Solvability & Exit Order Panel - Bottom Right (Requested placement) */}
      <div className="absolute bottom-4 right-4 z-20 flex flex-col items-end gap-2">
        {/* Help Toggle Button */}
        <button
          onClick={() => setShowHelp(!showHelp)}
          className={`p-1.5 rounded-lg border transition shadow-lg backdrop-blur-md text-xs flex items-center gap-1 ${
            showHelp
              ? 'bg-slate-800 border-cyan-500/50 text-cyan-400'
              : 'bg-slate-900/90 border-slate-700/70 text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle Shortcut Cheat Sheet"
        >
          <HelpCircle className="w-4 h-4" />
          <span className="font-medium text-[11px]">Shortcuts</span>
        </button>

        {/* Mini Help Overlay */}
        {showHelp && (
          <div className="bg-slate-900/95 border border-slate-700/70 rounded-xl p-3 text-[11px] text-slate-300 space-y-1.5 shadow-2xl backdrop-blur-md animate-fadeIn w-56">
            <div className="font-bold text-cyan-400 text-xs pb-1 border-b border-slate-800">
              Keyboard Shortcuts
            </div>
            <div className="flex justify-between">
              <span>Color:</span>
              <kbd className="bg-slate-800 px-1 py-0.5 rounded text-white font-mono">1 - 8</kbd>
            </div>
            <div className="flex justify-between">
              <span>Cycle Capacity:</span>
              <kbd className="bg-slate-800 px-1 py-0.5 rounded text-white font-mono">C</kbd>
            </div>
            <div className="flex justify-between">
              <span>Box4 / Box6 / Box10:</span>
              <kbd className="bg-slate-800 px-1 py-0.5 rounded text-white font-mono">Q / W / E</kbd>
            </div>
            <div className="flex justify-between">
              <span>Rotate 90°:</span>
              <kbd className="bg-slate-800 px-1 py-0.5 rounded text-white font-mono">R</kbd>
            </div>
            <div className="flex justify-between">
              <span>Duplicate:</span>
              <kbd className="bg-slate-800 px-1 py-0.5 rounded text-white font-mono">Ctrl + D</kbd>
            </div>
            <div className="flex justify-between">
              <span>Delete:</span>
              <kbd className="bg-slate-800 px-1 py-0.5 rounded text-white font-mono">Del</kbd>
            </div>
            <div className="flex justify-between">
              <span>Pan View:</span>
              <span className="text-slate-400">Middle Drag / Alt</span>
            </div>
          </div>
        )}

        {/* Real-time Solvability & Exit Order Card */}
        <div className="shadow-2xl backdrop-blur-md rounded-xl p-1.5 bg-slate-900/90 border border-slate-700/80">
          {solveResult.success ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Solvable ({boxes.length}/{boxes.length})</span>
              <button
                onClick={() => setShowSolutionOrder(!showSolutionOrder)}
                className={`ml-1 flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono transition ${
                  showSolutionOrder
                    ? 'bg-emerald-600 text-white shadow'
                    : 'bg-emerald-900/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60'
                }`}
                title="Toggle numbered unblocking order on boxes"
              >
                <ListOrdered className="w-3.5 h-3.5" />
                <span>{showSolutionOrder ? 'Hide Order' : 'Show Exit Order'}</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-950/90 border border-rose-500/60 text-rose-300 text-xs font-semibold animate-pulse">
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>Deadlock ({deadlockedIds.size} Stuck)</span>
              <button
                onClick={() => {
                  sounds.playPop();
                  onSelectBoxes([...deadlockedIds]);
                }}
                className="ml-1 flex items-center gap-1 px-2 py-0.5 bg-rose-700 hover:bg-rose-600 text-white rounded text-[11px] font-bold shadow transition"
                title="Select all deadlocked boxes to rotate or move them"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Select Stuck</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
