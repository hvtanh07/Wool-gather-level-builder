import { CleanLevelData, LegacyLvMap, BoxItem, DragonSection } from '../types/level';
import { getBoxCapacity, getBoxNumType } from '../utils/colors';

// Default serpentine track for dragon
export const DEFAULT_TRACK = [
  { x: -3.4, y: 7.2 },
  { x: -1.5, y: 7.2 },
  { x: 1.5, y: 7.2 },
  { x: 3.2, y: 6.2 },
  { x: 3.2, y: 4.8 },
  { x: 1.0, y: 4.5 },
  { x: -2.8, y: 4.5 },
  { x: -3.4, y: 3.2 },
  { x: -2.0, y: 2.2 },
  { x: 1.8, y: 2.2 },
  { x: 3.4, y: 1.8 },
];

export const DEFAULT_CAT_POSITIONS = [
  { id: 1, progress: 0.35, name: 'Checkpoint 1' },
  { id: 2, progress: 0.7, name: 'Checkpoint 2' },
  { id: 3, progress: 0.95, name: 'Final Safety Point' },
];

export function convertLegacyLvMapToClean(legacy: LegacyLvMap): CleanLevelData {
  const levelId = Math.abs(legacy.levelId || legacy.lv_raw || 101);
  const levelType = legacy.levelType === 'Hard' ? 'Hard' : 'Normal';

  // Palette distribution for boxes that have hardColor = 0
  const colorPalette = [1, 2, 3, 4, 5, 6, 7, 8];

  const boxes: BoxItem[] = (legacy.boxes || []).map((b, idx) => {
    const capacity = getBoxCapacity(b.numType);
    const numType = getBoxNumType(capacity);
    // Normalize angle to 0..360 integer / clean float
    let angle = Math.round(b.angle);
    if (angle < 0) angle += 360;
    if (angle >= 360) angle -= 360;

    // Pick color: hardColor if set (1..8), otherwise distribute deterministically
    const color = b.hardColor > 0 ? b.hardColor : colorPalette[(idx * 3 + b.id) % colorPalette.length];

    return {
      id: b.id || idx + 1,
      x: Number(b.pos.x.toFixed(3)),
      z: Number(b.pos.z.toFixed(3)),
      angle,
      numType,
      capacity,
      color,
      boxType: b.boxType || 'Normal',
    };
  });

  // Camera setup
  const camera = {
    cameraSize: legacy.cameraSize || 7.8,
    boxRootX: legacy.boxRoot?.x || 0.0,
    boxRootZ: legacy.boxRoot?.z || -1.6,
    boxRootAngle: legacy.boxRoot?.angle || 0.0,
    boxRootDisperse: legacy.boxRoot?.disperse || 0.0,
  };

  // Group default initial sections from boxes
  const sections: DragonSection[] = [];
  boxes.slice(0, 15).forEach((b) => {
    sections.push({ color: b.color, count: b.capacity });
  });

  return {
    version: '1.0',
    levelId,
    levelType,
    camera,
    slots: {
      count: 5,
      unlockedCount: 4,
    },
    dragon: {
      speed: 0.015,
      track: DEFAULT_TRACK,
      catPositions: DEFAULT_CAT_POSITIONS,
      sections,
    },
    boxes,
  };
}

