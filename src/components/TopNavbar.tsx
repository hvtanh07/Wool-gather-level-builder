import React from 'react';
import { CleanLevelData, LevelType } from '../types/level';
import { sounds } from '../utils/audio';
import {
  Play,
  Download,
  Upload,
  RotateCcw,
  Sparkles,
  Camera,
  Layers,
  Settings,
  HelpCircle,
  Volume2,
  VolumeX,
  Trash2,
} from 'lucide-react';

interface TopNavbarProps {
  levelData: CleanLevelData;
  onUpdateLevelData: (updater: (prev: CleanLevelData) => CleanLevelData) => void;
  onStartPlaytest: () => void;
  onOpenImportExport: () => void;
  onLoadPreset: (presetName: string) => void;
  onClearBoard?: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  levelData,
  onUpdateLevelData,
  onStartPlaytest,
  onOpenImportExport,
  onLoadPreset,
  onClearBoard,
}) => {
  const [soundOn, setSoundOn] = React.useState(true);

  return (
    <header className="h-14 bg-slate-950 border-b border-slate-800 px-4 flex items-center justify-between text-slate-200 select-none z-30 shadow-md">
      {/* Left: Brand & Level Metadata */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center text-white font-extrabold text-base shadow-lg shadow-rose-500/20">
            🧶
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight leading-tight">
              Wool Gather <span className="text-cyan-400 font-normal">Level Builder</span>
            </h1>
          </div>
        </div>

        <div className="h-5 w-px bg-slate-800" />

        {/* Level ID & Type */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1">
            <span className="text-[11px] text-slate-400 font-mono">ID:</span>
            <input
              type="number"
              value={levelData.levelId}
              onChange={(e) => {
                const id = parseInt(e.target.value, 10) || 1;
                onUpdateLevelData((prev) => ({ ...prev, levelId: id }));
              }}
              className="w-16 bg-transparent text-xs font-mono font-bold text-amber-400 focus:outline-none"
            />
          </div>

          {/* Level Type Toggle */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs font-medium">
            {(['Normal', 'Hard'] as LevelType[]).map((type) => (
              <button
                key={type}
                onClick={() => {
                  sounds.playPop();
                  onUpdateLevelData((prev) => ({ ...prev, levelType: type }));
                }}
                className={`px-2 py-0.5 rounded transition ${
                  levelData.levelType === type
                    ? type === 'Hard'
                      ? 'bg-rose-600 text-white shadow'
                      : 'bg-cyan-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Presets dropdown */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-[11px] text-slate-400">Preset:</span>
          <select
            onChange={(e) => {
              if (e.target.value) {
                onLoadPreset(e.target.value);
                e.target.value = '';
              }
            }}
            defaultValue=""
            className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none cursor-pointer"
          >
            <option value="" disabled>
              Load preset...
            </option>
            <option value="demo">Demo Level (lvmap_110089 - 49 Boxes)</option>
            <option value="starter">Starter Level (16 Boxes)</option>
            <option value="empty">Blank Canvas (New Level)</option>
          </select>
        </div>
      </div>

      {/* Center: Camera & Slots Controls */}
      <div className="flex items-center gap-3 hidden lg:flex">
        {/* Camera Size */}
        <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800/80 rounded-lg px-2.5 py-1 text-xs">
          <Camera className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] text-slate-400">Camera:</span>
          <input
            type="number"
            step="0.1"
            value={levelData.camera.cameraSize}
            onChange={(e) => {
              const sz = parseFloat(e.target.value) || 7.8;
              onUpdateLevelData((prev) => ({
                ...prev,
                camera: { ...prev.camera, cameraSize: sz },
              }));
            }}
            className="w-12 bg-transparent text-xs font-mono text-cyan-400 focus:outline-none"
          />
        </div>

        {/* Slots Count */}
        <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800/80 rounded-lg px-2.5 py-1 text-xs">
          <Layers className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] text-slate-400">Slots:</span>
          <select
            value={levelData.slots.unlockedCount}
            onChange={(e) => {
              const count = parseInt(e.target.value, 10);
              onUpdateLevelData((prev) => ({
                ...prev,
                slots: { count: count + 1, unlockedCount: count },
              }));
            }}
            className="bg-transparent text-xs font-mono text-cyan-400 focus:outline-none cursor-pointer"
          >
            <option value={4} className="bg-slate-900">4 Active Slots</option>
            <option value={5} className="bg-slate-900">5 Active Slots</option>
            <option value={6} className="bg-slate-900">6 Active Slots</option>
            <option value={7} className="bg-slate-900">7 Active Slots</option>
          </select>
        </div>
      </div>

      {/* Right: Actions (Import/Export, Sound, Playtest) */}
      <div className="flex items-center gap-2">
        {/* Sound toggle */}
        <button
          onClick={() => {
            sounds.enabled = !soundOn;
            setSoundOn(!soundOn);
          }}
          className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition"
          title="Toggle Sounds"
        >
          {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>

        {/* Clear Board button */}
        {onClearBoard && (
          <button
            onClick={onClearBoard}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 hover:border-rose-600 text-rose-300 hover:text-white text-xs font-semibold rounded-lg transition active:scale-95"
            title="Clear all boxes, gimmicks, and dragon configuration"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">Clear Board</span>
          </button>
        )}

        {/* Import/Export Modal */}
        <button
          onClick={onOpenImportExport}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition"
        >
          <Upload className="w-3.5 h-3.5 text-cyan-400" />
          <span>JSON Import / Export</span>
        </button>

        {/* Playtest Mode button */}
        <button
          onClick={onStartPlaytest}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-emerald-600/30 hover:shadow-emerald-500/50 transition active:scale-95 animate-pulse"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>Playtest Mode</span>
        </button>
      </div>
    </header>
  );
};
