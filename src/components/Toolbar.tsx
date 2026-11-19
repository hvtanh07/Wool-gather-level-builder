import React, { useRef, useState } from 'react';
import { CleanLevelData } from '../types/level';
import { parseLevelJson } from '../utils/levelIO';
import { sounds } from '../utils/audio';
import {
  Undo2,
  Redo2,
  ChevronLeft,
  ChevronRight,
  Dices,
  Trash2,
  FolderOpen,
  FileJson,
  ClipboardCopy,
  Check,
  Volume2,
  VolumeX,
  Eye,
} from 'lucide-react';

interface ToolbarProps {
  levelData: CleanLevelData;
  levelIndex: number;
  levelCount: number;
  viewMode: 'editor' | 'playtest';
  onSetViewMode: (mode: 'editor' | 'playtest') => void;
  onPrevLevel: () => void;
  onNextLevel: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  gridSnap: number;
  onSetGridSnap: (v: number) => void;
  showRays: boolean;
  onSetShowRays: (v: boolean) => void;
  onRandomizeLayout: () => void;
  onClearBoard: () => void;
  onOpenImportExport: () => void;
  onImportLevel: (level: CleanLevelData) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  levelData,
  levelIndex,
  levelCount,
  viewMode,
  onSetViewMode,
  onPrevLevel,
  onNextLevel,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  gridSnap,
  onSetGridSnap,
  showRays,
  onSetShowRays,
  onRandomizeLayout,
  onClearBoard,
  onOpenImportExport,
  onImportLevel,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [soundOn, setSoundOn] = useState(sounds.enabled);
  const [copied, setCopied] = useState(false);
  const editing = viewMode === 'editor';

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        onImportLevel(parseLevelJson(String(ev.target?.result || '')));
        sounds.playBoxComplete();
      } catch (err: unknown) {
        sounds.playBlocked();
        alert(`Could not import JSON file: ${err instanceof Error ? err.message : 'Invalid format'}`);
      }
    };
    reader.readAsText(file);
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(levelData, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      onOpenImportExport();
    }
  };

  return (
    <div className="bar" role="toolbar" aria-label="Level tools">
      <div className="grp">
        <button className="tb" onClick={onPrevLevel} disabled={levelIndex === 0} title="Previous level" aria-label="Previous level">
          <ChevronLeft />
        </button>
        <span className="lvtitle">
          Level {levelData.levelId}
          <small>
            {levelIndex + 1}/{levelCount} · {levelData.levelType}
          </small>
        </span>
        <button
          className="tb"
          onClick={onNextLevel}
          disabled={levelIndex >= levelCount - 1}
          title="Next level"
          aria-label="Next level"
        >
          <ChevronRight />
        </button>
      </div>

      <div className="grp">
        <div className="seg" role="group" aria-label="Mode">
          <button aria-pressed={editing} onClick={() => onSetViewMode('editor')}>
            Design
          </button>
          <button
            aria-pressed={!editing}
            onClick={() => {
              if (editing) sounds.playWhoosh();
              onSetViewMode('playtest');
            }}
          >
            Play test
          </button>
        </div>
      </div>

      {editing && (
        <>
          <div className="grp">
            <button className="tb" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
              <Undo2 />
            </button>
            <button className="tb" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
              <Redo2 />
            </button>
          </div>
          <div className="grp">
            <label className="hint" htmlFor="snap" style={{ marginRight: 4 }}>
              Snap
            </label>
            <select id="snap" value={gridSnap} onChange={(e) => onSetGridSnap(parseFloat(e.target.value))}>
              <option value={0}>Off</option>
              <option value={0.1}>0.1</option>
              <option value={0.25}>0.25</option>
              <option value={0.5}>0.5</option>
              <option value={1}>1.0</option>
            </select>
            <button
              className="tb"
              aria-pressed={showRays}
              onClick={() => onSetShowRays(!showRays)}
              title="Show exit rays for each box"
            >
              <Eye /> Rays
            </button>
          </div>
          <div className="grp">
            <button className="tb" onClick={onRandomizeLayout} title="Fill the board with a random tight 49-box layout">
              <Dices /> Random
            </button>
            <button className="tb danger" onClick={onClearBoard} title="Remove all boxes, tunnels, conveyors and dragon sections">
              <Trash2 /> Clear
            </button>
          </div>
        </>
      )}

      <span className="spacer" />

      <div className="grp">
        <button
          className="tb"
          onClick={() => {
            sounds.enabled = !soundOn;
            setSoundOn(!soundOn);
          }}
          title={soundOn ? 'Mute sounds' : 'Turn sounds on'}
          aria-label="Sounds"
        >
          {soundOn ? <Volume2 /> : <VolumeX />}
        </button>
        <button className="tb" onClick={() => fileInputRef.current?.click()} title="Open one level from a .json file (added after this level)" aria-label="Open level file">
          <FolderOpen /> <span className="lbl">Open</span>
        </button>
        <button className="tb" onClick={onOpenImportExport} title="Paste or download level JSON" aria-label="Import / Export JSON">
          <FileJson /> <span className="lbl">Import / Export</span>
        </button>
        <button className="tb" onClick={copyJson} title="Copy this level's JSON" aria-label="Copy JSON">
          {copied ? <Check /> : <ClipboardCopy />} <span className="lbl">{copied ? 'Copied' : 'Copy JSON'}</span>
        </button>
        <input type="file" ref={fileInputRef} onChange={handleFile} accept=".json,.txt,application/json,text/plain" hidden />
      </div>
    </div>
  );
};