// Raw JSON data from lvmap_110089 provided by user
export const RAW_LVMAP_110089: LegacyLvMap = {
  file: "lvmap_110089",
  levelId: 110089,
  lv_raw: -110089,
  levelType: "Normal",
  levelType_raw: 1,
  cameraSize: 7.796,
  boxRoot: {
    x: 0.0,
    z: -1.597,
    angle: 0.0,
    disperse: -0.039
  },
  boxCount: 49,
  boxes: [
    { id: 1, boxType: "Normal", numType: "Box6", pos: { x: 2.636, z: -5.415 }, angle: 90, hardColor: 0 },
    { id: 2, boxType: "Normal", numType: "Box10", pos: { x: 1.387, z: -5.411 }, angle: 90, hardColor: 0 },
    { id: 3, boxType: "Normal", numType: "Box4", pos: { x: 0.301, z: -5.411 }, angle: 0, hardColor: 0 },
    { id: 4, boxType: "Normal", numType: "Box4", pos: { x: -0.436, z: -5.411 }, angle: 0, hardColor: 6 },
    { id: 5, boxType: "Normal", numType: "Box6", pos: { x: -1.47, z: -5.406 }, angle: 270, hardColor: 0 },
    { id: 6, boxType: "Normal", numType: "Box6", pos: { x: -2.712, z: -5.409 }, angle: 270, hardColor: 0 },
    { id: 7, boxType: "Normal", numType: "Box4", pos: { x: -1.392, z: -4.481 }, angle: 270, hardColor: 7 },
    { id: 8, boxType: "Normal", numType: "Box4", pos: { x: -1.392, z: -3.566 }, angle: 270, hardColor: 0 },
    { id: 9, boxType: "Normal", numType: "Box4", pos: { x: -1.389, z: -2.723 }, angle: 270, hardColor: 0 },
    { id: 10, boxType: "Normal", numType: "Box4", pos: { x: -2.098, z: -4.481 }, angle: 0, hardColor: 8 },
    { id: 11, boxType: "Normal", numType: "Box10", pos: { x: -2.12, z: -3.271 }, angle: 0, hardColor: 0 },
    { id: 12, boxType: "Normal", numType: "Box10", pos: { x: 0.301, z: -3.27 }, angle: 0, hardColor: 0 },
    { id: 13, boxType: "Normal", numType: "Box10", pos: { x: -0.697, z: -4.197 }, angle: 0, hardColor: 0 },
    { id: 14, boxType: "Normal", numType: "Box4", pos: { x: -0.698, z: -2.969 }, angle: 0, hardColor: 6 },
    { id: 15, boxType: "Normal", numType: "Box4", pos: { x: 0.301, z: -1.906 }, angle: 0, hardColor: 0 },
    { id: 16, boxType: "Normal", numType: "Box4", pos: { x: -2.123, z: -1.906 }, angle: 0, hardColor: 0 },
    { id: 17, boxType: "Normal", numType: "Box4", pos: { x: -2.838, z: -4.481 }, angle: 270, hardColor: 0 },
    { id: 18, boxType: "Normal", numType: "Box4", pos: { x: -2.838, z: -3.566 }, angle: 270, hardColor: 0 },
    { id: 19, boxType: "Normal", numType: "Box4", pos: { x: -2.838, z: -2.723 }, angle: 0, hardColor: 0 },
    { id: 20, boxType: "Normal", numType: "Box10", pos: { x: 2.531, z: -4.481 }, angle: 90, hardColor: 0 },
    { id: 21, boxType: "Normal", numType: "Box6", pos: { x: 2.636, z: -3.566 }, angle: 90, hardColor: 0 },
    { id: 22, boxType: "Normal", numType: "Box10", pos: { x: 1.387, z: -3.557 }, angle: 90, hardColor: 0 },
    { id: 23, boxType: "Normal", numType: "Box6", pos: { x: 2.636, z: -2.723 }, angle: 90, hardColor: 0 },
    { id: 24, boxType: "Normal", numType: "Box10", pos: { x: 1.387, z: -2.679 }, angle: 90, hardColor: 0 },
    { id: 25, boxType: "Normal", numType: "Box6", pos: { x: 2.636, z: -1.906 }, angle: 90, hardColor: 0 },
    { id: 26, boxType: "Normal", numType: "Box6", pos: { x: -0.576, z: -1.906 }, angle: 90, hardColor: 7 },
    { id: 27, boxType: "Normal", numType: "Box10", pos: { x: 1.387, z: -4.481 }, angle: 90, hardColor: 0 },
    { id: 28, boxType: "Normal", numType: "Box10", pos: { x: 0.265, z: -4.481 }, angle: 270, hardColor: 0 },
    { id: 29, boxType: "Normal", numType: "Box10", pos: { x: 1.387, z: -1.906 }, angle: 90, hardColor: 0 },
    { id: 30, boxType: "Normal", numType: "Box10", pos: { x: -0.234, z: -1.069 }, angle: 270, hardColor: 8 },
    { id: 31, boxType: "Normal", numType: "Box4", pos: { x: -1.402, z: -1.906 }, angle: 270, hardColor: 6 },
    { id: 32, boxType: "Normal", numType: "Box10", pos: { x: -1.389, z: -0.7 }, angle: 180, hardColor: 7 },
    { id: 33, boxType: "Normal", numType: "Box4", pos: { x: -2.838, z: -1.906 }, angle: 270, hardColor: 0 },
    { id: 34, boxType: "Normal", numType: "Box10", pos: { x: -2.617, z: -1.082 }, angle: 270, hardColor: 0 },
    { id: 35, boxType: "Normal", numType: "Box10", pos: { x: -2.617, z: -0.227 }, angle: 270, hardColor: 0 },
    { id: 36, boxType: "Normal", numType: "Box4", pos: { x: 2.749, z: -1.099 }, angle: 90, hardColor: 0 },
    { id: 37, boxType: "Normal", numType: "Box4", pos: { x: 1.915, z: -1.099 }, angle: 90, hardColor: 0 },
    { id: 38, boxType: "Normal", numType: "Box10", pos: { x: 0.891, z: -1.087 }, angle: 90, hardColor: 0 },
    { id: 39, boxType: "Normal", numType: "Box4", pos: { x: 2.749, z: -0.243 }, angle: 90, hardColor: 0 },
    { id: 40, boxType: "Normal", numType: "Box4", pos: { x: 1.915, z: -0.243 }, angle: 90, hardColor: 0 },
    { id: 41, boxType: "Normal", numType: "Box10", pos: { x: 0.891, z: -0.221 }, angle: 90, hardColor: 0 },
    { id: 42, boxType: "Normal", numType: "Box6", pos: { x: 2.636, z: 0.632 }, angle: 90, hardColor: 0 },
    { id: 43, boxType: "Normal", numType: "Box4", pos: { x: 1.022, z: 0.632 }, angle: 0, hardColor: 0 },
    { id: 44, boxType: "Normal", numType: "Box4", pos: { x: 1.771, z: 0.632 }, angle: 0, hardColor: 0 },
    { id: 45, boxType: "Normal", numType: "Box10", pos: { x: -0.782, z: 0.423 }, angle: 0, hardColor: 0 },
    { id: 46, boxType: "Normal", numType: "Box10", pos: { x: -0.053, z: 0.423 }, angle: 0, hardColor: 0 },
    { id: 47, boxType: "Normal", numType: "Box4", pos: { x: -1.414, z: 0.632 }, angle: 0, hardColor: 0 },
    { id: 48, boxType: "Normal", numType: "Box4", pos: { x: -2.127, z: 0.632 }, angle: 0, hardColor: 0 },
    { id: 49, boxType: "Normal", numType: "Box4", pos: { x: -2.838, z: 0.632 }, angle: 0, hardColor: 0 }
  ]
};

