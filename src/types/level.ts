// Clean, modern JSON schema for Wool Gather Level Builder

export type BoxNumType = 'Box4' | 'Box6' | 'Box10';
export type LevelType = 'Normal' | 'Hard';

export type BoxType = 'Normal' | 'Ice' | string;

export interface BoxItem {
  id: number;
  x: number;
  z: number;
  angle: number; // 0 = Up, 90 = Right, 180 = Down, 270 = Left (supports 45-degree increments too)
  numType: BoxNumType;
  capacity: number; // 4, 6, 10
  color: number; // 1 to 8
  boxType?: BoxType; // "Normal", "Ice" (Frozen), etc. Default "Normal"
}

export const isBoxFrozen = (box: BoxItem | null | undefined): boolean => {
  return !!box && (box.boxType === 'Ice' || box.boxType === 'Frozen');
};

// Tunnel (Warehouse / Portal dispenser)
export interface TunnelSetup {
  id: number;
  x: number;
  z: number;
  angle: number; // orientation of tunnel portal exit (0 = Up, 90 = Right, 180 = Down, 270 = Left)
  queue: BoxItem[]; // queue of stored buses inside the tunnel
}

// Conveyor Belt
export interface ConveyorSetup {
  id: number;
  z: number; // Z position on the board (e.g. -1.0)
  startX: number; // left screen edge, e.g. -4.5
  endX: number; // right screen edge, e.g. 4.5
  activeZoneMinX: number; // preset interaction zone start (e.g. -2.6)
  activeZoneMaxX: number; // preset interaction zone end (e.g. 2.6)
  direction: 'left-to-right' | 'right-to-left'; // default 'left-to-right'
  speed: number; // world units per sec (e.g. 0.6)
  boxes: BoxItem[]; // buses circulating on the belt
}

export interface DragonSection {
  color: number; // 1 to 8
  count: number; // number of wool units in this section
}

export interface TrackPoint {
  x: number;
  y: number;
}

export interface CatPosition {
  id: number;
  progress: number; // 0.0 to 1.0 along the track
  name?: string;
}

export interface DragonSetup {
  speed: number; // track progress per second (e.g. 0.02)
  track: TrackPoint[];
  catPositions: CatPosition[];
  sections: DragonSection[];
}

export interface CameraSetup {
  cameraSize: number; // e.g. 7.8
  boxRootX: number;
  boxRootZ: number;
  boxRootAngle: number;
  boxRootDisperse: number;
}

export interface SlotsSetup {
  count: number; // total slots (e.g. 4)
  unlockedCount: number; // initially available slots (e.g. 3)
}

export interface CleanLevelData {
  version: '1.0';
  levelId: number;
  levelType: LevelType;
  camera: CameraSetup;
  slots: SlotsSetup;
  dragon: DragonSetup;
  boxes: BoxItem[];
  tunnels?: TunnelSetup[];
  conveyors?: ConveyorSetup[];
}

// Legacy format representation for importing old lvmap_*.json files
export interface LegacyLvMapBox {
  id: number;
  boxType: string;
  boxType_raw?: number;
  numType: string;
  pos: {
    x: number;
    z: number;
  };
  angle: number;
  hardColor: number;
  otherInt?: number;
}

export interface LegacyLvMap {
  file?: string;
  levelId: number;
  lv_raw?: number;
  levelType: string;
  levelType_raw?: number;
  cameraSize: number;
  boxRoot?: {
    x: number;
    z: number;
    angle: number;
    disperse: number;
  };
  boxCount: number;
  boxes: LegacyLvMapBox[];
  infos?: Record<string, string>;
}
