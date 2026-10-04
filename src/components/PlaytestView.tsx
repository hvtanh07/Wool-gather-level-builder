import React, { useRef, useEffect, useState, useCallback } from 'react';
import { CleanLevelData, BoxItem, DragonSection, TunnelSetup, ConveyorSetup, isBoxFrozen } from '../types/level';
import { BOX_DIMENSIONS, getWoolColor, ICE_THEME, TUNNEL_THEME, CONVEYOR_THEME } from '../utils/colors';
import { checkExitPath, angleToDirection, getTunnelReadyBox, isPointInTunnelCompound } from '../utils/collision';
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

interface IceAttack {
  id: number;
  attackerBox: BoxItem;
  startX: number;
  startZ: number;
  currentX: number;
  currentZ: number;
  targetBoxId: number;
  dir: { x: number; z: number };
  distance: number;
  progress: number; // 0 to 1
  state: 'forward' | 'returning';
}

interface IceParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  rot: number;
  rotSpeed: number;
  color: string;
}

interface TunnelDispenseAnim {
  tunnelId: number;
  progress: number;
}

// Fog covers the first 1/3 of the moving path (progress 0.0 to 1/3).
// Boxes cannot scan or retrieve segments that are inside this fog area.
const FOG_BOUNDARY = 1 / 3;
// Starting point right below/at the exit of the fog area where the dragon begins.
// The dragon head cannot move backward beyond this starting point.
const START_POINT = 1 / 3;
// Progress step between consecutive dragon wool knots
const SEG_STEP = 0.012;

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
    tunnels: TunnelSetup[];
    conveyors: ConveyorSetup[];
    iceAttacks: IceAttack[];
    iceParticles: IceParticle[];
    tunnelDispenses: TunnelDispenseAnim[];
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
    tunnels: [],
    conveyors: [],
    iceAttacks: [],
    iceParticles: [],
    tunnelDispenses: [],
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
    const maxSlots = levelData.slots?.unlockedCount ?? levelData.slots?.count ?? 4;
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
      tunnels: JSON.parse(JSON.stringify(levelData.tunnels || [])),
      conveyors: JSON.parse(JSON.stringify(levelData.conveyors || [])),
      iceAttacks: [],
      iceParticles: [],
      tunnelDispenses: [],
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
        if (engine.reconnectState && engine.reconnectState.isReconnecting) {
          // Reconnect logic:
          // Front moves backward towards tail, but cannot retreat beyond START_POINT.
          // If head reaches START_POINT, the body moves up (forward along track) to connect with head.
          const reconnectSpeed = 0.16; // track progress per second
          const retractStep = reconnectSpeed * dt;

          if (engine.dragonProgress > START_POINT) {
            engine.dragonProgress = Math.max(START_POINT, engine.dragonProgress - retractStep);
          } else {
            // Head is at START_POINT: cannot retreat further! Body (tail) moves up to connect!
            engine.dragonProgress = START_POINT;
            engine.reconnectState.tailAnchorProgress += reconnectSpeed * dt;
          }

          const currentFrontBack =
            engine.dragonProgress - engine.reconnectState.frontKnots * SEG_STEP;

          if (currentFrontBack <= engine.reconnectState.tailAnchorProgress) {
            // Body attached! Snap to exact alignment and resume forward crawl
            engine.dragonProgress = Math.max(
              START_POINT,
              engine.reconnectState.tailAnchorProgress +
                engine.reconnectState.frontKnots * SEG_STEP
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
                const secStartP = engine.dragonProgress - runningKnots * SEG_STEP;
                // Cannot scan or take segments inside the fog area (< FOG_BOUNDARY)
                if (secStartP >= FOG_BOUNDARY && sec.color === sb.color && sec.count > 0) {
                  const emergedInSec = Math.min(
                    sec.count,
                    Math.floor((secStartP - FOG_BOUNDARY) / SEG_STEP) + 1
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

                const sectionStartProgress = engine.dragonProgress - frontKnots * SEG_STEP;
                const sectionLength = amountToTake * SEG_STEP;
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

        // Update Conveyors: circulate boxes continuously
        engine.conveyors.forEach((conv) => {
          const dirSign = conv.direction === 'right-to-left' ? -1 : 1;
          const minX = Math.min(conv.startX, conv.endX);
          const maxX = Math.max(conv.startX, conv.endX);
          const stepX = conv.speed * dt * dirSign;

          conv.boxes.forEach((b) => {
            b.x += stepX;
            if (dirSign > 0 && b.x > maxX) {
              b.x = minX + (b.x - maxX);
            } else if (dirSign < 0 && b.x < minX) {
              b.x = maxX - (minX - b.x);
            }
          });
        });

        // Update Ice Attacks (attacker rushing forward to collide & bounce back)
        const canvas = canvasRef.current;
        const curWidth = canvas?.clientWidth || 800;
        const curHeight = canvas?.clientHeight || 600;

        for (let i = engine.iceAttacks.length - 1; i >= 0; i--) {
          const atk = engine.iceAttacks[i];
          if (atk.state === 'forward') {
            atk.progress += dt * 5.5;
            if (atk.progress >= 1.0) {
              atk.progress = 1.0;
              atk.state = 'returning';

              // Collision Impact!
              sounds.playIceShatter();
              sounds.playBounce();

              // Unfreeze target box!
              const target = engine.boardBoxes.find((b) => b.id === atk.targetBoxId);
              if (target) {
                target.boxType = 'Normal';
                const targetScreen = boardToScreen(target.x, target.z, curWidth, curHeight);
                engine.feedbacks.push({
                  id: Date.now() + Math.random(),
                  text: 'CRACK! ❄️💥',
                  x: targetScreen.x,
                  y: targetScreen.y - 18,
                  color: '#38bdf8',
                  lifetime: 1.0,
                });

                // Spawn flying ice crystal particles
                for (let p = 0; p < 18; p++) {
                  const ang = Math.random() * Math.PI * 2;
                  const spd = 60 + Math.random() * 120;
                  engine.iceParticles.push({
                    x: targetScreen.x,
                    y: targetScreen.y,
                    vx: Math.cos(ang) * spd,
                    vy: Math.sin(ang) * spd,
                    size: 3 + Math.random() * 5,
                    alpha: 1.0,
                    rot: Math.random() * Math.PI * 2,
                    rotSpeed: (Math.random() - 0.5) * 10,
                    color: Math.random() > 0.4 ? '#bae6fd' : '#ffffff',
                  });
                }
              }
            }
          } else if (atk.state === 'returning') {
            atk.progress -= dt * 4.5;
            if (atk.progress <= 0) {
              atk.progress = 0;
              engine.iceAttacks.splice(i, 1);
            }
          }

          atk.currentX = atk.startX + atk.dir.x * (atk.distance * atk.progress);
          atk.currentZ = atk.startZ + atk.dir.z * (atk.distance * atk.progress);
        }

        // Update Ice Particles
        for (let p = engine.iceParticles.length - 1; p >= 0; p--) {
          const pt = engine.iceParticles[p];
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          pt.vy += 70 * dt; // gravity
          pt.rot += pt.rotSpeed * dt;
          pt.alpha -= dt * 1.5;
          if (pt.alpha <= 0) {
            engine.iceParticles.splice(p, 1);
          }
        }

        // Update Tunnel Dispense Animations
        for (let d = engine.tunnelDispenses.length - 1; d >= 0; d--) {
          const td = engine.tunnelDispenses[d];
          td.progress += dt * 4.0;
          if (td.progress >= 1.0) {
            engine.tunnelDispenses.splice(d, 1);
          }
        }

        // Check Victory Condition:
        // Dragon has no wool left AND board is empty AND all slots cleared
        // AND all tunnel queues emptied AND all conveyor boxes cleared
        const isDragonClear = engine.dragonSections.length === 0;
        const isBoardClear = engine.boardBoxes.length === 0 && engine.iceAttacks.length === 0;
        const isSlotsClear = engine.slottedBoxes.every((sb) => sb === null);
        const isTunnelsClear = engine.tunnels.every((t) => t.queue.length === 0);
        const isConveyorsClear = engine.conveyors.every((c) => c.boxes.length === 0);

        if (
          isDragonClear &&
          isBoardClear &&
          isSlotsClear &&
          isTunnelsClear &&
          isConveyorsClear
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

  // World to screen mapping for right-side board (accounting for zoom scale and pan offset)
  const getBoardTransform = (width: number, height: number) => {
    const midX = width * 0.50;
    const rightW = width - midX;
    const baseZoom = Math.min((rightW - 40) / 8.5, (height - 60) / 10.0);
    const effectiveZoom = baseZoom * engineRef.current.boardZoomScale;
    const cx = midX + rightW / 2 + engineRef.current.boardPanOffset.x;
    const cy = height / 2 + engineRef.current.boardPanOffset.y;
    return { baseZoom, effectiveZoom, cx, cy, midX, rightW };
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

      const midX = width * 0.50;
      const rightW = width - midX;
      const baseZoom = Math.min((rightW - 40) / 8.5, (height - 60) / 10.0);
      const prevEffectiveZoom = baseZoom * prevScale;
      const nextEffectiveZoom = baseZoom * nextScale;

      const prevCx = midX + rightW / 2 + engine.boardPanOffset.x;
      const prevCy = height / 2 + engine.boardPanOffset.y;

      // World point under cursor before zoom
      const wx = (screenX - prevCx) / prevEffectiveZoom;
      const wz = -(screenY - prevCy) / prevEffectiveZoom;

      // New pan offsets to keep (wx, wz) at the exact same screen position
      engine.boardPanOffset.x = screenX - (midX + rightW / 2) - wx * nextEffectiveZoom;
      engine.boardPanOffset.y = screenY - (height / 2) + wz * nextEffectiveZoom;
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
        if (canvas) zoomAtPoint(1.2, canvas.clientWidth * 0.75, canvas.clientHeight / 2);
      } else if (e.key === '-' || e.key === '_') {
        const canvas = canvasRef.current;
        if (canvas) zoomAtPoint(0.83, canvas.clientWidth * 0.75, canvas.clientHeight / 2);
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

    const midX = width * 0.50;
    const rightW = width - midX;

    // -------------------------------------------------------------
    // LEFT HALF: SOFT MEADOW GREEN (Dragon & Wool Gathering Zone)
    // -------------------------------------------------------------
    const leftGrad = ctx.createLinearGradient(0, 0, midX, height);
    leftGrad.addColorStop(0, '#f0fdf4');
    leftGrad.addColorStop(1, '#dcfce7');
    ctx.fillStyle = leftGrad;
    ctx.fillRect(0, 0, midX, height);

    // -------------------------------------------------------------
    // RIGHT HALF: WARM CREAM / SAND TABLE (Puzzle Board & Box Mess)
    // -------------------------------------------------------------
    const rightGrad = ctx.createLinearGradient(midX, 0, width, height);
    rightGrad.addColorStop(0, '#fefce8');
    rightGrad.addColorStop(1, '#fef3c7');
    ctx.fillStyle = rightGrad;
    ctx.fillRect(midX, 0, rightW, height);

    // Subtle vertical divider line separating the two halves
    ctx.beginPath();
    ctx.moveTo(midX, 0);
    ctx.lineTo(midX, height);
    ctx.strokeStyle = 'rgba(217, 119, 6, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // -------------------------------------------------------------
    // 1. LEFT AREA: ROAD TRACK, DRAGON & CAT
    // -------------------------------------------------------------
    const track = levelData.dragon.track;
    const shelfY = height - 90;

    let minX = -3.5, maxX = 3.5, minY = 1.8, maxY = 7.2;
    if (track && track.length > 0) {
      minX = Math.min(...track.map((p) => p.x));
      maxX = Math.max(...track.map((p) => p.x));
      minY = Math.min(...track.map((p) => p.y));
      maxY = Math.max(...track.map((p) => p.y));
    }
    const trackSpanX = Math.max(maxX - minX, 1);
    const trackSpanY = Math.max(maxY - minY, 1);
    const trackMidX = (minX + maxX) / 2;
    const trackMidY = (minY + maxY) / 2;

    const availLeftW = Math.max(120, Math.min(midX - 40, 750));
    const availLeftH = Math.max(140, shelfY - 50);

    const leftAreaZoom = Math.min(
      availLeftW / (trackSpanX + 1.2),
      availLeftH / (trackSpanY + 0.8)
    );
    const leftCx = midX / 2;
    const leftCy = 30 + availLeftH / 2;

    const trackToScreen = (wx: number, wy: number) => ({
      x: leftCx + (wx - trackMidX) * leftAreaZoom,
      y: leftCy - (wy - trackMidY) * leftAreaZoom,
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

      // Outer Road Curb / Warm Border (matches reference image)
      ctx.lineWidth = 36;
      ctx.strokeStyle = '#e2b078';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Warm Sand Road Bed (matches reference image)
      ctx.lineWidth = 28;
      ctx.strokeStyle = '#fed7aa';
      ctx.stroke();

      // Center White Dashed Stitching
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.setLineDash([8, 8]);
      ctx.stroke();
      ctx.setLineDash([]);

      // -------------------------------------------------------------
      // 1.1 START POINT / ACTIVE BOUNDARY LINE (At progress = 1/3)
      // Dragon starts here; boxes gather segments that cross this line
      // -------------------------------------------------------------
      const startPt = getTrackPointAt(START_POINT);
      const startScr = trackToScreen(startPt.x, startPt.y);
      const perpAngle = -startPt.angle + Math.PI / 2;
      const gateWidth = 18;
      const gX1 = startScr.x + Math.cos(perpAngle) * gateWidth;
      const gY1 = startScr.y + Math.sin(perpAngle) * gateWidth;
      const gX2 = startScr.x - Math.cos(perpAngle) * gateWidth;
      const gY2 = startScr.y - Math.sin(perpAngle) * gateWidth;

      // Start line cyan bar
      ctx.beginPath();
      ctx.moveTo(gX1, gY1);
      ctx.lineTo(gX2, gY2);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#06b6d4';
      ctx.stroke();

      // Checkered core
      ctx.beginPath();
      ctx.moveTo(gX1, gY1);
      ctx.lineTo(gX2, gY2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Start Point Flag Pin
      ctx.save();
      ctx.translate(startScr.x + Math.cos(perpAngle) * 22, startScr.y + Math.sin(perpAngle) * 22);
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(-22, -8, 44, 16, 4);
      ctx.fill();
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 8.5px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🚩 START', 0, 0);
      ctx.restore();

      // -------------------------------------------------------------
      // 1.2 CAT SITTING AT CURRENT CHECKPOINT
      // -------------------------------------------------------------
      const catPositions = levelData.dragon.catPositions;
      if (catPositions && engine.catIndex < catPositions.length) {
        const catTarget = catPositions[engine.catIndex];
        const catPt = getTrackPointAt(catTarget.progress);
        const catScreen = trackToScreen(catPt.x, catPt.y);

        ctx.save();
        const hopOffset =
          engine.catHopAnim > 0 ? Math.sin(engine.catHopAnim * Math.PI) * 24 : 0;
        ctx.translate(catScreen.x, catScreen.y - hopOffset);

        // Cat Shadow
        ctx.beginPath();
        ctx.ellipse(0, 12, 14, 5, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.fill();

        // Cat Body
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#b45309';
        ctx.stroke();

        // Ears
        ctx.beginPath();
        ctx.moveTo(-10, -9); ctx.lineTo(-6, -20); ctx.lineTo(-1, -12);
        ctx.fillStyle = '#d97706'; ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-8, -10); ctx.lineTo(-6, -17); ctx.lineTo(-3, -12);
        ctx.fillStyle = '#f472b6'; ctx.fill();

        ctx.beginPath();
        ctx.moveTo(10, -9); ctx.lineTo(6, -20); ctx.lineTo(1, -12);
        ctx.fillStyle = '#d97706'; ctx.fill();
        ctx.beginPath();
        ctx.moveTo(8, -10); ctx.lineTo(6, -17); ctx.lineTo(3, -12);
        ctx.fillStyle = '#f472b6'; ctx.fill();

        // Eyes & Nose
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-4.5, -2, 2, 0, Math.PI * 2);
        ctx.arc(4.5, -2, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ec4899';
        ctx.beginPath();
        ctx.arc(0, 2.5, 1.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      // -------------------------------------------------------------
      // 1.3 DRAGON WOOL BODY (FULL VIBRANT COLOR EVERYWHERE!)
      // -------------------------------------------------------------
      const headPt = getTrackPointAt(engine.dragonProgress);
      const headScreen = trackToScreen(headPt.x, headPt.y);

      const activeColors = new Set(
        Array.from(engine.activeConnections.values()).map((c) => c.colorHex)
      );

      // Render knots for a section with 100% full vibrant color
      const renderSectionKnots = (
        sec: DragonSection,
        startProgress: number
      ): number => {
        const col = getWoolColor(sec.color);
        const knotCount = Math.min(sec.count, 25);
        const knotRadius = 12;
        const isSectionGathering = activeColors.has(col.hex);

        let currP = startProgress;

        for (let k = 0; k < knotCount; k++) {
          currP -= SEG_STEP;
          if (currP < 0) break;
          const kPt = getTrackPointAt(currP);
          const kScr = trackToScreen(kPt.x, kPt.y);

          ctx.save();
          // Always 100% full vibrant color along the entire track
          ctx.globalAlpha = 1.0;

          // Shadow under knot
          ctx.beginPath();
          ctx.arc(kScr.x, kScr.y + 1, knotRadius, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
          ctx.fill();

          // Main 3D Spherical Wool Knot in full vibrant color
          ctx.beginPath();
          ctx.arc(kScr.x, kScr.y, knotRadius, 0, Math.PI * 2);
          const grad = ctx.createRadialGradient(
            kScr.x - 3,
            kScr.y - 3,
            1.5,
            kScr.x,
            kScr.y,
            knotRadius
          );
          grad.addColorStop(0, col.lightHex);
          grad.addColorStop(0.55, col.hex);
          grad.addColorStop(1, col.darkHex);
          ctx.fillStyle = grad;
          ctx.fill();

          // Knitted yarn looping rib arc
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(kScr.x - 1.5, kScr.y - 1.5, knotRadius * 0.55, -0.6, Math.PI * 0.7);
          ctx.stroke();

          // Crisp outline
          ctx.strokeStyle = col.darkHex;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Active gathering pulse glow
          if (isSectionGathering) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 2.5;
            ctx.stroke();
          }

          ctx.restore();
        }

        return currP;
      };

      ctx.save();

      if (engine.reconnectState && engine.reconnectState.isReconnecting) {
        const { cutIndex, tailAnchorProgress } = engine.reconnectState;

        // 1. Draw Front Sections (from Head backwards)
        let frontProgress = engine.dragonProgress;
        for (let s = 0; s < cutIndex; s++) {
          frontProgress = renderSectionKnots(engine.dragonSections[s], frontProgress);
          if (frontProgress < 0) break;
        }

        // 2. Draw Tail Sections (anchored at tailAnchorProgress)
        let tailProgress = tailAnchorProgress;
        for (let s = cutIndex; s < engine.dragonSections.length; s++) {
          tailProgress = renderSectionKnots(engine.dragonSections[s], tailProgress);
          if (tailProgress < 0) break;
        }
      } else {
        // Continuous single dragon body
        let currentSegProgress = engine.dragonProgress;
        for (const section of engine.dragonSections) {
          currentSegProgress = renderSectionKnots(section, currentSegProgress);
          if (currentSegProgress < 0) break;
        }
      }

      // -------------------------------------------------------------
      // 1.4 COMPACT DRAGON HEAD (Small, sits at front tip, does NOT cover segments)
      // -------------------------------------------------------------
      ctx.save();
      ctx.translate(headScreen.x, headScreen.y);
      ctx.rotate(-headPt.angle);

      // Head Body centered forward at (5, 0) with small 10px radius
      // Back edge is at -5px, completely clearing the first segment behind it!
      ctx.beginPath();
      ctx.arc(5, 0, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#f97316';
      ctx.fill();
      ctx.strokeStyle = '#c2410c';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Small golden horns angled forward/upward (does NOT extend backward over segments!)
      ctx.beginPath();
      ctx.moveTo(2, -7);
      ctx.lineTo(7, -13);
      ctx.lineTo(8, -6);
      ctx.fillStyle = '#facc15';
      ctx.fill();
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(2, 7);
      ctx.lineTo(7, 13);
      ctx.lineTo(8, 6);
      ctx.fillStyle = '#facc15';
      ctx.fill();
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Small cute snout at (12, 0)
      ctx.beginPath();
      ctx.arc(12, 0, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fb923c';
      ctx.fill();
      ctx.strokeStyle = '#c2410c';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Nostrils
      ctx.fillStyle = '#7c2d12';
      ctx.beginPath();
      ctx.arc(14, -1.8, 1.2, 0, Math.PI * 2);
      ctx.arc(14, 1.8, 1.2, 0, Math.PI * 2);
      ctx.fill();

      // Expressive eyes at (6, -3.5) and (6, 3.5)
      ctx.beginPath();
      ctx.arc(6, -3.5, 2.8, 0, Math.PI * 2);
      ctx.arc(6, 3.5, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(6.8, -3.5, 1.8, 0, Math.PI * 2);
      ctx.arc(6.8, 3.5, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      // Sparkles
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(7.2, -4.2, 0.8, 0, Math.PI * 2);
      ctx.arc(7.2, 2.8, 0.8, 0, Math.PI * 2);
      ctx.fill();

      // Cute blush cheeks
      ctx.fillStyle = 'rgba(236, 72, 153, 0.45)';
      ctx.beginPath();
      ctx.arc(4, -8, 2.5, 0, Math.PI * 2);
      ctx.arc(4, 8, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      ctx.restore();
    }

    // -------------------------------------------------------------
    // 2. SPOOL SHELF & SLOTS (Stationed at bottom of left half)
    // -------------------------------------------------------------
    const slotCount = levelData.slots?.unlockedCount ?? levelData.slots?.count ?? 4;
    const slotW = Math.min((midX - 36) / (slotCount + 1), 72);
    const slotSpacing = slotW + 10;
    const shelfStartX = (midX - (slotCount * slotSpacing - 10)) / 2;

    // Shelf container bar
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.strokeStyle = 'rgba(180, 83, 9, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(shelfStartX - 12, shelfY - 8, slotCount * slotSpacing + 14, 60, 14);
    ctx.fill();
    ctx.stroke();

    const slotScreenPositions: { x: number; y: number }[] = [];

    // Render Slots & Docked Boxes
    for (let s = 0; s < slotCount; s++) {
      const sx = shelfStartX + s * slotSpacing + slotW / 2;
      const sy = shelfY + 22;
      slotScreenPositions.push({ x: sx, y: sy });

      const slotted = engine.slottedBoxes[s];

      // Well background
      ctx.beginPath();
      ctx.roundRect(sx - slotW / 2, sy - 21, slotW, 42, 10);
      ctx.fillStyle = 'rgba(254, 243, 199, 0.7)';
      ctx.fill();
      ctx.strokeStyle = '#fcd34d';
      ctx.lineWidth = 1.5;
      ctx.stroke();

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
        const spoolW = slotW - 12;
        const spoolH = 30;

        ctx.fillStyle = col.darkHex;
        ctx.beginPath();
        ctx.roundRect(-spoolW / 2, -spoolH / 2, 5, spoolH, 3);
        ctx.roundRect(spoolW / 2 - 5, -spoolH / 2, 5, spoolH, 3);
        ctx.fill();

        // Wool winding cylinder in center
        ctx.fillStyle = col.hex;
        ctx.beginPath();
        ctx.roundRect(-spoolW / 2 + 4, -spoolH / 2 + 3, spoolW - 8, spoolH - 6, 4);
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
        ctx.fillStyle = 'rgba(100, 116, 139, 0.45)';
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
      const threadMidX = (startPt.x + endPt.x) / 2;
      const threadMidY = (startPt.y + endPt.y) / 2 + 15;
      ctx.quadraticCurveTo(threadMidX, threadMidY, endPt.x, endPt.y);
      ctx.strokeStyle = conn.colorHex;
      ctx.lineWidth = 3.5;
      ctx.stroke();
    });

    // Draw traveling wool particles along the curve
    engine.yarnParticles.forEach((p) => {
      if (p.t < 0) return;
      if (p.slotIndex >= slotScreenPositions.length) return;
      const startPt = trackToScreen(p.startPos.x, p.startPos.y);
      const endPt = slotScreenPositions[p.slotIndex];
      const threadMidX = (startPt.x + endPt.x) / 2;
      const threadMidY = (startPt.y + endPt.y) / 2 + 15;

      const t = p.t;
      const px = (1 - t) * (1 - t) * startPt.x + 2 * (1 - t) * t * threadMidX + t * t * endPt.x;
      const py = (1 - t) * (1 - t) * startPt.y + 2 * (1 - t) * t * threadMidY + t * t * endPt.y;

      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = p.colorHex;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // -------------------------------------------------------------
    // 4. RIGHT AREA: THE MESS OF BOXES (Strictly clipped to right half)
    // -------------------------------------------------------------
    const { effectiveZoom } = getBoardTransform(width, height);

    ctx.save();
    ctx.beginPath();
    ctx.rect(midX, 0, rightW, height);
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

    // -------------------------------------------------------------
    // DRAW CONVEYORS IN PLAYTEST
    // -------------------------------------------------------------
    engine.conveyors.forEach((conv) => {
      const beltH = 0.85 * effectiveZoom;
      const pStart = boardToScreen(conv.startX, conv.z, width, height);
      const pEnd = boardToScreen(conv.endX, conv.z, width, height);
      const minX = Math.min(pStart.x, pEnd.x);
      const maxX = Math.max(pStart.x, pEnd.x);
      const beltW = maxX - minX;
      const beltY = pStart.y - beltH / 2;

      ctx.save();

      // Rubber belt
      ctx.fillStyle = CONVEYOR_THEME.beltHex;
      ctx.beginPath();
      ctx.roundRect(minX, beltY, beltW, beltH, 6 * engine.boardZoomScale);
      ctx.fill();
      ctx.strokeStyle = CONVEYOR_THEME.borderHex;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Treads
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      const treadStep = 12 * engine.boardZoomScale;
      for (let tx = minX + 8; tx < maxX - 8; tx += treadStep) {
        ctx.beginPath();
        ctx.moveTo(tx, beltY + 3);
        ctx.lineTo(tx, beltY + beltH - 3);
        ctx.stroke();
      }

      // Direction chevrons
      const isLTR = conv.direction === 'left-to-right';
      ctx.fillStyle = CONVEYOR_THEME.chevronHex;
      ctx.font = `bold ${Math.round(11 * engine.boardZoomScale)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const chevCount = Math.max(3, Math.floor(beltW / (50 * engine.boardZoomScale)));
      for (let i = 1; i < chevCount; i++) {
        const cx = minX + (i * beltW) / chevCount;
        ctx.fillText(isLTR ? '▶▶▶' : '◀◀◀', cx, beltY + beltH / 2);
      }

      // Active Pick Zone
      const pActiveMin = boardToScreen(conv.activeZoneMinX, conv.z, width, height);
      const pActiveMax = boardToScreen(conv.activeZoneMaxX, conv.z, width, height);
      const activeLeft = Math.min(pActiveMin.x, pActiveMax.x);
      const activeRight = Math.max(pActiveMin.x, pActiveMax.x);
      const activeW = activeRight - activeLeft;

      ctx.fillStyle = CONVEYOR_THEME.activeZoneBg;
      ctx.fillRect(activeLeft, beltY, activeW, beltH);
      ctx.strokeStyle = CONVEYOR_THEME.activeZoneBorder;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(activeLeft, beltY, activeW, beltH);
      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = '#67e8f9';
      ctx.font = `bold ${Math.max(7, Math.round(8 * engine.boardZoomScale))}px monospace`;
      ctx.fillText('⚡ PICK ZONE ⚡', activeLeft + activeW / 2, beltY + beltH - 5);

      // Hoods at ends
      const hoodW = Math.max(22, 0.65 * effectiveZoom);
      ctx.fillStyle = CONVEYOR_THEME.hoodHex;
      ctx.beginPath();
      ctx.roundRect(minX - 2, beltY - 2, hoodW, beltH + 4, [6, 0, 0, 6]);
      ctx.fill();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.roundRect(maxX - hoodW + 2, beltY - 2, hoodW, beltH + 4, [0, 6, 6, 0]);
      ctx.fill();
      ctx.stroke();

      // LED Counter Display: [ 🔄 CONV N ]
      const badgeText = `🔄 ${conv.boxes.length}`;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(minX + 6, beltY - 16 * engine.boardZoomScale, 50 * engine.boardZoomScale, 14 * engine.boardZoomScale, 3);
      ctx.fill();
      ctx.strokeStyle = CONVEYOR_THEME.counterHex;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = CONVEYOR_THEME.counterHex;
      ctx.font = `bold ${Math.round(8.5 * engine.boardZoomScale)}px monospace`;
      ctx.fillText(badgeText, minX + 31 * engine.boardZoomScale, beltY - 9 * engine.boardZoomScale);

      ctx.restore();

      // Conveyor Buses
      conv.boxes.forEach((cb) => {
        const cScreen = boardToScreen(cb.x, conv.z, width, height);
        const colDef = getWoolColor(cb.color);
        const dim = BOX_DIMENSIONS[cb.numType] || BOX_DIMENSIONS.Box4;
        const bW = dim.width * effectiveZoom;
        const bL = dim.length * effectiveZoom;

        ctx.save();
        ctx.translate(cScreen.x, cScreen.y);
        ctx.rotate((cb.angle * Math.PI) / 180);

        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;

        const bx = -bW / 2;
        const by = -bL / 2;
        ctx.beginPath();
        ctx.roundRect(bx, by, bW, bL, 5 * engine.boardZoomScale);

        const bGrad = ctx.createLinearGradient(bx, by, bx + bW, by + bL);
        bGrad.addColorStop(0, colDef.lightHex);
        bGrad.addColorStop(0.5, colDef.hex);
        bGrad.addColorStop(1, colDef.darkHex);
        ctx.fillStyle = bGrad;
        ctx.fill();

        ctx.shadowColor = 'transparent';

        const inActive = cb.x >= conv.activeZoneMinX && cb.x <= conv.activeZoneMaxX;
        ctx.strokeStyle = inActive ? '#ffffff' : 'rgba(255,255,255,0.4)';
        ctx.lineWidth = inActive ? Math.max(1.5, 2 * engine.boardZoomScale) : 1;
        ctx.stroke();

        const pW = Math.min(bW * 0.75, 24 * engine.boardZoomScale);
        const pH = 12 * engine.boardZoomScale;
        const pY = bL / 2 - pH - 3 * engine.boardZoomScale;
        ctx.beginPath();
        ctx.roundRect(-pW / 2, pY, pW, pH, 5 * engine.boardZoomScale);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(8.5 * engine.boardZoomScale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${cb.capacity}`, 0, pY + pH / 2);

        ctx.restore();
      });
    });

    // -------------------------------------------------------------
    // DRAW TUNNELS IN PLAYTEST (Shown as 2 objects: Tunnel structure & Ready Box in front)
    // -------------------------------------------------------------
    engine.tunnels.forEach((tun) => {
      const tScreen = boardToScreen(tun.x, tun.z, width, height);
      const tunDim = BOX_DIMENSIONS.Box6;
      const tunW = tunDim.width * effectiveZoom;
      const tunH = tunDim.length * effectiveZoom;

      // 1. Draw the Tunnel Structure itself
      ctx.save();
      ctx.translate(tScreen.x, tScreen.y);
      ctx.rotate((tun.angle * Math.PI) / 180);

      // Shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = 8 * engine.boardZoomScale;

      const ax = -tunW / 2;
      const ay = -tunH / 2;
      ctx.beginPath();
      ctx.roundRect(ax, ay, tunW, tunH, 7 * engine.boardZoomScale);
      const tunBodyGrad = ctx.createLinearGradient(ax, ay, ax + tunW, ay + tunH);
      tunBodyGrad.addColorStop(0, '#334155');
      tunBodyGrad.addColorStop(0.5, '#1e293b');
      tunBodyGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = tunBodyGrad;
      ctx.fill();

      ctx.shadowColor = 'transparent';

      // Outer border
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#475569';
      ctx.stroke();

      // Side metallic rails (Left & Right bumpers)
      const railW = Math.max(4, tunW * 0.16);

      // Left rail
      ctx.beginPath();
      ctx.roundRect(ax + 2, ay + 2, railW, tunH - 4, 3 * engine.boardZoomScale);
      const leftRailGrad = ctx.createLinearGradient(ax + 2, 0, ax + 2 + railW, 0);
      leftRailGrad.addColorStop(0, '#94a3b8');
      leftRailGrad.addColorStop(0.5, '#cbd5e1');
      leftRailGrad.addColorStop(1, '#475569');
      ctx.fillStyle = leftRailGrad;
      ctx.fill();

      // Right rail
      ctx.beginPath();
      ctx.roundRect(ax + tunW - railW - 2, ay + 2, railW, tunH - 4, 3 * engine.boardZoomScale);
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
      ctx.roundRect(trackLeft, ay + 3, trackW, tunH - 6, 3 * engine.boardZoomScale);
      ctx.fillStyle = '#090d16';
      ctx.fill();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Chevrons pointing towards the ready box (in local space, towards +Y mouth)
      const chevY = ay + tunH * 0.68;
      const chevW = Math.min(trackW * 0.65, 12 * engine.boardZoomScale);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2.5 * engine.boardZoomScale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Chevron 1
      ctx.beginPath();
      ctx.moveTo(-chevW / 2, chevY - 4 * engine.boardZoomScale);
      ctx.lineTo(0, chevY);
      ctx.lineTo(chevW / 2, chevY - 4 * engine.boardZoomScale);
      ctx.stroke();

      // Chevron 2
      ctx.beginPath();
      ctx.moveTo(-chevW / 2, chevY + 4 * engine.boardZoomScale);
      ctx.lineTo(0, chevY + 8 * engine.boardZoomScale);
      ctx.lineTo(chevW / 2, chevY + 4 * engine.boardZoomScale);
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
      ctx.font = `bold ${Math.round(15 * engine.boardZoomScale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText(`${storedCount}`, 0, 0);
      ctx.fillText(`${storedCount}`, 0, 0);
      ctx.restore();

      ctx.restore();

      // 2. Draw the Ready Box in Front of the Tunnel (ALWAYS in opposite direction)
      const readyBox = getTunnelReadyBox(tun);
      if (readyBox) {
        const bScreen = boardToScreen(readyBox.x, readyBox.z, width, height);
        const bDim = BOX_DIMENSIONS[readyBox.numType] || BOX_DIMENSIONS.Box6;
        const bW = bDim.width * effectiveZoom;
        const bL = bDim.length * effectiveZoom;
        const colDef = getWoolColor(readyBox.color);

        ctx.save();
        ctx.translate(bScreen.x, bScreen.y);
        ctx.rotate((readyBox.angle * Math.PI) / 180);

        // Box shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 5 * engine.boardZoomScale;
        ctx.shadowOffsetY = 2;

        const bx = -bW / 2;
        const by = -bL / 2;
        ctx.beginPath();
        ctx.roundRect(bx, by, bW, bL, 6 * engine.boardZoomScale);

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
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath();
        ctx.roundRect(bx, by, bW, bL, 6 * engine.boardZoomScale);
        ctx.stroke();

        // Forward direction arrow (pointing along readyBox.angle, away from tunnel)
        const arrowLength = Math.min(bL * 0.45, 18 * engine.boardZoomScale);
        const arrowWidth = Math.min(bW * 0.42, 13 * engine.boardZoomScale);
        const arrowTipY = -bL / 2 + 6 * engine.boardZoomScale;

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
        const pillW = Math.min(bW * 0.75, 24 * engine.boardZoomScale);
        const pillH = 13 * engine.boardZoomScale;
        const pillY = bL / 2 - pillH - 4 * engine.boardZoomScale;

        ctx.beginPath();
        ctx.roundRect(-pillW / 2, pillY, pillW, pillH, 6 * engine.boardZoomScale);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(9.5 * engine.boardZoomScale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${readyBox.capacity}`, 0, pillY + pillH / 2);

        ctx.restore();
      }
    });

    // Check exit status for all board boxes
    const exitStatus = new Map<number, ReturnType<typeof checkExitPath>>();
    engine.boardBoxes.forEach((b) => {
      exitStatus.set(b.id, checkExitPath(b, engine.boardBoxes));
    });

    // Render each board box
    engine.boardBoxes.forEach((b) => {
      const status = exitStatus.get(b.id);
      const isClear = !status?.isBlocked;
      const isFrozen = isBoxFrozen(b);
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
      ctx.shadowColor = isFrozen ? 'rgba(56, 189, 248, 0.5)' : 'rgba(0, 0, 0, 0.25)';
      ctx.shadowBlur = isFrozen ? 8 * engine.boardZoomScale : 6 * engine.boardZoomScale;
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

      // Crystalline Ice overlay for Frozen Box
      if (isFrozen) {
        const iceGrad = ctx.createLinearGradient(rx, ry, rx + rw, ry + rh);
        iceGrad.addColorStop(0, 'rgba(224, 242, 254, 0.85)');
        iceGrad.addColorStop(0.5, 'rgba(186, 230, 253, 0.6)');
        iceGrad.addColorStop(1, 'rgba(125, 211, 252, 0.85)');
        ctx.fillStyle = iceGrad;
        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, Math.max(3, 6 * engine.boardZoomScale));
        ctx.fill();

        // Jagged ice crack lines
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = Math.max(1, 1.2 * engine.boardZoomScale);
        ctx.beginPath();
        ctx.moveTo(rx + 3, ry + 4);
        ctx.lineTo(rx + rw * 0.35, ry + rh * 0.4);
        ctx.lineTo(rx + rw * 0.2, ry + rh * 0.7);
        ctx.moveTo(rx + rw - 3, ry + 6);
        ctx.lineTo(rx + rw * 0.6, ry + rh * 0.35);
        ctx.lineTo(rx + rw * 0.7, ry + rh * 0.75);
        ctx.stroke();
        ctx.restore();
      }

      // Border: electric ice blue if frozen, crisp white if clear, dark border if blocked
      ctx.lineWidth = isFrozen ? Math.max(2, 2.5 * engine.boardZoomScale) : isClear ? Math.max(1.5, 2 * engine.boardZoomScale) : 1;
      ctx.strokeStyle = isFrozen ? '#7dd3fc' : isClear ? '#ffffff' : 'rgba(0, 0, 0, 0.4)';
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

      // Snowflake badge in corner for Frozen Box
      if (isFrozen) {
        const bSize = Math.max(12, 14 * engine.boardZoomScale);
        const bX = rx + rw - bSize - 2;
        const bY = ry + 2;
        ctx.beginPath();
        ctx.roundRect(bX, bY, bSize, bSize, 3);
        ctx.fillStyle = 'rgba(12, 74, 110, 0.88)';
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#e0f2fe';
        ctx.font = `${Math.round(8.5 * engine.boardZoomScale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('❄️', bX + bSize / 2, bY + bSize / 2);
      }

      ctx.restore();
    });

    // -------------------------------------------------------------
    // DRAW ATTACKING BUSES (UNFREEZING COLLISION RUSH & BOUNCE)
    // -------------------------------------------------------------
    engine.iceAttacks.forEach((atk) => {
      const b = atk.attackerBox;
      const colDef = getWoolColor(b.color);
      const dim = BOX_DIMENSIONS[b.numType] || BOX_DIMENSIONS.Box4;
      const sc = boardToScreen(atk.currentX, atk.currentZ, width, height);
      const screenW = dim.width * effectiveZoom;
      const screenL = dim.length * effectiveZoom;

      ctx.save();
      ctx.translate(sc.x, sc.y);
      ctx.rotate((b.angle * Math.PI) / 180);

      // Cyan rush glow
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 12 * engine.boardZoomScale;

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

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * engine.boardZoomScale;
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

    // -------------------------------------------------------------
    // DRAW ICE SHATTER PARTICLES
    // -------------------------------------------------------------
    engine.iceParticles.forEach((pt) => {
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.rot);
      ctx.globalAlpha = Math.max(0, pt.alpha);
      ctx.fillStyle = pt.color;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(0, -pt.size);
      ctx.lineTo(pt.size * 0.7, 0);
      ctx.lineTo(0, pt.size);
      ctx.lineTo(-pt.size * 0.7, 0);
      ctx.closePath();
      ctx.fill();
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
    const midX = width * 0.50;

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

    // Hover detection over board boxes (only in right half)
    if (mouseX >= midX) {
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
    const midX = width * 0.50;

    // Ignore clicks on dragon track or spool shelf in left half
    if (mouseX < midX) return;

    // Screen to World for board area
    const { x: wx, z: wz } = screenToBoard(mouseX, mouseY, width, height);

    // -------------------------------------------------------------
    // 1. Check Clicks on Tunnels (Warehouse Dispenser)
    // -------------------------------------------------------------
    for (const tun of engine.tunnels) {
      if (tun.queue.length === 0) continue;
      if (isPointInTunnelCompound(wx, wz, tun)) {
        const readyBox = getTunnelReadyBox(tun);
        if (!readyBox) continue;

        const exitRes = checkExitPath(readyBox, engine.boardBoxes);
        const boxSc = boardToScreen(readyBox.x, readyBox.z, width, height);
        const dir = angleToDirection(readyBox.angle);

        if (exitRes.isBlocked) {
          // If blocked by a frozen bus, launch unfreezing attack!
          if (exitRes.blockingBoxId) {
            const blocker = engine.boardBoxes.find((b) => b.id === exitRes.blockingBoxId);
            if (blocker && isBoxFrozen(blocker)) {
              sounds.playWhoosh();
              engine.iceAttacks.push({
                id: Date.now(),
                attackerBox: readyBox,
                startX: readyBox.x,
                startZ: readyBox.z,
                currentX: readyBox.x,
                currentZ: readyBox.z,
                targetBoxId: blocker.id,
                dir,
                distance: exitRes.distanceToBlocker || 1.0,
                progress: 0,
                state: 'forward',
              });
              return;
            }
          }

          sounds.playBlocked();
          engine.feedbacks.push({
            id: Date.now(),
            text: 'Tunnel Exit Blocked! ❌',
            x: boxSc.x,
            y: boxSc.y - 20,
            color: '#ef4444',
            lifetime: 1.0,
          });
          return;
        }

        // Empty slot check
        const emptySlotIdx = engine.slottedBoxes.findIndex((s) => s === null);
        if (emptySlotIdx === -1) {
          sounds.playBlocked();
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

        // Launch ready bus into slot!
        sounds.playWhoosh();
        const launched = tun.queue.shift()!;
        engine.slottedBoxes[emptySlotIdx] = {
          box: {
            ...launched,
            x: readyBox.x,
            z: readyBox.z,
            angle: readyBox.angle,
          },
          filled: 0,
          capacity: launched.capacity,
          color: launched.color,
          slotIndex: emptySlotIdx,
          flyProgress: 0,
          sourceScreenPos: { x: boxSc.x, y: boxSc.y },
        };

        // Instantly dispense next bus from queue!
        if (tun.queue.length > 0) {
          sounds.playTunnelDispense();
          engine.tunnelDispenses.push({ tunnelId: tun.id, progress: 0 });
        }
        return;
      }
    }

    // -------------------------------------------------------------
    // 2. Check Clicks on Conveyor Belts
    // -------------------------------------------------------------
    for (const conv of engine.conveyors) {
      if (Math.abs(wz - conv.z) <= 0.45) {
        const clickedConvBox = conv.boxes.find((cb) => {
          const dim = BOX_DIMENSIONS[cb.numType] || BOX_DIMENSIONS.Box4;
          return Math.abs(wx - cb.x) <= dim.width / 2 && Math.abs(wz - conv.z) <= dim.length / 2;
        });

        if (clickedConvBox) {
          const minActive = Math.min(conv.activeZoneMinX, conv.activeZoneMaxX);
          const maxActive = Math.max(conv.activeZoneMinX, conv.activeZoneMaxX);
          const inActiveZone = clickedConvBox.x >= minActive && clickedConvBox.x <= maxActive;
          const boxSc = boardToScreen(clickedConvBox.x, conv.z, width, height);

          if (!inActiveZone) {
            sounds.playBlocked();
            engine.shakingBoxId = clickedConvBox.id;
            engine.shakeTimer = 0.35;
            engine.feedbacks.push({
              id: Date.now(),
              text: 'Outside Active Zone! ⚠️',
              x: boxSc.x,
              y: boxSc.y - 20,
              color: '#f59e0b',
              lifetime: 1.0,
            });
            return;
          }

          // Slot check
          const emptySlotIdx = engine.slottedBoxes.findIndex((s) => s === null);
          if (emptySlotIdx === -1) {
            sounds.playBlocked();
            engine.shakingBoxId = clickedConvBox.id;
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

          // Launch conveyor box into slot
          sounds.playWhoosh();
          engine.slottedBoxes[emptySlotIdx] = {
            box: clickedConvBox,
            filled: 0,
            capacity: clickedConvBox.capacity,
            color: clickedConvBox.color,
            slotIndex: emptySlotIdx,
            flyProgress: 0,
            sourceScreenPos: { x: boxSc.x, y: boxSc.y },
          };
          conv.boxes = conv.boxes.filter((b) => b.id !== clickedConvBox.id);
          return;
        }
      }
    }

    // -------------------------------------------------------------
    // 3. Check Clicks on Board Boxes
    // -------------------------------------------------------------
    const clickedBox = findBoardBoxAt(wx, wz, engine.boardBoxes);
    if (!clickedBox) return;

    const boxSc = boardToScreen(clickedBox.x, clickedBox.z, width, height);

    // If box is Frozen: locked in place, cannot be directly selected!
    if (isBoxFrozen(clickedBox)) {
      sounds.playIceShake();
      engine.shakingBoxId = clickedBox.id;
      engine.shakeTimer = 0.4;
      engine.feedbacks.push({
        id: Date.now(),
        text: 'Frozen! ❄️ Launch a bus to break ice',
        x: boxSc.x,
        y: boxSc.y - 20,
        color: '#38bdf8',
        lifetime: 1.0,
      });
      return;
    }

    // Check exit path
    const exitRes = checkExitPath(clickedBox, engine.boardBoxes);

    if (exitRes.isBlocked) {
      // Check if blocker is Frozen: if so, LAUNCH UNFREEZING ATTACK!
      if (exitRes.blockingBoxId) {
        const blocker = engine.boardBoxes.find((b) => b.id === exitRes.blockingBoxId);
        if (blocker && isBoxFrozen(blocker)) {
          sounds.playWhoosh();
          engine.iceAttacks.push({
            id: Date.now(),
            attackerBox: clickedBox,
            startX: clickedBox.x,
            startZ: clickedBox.z,
            currentX: clickedBox.x,
            currentZ: clickedBox.z,
            targetBoxId: blocker.id,
            dir: angleToDirection(clickedBox.angle),
            distance: exitRes.distanceToBlocker || 1.0,
            progress: 0,
            state: 'forward',
          });
          return;
        }
      }

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

        {/* Floating Pan & Zoom HUD (Bottom-Right, over the Board Area) */}
        <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 px-2 py-1.5 rounded-xl shadow-xl backdrop-blur-md">
            <button
              onClick={() => {
                const canvas = canvasRef.current;
                if (!canvas) return;
                zoomAtPoint(1.2, canvas.clientWidth * 0.75, canvas.clientHeight / 2);
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
                zoomAtPoint(0.83, canvas.clientWidth * 0.75, canvas.clientHeight / 2);
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

          {/* Floating Pan & Zoom Hint */}
          <div className="hidden sm:flex items-center gap-2 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl shadow-lg backdrop-blur-sm text-[11px] text-slate-400">
            <span className="inline-block w-2 h-2 rounded-full bg-cyan-400/80 animate-pulse" />
            <span>Drag empty area to pan • Scroll to zoom</span>
          </div>
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
