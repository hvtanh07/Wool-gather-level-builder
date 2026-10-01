import React, { useRef, useEffect, useState, useCallback } from 'react';
import { CleanLevelData, BoxItem, DragonSection } from '../types/level';
import { BOX_DIMENSIONS, getWoolColor } from '../utils/colors';
import { checkExitPath, angleToDirection } from '../utils/collision';
import { sounds } from '../utils/audio';
import confetti from 'canvas-confetti';
import {
  Play,
  Pause,
  RotateCcw,
  ArrowLeft,
  FastForward,
  Trophy,
  Skull,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';

interface PlaytestViewProps {
  levelData: CleanLevelData;
  onExit: () => void;
}

interface SlottedBox {
  box: BoxItem;
  filled: number;
  capacity: number;
  color: number;
  slotIndex: number;
  flyProgress: number; // 0 = just launched, 1 = docked
  sourceScreenPos: { x: number; y: number };
  leavingAnim?: number; // 0 to 1 when departing after full
}

interface FloatingFeedback {
  id: number;
  text: string;
  x: number;
  y: number;
  color: string;
  lifetime: number;
}

interface YarnParticle {
  slotIndex: number;
  colorHex: string;
  t: number; // 0 (at dragon) to 1 (at slot)
  startPos: { x: number; y: number };
  endPos: { x: number; y: number };
}

// Fog covers the first 1/3 of the moving path (progress 0.0 to 1/3).
// Boxes cannot scan or retrieve segments that are inside this fog area.
const FOG_BOUNDARY = 1 / 3;
// Starting point right below/at the exit of the fog area where the dragon begins.
// The dragon head cannot move backward beyond this starting point.
const START_POINT = 1 / 3;

export const PlaytestView: React.FC<PlaytestViewProps> = ({ levelData, onExit }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // UI state for React overlays and controls
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [gameSpeed, setGameSpeed] = useState<number>(1.0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [gameState, setGameState] = useState<'playing' | 'won' | 'lost'>('playing');
  const [uiProgress, setUiProgress] = useState<number>(START_POINT);
  const [uiCatIndex, setUiCatIndex] = useState<number>(0);

  // Pan & Zoom UI State
  const [zoomDisplay, setZoomDisplay] = useState<number>(100);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [hoveredBox, setHoveredBox] = useState<{ id: number; isBlocked: boolean } | null>(null);

  // Pointer state for distinguishing between click (launch box) and drag (pan view)
  const pointerStateRef = useRef<{
    isDown: boolean;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    hasMoved: boolean;
    button: number;
  }>({
    isDown: false,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    hasMoved: false,
    button: 0,
  });

  // Engine state ref: keeps game loop running smoothly at 60fps without React state resets
  const engineRef = useRef<{
    isPlaying: boolean;
    gameSpeed: number;
    gameState: 'playing' | 'won' | 'lost';
    dragonProgress: number;
    catIndex: number;
    catHopAnim: number;
    dragonSections: DragonSection[];
    slottedBoxes: (SlottedBox | null)[];
    boardBoxes: BoxItem[];
    shakingBoxId: number | null;
    shakeTimer: number;
    feedbacks: FloatingFeedback[];
    woolGatherTimer: number;
    yarnParticles: YarnParticle[];
    activeConnections: Map<number, { slotIdx: number; colorHex: string; dragonPt: { x: number; y: number } }>;
    boardZoomScale: number;
    boardPanOffset: { x: number; y: number };
    reconnectState: {
      isReconnecting: boolean;
      cutIndex: number;
      tailAnchorProgress: number;
      frontKnots: number;
    } | null;
  }>({
    isPlaying: true,
    gameSpeed: 1.0,
    gameState: 'playing',
    dragonProgress: START_POINT,
    catIndex: 0,
    catHopAnim: 0,
    dragonSections: [],
    slottedBoxes: [],
    boardBoxes: [],
    shakingBoxId: null,
    shakeTimer: 0,
    feedbacks: [],
    woolGatherTimer: 0,
    yarnParticles: [],
    activeConnections: new Map(),
    boardZoomScale: 1.0,
    boardPanOffset: { x: 0, y: 0 },
    reconnectState: null,
  });

  // Keep control props synced to engineRef
  useEffect(() => {
    engineRef.current.isPlaying = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    engineRef.current.gameSpeed = gameSpeed;
  }, [gameSpeed]);

  // Spline interpolation for dragon track
  const getTrackPointAt = useCallback(
    (progress: number): { x: number; y: number; angle: number } => {
      const track = levelData.dragon.track;
      if (!track || track.length < 2) return { x: 0, y: 5, angle: 0 };

      const clampedP = Math.max(0, Math.min(progress, 0.9999));
      const totalSegments = track.length - 1;
      const segIndex = Math.min(Math.floor(clampedP * totalSegments), totalSegments - 1);
      const segT = clampedP * totalSegments - segIndex;

      const p0 = track[segIndex];
      const p1 = track[segIndex + 1];

      const x = p0.x + (p1.x - p0.x) * segT;
      const y = p0.y + (p1.y - p0.y) * segT;

      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const angle = Math.atan2(dy, dx);

      return { x, y, angle };
    },
    [levelData.dragon.track]
  );

  // Initialize or Reset the game
  const resetGame = useCallback(() => {
    const maxSlots = Math.max(4, levelData.slots.unlockedCount || 4);
    const initialSlots: (SlottedBox | null)[] = [];
    for (let i = 0; i < maxSlots; i++) {
      initialSlots.push(null);
    }

    const prevZoom = engineRef.current?.boardZoomScale ?? 1.0;
    const prevPan = engineRef.current?.boardPanOffset ?? { x: 0, y: 0 };

    engineRef.current = {
      isPlaying: true,
      gameSpeed,
      gameState: 'playing',
      dragonProgress: START_POINT,
      catIndex: 0,
      catHopAnim: 0,
      dragonSections: JSON.parse(JSON.stringify(levelData.dragon.sections)),
      slottedBoxes: initialSlots,
      boardBoxes: JSON.parse(JSON.stringify(levelData.boxes)),
      shakingBoxId: null,
      shakeTimer: 0,
      feedbacks: [],
      woolGatherTimer: 0,
      yarnParticles: [],
      activeConnections: new Map(),
      boardZoomScale: prevZoom,
      boardPanOffset: prevPan,
      reconnectState: null,
    };

    setGameState('playing');
    setUiProgress(START_POINT);
    setUiCatIndex(0);
    setIsPlaying(true);
  }, [levelData, gameSpeed]);

  useEffect(() => {
    resetGame();
  }, [resetGame]);

  // Main continuous 60fps Game Loop
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();
    let uiThrottleTimer = 0;

    const loop = (currentTime: number) => {
      const rawDt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      const engine = engineRef.current;
      const dt = rawDt * engine.gameSpeed;

      if (engine.isPlaying && engine.gameState === 'playing') {
        const segStep = 0.007;

        if (engine.reconnectState && engine.reconnectState.isReconnecting) {
          // Reconnect logic:
          // Front moves backward towards tail, but cannot retreat beyond START_POINT.
          // If head reaches START_POINT, the body moves up (forward along track) to connect with head.
          const reconnectSpeed = 0.14; // track progress per second
          const retractStep = reconnectSpeed * dt;

          if (engine.dragonProgress > START_POINT) {
            engine.dragonProgress = Math.max(START_POINT, engine.dragonProgress - retractStep);
          } else {
            // Head is at START_POINT: cannot retreat further! Body (tail) moves up to connect!
            engine.dragonProgress = START_POINT;
            engine.reconnectState.tailAnchorProgress += reconnectSpeed * dt;
          }

          const currentFrontBack =
            engine.dragonProgress - engine.reconnectState.frontKnots * segStep;

          if (currentFrontBack <= engine.reconnectState.tailAnchorProgress) {
            // Body attached! Snap to exact alignment and resume forward crawl
            engine.dragonProgress = Math.max(
              START_POINT,
              engine.reconnectState.tailAnchorProgress +
                engine.reconnectState.frontKnots * segStep
            );
            engine.reconnectState = null;
            sounds.playPop(); // Crisp attachment snap sound
          }
        } else {
          // 1. Advance Dragon steadily forward along track
          const baseSpeed = levelData.dragon.speed || 0.015;
          engine.dragonProgress += baseSpeed * dt;

          // 2. Check Cat Checkpoint Collisions
          const catPositions = levelData.dragon.catPositions;
          if (catPositions && engine.catIndex < catPositions.length) {
            const currentCatTarget = catPositions[engine.catIndex];
            if (engine.dragonProgress >= currentCatTarget.progress) {
              if (engine.catIndex < catPositions.length - 1) {
                // Cat leaps to next checkpoint!
                sounds.playCatJump();
                engine.catIndex += 1;
                engine.catHopAnim = 1.0;
                setUiCatIndex(engine.catIndex);
              } else {
                // Reached cat at final checkpoint: DEFEAT!
                sounds.playDefeat();
                engine.gameState = 'lost';
                setGameState('lost');
              }
            }
          }
        }

        // Cat hop animation decay
        if (engine.catHopAnim > 0) {
          engine.catHopAnim = Math.max(0, engine.catHopAnim - dt * 3.0);
        }

        // Box shake animation timer
        if (engine.shakeTimer > 0) {
          engine.shakeTimer -= dt;
          if (engine.shakeTimer <= 0) {
            engine.shakingBoxId = null;
          }
        }

        // 3. Update Flying Boxes animation towards slot
        engine.slottedBoxes.forEach((sb) => {
          if (!sb) return;
          if (sb.flyProgress < 1) {
            sb.flyProgress = Math.min(1, sb.flyProgress + dt * 4.0);
          }
          if (sb.leavingAnim !== undefined) {
            sb.leavingAnim += dt * 3.5;
          }
        });

        // Remove departed boxes once leaving animation finishes
        for (let s = 0; s < engine.slottedBoxes.length; s++) {
          const sb = engine.slottedBoxes[s];
          if (sb && sb.leavingAnim !== undefined && sb.leavingAnim >= 1) {
            engine.slottedBoxes[s] = null;
          }
        }

        // 4. Wool Gathering Logic from Dragon to Slotted Boxes
        // Only retrieve when the dragon body is attached (not while reconnecting backward)
        if (!engine.reconnectState?.isReconnecting) {
          engine.woolGatherTimer += dt;
          if (engine.woolGatherTimer >= 0.09) {
            engine.woolGatherTimer = 0;

            engine.activeConnections.clear();

            for (let slotIdx = 0; slotIdx < engine.slottedBoxes.length; slotIdx++) {
              const sb = engine.slottedBoxes[slotIdx];
              if (!sb || sb.flyProgress < 1 || sb.leavingAnim !== undefined) continue;
              if (sb.filled >= sb.capacity) continue;

              // Find matching section in dragon that has emerged past the fog boundary
              let runningKnots = 0;
              let matchSectionIdx = -1;
              let availableKnots = 0;
              for (let i = 0; i < engine.dragonSections.length; i++) {
                const sec = engine.dragonSections[i];
                const secStartP = engine.dragonProgress - runningKnots * segStep;
                // Cannot scan or take segments inside the fog area (< FOG_BOUNDARY)
                if (secStartP >= FOG_BOUNDARY && sec.color === sb.color && sec.count > 0) {
                  const emergedInSec = Math.min(
                    sec.count,
                    Math.floor((secStartP - FOG_BOUNDARY) / segStep) + 1
                  );
                  if (emergedInSec > 0) {
                    matchSectionIdx = i;
                    availableKnots = emergedInSec;
                    break;
                  }
                }
                runningKnots += sec.count;
              }

              if (matchSectionIdx !== -1) {
                const matchedSection = engine.dragonSections[matchSectionIdx];
                const needed = sb.capacity - sb.filled;
                const amountToTake = Math.min(needed, availableKnots);

                sounds.playWoolTick();

                // Calculate front knots before this section
                let frontKnots = 0;
                for (let i = 0; i < matchSectionIdx; i++) {
                  frontKnots += engine.dragonSections[i].count;
                }

                const sectionStartProgress = engine.dragonProgress - frontKnots * segStep;
                const sectionLength = amountToTake * segStep;
                const tailAnchorProgress = sectionStartProgress - sectionLength;

                const colDef = getWoolColor(sb.color);
                const dragonPt = getTrackPointAt(Math.max(0, sectionStartProgress));

                engine.activeConnections.set(slotIdx, {
                  slotIdx,
                  colorHex: colDef.hex,
                  dragonPt: { x: dragonPt.x, y: dragonPt.y },
                });

                // Spawn traveling yarn particles
                const particleCount = Math.min(amountToTake, 4);
                for (let p = 0; p < particleCount; p++) {
                  engine.yarnParticles.push({
                    slotIndex: slotIdx,
                    colorHex: colDef.hex,
                    t: -p * 0.12,
                    startPos: { x: dragonPt.x, y: dragonPt.y },
                    endPos: { x: 0, y: 0 },
                  });
                }

                // Transfer wool
                matchedSection.count -= amountToTake;
                sb.filled += amountToTake;

                // Check if box reached full capacity
                if (sb.filled >= sb.capacity) {
                  sounds.playBoxComplete();
                  sb.leavingAnim = 0.01; // Start departure animation
                }

                // If segment is empty: REMOVE IT and start backward move-to-attach!
                if (matchedSection.count <= 0) {
                  engine.dragonSections.splice(matchSectionIdx, 1);

                  // If there is a back tail behind this removed segment:
                  if (matchSectionIdx < engine.dragonSections.length) {
                    engine.reconnectState = {
                      isReconnecting: true,
                      cutIndex: matchSectionIdx,
                      tailAnchorProgress,
                      frontKnots,
                    };
                  }
                }

                // Handle one retrieval per tick for clear, rhythmic animation
                break;
              }
            }
          }
        }

        // Check Victory Condition:
        // Dragon has no wool left AND board is empty AND all slots cleared
        if (
          engine.dragonSections.length === 0 &&
          engine.boardBoxes.length === 0 &&
          engine.slottedBoxes.every((sb) => sb === null)
        ) {
          sounds.playVictory();
          engine.gameState = 'won';
          setGameState('won');
          confetti({
            particleCount: 150,
            spread: 90,
            origin: { y: 0.6 },
          });
        }

        // 5. Update Yarn Particles
        engine.yarnParticles.forEach((p) => {
          p.t += dt * 4.0;
        });
        engine.yarnParticles = engine.yarnParticles.filter((p) => p.t <= 1);
      }

      // Update Floating Feedbacks
      engine.feedbacks.forEach((f) => {
        f.y -= dt * 35;
        f.lifetime -= dt;
      });
      engine.feedbacks = engine.feedbacks.filter((f) => f.lifetime > 0);

      // Throttle React UI progress bar update (every ~100ms)
      uiThrottleTimer += dt;
      if (uiThrottleTimer >= 0.1) {
        uiThrottleTimer = 0;
        setUiProgress(engine.dragonProgress);
      }

      // 6. Draw Frame on Canvas
      renderFrame();

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [levelData, getTrackPointAt]);

  // World to screen mapping for bottom board (accounting for zoom scale and pan offset)
  const getBoardTransform = (width: number, height: number) => {
    const baseZoom = Math.min(width / 9, height / 16);
    const effectiveZoom = baseZoom * engineRef.current.boardZoomScale;
    const cx = width / 2 + engineRef.current.boardPanOffset.x;
    const cy = height * 0.68 + engineRef.current.boardPanOffset.y;
    return { baseZoom, effectiveZoom, cx, cy };
  };

  const boardToScreen = (
    wx: number,
    wz: number,
    width: number,
    height: number
  ) => {
    const { effectiveZoom, cx, cy } = getBoardTransform(width, height);
    return {
      x: cx + wx * effectiveZoom,
      y: cy - wz * effectiveZoom,
    };
  };

  const screenToBoard = (
    sx: number,
    sy: number,
    width: number,
    height: number
  ) => {
    const { effectiveZoom, cx, cy } = getBoardTransform(width, height);
    return {
      x: (sx - cx) / effectiveZoom,
      z: -(sy - cy) / effectiveZoom,
    };
  };

  const findBoardBoxAt = (
    wx: number,
    wz: number,
    boxes: BoxItem[]
  ): BoxItem | undefined => {
    for (let i = boxes.length - 1; i >= 0; i--) {
      const b = boxes[i];
      const dim = BOX_DIMENSIONS[b.numType] || BOX_DIMENSIONS.Box4;
      const dir = angleToDirection(b.angle);
      const right = { x: dir.z, z: -dir.x };

      const dx = wx - b.x;
      const dz = wz - b.z;

      const u = dx * dir.x + dz * dir.z;
      const v = dx * right.x + dz * right.z;

      if (Math.abs(u) <= dim.length / 2 && Math.abs(v) <= dim.width / 2) {
        return b;
      }
    }
    return undefined;
  };

  const zoomAtPoint = useCallback(
    (factor: number, screenX: number, screenY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const engine = engineRef.current;

      const prevScale = engine.boardZoomScale;
      const nextScale = Math.min(Math.max(prevScale * factor, 0.4), 3.0);
      if (Math.abs(nextScale - prevScale) < 0.001) return;

      const baseZoom = Math.min(width / 9, height / 16);
      const prevEffectiveZoom = baseZoom * prevScale;
      const nextEffectiveZoom = baseZoom * nextScale;

      const prevCx = width / 2 + engine.boardPanOffset.x;
      const prevCy = height * 0.68 + engine.boardPanOffset.y;

      // World point under cursor before zoom
      const wx = (screenX - prevCx) / prevEffectiveZoom;
      const wz = -(screenY - prevCy) / prevEffectiveZoom;

      // New pan offsets to keep (wx, wz) at the exact same screen position
      engine.boardPanOffset.x = screenX - width / 2 - wx * nextEffectiveZoom;
      engine.boardPanOffset.y = screenY - height * 0.68 + wz * nextEffectiveZoom;
      engine.boardZoomScale = nextScale;

      setZoomDisplay(Math.round(nextScale * 100));
    },
    []
  );

  const resetView = useCallback(() => {
    const engine = engineRef.current;
    engine.boardZoomScale = 1.0;
    engine.boardPanOffset = { x: 0, y: 0 };
    setZoomDisplay(100);
  }, []);

  // Keyboard shortcuts for zooming
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === '+' || e.key === '=') {
        const canvas = canvasRef.current;
        if (canvas) zoomAtPoint(1.2, canvas.clientWidth / 2, canvas.clientHeight * 0.68);
      } else if (e.key === '-' || e.key === '_') {
        const canvas = canvasRef.current;
        if (canvas) zoomAtPoint(0.83, canvas.clientWidth / 2, canvas.clientHeight * 0.68);
      } else if (e.key === '0' || e.key === 'Home') {
        resetView();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomAtPoint, resetView]);

  // Render Frame
  const renderFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const engine = engineRef.current;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Winter sky gradient background matching the screenshot
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
    skyGrad.addColorStop(0, '#cce5ff');
    skyGrad.addColorStop(0.38, '#e6f2ff');
    skyGrad.addColorStop(0.42, '#93c5fd');
    skyGrad.addColorStop(1, '#dbeafe');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    // -------------------------------------------------------------
    // 1. TOP AREA: ROAD TRACK, DRAGON & CAT
    // -------------------------------------------------------------
    const track = levelData.dragon.track;
    const topAreaZoom = Math.min(width / 9, height / 16);
    const topCx = width / 2;
    const topCy = height * 0.18;

    const trackToScreen = (wx: number, wy: number) => ({
      x: topCx + wx * topAreaZoom,
      y: topCy - (wy - 5.0) * topAreaZoom,
    });

    if (track && track.length > 1) {
      // Draw Road Track
      ctx.beginPath();
      const first = trackToScreen(track[0].x, track[0].y);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < track.length; i++) {
        const pt = trackToScreen(track[i].x, track[i].y);
        ctx.lineTo(pt.x, pt.y);
      }

      ctx.lineWidth = 26;
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      ctx.lineWidth = 20;
      ctx.strokeStyle = '#cbd5e1';
      ctx.stroke();

      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.setLineDash([8, 8]);
      ctx.stroke();
      ctx.setLineDash([]);

      // -------------------------------------------------------------
      // 1.1 FOG AREA (First 1/3 of track: progress 0.0 to 1/3)
      // -------------------------------------------------------------
      ctx.save();
      // Fog ribbon along track
      ctx.beginPath();
      const fogSteps = 30;
      for (let i = 0; i <= fogSteps; i++) {
        const p = (i / fogSteps) * FOG_BOUNDARY;
        const pt = getTrackPointAt(p);
        const scr = trackToScreen(pt.x, pt.y);
        if (i === 0) ctx.moveTo(scr.x, scr.y);
        else ctx.lineTo(scr.x, scr.y);
      }
      ctx.lineWidth = 32;
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.65)';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      ctx.lineWidth = 22;
      ctx.strokeStyle = 'rgba(241, 245, 249, 0.8)';
      ctx.stroke();

      // Drifting animated mist clouds along fog area
      const animTime = performance.now() * 0.001;
      for (let i = 0; i < 5; i++) {
        const puffP = (i * 0.065 + animTime * 0.015) % FOG_BOUNDARY;
        const puffPt = getTrackPointAt(puffP);
        const puffScr = trackToScreen(puffPt.x, puffPt.y);
        const puffRadius = 14 + Math.sin(animTime * 2.5 + i * 1.5) * 4;

        const puffGrad = ctx.createRadialGradient(
          puffScr.x,
          puffScr.y,
          2,
          puffScr.x,
          puffScr.y,
          puffRadius
        );
        puffGrad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
        puffGrad.addColorStop(0.6, 'rgba(226, 232, 240, 0.35)');
        puffGrad.addColorStop(1, 'rgba(226, 232, 240, 0)');

        ctx.fillStyle = puffGrad;
        ctx.beginPath();
        ctx.arc(puffScr.x, puffScr.y, puffRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Fog Region Badge
      const fogMidPt = getTrackPointAt(FOG_BOUNDARY * 0.45);
      const fogMidScr = trackToScreen(fogMidPt.x, fogMidPt.y);
      const fogPerp = -fogMidPt.angle + Math.PI / 2;
      ctx.save();
      ctx.translate(fogMidScr.x + Math.cos(fogPerp) * 24, fogMidScr.y + Math.sin(fogPerp) * 24);
      ctx.fillStyle = 'rgba(51, 65, 85, 0.88)';
      ctx.beginPath();
      ctx.roundRect(-42, -9, 84, 18, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 8.5px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🌫️ FOG (LOCKED)', 0, 0);
      ctx.restore();

      // -------------------------------------------------------------
      // 1.2 START POINT GATE & LINE (At progress = 1/3)
      // Dragon starts here and cannot retreat back into the fog area
      // -------------------------------------------------------------
      const startPt = getTrackPointAt(START_POINT);
      const startScr = trackToScreen(startPt.x, startPt.y);
      const perpAngle = -startPt.angle + Math.PI / 2;
      const gateWidth = 16;
      const gX1 = startScr.x + Math.cos(perpAngle) * gateWidth;
      const gY1 = startScr.y + Math.sin(perpAngle) * gateWidth;
      const gX2 = startScr.x - Math.cos(perpAngle) * gateWidth;
      const gY2 = startScr.y - Math.sin(perpAngle) * gateWidth;

      // Start line glow
      ctx.beginPath();
      ctx.moveTo(gX1, gY1);
      ctx.lineTo(gX2, gY2);
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
      ctx.stroke();

      // Start line crisp cyan bar
      ctx.beginPath();
      ctx.moveTo(gX1, gY1);
      ctx.lineTo(gX2, gY2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#06b6d4';
      ctx.stroke();

      // Start line checkered dashed core
      ctx.beginPath();
      ctx.moveTo(gX1, gY1);
      ctx.lineTo(gX2, gY2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Start Point Flag Badge
      ctx.save();
      ctx.translate(startScr.x + Math.cos(perpAngle) * 26, startScr.y + Math.sin(perpAngle) * 26);
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(-24, -9, 48, 18, 5);
      ctx.fill();
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🚩 START', 0, 0);
      ctx.restore();

      ctx.restore();

      // Draw Cat sitting at current checkpoint
      const catPositions = levelData.dragon.catPositions;
      if (catPositions && engine.catIndex < catPositions.length) {
        const catTarget = catPositions[engine.catIndex];
        const catPt = getTrackPointAt(catTarget.progress);
        const catScreen = trackToScreen(catPt.x, catPt.y);

        ctx.save();
        const hopOffset =
          engine.catHopAnim > 0 ? Math.sin(engine.catHopAnim * Math.PI) * 22 : 0;
        ctx.translate(catScreen.x, catScreen.y - hopOffset);

        // Cat Shadow
        ctx.beginPath();
        ctx.ellipse(0, 10, 12, 5, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fill();

        // Cat Body
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#b45309';
        ctx.stroke();

        // Ears
        ctx.beginPath();
        ctx.moveTo(-9, -8);
        ctx.lineTo(-4, -18);
        ctx.lineTo(0, -10);
        ctx.fillStyle = '#d97706';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(9, -8);
        ctx.lineTo(4, -18);
        ctx.lineTo(0, -10);
        ctx.fillStyle = '#d97706';
        ctx.fill();

        // Eyes & Nose
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-4, -2, 2, 0, Math.PI * 2);
        ctx.arc(4, -2, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ec4899';
        ctx.beginPath();
        ctx.arc(0, 2, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`CAT (${engine.catIndex + 1}/${catPositions.length})`, 0, -22);

        ctx.restore();
      }

      // Draw Dragon Wool Body along track
      const headPt = getTrackPointAt(engine.dragonProgress);
      const headScreen = trackToScreen(headPt.x, headPt.y);

      const segStep = 0.007;

      ctx.save();

      if (engine.reconnectState && engine.reconnectState.isReconnecting) {
        const { cutIndex, tailAnchorProgress } = engine.reconnectState;

        // 1. Draw Front Sections (from Head backwards towards the gap)
        let frontProgress = engine.dragonProgress;
        for (let s = 0; s < cutIndex; s++) {
          const section = engine.dragonSections[s];
          const col = getWoolColor(section.color);
          const knotCount = Math.min(section.count, 25);

          for (let k = 0; k < knotCount; k++) {
            frontProgress -= segStep;
            if (frontProgress < 0) break;
            const knotPt = getTrackPointAt(frontProgress);
            const knotScreen = trackToScreen(knotPt.x, knotPt.y);

            const inFog = frontProgress < FOG_BOUNDARY;
            ctx.globalAlpha = inFog ? 0.35 : 1.0;
            ctx.beginPath();
            ctx.arc(knotScreen.x, knotScreen.y, 8, 0, Math.PI * 2);
            ctx.fillStyle = col.hex;
            ctx.fill();
            ctx.strokeStyle = inFog ? 'rgba(255, 255, 255, 0.7)' : col.darkHex;
            ctx.lineWidth = inFog ? 1.5 : 1;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
          }
          if (frontProgress < 0) break;
        }

        // 2. Draw Tail Sections (anchored at tailAnchorProgress)
        let tailProgress = tailAnchorProgress;
        for (let s = cutIndex; s < engine.dragonSections.length; s++) {
          const section = engine.dragonSections[s];
          const col = getWoolColor(section.color);
          const knotCount = Math.min(section.count, 25);

          for (let k = 0; k < knotCount; k++) {
            tailProgress -= segStep;
            if (tailProgress < 0) break;
            const knotPt = getTrackPointAt(tailProgress);
            const knotScreen = trackToScreen(knotPt.x, knotPt.y);

            const inFog = tailProgress < FOG_BOUNDARY;
            ctx.globalAlpha = inFog ? 0.35 : 1.0;
            ctx.beginPath();
            ctx.arc(knotScreen.x, knotScreen.y, 8, 0, Math.PI * 2);
            ctx.fillStyle = col.hex;
            ctx.fill();
            ctx.strokeStyle = inFog ? 'rgba(255, 255, 255, 0.7)' : col.darkHex;
            ctx.lineWidth = inFog ? 1.5 : 1;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
          }
          if (tailProgress < 0) break;
        }
      } else {
        // Continuous single dragon body
        let currentSegProgress = engine.dragonProgress;
        for (const section of engine.dragonSections) {
          const col = getWoolColor(section.color);
          const knotCount = Math.min(section.count, 25);

          for (let k = 0; k < knotCount; k++) {
            currentSegProgress -= segStep;
            if (currentSegProgress < 0) break;

            const knotPt = getTrackPointAt(currentSegProgress);
            const knotScreen = trackToScreen(knotPt.x, knotPt.y);

            // Knitted segment
            const inFog = currentSegProgress < FOG_BOUNDARY;
            ctx.globalAlpha = inFog ? 0.35 : 1.0;
            ctx.beginPath();
            ctx.arc(knotScreen.x, knotScreen.y, 8, 0, Math.PI * 2);
            ctx.fillStyle = col.hex;
            ctx.fill();
            ctx.strokeStyle = inFog ? 'rgba(255, 255, 255, 0.7)' : col.darkHex;
            ctx.lineWidth = inFog ? 1.5 : 1;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
          }
          if (currentSegProgress < 0) break;
        }
      }

      // Draw Dragon Head
      ctx.translate(headScreen.x, headScreen.y);
      ctx.rotate(-headPt.angle);

      // Dragon Head Shadow
      ctx.beginPath();
      ctx.ellipse(0, 6, 14, 6, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fill();

      // Dragon Head
      ctx.beginPath();
      ctx.arc(4, 0, 13, 0, Math.PI * 2);
      ctx.fillStyle = '#f97316';
      ctx.fill();
      ctx.strokeStyle = '#c2410c';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Horns
      ctx.beginPath();
      ctx.moveTo(-4, -10);
      ctx.lineTo(-12, -18);
      ctx.lineTo(-2, -12);
      ctx.fillStyle = '#eab308';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-4, 10);
      ctx.lineTo(-12, 18);
      ctx.lineTo(-2, 12);
      ctx.fillStyle = '#eab308';
      ctx.fill();

      // Eyes
      ctx.beginPath();
      ctx.arc(8, -5, 3.5, 0, Math.PI * 2);
      ctx.arc(8, 5, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(9, -5, 2, 0, Math.PI * 2);
      ctx.arc(9, 5, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();

      ctx.restore();
    }

    // -------------------------------------------------------------
    // 2. MIDDLE AREA: SPOOL SHELF & SLOTS
    // -------------------------------------------------------------
    const shelfY = height * 0.38;
    const unlockedCount = Math.max(4, levelData.slots.unlockedCount || 4);
    const slotCount = Math.max(unlockedCount + 1, levelData.slots.count || 5);
    const slotW = Math.min(width / (slotCount + 1), 84);
    const slotSpacing = slotW + 12;
    const shelfStartX = (width - (slotCount * slotSpacing - 12)) / 2;

    // Shelf container bar
    ctx.fillStyle = 'rgba(219, 234, 254, 0.9)';
    ctx.strokeStyle = 'rgba(147, 197, 253, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(shelfStartX - 14, shelfY - 10, slotCount * slotSpacing + 16, 68, 14);
    ctx.fill();
    ctx.stroke();

    const slotScreenPositions: { x: number; y: number }[] = [];

    // Render Slots & Docked Boxes
    for (let s = 0; s < slotCount; s++) {
      const sx = shelfStartX + s * slotSpacing + slotW / 2;
      const sy = shelfY + 24;
      slotScreenPositions.push({ x: sx, y: sy });

      const isUnlocked = s < unlockedCount;
      const slotted = engine.slottedBoxes[s];

      // Well background
      ctx.beginPath();
      ctx.roundRect(sx - slotW / 2, sy - 24, slotW, 48, 10);
      ctx.fillStyle = isUnlocked ? 'rgba(191, 219, 254, 0.6)' : 'rgba(148, 163, 184, 0.35)';
      ctx.fill();
      ctx.strokeStyle = isUnlocked ? '#93c5fd' : '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (!isUnlocked) {
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Locked', sx, sy + 4);
        continue;
      }

      if (slotted) {
        // Position during flight or departure
        let curX = sx;
        let curY = sy;
        let scale = 1.0;
        let alpha = 1.0;

        if (slotted.flyProgress < 1) {
          const t = slotted.flyProgress;
          curX = slotted.sourceScreenPos.x + (sx - slotted.sourceScreenPos.x) * t;
          curY = slotted.sourceScreenPos.y + (sy - slotted.sourceScreenPos.y) * t;
        } else if (slotted.leavingAnim !== undefined) {
          const lt = slotted.leavingAnim;
          curY = sy - lt * 80;
          scale = 1.0 + lt * 0.4;
          alpha = Math.max(0, 1 - lt);
        }

        const col = getWoolColor(slotted.color);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(curX, curY);
        ctx.scale(scale, scale);

        // Spool flange ends (left and right caps)
        const spoolW = slotW - 14;
        const spoolH = 34;

        ctx.fillStyle = col.darkHex;
        ctx.beginPath();
        ctx.roundRect(-spoolW / 2, -spoolH / 2, 6, spoolH, 3);
        ctx.roundRect(spoolW / 2 - 6, -spoolH / 2, 6, spoolH, 3);
        ctx.fill();

        // Wool winding cylinder in center
        ctx.fillStyle = col.hex;
        ctx.beginPath();
        ctx.roundRect(-spoolW / 2 + 5, -spoolH / 2 + 3, spoolW - 10, spoolH - 6, 4);
        ctx.fill();

        // Progress text (e.g. "3 / 6")
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText(`${slotted.filled} / ${slotted.capacity}`, 0, 4);
        ctx.shadowBlur = 0;

        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(100, 116, 139, 0.5)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('EMPTY', sx, sy + 3);
      }
    }

    // -------------------------------------------------------------
    // 3. ANIMATED YARN RETRIEVAL THREADS & TRAVELING PARTICLES
    // -------------------------------------------------------------
    engine.activeConnections.forEach((conn) => {
      if (conn.slotIdx >= slotScreenPositions.length) return;
      const startPt = trackToScreen(conn.dragonPt.x, conn.dragonPt.y);
      const endPt = slotScreenPositions[conn.slotIdx];

      ctx.beginPath();
      ctx.moveTo(startPt.x, startPt.y);
      const midX = (startPt.x + endPt.x) / 2;
      const midY = (startPt.y + endPt.y) / 2 + 25;
      ctx.quadraticCurveTo(midX, midY, endPt.x, endPt.y);
      ctx.strokeStyle = conn.colorHex;
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Draw traveling wool particles along the curve
    engine.yarnParticles.forEach((p) => {
      if (p.t < 0) return;
      if (p.slotIndex >= slotScreenPositions.length) return;
      const startPt = trackToScreen(p.startPos.x, p.startPos.y);
      const endPt = slotScreenPositions[p.slotIndex];
      const midX = (startPt.x + endPt.x) / 2;
      const midY = (startPt.y + endPt.y) / 2 + 25;

      const t = p.t;
      // Quadratic Bezier interpolation: B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
      const px = (1 - t) * (1 - t) * startPt.x + 2 * (1 - t) * t * midX + t * t * endPt.x;
      const py = (1 - t) * (1 - t) * startPt.y + 2 * (1 - t) * t * midY + t * t * endPt.y;

      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = p.colorHex;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // -------------------------------------------------------------
    // 4. BOTTOM AREA: THE MESS OF BOXES
    // -------------------------------------------------------------
    const { effectiveZoom } = getBoardTransform(width, height);

    // Save context and clip to area below shelf so panned boxes do not overlap spools or dragon track
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, shelfY + 62, width, Math.max(10, height - (shelfY + 62)));
    ctx.clip();

    // Board reference area
    const boardMin = boardToScreen(-3.5, 1.2, width, height);
    const boardMax = boardToScreen(3.5, -6.5, width, height);
    ctx.strokeStyle = 'rgba(147, 197, 253, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(
      boardMin.x,
      boardMin.y,
      boardMax.x - boardMin.x,
      boardMax.y - boardMin.y,
      Math.max(6, 16 * engine.boardZoomScale)
    );
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fill();
    ctx.stroke();

    // Check exit status for all board boxes
    const exitStatus = new Map<number, ReturnType<typeof checkExitPath>>();
    engine.boardBoxes.forEach((b) => {
      exitStatus.set(b.id, checkExitPath(b, engine.boardBoxes));
    });

    // Render each board box
    engine.boardBoxes.forEach((b) => {
      const status = exitStatus.get(b.id);
      const isClear = !status?.isBlocked;
      const colDef = getWoolColor(b.color);
      const dim = BOX_DIMENSIONS[b.numType] || BOX_DIMENSIONS.Box4;

      const sc = boardToScreen(b.x, b.z, width, height);
      const screenW = dim.width * effectiveZoom;
      const screenL = dim.length * effectiveZoom;

      let shakeOffsetX = 0;
      if (engine.shakingBoxId === b.id) {
        shakeOffsetX = Math.sin(performance.now() * 0.05) * 5;
      }

      ctx.save();
      ctx.translate(sc.x + shakeOffsetX, sc.y);
      const rad = (b.angle * Math.PI) / 180;
      ctx.rotate(rad);

      // Shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
      ctx.shadowBlur = 6 * engine.boardZoomScale;
      ctx.shadowOffsetY = 3 * engine.boardZoomScale;

      // Box body
      const rx = -screenW / 2;
      const ry = -screenL / 2;
      const rw = screenW;
      const rh = screenL;

      ctx.beginPath();
      ctx.roundRect(rx, ry, rw, rh, Math.max(3, 6 * engine.boardZoomScale));

      const grad = ctx.createLinearGradient(rx, ry, rx + rw, ry + rh);
      grad.addColorStop(0, colDef.lightHex);
      grad.addColorStop(0.5, colDef.hex);
      grad.addColorStop(1, colDef.darkHex);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.shadowColor = 'transparent';

      // Knit ribs
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = Math.max(1, 1 * engine.boardZoomScale);
      const ribCount = Math.floor(rh / (8 * engine.boardZoomScale));
      for (let r = 0; r < ribCount; r++) {
        const lineY = ry + (r + 0.5) * (rh / ribCount);
        ctx.beginPath();
        ctx.moveTo(rx + 3, lineY);
        ctx.lineTo(rx + rw - 3, lineY);
        ctx.stroke();
      }

      // Border: crisp white highlight if clear, dark border if blocked
      ctx.lineWidth = isClear ? Math.max(1.5, 2 * engine.boardZoomScale) : 1;
      ctx.strokeStyle = isClear ? '#ffffff' : 'rgba(0, 0, 0, 0.4)';
      ctx.stroke();

      // Forward Direction Arrow
      const arrowLength = Math.min(screenL * 0.45, 16 * engine.boardZoomScale);
      const arrowWidth = Math.min(screenW * 0.4, 11 * engine.boardZoomScale);
      const arrowTipY = -screenL / 2 + 5 * engine.boardZoomScale;

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
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = Math.max(0.75, 1 * engine.boardZoomScale);
      ctx.stroke();

      // Capacity badge
      const pillScale = Math.min(1.8, Math.max(0.7, engine.boardZoomScale));
      const pillW = Math.min(screenW * 0.75, 26 * pillScale);
      const pillH = 13 * pillScale;
      const pillY = screenL / 2 - pillH - 3 * pillScale;
      ctx.beginPath();
      ctx.roundRect(-pillW / 2, pillY, pillW, pillH, 6 * pillScale);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(9 * pillScale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${b.capacity}`, 0, pillY + pillH / 2);

      ctx.restore();
    });

    ctx.restore(); // Restore clip

    // -------------------------------------------------------------
    // 5. FLOATING FEEDBACK TEXTS
    // -------------------------------------------------------------
    engine.feedbacks.forEach((f) => {
      ctx.save();
      ctx.fillStyle = f.color;
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 4;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    });

    ctx.restore();
  };

  // Handle Wheel Zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    zoomAtPoint(factor, mouseX, mouseY);
  };

  // Handle Mouse Down
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    pointerStateRef.current = {
      isDown: true,
      startX: mouseX,
      startY: mouseY,
      startPanX: engineRef.current.boardPanOffset.x,
      startPanY: engineRef.current.boardPanOffset.y,
      hasMoved: false,
      button: e.button,
    };
  };

  // Handle Mouse Move
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const shelfY = height * 0.38;

    const ptr = pointerStateRef.current;
    if (ptr.isDown) {
      const dx = mouseX - ptr.startX;
      const dy = mouseY - ptr.startY;
      if (!ptr.hasMoved && Math.hypot(dx, dy) > 4) {
        ptr.hasMoved = true;
        setIsPanning(true);
      }
      if (ptr.hasMoved) {
        engineRef.current.boardPanOffset.x = ptr.startPanX + dx;
        engineRef.current.boardPanOffset.y = ptr.startPanY + dy;
        return;
      }
    }

    // Hover detection over board boxes
    if (mouseY > shelfY + 50) {
      const { x: wx, z: wz } = screenToBoard(mouseX, mouseY, width, height);
      const box = findBoardBoxAt(wx, wz, engineRef.current.boardBoxes);
      if (box) {
        const blocked = checkExitPath(box, engineRef.current.boardBoxes).isBlocked;
        setHoveredBox({ id: box.id, isBlocked: blocked });
      } else {
        setHoveredBox(null);
      }
    } else {
      setHoveredBox(null);
    }
  };

  // Handle Mouse Up
  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const ptr = pointerStateRef.current;
    const wasMoved = ptr.hasMoved;
    const wasDown = ptr.isDown;
    const button = ptr.button;

    ptr.isDown = false;
    ptr.hasMoved = false;
    setIsPanning(false);

    if (!wasDown) return;

    // If dragged/panned or clicked with middle/right button, do not launch box
    if (wasMoved || button !== 0) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    handleBoxClick(mouseX, mouseY);
  };

  // Handle Box Tap / Click in the Playtest View
  const handleBoxClick = (mouseX: number, mouseY: number) => {
    const engine = engineRef.current;
    if (engine.gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const shelfY = height * 0.38;

    // Ignore clicks on dragon track or spool shelf
    if (mouseY < shelfY + 50) return;

    // Screen to World for board area
    const { x: wx, z: wz } = screenToBoard(mouseX, mouseY, width, height);

    // Find clicked box on board
    const clickedBox = findBoardBoxAt(wx, wz, engine.boardBoxes);
    if (!clickedBox) return;

    const boxSc = boardToScreen(clickedBox.x, clickedBox.z, width, height);

    // Check exit path
    const exitRes = checkExitPath(clickedBox, engine.boardBoxes);

    if (exitRes.isBlocked) {
      sounds.playBlocked();
      engine.shakingBoxId = clickedBox.id;
      engine.shakeTimer = 0.4;

      engine.feedbacks.push({
        id: Date.now(),
        text: 'Path Blocked! ❌',
        x: boxSc.x,
        y: boxSc.y - 20,
        color: '#ef4444',
        lifetime: 1.0,
      });
      return;
    }

    // Path is clear! Check if there is an empty slot available
    const emptySlotIdx = engine.slottedBoxes.findIndex((s) => s === null);
    if (emptySlotIdx === -1) {
      sounds.playBlocked();
      engine.shakingBoxId = clickedBox.id;
      engine.shakeTimer = 0.4;

      engine.feedbacks.push({
        id: Date.now(),
        text: 'All Slots Full! ⚠️',
        x: boxSc.x,
        y: boxSc.y - 20,
        color: '#f59e0b',
        lifetime: 1.0,
      });
      return;
    }

    // Launch box into slot!
    sounds.playWhoosh();

    const newSlottedBox: SlottedBox = {
      box: clickedBox,
      filled: 0,
      capacity: clickedBox.capacity,
      color: clickedBox.color,
      slotIndex: emptySlotIdx,
      flyProgress: 0,
      sourceScreenPos: { x: boxSc.x, y: boxSc.y },
    };

    engine.slottedBoxes[emptySlotIdx] = newSlottedBox;
    engine.boardBoxes = engine.boardBoxes.filter((b) => b.id !== clickedBox.id);
  };

  return (
    <div className="relative w-full h-full select-none overflow-hidden flex flex-col bg-slate-900">
      {/* Top Playtest Control Bar */}
      <div className="h-12 bg-slate-950/90 border-b border-slate-800 px-4 flex items-center justify-between z-30 shadow-md backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Editor</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-amber-400">Level {levelData.levelId}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
              {levelData.levelType}
            </span>
          </div>
        </div>

        {/* Center: Cat Checkpoints & Dragon Progress Bar */}
        <div className="flex items-center gap-3 w-80 max-w-full">
          <span className="text-[11px] text-slate-400 font-mono">Progress:</span>
          <div className="flex-1 bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-700 relative">
            {/* Fog Region indicator (0% to 33.3%) */}
            <div
              className="absolute top-0 bottom-0 left-0 bg-slate-800/80 border-r border-dashed border-cyan-500/40 z-10 pointer-events-none"
              style={{ width: `${(FOG_BOUNDARY * 100).toFixed(1)}%` }}
              title="Fog Area (0% - 33.3%): Wool segments are locked and cannot be retrieved"
            />
            {/* Start Line Marker at 33.3% */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 z-20 shadow-[0_0_6px_rgba(6,182,212,0.9)] pointer-events-none"
              style={{ left: `${(START_POINT * 100).toFixed(1)}%` }}
              title="Start Line (Dragon cannot retreat past here)"
            />
            {/* Dragon Head Progress fill */}
            <div
              className="bg-gradient-to-r from-cyan-500 via-teal-400 to-amber-500 h-full transition-all duration-100"
              style={{ width: `${Math.min(100, Math.round(uiProgress * 100))}%` }}
            />
            {/* Cat markers on progress bar */}
            {levelData.dragon.catPositions.map((cat, idx) => (
              <div
                key={cat.id}
                className={`absolute top-0 bottom-0 w-1.5 z-20 ${
                  idx < uiCatIndex ? 'bg-slate-500' : 'bg-rose-500'
                }`}
                style={{ left: `${cat.progress * 100}%` }}
                title={`Cat Checkpoint ${idx + 1}`}
              />
            ))}
          </div>
          <span className="text-xs font-mono text-cyan-400 w-10">
            {Math.round(uiProgress * 100)}%
          </span>
        </div>

        {/* Right: Simulation Controls */}
        <div className="flex items-center gap-2">
          {/* Speed Toggle */}
          <button
            onClick={() => {
              const next = gameSpeed === 1.0 ? 2.0 : gameSpeed === 2.0 ? 4.0 : 1.0;
              setGameSpeed(next);
            }}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-mono font-semibold text-cyan-400 border border-slate-700 transition"
            title="Adjust Simulation Speed"
          >
            <FastForward className="w-3.5 h-3.5" />
            <span>{gameSpeed}x</span>
          </button>

          {/* Sound Toggle */}
          <button
            onClick={() => {
              sounds.enabled = !soundEnabled;
              setSoundEnabled(!soundEnabled);
            }}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>

          {/* Pause / Play */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current text-emerald-400" />}
          </button>

          {/* Restart */}
          <button
            onClick={resetGame}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold border border-slate-700 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restart</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Canvas */}
      <div className="flex-1 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
          className={`w-full h-full block ${
            isPanning
              ? 'cursor-grabbing'
              : hoveredBox
              ? hoveredBox.isBlocked
                ? 'cursor-not-allowed'
                : 'cursor-pointer'
              : 'cursor-grab'
          }`}
        />

        {/* Floating Pan & Zoom HUD (Bottom-Left) */}
        <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 px-2 py-1.5 rounded-xl shadow-xl backdrop-blur-md">
          <button
            onClick={() => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              zoomAtPoint(1.2, canvas.clientWidth / 2, canvas.clientHeight * 0.68);
            }}
            className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition"
            title="Zoom In (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            onClick={resetView}
            className="px-1.5 py-0.5 hover:bg-slate-800 text-slate-300 hover:text-amber-400 font-mono text-xs font-semibold rounded transition"
            title="Click to Reset View (100%)"
          >
            {zoomDisplay}%
          </button>

          <button
            onClick={() => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              zoomAtPoint(0.83, canvas.clientWidth / 2, canvas.clientHeight * 0.68);
            }}
            className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition"
            title="Zoom Out (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-slate-700 mx-0.5" />

          <button
            onClick={resetView}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-cyan-400 rounded-lg transition"
            title="Reset Camera (Center & 100%)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Floating Pan & Zoom Hint (Bottom-Right) */}
        <div className="absolute bottom-4 right-4 z-20 hidden sm:flex items-center gap-2 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl shadow-lg backdrop-blur-sm text-[11px] text-slate-400">
          <span className="inline-block w-2 h-2 rounded-full bg-cyan-400/80 animate-pulse" />
          <span>Drag empty area to pan • Scroll to zoom</span>
        </div>

        {/* Victory Overlay Modal */}
        {gameState === 'won' && (
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-40 animate-fadeIn">
            <div className="bg-slate-900 border border-emerald-500/50 p-6 rounded-2xl max-w-sm w-full mx-4 shadow-2xl text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500 rounded-full flex items-center justify-center mx-auto text-emerald-400">
                <Trophy className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Level Complete! 🎉</h2>
                <p className="text-xs text-slate-300 mt-1">
                  All dragon wool gathered and all boxes cleared successfully!
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={resetGame}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
                >
                  Play Again
                </button>
                <button
                  onClick={onExit}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition shadow-lg shadow-emerald-600/30"
                >
                  Return to Builder
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Defeat Overlay Modal */}
        {gameState === 'lost' && (
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-40 animate-fadeIn">
            <div className="bg-slate-900 border border-rose-500/50 p-6 rounded-2xl max-w-sm w-full mx-4 shadow-2xl text-center space-y-4">
              <div className="w-16 h-16 bg-rose-500/20 border border-rose-500 rounded-full flex items-center justify-center mx-auto text-rose-400">
                <Skull className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Game Over! 💥</h2>
                <p className="text-xs text-slate-300 mt-1">
                  The dragon caught the cat at the final safety point!
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={resetGame}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition shadow-lg shadow-rose-600/30"
                >
                  Try Again
                </button>
                <button
                  onClick={onExit}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
                >
                  Edit Level
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
