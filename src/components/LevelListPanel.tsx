import React, { useRef, useState } from 'react';
import { CleanLevelData } from '../types/level';
import { parseLevelListJson } from '../utils/levelIO';
import { sounds } from '../utils/audio';
import {
  X,
  Plus,
  Copy,
  Trash2,
  ChevronUp,
  ChevronDown,
  Upload,
  Download,
  RotateCcw,
  ListOrdered,
} from 'lucide-react';

interface LevelListPanelProps {
  isOpen: boolean;
  onClose: () => void;
  levels: CleanLevelData[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onImportLevels: (levels: CleanLevelData[], mode: 'append' | 'replace') => void;
  onResetToPack: () => void;
}

export const LevelListPanel: React.FC<LevelListPanelProps> = ({
  isOpen,
  onClose,
  levels,
  activeIndex,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
  onImportLevels,
  onResetToPack,
}) => {
  const [filter, setFilter] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');

  if (!isOpen) return null;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const list = parseLevelListJson(String(ev.target?.result || ''));
        if (list.length === 0) throw new Error('No levels found in file.');
        if (
          importMode === 'replace' &&
          !window.confirm(`Replace all ${levels.length} levels in the list with ${list.length} levels from "${file.name}"?`)
        ) {
          return;
        }
        onImportLevels(list, importMode);
        sounds.playBoxComplete();
      } catch (err: unknown) {
        sounds.playBlocked();
        alert(`Could not import levels: ${err instanceof Error ? err.message : 'Invalid format'}`);
      }
    };
    reader.readAsText(file);
  };

  const handleExportAll = () => {
    sounds.playPop();
    const blob = new Blob([JSON.stringify(levels, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wool_gather_levels_${levels.length}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const q = filter.trim().toLowerCase();
  const rows = levels
    .map((lvl, idx) => ({ lvl, idx }))
    .filter(({ lvl, idx }) => !q || String(lvl.levelId).includes(q) || String(idx + 1) === q || lvl.levelType.toLowerCase().includes(q));

  const btn =
    'flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition';

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <aside
        className="w-[340px] max-w-[90vw] h-full bg-slate-950 border-r border-slate-800 shadow-2xl flex flex-col text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold">Level List</h2>
            <span className="text-[11px] text-slate-500">{levels.length} levels</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 border-b border-slate-800 space-y-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by level ID or type..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-600"
          />
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onAdd} className={`${btn} bg-cyan-700 hover:bg-cyan-600 border-cyan-600 text-white`}>
              <Plus className="w-3.5 h-3.5" /> New Level
            </button>
            <button
              onClick={() => onDuplicate(activeIndex)}
              className={`${btn} bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-200`}
            >
              <Copy className="w-3.5 h-3.5" /> Duplicate Current
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`${btn} bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-200`}
              title="Import a .json file with one level or an array of levels"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400" /> Import File
            </button>
            <button
              onClick={handleExportAll}
              className={`${btn} bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-200`}
              title="Download every level in the list as one JSON array"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" /> Export All
            </button>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <label className="flex items-center gap-1.5">
              Import mode:
              <select
                value={importMode}
                onChange={(e) => setImportMode(e.target.value as 'append' | 'replace')}
                className="bg-slate-900 border border-slate-800 rounded px-1 py-0.5 text-[11px]"
              >
                <option value="append">Add to end</option>
                <option value="replace">Replace list</option>
              </select>
            </label>
            <button
              onClick={() => {
                if (window.confirm('Reset the list to the built-in 40 levels? Your edits in this browser will be lost.')) {
                  onResetToPack();
                }
              }}
              className="flex items-center gap-1 text-slate-500 hover:text-rose-300"
              title="Restore the built-in level pack"
            >
              <RotateCcw className="w-3 h-3" /> Reset to pack
            </button>
          </div>
          <input type="file" ref={fileInputRef} onChange={handleFile} accept=".json,.txt,application/json,text/plain" className="hidden" />
        </div>

        <ul className="flex-1 overflow-y-auto p-2 space-y-1">
          {rows.map(({ lvl, idx }) => {
            const active = idx === activeIndex;
            const tunnels = lvl.tunnels?.length || 0;
            const conveyors = lvl.conveyors?.length || 0;
            return (
              <li
                key={idx}
                onClick={() => onSelect(idx)}
                className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer border transition ${
                  active ? 'bg-cyan-950/60 border-cyan-700' : 'bg-slate-900/60 border-transparent hover:border-slate-700'
                }`}
              >
                <span className="w-6 text-[10px] text-slate-500 font-mono text-right">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-bold font-mono ${active ? 'text-amber-300' : 'text-slate-100'}`}>
                      Level {lvl.levelId}
                    </span>
                    {lvl.levelType === 'Hard' && (
                      <span className="px-1 rounded bg-rose-700/70 text-[9px] font-bold text-white">HARD</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">
                    {lvl.boxes.length} boxes
                    {tunnels > 0 && ` · ${tunnels} tunnel${tunnels > 1 ? 's' : ''}`}
                    {conveyors > 0 && ` · ${conveyors} conveyor${conveyors > 1 ? 's' : ''}`}
                    {lvl.dragon.trackId !== undefined && ` · track #${lvl.dragon.trackId}`}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={(e) => { e.stopPropagation(); onMove(idx, -1); }}
                    disabled={idx === 0}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30"
                    title="Move up"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onMove(idx, 1); }}
                    disabled={idx === levels.length - 1}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30"
                    title="Move down"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDuplicate(idx); }}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                    title="Duplicate"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (levels.length > 1 && window.confirm(`Delete Level ${lvl.levelId}?`)) onDelete(idx);
                    }}
                    disabled={levels.length <= 1}
                    className="p-1 rounded text-slate-400 hover:text-rose-300 hover:bg-slate-800 disabled:opacity-30"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
          {rows.length === 0 && <li className="text-center text-xs text-slate-500 py-6">No levels match.</li>}
        </ul>
        <div className="px-4 py-2 border-t border-slate-800 text-[10px] text-slate-500">
          Edits save automatically in this browser. Use Export All to keep a file copy.
        </div>
      </aside>
      <div className="flex-1 bg-slate-950/50 backdrop-blur-[1px]" />
    </div>
  );
};