// Create the clean default level based on demo 110089
export const DEMO_LEVEL: CleanLevelData = convertLegacyLvMapToClean(RAW_LVMAP_110089);

// Starter 16-box level preset
export const STARTER_LEVEL: CleanLevelData = {
  version: '1.0',
  levelId: 102,
  levelType: 'Normal',
  camera: {
    cameraSize: 7.8,
    boxRootX: 0.0,
    boxRootZ: -1.6,
    boxRootAngle: 0.0,
    boxRootDisperse: 0.0,
  },
  slots: {
    count: 5,
    unlockedCount: 4,
  },
  dragon: {
    speed: 0.018,
    track: DEFAULT_TRACK,
    catPositions: DEFAULT_CAT_POSITIONS,
    sections: [
      { color: 1, count: 6 },
      { color: 2, count: 6 },
      { color: 3, count: 4 },
      { color: 4, count: 4 },
      { color: 5, count: 6 },
      { color: 6, count: 10 },
      { color: 7, count: 6 },
      { color: 8, count: 6 },
    ],
  },
  boxes: [
    // Top Row
    { id: 1, x: -1.5, z: 0.5, angle: 0, numType: 'Box4', capacity: 4, color: 1 },
    { id: 2, x: -0.5, z: 0.5, angle: 0, numType: 'Box6', capacity: 6, color: 2 },
    { id: 3, x: 0.5, z: 0.5, angle: 0, numType: 'Box6', capacity: 6, color: 3 },
    { id: 4, x: 1.5, z: 0.5, angle: 0, numType: 'Box4', capacity: 4, color: 4 },
    // Mid-upper row
    { id: 5, x: -2.0, z: -0.6, angle: 270, numType: 'Box6', capacity: 6, color: 5 },
    { id: 6, x: -0.8, z: -0.6, angle: 270, numType: 'Box4', capacity: 4, color: 6 },
    { id: 7, x: 0.8, z: -0.6, angle: 90, numType: 'Box4', capacity: 4, color: 7 },
    { id: 8, x: 2.0, z: -0.6, angle: 90, numType: 'Box6', capacity: 6, color: 8 },
    // Mid-lower row
    { id: 9, x: -2.0, z: -1.8, angle: 270, numType: 'Box6', capacity: 6, color: 1 },
    { id: 10, x: -0.8, z: -1.8, angle: 0, numType: 'Box4', capacity: 4, color: 2 },
    { id: 11, x: 0.8, z: -1.8, angle: 0, numType: 'Box4', capacity: 4, color: 3 },
    { id: 12, x: 2.0, z: -1.8, angle: 90, numType: 'Box6', capacity: 6, color: 4 },
    // Bottom row
    { id: 13, x: -1.5, z: -3.0, angle: 180, numType: 'Box4', capacity: 4, color: 5 },
    { id: 14, x: -0.5, z: -3.0, angle: 180, numType: 'Box10', capacity: 10, color: 6 },
    { id: 15, x: 0.5, z: -3.0, angle: 180, numType: 'Box6', capacity: 6, color: 7 },
    { id: 16, x: 1.5, z: -3.0, angle: 180, numType: 'Box4', capacity: 4, color: 8 },
  ],
};

export const EMPTY_LEVEL: CleanLevelData = {
  version: '1.0',
  levelId: 101,
  levelType: 'Normal',
  camera: {
    cameraSize: 7.8,
    boxRootX: 0.0,
    boxRootZ: -1.6,
    boxRootAngle: 0.0,
    boxRootDisperse: 0.0,
  },
  slots: {
    count: 5,
    unlockedCount: 4,
  },
  dragon: {
    speed: 0.015,
    track: DEFAULT_TRACK,
    catPositions: DEFAULT_CAT_POSITIONS,
    sections: [],
  },
  boxes: [],
};

