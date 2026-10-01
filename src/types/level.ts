// Clean, modern JSON schema for Wool Gather Level Builder

export type BoxNumType = 'Box4' | 'Box6' | 'Box10';
export type LevelType = 'Normal' | 'Hard';

export interface BoxItem {
  id: number;
  x: number;
  z: number;
  angle: number; // 0 = Up, 90 = Right, 180 = Down, 270 = Left (supports 45-degree increments too)
  numType: BoxNumType;
  capacity: number; // 4, 6, 10
  color: number; // 1 to 8
  boxType?: string; // "Normal", "Ice", "Garage", etc. Default "Normal"
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
