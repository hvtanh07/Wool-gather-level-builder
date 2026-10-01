import React from 'react';
import { BoxItem, BoxNumType } from '../types/level';
import { WOOL_COLORS, BOX_DIMENSIONS, getWoolColor, getBoxNumType } from '../utils/colors';
import { checkExitPath } from '../utils/collision';
import { sounds } from '../utils/audio';
import {
  MousePointer,
  PlusSquare,
  RotateCw,
  Trash2,
  Copy,
  Layers,
  Compass,
  ArrowUp,
  ArrowRight,
  ArrowDown,
  ArrowLeft,
  Eye,
  Grid,
  AlignLeft,
  AlignRight,
  ArrowUpToLine,
  ArrowDownToLine,
} from 'lucide-react';

interface SidebarProps {
  boxes: BoxItem[];
  selectedBoxIds: number[];
  onSelectBoxes: (ids: number[]) => void;
  onUpdateBoxes: (boxes: BoxItem[]) => void;
  activeColor: number;
  setActiveColor: (col: number) => void;
  activeNumType: BoxNumType;
  setActiveNumType: (nt: BoxNumType) => void;
  gridSnap: number;
  setGridSnap: (snap: number) => void;
  showRays: boolean;
  setShowRays: (show: boolean) => void;
  onAddBox: (numType: BoxNumType, color: number) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  boxes,
  selectedBoxIds,
  onSelectBoxes,
  onUpdateBoxes,
  activeColor,
  setActiveColor,
  activeNumType,
  setActiveNumType,
  gridSnap,
  setGridSnap,
  showRays,
  setShowRays,
  onAddBox,
}) => {
  const selectedBoxes = boxes.filter((b) => selectedBoxIds.includes(b.id));
  const singleSelected = selectedBoxes.length === 1 ? selectedBoxes[0] : null;

  // Single box exit status
  const singleExitStatus = singleSelected ? checkExitPath(singleSelected, boxes) : null;

  // Set angle for all selected boxes
  const setAngle = (angle: number) => {
    sounds.playPop();
    const updated = boxes.map((b) => (selectedBoxIds.includes(b.id) ? { ...b, angle } : b));
    onUpdateBoxes(updated);
  };

  // Set color for selected boxes
  const setBoxColor = (color: number) => {
    sounds.playPop();
    setActiveColor(color);
    if (selectedBoxIds.length > 0) {
      const updated = boxes.map((b) => (selectedBoxIds.includes(b.id) ? { ...b, color } : b));
      onUpdateBoxes(updated);
    }
  };

  // Set capacity for selected boxes
  const setBoxCapacity = (numType: BoxNumType) => {
    sounds.playPop();
    setActiveNumType(numType);
    const capacity = BOX_DIMENSIONS[numType].capacity;
    if (selectedBoxIds.length > 0) {
      const updated = boxes.map((b) =>
        selectedBoxIds.includes(b.id) ? { ...b, numType, capacity } : b
      );
      onUpdateBoxes(updated);
    }
  };

  // Delete selected boxes
  const handleDelete = () => {
    sounds.playPop();
    const remaining = boxes.filter((b) => !selectedBoxIds.includes(b.id));
    onUpdateBoxes(remaining);
    onSelectBoxes([]);
  };

  // Duplicate selected boxes
  const handleDuplicate = () => {
    sounds.playPop();
    const maxId = boxes.reduce((max, b) => Math.max(max, b.id), 0);
    let nextId = maxId + 1;
    const newBoxes: BoxItem[] = [];

    boxes.forEach((b) => {
      if (selectedBoxIds.includes(b.id)) {
        newBoxes.push({
          ...b,
          id: nextId++,
          x: Number((b.x + 0.4).toFixed(3)),
          z: Number((b.z + 0.4).toFixed(3)),
        });
      }
    });

    onUpdateBoxes([...boxes, ...newBoxes]);
    onSelectBoxes(newBoxes.map((b) => b.id));
  };

  // Alignment utilities
  const handleAlign = (type: 'left' | 'right' | 'top' | 'bottom') => {
    if (selectedBoxes.length < 2) return;
    sounds.playPop();

    let targetVal = 0;
    if (type === 'left') targetVal = Math.min(...selectedBoxes.map((b) => b.x));
    if (type === 'right') targetVal = Math.max(...selectedBoxes.map((b) => b.x));
    if (type === 'top') targetVal = Math.max(...selectedBoxes.map((b) => b.z));
    if (type === 'bottom') targetVal = Math.min(...selectedBoxes.map((b) => b.z));

    const updated = boxes.map((b) => {
      if (!selectedBoxIds.includes(b.id)) return b;
      if (type === 'left' || type === 'right') return { ...b, x: targetVal };
      return { ...b, z: targetVal };
    });

    onUpdateBoxes(updated);
  };

  return (
    <div className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col h-full text-slate-200 select-none overflow-y-auto scrollbar-thin">
      {/* 1. Quick Add Box Section */}
      <div className="p-3 border-b border-slate-800/80 space-y-2">
        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
          Add New Box
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(['Box4', 'Box6', 'Box10'] as BoxNumType[]).map((nt) => {
            const cap = BOX_DIMENSIONS[nt].capacity;
            const col = getWoolColor(activeColor);
            return (
              <button
                key={nt}
                onClick={() => onAddBox(nt, activeColor)}
                className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-800/70 hover:bg-slate-750 border border-slate-700/60 hover:border-cyan-500/50 transition group active:scale-95"
                title={`Add ${nt} (${cap} wool units)`}
              >
                <div
                  className="w-7 rounded shadow-inner mb-1 flex items-center justify-center text-[10px] font-bold text-white"
                  style={{
                    backgroundColor: col.hex,
                    height: nt === 'Box4' ? 22 : nt === 'Box6' ? 28 : 34,
                  }}
                >
                  {cap}
                </div>
                <span className="text-[11px] font-medium text-slate-300 group-hover:text-cyan-400">
                  {nt}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Color Palette */}
      <div className="p-3 border-b border-slate-800/80 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Wool Color
          </label>
          <span className="text-xs text-cyan-400 font-medium">
            {getWoolColor(activeColor).name}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {Object.values(WOOL_COLORS).map((c) => (
            <button
              key={c.id}
              onClick={() => setBoxColor(c.id)}
              className={`h-8 rounded-lg relative flex items-center justify-center transition-all ${
                activeColor === c.id
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-105 shadow-md'
                  : 'hover:scale-105 opacity-90 hover:opacity-100'
              }`}
              style={{ backgroundColor: c.hex }}
              title={`${c.id}: ${c.name}`}
            >
              <span className="text-[10px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                {c.id}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 3. Exit Direction (Angle) */}
      <div className="p-3 border-b border-slate-800/80 space-y-2">
        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
          Arrow Direction
        </label>
        <div className="grid grid-cols-4 gap-1.5">
          <button
            onClick={() => setAngle(0)}
            className="flex flex-col items-center p-2 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-xs text-slate-300 hover:text-white transition"
            title="Up (0°)"
          >
            <ArrowUp className="w-4 h-4 mb-0.5" />
            <span className="text-[10px]">Up</span>
          </button>
          <button
            onClick={() => setAngle(90)}
            className="flex flex-col items-center p-2 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-xs text-slate-300 hover:text-white transition"
            title="Right (90°)"
          >
            <ArrowRight className="w-4 h-4 mb-0.5" />
            <span className="text-[10px]">Right</span>
          </button>
          <button
            onClick={() => setAngle(180)}
            className="flex flex-col items-center p-2 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-xs text-slate-300 hover:text-white transition"
            title="Down (180°)"
          >
            <ArrowDown className="w-4 h-4 mb-0.5" />
            <span className="text-[10px]">Down</span>
          </button>
          <button
            onClick={() => setAngle(270)}
            className="flex flex-col items-center p-2 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-xs text-slate-300 hover:text-white transition"
            title="Left (270°)"
          >
            <ArrowLeft className="w-4 h-4 mb-0.5" />
            <span className="text-[10px]">Left</span>
          </button>
        </div>
      </div>

      {/* 4. Selected Box Inspector */}
      {singleSelected ? (
        <div className="p-3 border-b border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-400">
              Box #{singleSelected.id}
            </span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                singleExitStatus?.isBlocked
                  ? 'bg-rose-950/70 border-rose-500/50 text-rose-400'
                  : 'bg-emerald-950/70 border-emerald-500/50 text-emerald-400'
              }`}
            >
              {singleExitStatus?.isBlocked
                ? `Blocked by #${singleExitStatus.blockingBoxId}`
                : 'Clear Path'}
            </span>
          </div>

          {/* Position Inputs */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-slate-400 text-[10px] block mb-0.5">X Position</label>
              <input
                type="number"
                step="0.05"
                value={singleSelected.x}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  onUpdateBoxes(
                    boxes.map((b) => (b.id === singleSelected.id ? { ...b, x: val } : b))
                  );
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-white text-xs"
              />
            </div>
            <div>
              <label className="text-slate-400 text-[10px] block mb-0.5">Z Position</label>
              <input
                type="number"
                step="0.05"
                value={singleSelected.z}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  onUpdateBoxes(
                    boxes.map((b) => (b.id === singleSelected.id ? { ...b, z: val } : b))
                  );
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-white text-xs"
              />
            </div>
          </div>

          {/* Capacity Switcher */}
          <div>
            <label className="text-slate-400 text-[10px] block mb-1">Capacity</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['Box4', 'Box6', 'Box10'] as BoxNumType[]).map((nt) => (
                <button
                  key={nt}
                  onClick={() => setBoxCapacity(nt)}
                  className={`py-1 rounded text-xs font-semibold border transition ${
                    singleSelected.numType === nt
                      ? 'bg-cyan-600 text-white border-cyan-400'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                  }`}
                >
                  {nt} ({BOX_DIMENSIONS[nt].capacity})
                </button>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleDuplicate}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-medium text-slate-300 hover:text-white border border-slate-700 transition"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Duplicate</span>
            </button>
            <button
              onClick={handleDelete}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-rose-950/60 hover:bg-rose-900 rounded-lg text-xs font-medium text-rose-400 hover:text-white border border-rose-800/60 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      ) : selectedBoxes.length > 1 ? (
        /* Multi-selection tools */
        <div className="p-3 border-b border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-400">
              {selectedBoxes.length} Boxes Selected
            </span>
          </div>

          {/* Alignment */}
          <div>
            <label className="text-slate-400 text-[10px] block mb-1">Align Boxes</label>
            <div className="grid grid-cols-4 gap-1">
              <button
                onClick={() => handleAlign('left')}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 flex justify-center text-slate-300 hover:text-white"
                title="Align Left"
              >
                <AlignLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleAlign('right')}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 flex justify-center text-slate-300 hover:text-white"
                title="Align Right"
              >
                <AlignRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleAlign('top')}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 flex justify-center text-slate-300 hover:text-white"
                title="Align Top"
              >
                <ArrowUpToLine className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleAlign('bottom')}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 flex justify-center text-slate-300 hover:text-white"
                title="Align Bottom"
              >
                <ArrowDownToLine className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleDuplicate}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-medium text-slate-300 hover:text-white border border-slate-700 transition"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Duplicate</span>
            </button>
            <button
              onClick={handleDelete}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-rose-950/60 hover:bg-rose-900 rounded-lg text-xs font-medium text-rose-400 hover:text-white border border-rose-800/60 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3 border-b border-slate-800/80 text-xs text-slate-500 italic">
          Click any box on canvas to inspect, drag to reposition, or drag on empty space to multi-select.
        </div>
      )}

      {/* 5. View & Grid Settings */}
      <div className="p-3 space-y-3 mt-auto">
        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
          Canvas Settings
        </label>

        {/* Snap to grid */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Grid className="w-3.5 h-3.5 text-slate-400" />
            <span>Grid Snap</span>
          </div>
          <select
            value={gridSnap}
            onChange={(e) => setGridSnap(parseFloat(e.target.value))}
            className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-slate-300 text-xs font-mono"
          >
            <option value={0}>Free (Off)</option>
            <option value={0.1}>0.1 units</option>
            <option value={0.25}>0.25 units</option>
            <option value={0.5}>0.5 units</option>
            <option value={1.0}>1.0 unit</option>
          </select>
        </div>

        {/* Show exit rays */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Eye className="w-3.5 h-3.5 text-slate-400" />
            <span>Show Exit Rays</span>
          </div>
          <button
            onClick={() => setShowRays(!showRays)}
            className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
              showRays ? 'bg-cyan-600' : 'bg-slate-800'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                showRays ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
};
