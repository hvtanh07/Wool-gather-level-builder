import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { BoxItem, BoxNumType, DragonSetup, TunnelSetup, ConveyorSetup, isBoxFrozen } from '../types/level';
import { BOX_DIMENSIONS, getWoolColor, getBoxNumType, ICE_THEME, TUNNEL_THEME, CONVEYOR_THEME } from '../utils/colors';
import { checkExitPath, getBoxCorners, angleToDirection, getTunnelReadyBox, isPointInTunnelCompound } from '../utils/collision';
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
  tunnels?: TunnelSetup[];
  onUpdateTunnels?: (tunnels: TunnelSetup[]) => void;
  selectedTunnelId?: number | null;
  onSelectTunnel?: (id: number | null) => void;
  conveyors?: ConveyorSetup[];
  onUpdateConveyors?: (conveyors: ConveyorSetup[]) => void;
  selectedConveyorId?: number | null;
  onSelectConveyor?: (id: number | null) => void;
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
  tunnels = [],
  onUpdateTunnels,
  selectedTunnelId = null,
  onSelectTunnel,
  conveyors = [],
  onUpdateConveyors,
  selectedConveyorId = null,
  onSelectConveyor,
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
  const [hoveredTunnelId, setHoveredTunnelId] = useState<number | null>(null);
  const [hoveredConveyorId, setHoveredConveyorId] = useState<number | null>(null);

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

  // Dragging Tunnels
  const [isDraggingTunnel, setIsDraggingTunnel] = useState(false);
  const [dragTunnelStart, setDragTunnelStart] = useState<{
    mouseX: number;
    mouseY: number;
    tunnelId: number;
    startX: number;
    startZ: number;
  } | null>(null);

  // Dragging Conveyors
  const [isDraggingConveyor, setIsDraggingConveyor] = useState(false);
  const [dragConveyorStart, setDragConveyorStart] = useState<{
    mouseX: number;
    mouseY: number;
    conveyorId: number;
    startZ: number;
  } | null>(null);

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

  const findTunnelAt = useCallback(
    (wx: number, wz: number): TunnelSetup | undefined => {
      for (let i = tunnels.length - 1; i >= 0; i--) {
        if (isPointInTunnelCompound(wx, wz, tunnels[i])) {
          return tunnels[i];
        }
      }
      return undefined;
    },
    [tunnels]
  );

  // Check if a point is inside a conveyor belt
  const isPointInConveyor = (wx: number, wz: number, c: ConveyorSetup): boolean => {
    const minX = Math.min(c.startX, c.endX);
    const maxX = Math.max(c.startX, c.endX);
    return wx >= minX && wx <= maxX && Math.abs(wz - c.z) <= 0.45;
  };

  const findConveyorAt = useCallback(
    (wx: number, wz: number): ConveyorSetup | undefined => {
      for (let i = conveyors.length - 1; i >= 0; i--) {
        if (isPointInConveyor(wx, wz, conveyors[i])) {
          return conveyors[i];
        }
      }
      return undefined;
    },
    [conveyors]
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

    // -------------------------------------------------------------
    // DRAW CONVEYORS
    // -------------------------------------------------------------
    conveyors.forEach((conv) => {
      const isSelected = selectedConveyorId === conv.id;
      const isHovered = hoveredConveyorId === conv.id;
      const beltH = 0.85 * zoom;
      const pStart = worldToScreen(conv.startX, conv.z);
      const pEnd = worldToScreen(conv.endX, conv.z);
      const minX = Math.min(pStart.x, pEnd.x);
      const maxX = Math.max(pStart.x, pEnd.x);
      const beltW = maxX - minX;
      const beltY = pStart.y - beltH / 2;

      ctx.save();

      // Belt shadow / glow
      ctx.shadowColor = isSelected ? 'rgba(6, 182, 212, 0.8)' : 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = isSelected ? 14 : isHovered ? 8 : 4;

      // Dark rubber belt base
      ctx.fillStyle = CONVEYOR_THEME.beltHex;
      ctx.beginPath();
      ctx.roundRect(minX, beltY, beltW, beltH, 6);
      ctx.fill();

      ctx.shadowColor = 'transparent';

      // Belt border
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.strokeStyle = isSelected ? '#06b6d4' : isHovered ? '#94a3b8' : CONVEYOR_THEME.borderHex;
      ctx.stroke();

      // Rubber tread ribs
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      const treadStep = 12;
      for (let tx = minX + 8; tx < maxX - 8; tx += treadStep) {
        ctx.beginPath();
        ctx.moveTo(tx, beltY + 3);
        ctx.lineTo(tx, beltY + beltH - 3);
        ctx.stroke();
      }

      // Direction chevrons
      const isLTR = conv.direction === 'left-to-right';
      ctx.fillStyle = CONVEYOR_THEME.chevronHex;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const chevCount = Math.max(3, Math.floor(beltW / 50));
      for (let i = 1; i < chevCount; i++) {
        const cx = minX + (i * beltW) / chevCount;
        ctx.fillText(isLTR ? '▶▶▶' : '◀◀◀', cx, beltY + beltH / 2);
      }

      // Active Zone Highlight (Preset interactive zone)
      const pActiveMin = worldToScreen(conv.activeZoneMinX, conv.z);
      const pActiveMax = worldToScreen(conv.activeZoneMaxX, conv.z);
      const activeLeft = Math.min(pActiveMin.x, pActiveMax.x);
      const activeRight = Math.max(pActiveMin.x, pActiveMax.x);
      const activeW = activeRight - activeLeft;

      // Active zone background tint
      ctx.fillStyle = CONVEYOR_THEME.activeZoneBg;
      ctx.fillRect(activeLeft, beltY, activeW, beltH);

      // Neon cyan border markers for active zone
      ctx.strokeStyle = CONVEYOR_THEME.activeZoneBorder;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(activeLeft, beltY, activeW, beltH);
      ctx.setLineDash([]);

      // Active zone label badge
      ctx.fillStyle = 'rgba(6, 182, 212, 0.2)';
      ctx.fillRect(activeLeft, beltY + beltH - 12, activeW, 12);
      ctx.fillStyle = '#67e8f9';
      ctx.font = 'bold 8px monospace';
      ctx.fillText('⚡ ACTIVE PICK ZONE ⚡', activeLeft + activeW / 2, beltY + beltH - 6);

      // Covered Hoods at ends (Left & Right screen sides)
      const hoodW = Math.max(28, zoom * 0.65);
      ctx.fillStyle = CONVEYOR_THEME.hoodHex;
      // Left hood
      ctx.beginPath();
      ctx.roundRect(minX - 2, beltY - 2, hoodW, beltH + 4, [6, 0, 0, 6]);
      ctx.fill();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Right hood
      ctx.beginPath();
      ctx.roundRect(maxX - hoodW + 2, beltY - 2, hoodW, beltH + 4, [0, 6, 6, 0]);
      ctx.fill();
      ctx.stroke();

      // LED Counter Display: [ 🔄 CONV N ]
      const badgeText = `🔄 CONV [${conv.boxes.length}]`;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(minX + 8, beltY - 18, 80, 16, 4);
      ctx.fill();
      ctx.strokeStyle = CONVEYOR_THEME.counterHex;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = CONVEYOR_THEME.counterHex;
      ctx.font = 'bold 9px monospace';
      ctx.fillText(badgeText, minX + 48, beltY - 10);

      ctx.restore();

      // Render Conveyor Buses
      conv.boxes.forEach((cb) => {
        const cScreen = worldToScreen(cb.x, conv.z);
        const colDef = getWoolColor(cb.color);
        const dim = BOX_DIMENSIONS[cb.numType] || BOX_DIMENSIONS.Box4;
        const bW = dim.width * zoom;
        const bL = dim.length * zoom;

        ctx.save();
        ctx.translate(cScreen.x, cScreen.y);
        ctx.rotate((cb.angle * Math.PI) / 180);

        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;

        const bx = -bW / 2;
        const by = -bL / 2;
        ctx.beginPath();
        ctx.roundRect(bx, by, bW, bL, 5);

        const bGrad = ctx.createLinearGradient(bx, by, bx + bW, by + bL);
        bGrad.addColorStop(0, colDef.lightHex);
        bGrad.addColorStop(0.5, colDef.hex);
        bGrad.addColorStop(1, colDef.darkHex);
        ctx.fillStyle = bGrad;
        ctx.fill();

        ctx.shadowColor = 'transparent';

        const inActive = cb.x >= conv.activeZoneMinX && cb.x <= conv.activeZoneMaxX;
        ctx.strokeStyle = inActive ? '#ffffff' : 'rgba(255,255,255,0.4)';
        ctx.lineWidth = inActive ? 1.5 : 1;
        ctx.stroke();

        const pW = Math.min(bW * 0.75, 24);
        const pH = 12;
        const pY = bL / 2 - pH - 3;
        ctx.beginPath();
        ctx.roundRect(-pW / 2, pY, pW, pH, 5);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${cb.capacity}`, 0, pY + pH / 2);

        ctx.restore();
      });
    });

    // Collect all obstacles: board boxes + ready boxes + stationary tunnel structures
    const tunnelObstacles: BoxItem[] = [];
    tunnels.forEach((tun) => {
      const rBox = getTunnelReadyBox(tun);
      if (rBox) tunnelObstacles.push(rBox);
      // Stationary tunnel structure acts as an obstacle
      tunnelObstacles.push({
        id: -(tun.id * 1000 + 999),
        x: tun.x,
        z: tun.z,
        angle: tun.angle,
        numType: 'Box6',
        capacity: 6,
        color: 1,
        boxType: 'Normal',
      });
    });
    const allObstacles = [...boxes, ...tunnelObstacles];

    // Precalculate exit blockage for all boxes
    const exitStatus = new Map<number, ReturnType<typeof checkExitPath>>();
    boxes.forEach((b) => {
      exitStatus.set(b.id, checkExitPath(b, allObstacles));
    });

    // Precalculate exit blockage for tunnels with a ready bus
    const tunnelExitStatus = new Map<number, ReturnType<typeof checkExitPath>>();
    tunnels.forEach((tun) => {
      const readyBox = getTunnelReadyBox(tun);
      if (readyBox) {
        // Exclude the readyBox itself and its parent tunnel structure
        const otherObstacles = allObstacles.filter(
          (o) => o.id !== readyBox.id && o.id !== -(tun.id * 1000 + 999)
        );
        tunnelExitStatus.set(tun.id, checkExitPath(readyBox, otherObstacles));
      }
    });

    // Draw exit rays if enabled or for selected box/tunnel
    if (showRays || selectedBoxIds.length > 0 || selectedTunnelId !== null) {
      boxes.forEach((b) => {
        const isSelected = selectedBoxIds.includes(b.id);
        if (!showRays && !isSelected) return;

        const corners = getBoxCorners(b);
        const status = exitStatus.get(b.id);
        const isTargetFrozen =
          status?.isBlocked && status.blockingBoxId
            ? isBoxFrozen(boxes.find((target) => target.id === status.blockingBoxId))
            : false;

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
        ctx.strokeStyle = isTargetFrozen
          ? 'rgba(56, 189, 248, 0.95)'
          : status?.isBlocked
          ? 'rgba(239, 68, 68, 0.7)'
          : 'rgba(34, 197, 94, 0.85)';
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.setLineDash(status?.isBlocked ? (isTargetFrozen ? [6, 3] : [4, 4]) : []);
        ctx.stroke();
        ctx.setLineDash([]);

        if (status?.isBlocked && status.hitPoint) {
          const hitScreen = worldToScreen(status.hitPoint.x, status.hitPoint.z);
          ctx.beginPath();
          ctx.arc(hitScreen.x, hitScreen.y, isTargetFrozen ? 6 : 4, 0, Math.PI * 2);
          ctx.fillStyle = isTargetFrozen ? '#38bdf8' : '#ef4444';
          ctx.fill();
          if (isTargetFrozen) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      });

      // Draw exit rays for tunnels with ready bus (originating from front of ready box)
      tunnels.forEach((tun) => {
        const isSelected = selectedTunnelId === tun.id;
        if (!showRays && !isSelected) return;
        const readyBox = getTunnelReadyBox(tun);
        if (!readyBox) return;

        const status = tunnelExitStatus.get(tun.id);
        const corners = getBoxCorners(readyBox);
        const isTargetFrozen =
          status?.isBlocked && status.blockingBoxId
            ? isBoxFrozen(boxes.find((target) => target.id === status.blockingBoxId))
            : false;

        const pStart = worldToScreen(
          readyBox.x + corners.direction.x * (corners.length / 2),
          readyBox.z + corners.direction.z * (corners.length / 2)
        );

        const rayDist = status?.isBlocked && status.distanceToBlocker ? status.distanceToBlocker : 15;
        const pEnd = worldToScreen(
          readyBox.x + corners.direction.x * (corners.length / 2 + rayDist),
          readyBox.z + corners.direction.z * (corners.length / 2 + rayDist)
        );

        ctx.beginPath();
        ctx.moveTo(pStart.x, pStart.y);
        ctx.lineTo(pEnd.x, pEnd.y);
        ctx.strokeStyle = isTargetFrozen
          ? 'rgba(56, 189, 248, 0.95)'
          : status?.isBlocked
          ? 'rgba(239, 68, 68, 0.7)'
          : 'rgba(34, 197, 94, 0.85)';
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.setLineDash(status?.isBlocked ? (isTargetFrozen ? [6, 3] : [4, 4]) : [6, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        if (status?.isBlocked && status.hitPoint) {
          const hitScreen = worldToScreen(status.hitPoint.x, status.hitPoint.z);
          ctx.beginPath();
          ctx.arc(hitScreen.x, hitScreen.y, isTargetFrozen ? 6 : 4, 0, Math.PI * 2);
          ctx.fillStyle = isTargetFrozen ? '#38bdf8' : '#ef4444';
          ctx.fill();
          if (isTargetFrozen) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      });
    }

    // Draw Boxes
    boxes.forEach((b) => {
      const isSelected = selectedBoxIds.includes(b.id);
      const isHovered = hoveredBoxId === b.id;
      const isDeadlocked = deadlockedIds.has(b.id);
      const isFrozen = isBoxFrozen(b);
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

      // Box shadow: glowing red if deadlocked, cyan if selected, ice glow if frozen, subtle otherwise
      ctx.shadowColor = isDeadlocked
        ? 'rgba(239, 68, 68, 0.85)'
        : isSelected
        ? 'rgba(56, 189, 248, 0.7)'
        : isFrozen
        ? 'rgba(56, 189, 248, 0.65)'
        : isHovered
        ? 'rgba(255, 255, 255, 0.4)'
        : 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = isDeadlocked ? 14 : isSelected ? 12 : isFrozen ? 10 : isHovered ? 8 : 6;
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

      // Crystalline Ice overlay for Frozen Box
      if (isFrozen) {
        const iceGrad = ctx.createLinearGradient(rx, ry, rx + rw, ry + rh);
        iceGrad.addColorStop(0, 'rgba(224, 242, 254, 0.85)');
        iceGrad.addColorStop(0.5, 'rgba(186, 230, 253, 0.6)');
        iceGrad.addColorStop(1, 'rgba(125, 211, 252, 0.85)');
        ctx.fillStyle = iceGrad;
        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, radius);
        ctx.fill();

        // Jagged ice crack lines
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(rx + 4, ry + 6);
        ctx.lineTo(rx + rw * 0.35, ry + rh * 0.4);
        ctx.lineTo(rx + rw * 0.2, ry + rh * 0.7);
        ctx.moveTo(rx + rw - 4, ry + 8);
        ctx.lineTo(rx + rw * 0.6, ry + rh * 0.35);
        ctx.lineTo(rx + rw * 0.7, ry + rh * 0.75);
        ctx.stroke();
        ctx.restore();
      }

      // Box border
      ctx.lineWidth = isSelected ? 3 : isFrozen ? 2.5 : isDeadlocked ? 2.5 : isHovered ? 2.5 : isClear ? 2 : 1;
      ctx.strokeStyle = isSelected
        ? '#38bdf8'
        : isFrozen
        ? '#7dd3fc'
        : isDeadlocked
        ? '#f43f5e'
        : isHovered
        ? '#ffffff'
        : isClear
        ? '#4ade80'
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

      // Snowflake badge in corner for Frozen Box
      if (isFrozen) {
        const badgeSize = 14;
        const bX = rx + rw - badgeSize - 2;
        const bY = ry + 2;
        ctx.beginPath();
        ctx.roundRect(bX, bY, badgeSize, badgeSize, 4);
        ctx.fillStyle = 'rgba(12, 74, 110, 0.88)';
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#e0f2fe';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('❄️', bX + badgeSize / 2, bY + badgeSize / 2);
      }

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
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetY = 2;

        ctx.beginPath();
        ctx.roundRect(bx, by, badgeW, badgeH, 6);
        ctx.fillStyle = '#030712';
        ctx.fill();

        ctx.shadowColor = 'transparent';

        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#fbbf24';
        ctx.stroke();

        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(textStr, bx + badgeW / 2, by + badgeH / 2 + 0.5);

        ctx.restore();
      }

      ctx.restore();
    });

    // -------------------------------------------------------------
    // DRAW TUNNELS (Shown as 2 objects: Tunnel structure & Ready Box in front)
    // -------------------------------------------------------------
    tunnels.forEach((tun) => {
      const isSelected = selectedTunnelId === tun.id;
      const isHovered = hoveredTunnelId === tun.id;
      const tScreen = worldToScreen(tun.x, tun.z);
      const tunDim = BOX_DIMENSIONS.Box6;
      const tunW = tunDim.width * zoom;
      const tunH = tunDim.length * zoom;

      // 1. Draw the Tunnel Structure itself
      ctx.save();
      ctx.translate(tScreen.x, tScreen.y);
      ctx.rotate((tun.angle * Math.PI) / 180);

      // Tunnel Arch Shadow
      ctx.shadowColor = isSelected ? 'rgba(250, 204, 21, 0.85)' : 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = isSelected ? 16 : isHovered ? 10 : 6;

      const ax = -tunW / 2;
      const ay = -tunH / 2;

      // Outer metallic capsule body
      ctx.beginPath();
      ctx.roundRect(ax, ay, tunW, tunH, 7);
      const tunBodyGrad = ctx.createLinearGradient(ax, ay, ax + tunW, ay + tunH);
      tunBodyGrad.addColorStop(0, '#334155');
      tunBodyGrad.addColorStop(0.5, '#1e293b');
      tunBodyGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = tunBodyGrad;
      ctx.fill();

      ctx.shadowColor = 'transparent';

      // Outer border
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.strokeStyle = isSelected ? '#facc15' : isHovered ? '#38bdf8' : '#475569';
      ctx.stroke();

      // Side metallic rails (Left & Right bumpers)
      const railW = Math.max(4, tunW * 0.16);

      // Left rail
      ctx.beginPath();
      ctx.roundRect(ax + 2, ay + 2, railW, tunH - 4, 3);
      const leftRailGrad = ctx.createLinearGradient(ax + 2, 0, ax + 2 + railW, 0);
      leftRailGrad.addColorStop(0, '#94a3b8');
      leftRailGrad.addColorStop(0.5, '#cbd5e1');
      leftRailGrad.addColorStop(1, '#475569');
      ctx.fillStyle = leftRailGrad;
      ctx.fill();

      // Right rail
      ctx.beginPath();
      ctx.roundRect(ax + tunW - railW - 2, ay + 2, railW, tunH - 4, 3);
      const rightRailGrad = ctx.createLinearGradient(ax + tunW - railW - 2, 0, ax + tunW - 2, 0);
      rightRailGrad.addColorStop(0, '#475569');
      rightRailGrad.addColorStop(0.5, '#cbd5e1');
      rightRailGrad.addColorStop(1, '#94a3b8');
      ctx.fillStyle = rightRailGrad;
      ctx.fill();

      // Center dark track lane
      const trackLeft = ax + railW + 3;
      const trackW = tunW - railW * 2 - 6;
      ctx.beginPath();
      ctx.roundRect(trackLeft, ay + 3, trackW, tunH - 6, 3);
      ctx.fillStyle = '#090d16';
      ctx.fill();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Chevrons pointing towards the ready box (in local space, towards +Y mouth)
      const chevY = ay + tunH * 0.68;
      const chevW = Math.min(trackW * 0.65, 12);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Chevron 1
      ctx.beginPath();
      ctx.moveTo(-chevW / 2, chevY - 4);
      ctx.lineTo(0, chevY);
      ctx.lineTo(chevW / 2, chevY - 4);
      ctx.stroke();

      // Chevron 2
      ctx.beginPath();
      ctx.moveTo(-chevW / 2, chevY + 4);
      ctx.lineTo(0, chevY + 8);
      ctx.lineTo(chevW / 2, chevY + 4);
      ctx.stroke();

      // Counter Number (remaining stored buses waiting in tunnel queue)
      const storedCount = Math.max(0, tun.queue.length - 1);
      const numY = ay + tunH * 0.32;
      ctx.save();
      ctx.translate(0, numY);
      // Counter-rotate text so digit is ALWAYS upright and legible on screen
      ctx.rotate(-(tun.angle * Math.PI) / 180);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText(`${storedCount}`, 0, 0);
      ctx.fillText(`${storedCount}`, 0, 0);
      ctx.restore();

      ctx.restore();

      // 2. Draw the Ready Box in Front of the Tunnel (ALWAYS in opposite direction)
      const readyBox = getTunnelReadyBox(tun);
      if (readyBox) {
        const bScreen = worldToScreen(readyBox.x, readyBox.z);
        const bDim = BOX_DIMENSIONS[readyBox.numType] || BOX_DIMENSIONS.Box6;
        const bW = bDim.width * zoom;
        const bL = bDim.length * zoom;
        const colDef = getWoolColor(readyBox.color);

        ctx.save();
        ctx.translate(bScreen.x, bScreen.y);
        ctx.rotate((readyBox.angle * Math.PI) / 180);

        // Box shadow
        ctx.shadowColor = isSelected
          ? 'rgba(250, 204, 21, 0.75)'
          : isHovered
          ? 'rgba(56, 189, 248, 0.6)'
          : 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = isSelected ? 14 : isHovered ? 10 : 5;
        ctx.shadowOffsetY = 2;

        const bx = -bW / 2;
        const by = -bL / 2;
        ctx.beginPath();
        ctx.roundRect(bx, by, bW, bL, 6);

        // Body knitted wool gradient
        const bGrad = ctx.createLinearGradient(bx, by, bx + bW, by + bL);
        bGrad.addColorStop(0, colDef.lightHex);
        bGrad.addColorStop(0.5, colDef.hex);
        bGrad.addColorStop(1, colDef.darkHex);
        ctx.fillStyle = bGrad;
        ctx.fill();

        ctx.shadowColor = 'transparent';

        // Knit texture lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        const ribCount = Math.floor(bL / 8);
        for (let r = 0; r < ribCount; r++) {
          const lineY = by + (r + 0.5) * (bL / ribCount);
          ctx.beginPath();
          ctx.moveTo(bx + 4, lineY);
          ctx.lineTo(bx + bW - 4, lineY);
          ctx.stroke();
        }

        // Box border
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.strokeStyle = isSelected ? '#facc15' : isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath();
        ctx.roundRect(bx, by, bW, bL, 6);
        ctx.stroke();

        // Forward direction arrow (pointing along readyBox.angle, away from tunnel)
        const arrowLength = Math.min(bL * 0.45, 18);
        const arrowWidth = Math.min(bW * 0.42, 13);
        const arrowTipY = -bL / 2 + 6;

        ctx.beginPath();
        ctx.moveTo(0, arrowTipY);
        ctx.lineTo(-arrowWidth / 2, arrowTipY + arrowLength * 0.6);
        ctx.lineTo(-arrowWidth / 5, arrowTipY + arrowLength * 0.6);
        ctx.lineTo(-arrowWidth / 5, arrowTipY + arrowLength);
        ctx.lineTo(arrowWidth / 5, arrowTipY + arrowLength);
        ctx.lineTo(arrowWidth / 5, arrowTipY + arrowLength * 0.6);
        ctx.lineTo(arrowWidth / 2, arrowTipY + arrowLength * 0.6);
        ctx.closePath();

        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Capacity badge pill (bottom of the box)
        const pillW = Math.min(bW * 0.75, 24);
        const pillH = 13;
        const pillY = bL / 2 - pillH - 4;

        ctx.beginPath();
        ctx.roundRect(-pillW / 2, pillY, pillW, pillH, 6);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${readyBox.capacity}`, 0, pillY + pillH / 2);

        // Small Tunnel ready badge
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.font = '8px monospace';
        ctx.fillText(`T#${tun.id}`, 0, 0);

        ctx.restore();
      }
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
    tunnels,
    selectedTunnelId,
    hoveredTunnelId,
    conveyors,
    selectedConveyorId,
    hoveredConveyorId,
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

      // 1. Check Tunnel click
      const clickedTunnel = findTunnelAt(worldPos.x, worldPos.z);
      if (clickedTunnel) {
        sounds.playPop();
        if (onSelectTunnel) onSelectTunnel(clickedTunnel.id);
        if (onSelectConveyor) onSelectConveyor(null);
        onSelectBoxes([]);
        setIsDraggingTunnel(true);
        setDragTunnelStart({
          mouseX,
          mouseY,
          tunnelId: clickedTunnel.id,
          startX: clickedTunnel.x,
          startZ: clickedTunnel.z,
        });
        return;
      }

      // 2. Check Conveyor click
      const clickedConveyor = findConveyorAt(worldPos.x, worldPos.z);
      if (clickedConveyor) {
        sounds.playPop();
        if (onSelectConveyor) onSelectConveyor(clickedConveyor.id);
        if (onSelectTunnel) onSelectTunnel(null);
        onSelectBoxes([]);
        setIsDraggingConveyor(true);
        setDragConveyorStart({
          mouseX,
          mouseY,
          conveyorId: clickedConveyor.id,
          startZ: clickedConveyor.z,
        });
        return;
      }

      // 3. Check Box click
      const clickedBox = findBoxAt(worldPos.x, worldPos.z);

      if (clickedBox) {
        sounds.playPop();
        if (onSelectTunnel) onSelectTunnel(null);
        if (onSelectConveyor) onSelectConveyor(null);

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
          if (onSelectTunnel) onSelectTunnel(null);
          if (onSelectConveyor) onSelectConveyor(null);
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

    if (isDraggingTunnel && dragTunnelStart && onUpdateTunnels) {
      const dxScreen = mouseX - dragTunnelStart.mouseX;
      const dyScreen = mouseY - dragTunnelStart.mouseY;
      const dxWorld = dxScreen / zoom;
      const dzWorld = -dyScreen / zoom;
      const updated = tunnels.map((t) => {
        if (t.id !== dragTunnelStart.tunnelId) return t;
        return {
          ...t,
          x: snapVal(dragTunnelStart.startX + dxWorld),
          z: snapVal(dragTunnelStart.startZ + dzWorld),
        };
      });
      onUpdateTunnels(updated);
      return;
    }

    if (isDraggingConveyor && dragConveyorStart && onUpdateConveyors) {
      const dyScreen = mouseY - dragConveyorStart.mouseY;
      const dzWorld = -dyScreen / zoom;
      const updated = conveyors.map((c) => {
        if (c.id !== dragConveyorStart.conveyorId) return c;
        return {
          ...c,
          z: snapVal(dragConveyorStart.startZ + dzWorld),
        };
      });
      onUpdateConveyors(updated);
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

    const tunnelUnderMouse = findTunnelAt(worldPos.x, worldPos.z);
    setHoveredTunnelId(tunnelUnderMouse ? tunnelUnderMouse.id : null);

    const conveyorUnderMouse = findConveyorAt(worldPos.x, worldPos.z);
    setHoveredConveyorId(conveyorUnderMouse ? conveyorUnderMouse.id : null);
  };

  // Handle Mouse Up
  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
    }

    if (isDraggingTunnel) {
      setIsDraggingTunnel(false);
      setDragTunnelStart(null);
    }

    if (isDraggingConveyor) {
      setIsDraggingConveyor(false);
      setDragConveyorStart(null);
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
