import { BoxNumType } from '../types/level';

export interface WoolColorDef {
  id: number;
  name: string;
  hex: string;
  darkHex: string;
  lightHex: string;
  textColor: string;
}

export const WOOL_COLORS: Record<number, WoolColorDef> = {
  1: {
    id: 1,
    name: 'Red',
    hex: '#ef4444',
    darkHex: '#b91c1c',
    lightHex: '#f87171',
    textColor: '#ffffff',
  },
  2: {
    id: 2,
    name: 'Blue',
    hex: '#2563eb',
    darkHex: '#1d4ed8',
    lightHex: '#60a5fa',
    textColor: '#ffffff',
  },
  3: {
    id: 3,
    name: 'Green',
    hex: '#22c55e',
    darkHex: '#15803d',
    lightHex: '#4ade80',
    textColor: '#ffffff',
  },
  4: {
    id: 4,
    name: 'Yellow',
    hex: '#eab308',
    darkHex: '#a16207',
    lightHex: '#fde047',
    textColor: '#1e293b',
  },
  5: {
    id: 5,
    name: 'Pink',
    hex: '#ec4899',
    darkHex: '#be185d',
    lightHex: '#f472b6',
    textColor: '#ffffff',
  },
  6: {
    id: 6,
    name: 'Orange',
    hex: '#f97316',
    darkHex: '#c2410c',
    lightHex: '#fb923c',
    textColor: '#ffffff',
  },
  7: {
    id: 7,
    name: 'Purple',
    hex: '#9333ea',
    darkHex: '#6b21a8',
    lightHex: '#c084fc',
    textColor: '#ffffff',
  },
  8: {
    id: 8,
    name: 'Cyan',
    hex: '#06b6d4',
    darkHex: '#0e7490',
    lightHex: '#38bdf8',
    textColor: '#ffffff',
  },
};

export function getWoolColor(colorId: number): WoolColorDef {
  return WOOL_COLORS[colorId] || WOOL_COLORS[1];
}

export interface BoxDimDef {
  numType: BoxNumType;
  capacity: number;
  width: number;  // X span before rotation
  length: number; // Z span before rotation (along direction)
}

export const BOX_DIMENSIONS: Record<BoxNumType, BoxDimDef> = {
  Box4: {
    numType: 'Box4',
    capacity: 4,
    width: 0.54,
    length: 0.54,
  },
  Box6: {
    numType: 'Box6',
    capacity: 6,
    width: 0.54,
    length: 0.76,
  },
  Box10: {
    numType: 'Box10',
    capacity: 10,
    width: 0.54,
    length: 0.98,
  },
};

export function getBoxCapacity(numType: string): number {
  if (numType === 'Box4' || numType === '4') return 4;
  if (numType === 'Box6' || numType === '6') return 6;
  if (numType === 'Box10' || numType === '10') return 10;
  return 4;
}

export function getBoxNumType(capacity: number): BoxNumType {
  if (capacity <= 4) return 'Box4';
  if (capacity <= 6) return 'Box6';
  return 'Box10';
}

export const ICE_THEME = {
  frostHex: 'rgba(224, 242, 254, 0.82)',
  cyanLightHex: '#bae6fd',
  iceBorderHex: '#38bdf8',
  iceGlow: 'rgba(56, 189, 248, 0.75)',
};

export const TUNNEL_THEME = {
  frameHex: '#1e293b',
  borderHex: '#475569',
  portalHex: '#020617',
  stripeYellow: '#facc15',
  stripeDark: '#0f172a',
  counterHex: '#fbbf24',
};

export const CONVEYOR_THEME = {
  beltHex: '#1e293b',
  borderHex: '#334155',
  chevronHex: 'rgba(255, 255, 255, 0.18)',
  activeZoneBorder: '#06b6d4',
  activeZoneBg: 'rgba(6, 182, 212, 0.08)',
  hoodHex: '#0f172a',
  counterHex: '#38bdf8',
};
