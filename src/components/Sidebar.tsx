import React, { useState } from 'react';
import { BoxItem, BoxNumType, BoxType, TunnelSetup, ConveyorSetup, isBoxFrozen } from '../types/level';
import { WOOL_COLORS, BOX_DIMENSIONS, getWoolColor } from '../utils/colors';
import { checkExitPath } from '../utils/collision';
import { sounds } from '../utils/audio';
import {
  MousePointer,
  RotateCw,
  Trash2,
  Copy,
  Layers,
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
  Snowflake,
  Box,
  Plus,
  ChevronUp,
  ChevronDown,
  Settings,
  Dices,
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
  activeBoxType?: BoxType;
  setActiveBoxType?: (bt: BoxType) => void;
  gridSnap: number;
  setGridSnap: (snap: number) => void;
  showRays: boolean;
  setShowRays: (show: boolean) => void;
  onAddBox: (numType: BoxNumType, color: number, boxType?: BoxType) => void;
  onClearBoard?: () => void;
  onRandomizeLayout?: () => void;
  // Tunnel props
  tunnels?: TunnelSetup[];
  onUpdateTunnels?: (tunnels: TunnelSetup[]) => void;
  selectedTunnelId?: number | null;
  onSelectTunnel?: (id: number | null) => void;
  // Conveyor props
  conveyors?: ConveyorSetup[];
  onUpdateConveyors?: (conveyors: ConveyorSetup[]) => void;
  selectedConveyorId?: number | null;
  onSelectConveyor?: (id: number | null) => void;
}

// Helper to evenly spread boxes along the full conveyor belt length
function evenlySpreadConveyorBoxes(boxes: BoxItem[], startX: number, endX: number): BoxItem[] {
  const n = boxes.length;
  if (n === 0) return [];
  const minX = Math.min(startX, endX);
  const maxX = Math.max(startX, endX);
  const totalLength = maxX - minX;
  if (n === 1) {
    return [{ ...boxes[0], x: Number(((minX + maxX) / 2).toFixed(3)) }];
  }
  const step = totalLength / n;
  return boxes.map((box, i) => ({
    ...box,
    x: Number((minX + (i + 0.5) * step).toFixed(3)),
  }));
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
  activeBoxType = 'Normal',
  setActiveBoxType,
  gridSnap,
  setGridSnap,
  showRays,
  setShowRays,
  onAddBox,
  onClearBoard,
  onRandomizeLayout,
  tunnels = [],
  onUpdateTunnels,
  selectedTunnelId,
  onSelectTunnel,
  conveyors = [],
  onUpdateConveyors,
  selectedConveyorId,
  onSelectConveyor,
}) => {
  const [localActiveBoxType, setLocalActiveBoxType] = useState<BoxType>('Normal');
  const currentBoxType = setActiveBoxType ? activeBoxType : localActiveBoxType;
  const updateActiveBoxType = setActiveBoxType || setLocalActiveBoxType;

  // Queue adder states for Tunnel and Conveyor
  const [tunnelAddNumType, setTunnelAddNumType] = useState<BoxNumType>('Box6');
  const [tunnelAddColor, setTunnelAddColor] = useState<number>(2);

  const [conveyorAddNumType, setConveyorAddNumType] = useState<BoxNumType>('Box6');
  const [conveyorAddColor, setConveyorAddColor] = useState<number>(3);

  const selectedBoxes = boxes.filter((b) => selectedBoxIds.includes(b.id));
  const singleSelected = selectedBoxes.length === 1 ? selectedBoxes[0] : null;

  // Selected Tunnel & Conveyor
  const selectedTunnel = tunnels.find((t) => t.id === selectedTunnelId) || null;
  const selectedConveyor = conveyors.find((c) => c.id === selectedConveyorId) || null;

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

  // Set boxType (Normal vs Ice) for selected boxes
  const setBoxType = (boxType: BoxType) => {
    sounds.playPop();
    if (selectedBoxIds.length > 0) {
      const updated = boxes.map((b) =>
        selectedBoxIds.includes(b.id) ? { ...b, boxType } : b
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
          x: Number((b.x + 0.5).toFixed(3)),
          z: Number((b.z - 0.5).toFixed(3)),
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

  // Add new Tunnel
  const handleAddTunnel = () => {
    if (!onUpdateTunnels) return;
    sounds.playPop();
    const maxId = tunnels.reduce((max, t) => Math.max(max, t.id), 0);
    const newTunnel: TunnelSetup = {
      id: maxId + 1,
      x: 0,
      z: -3.0,
      angle: 180,
      queue: [
        {
          id: 1000 + (maxId + 1) * 10 + 1,
          x: 0,
          z: -3.0,
          angle: 0,
          numType: 'Box6',
          capacity: 6,
          color: 2,
          boxType: 'Normal',
        },
        {
          id: 1000 + (maxId + 1) * 10 + 2,
          x: 0,
          z: -3.0,
          angle: 0,
          numType: 'Box4',
          capacity: 4,
          color: 4,
          boxType: 'Normal',
        },
        {
          id: 1000 + (maxId + 1) * 10 + 3,
          x: 0,
          z: -3.0,
          angle: 0,
          numType: 'Box10',
          capacity: 10,
          color: 6,
          boxType: 'Normal',
        },
      ],
    };
    onUpdateTunnels([...tunnels, newTunnel]);
    if (onSelectTunnel) onSelectTunnel(newTunnel.id);
    onSelectBoxes([]);
    if (onSelectConveyor) onSelectConveyor(null);
  };

  // Add new Conveyor
  const handleAddConveyor = () => {
    if (!onUpdateConveyors) return;
    sounds.playPop();
    const maxId = conveyors.reduce((max, c) => Math.max(max, c.id), 0);
    const newConveyor: ConveyorSetup = {
      id: maxId + 1,
      z: -1.2,
      startX: -4.5,
      endX: 4.5,
      activeZoneMinX: -2.6,
      activeZoneMaxX: 2.6,
      direction: 'left-to-right',
      speed: 0.6,
      boxes: [
        {
          id: 2000 + (maxId + 1) * 10 + 1,
          x: -2.0,
          z: -1.2,
          angle: 0,
          numType: 'Box6',
          capacity: 6,
          color: 5,
          boxType: 'Normal',
        },
        {
          id: 2000 + (maxId + 1) * 10 + 2,
          x: 0.0,
          z: -1.2,
          angle: 0,
          numType: 'Box4',
          capacity: 4,
          color: 1,
          boxType: 'Normal',
        },
        {
          id: 2000 + (maxId + 1) * 10 + 3,
          x: 2.0,
          z: -1.2,
          angle: 0,
          numType: 'Box6',
          capacity: 6,
          color: 7,
          boxType: 'Normal',
        },
      ],
    };
    onUpdateConveyors([...conveyors, newConveyor]);
    if (onSelectConveyor) onSelectConveyor(newConveyor.id);
    onSelectBoxes([]);
    if (onSelectTunnel) onSelectTunnel(null);
  };

  return (
    <div className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col h-full text-slate-200 select-none overflow-y-auto scrollbar-thin">
      {/* 1. Quick Add Box Section */}
      <div className="p-3 border-b border-slate-800/80 space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Add New Box
          </label>
          {/* Box Type Toggle (Normal vs Ice) */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-[10px]">
            <button
              onClick={() => updateActiveBoxType('Normal')}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-medium transition ${
                currentBoxType === 'Normal' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Box className="w-3 h-3" />
              <span>Normal</span>
            </button>
            <button
              onClick={() => updateActiveBoxType('Ice')}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-medium transition ${
                currentBoxType === 'Ice'
                  ? 'bg-sky-500 text-white shadow'
                  : 'text-slate-400 hover:text-sky-300'
              }`}
            >
              <Snowflake className="w-3 h-3 text-sky-300" />
              <span>Frozen</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(['Box4', 'Box6', 'Box10'] as BoxNumType[]).map((nt) => {
            const cap = BOX_DIMENSIONS[nt].capacity;
            const col = getWoolColor(activeColor);
            return (
              <button
                key={nt}
                onClick={() => onAddBox(nt, activeColor, currentBoxType)}
                className={`flex flex-col items-center justify-center p-2 rounded-xl bg-slate-800/70 hover:bg-slate-750 border transition group active:scale-95 ${
                  currentBoxType === 'Ice'
                    ? 'border-sky-500/50 hover:border-sky-400'
                    : 'border-slate-700/60 hover:border-cyan-500/50'
                }`}
                title={`Add ${nt} (${cap} wool units) as ${currentBoxType}`}
              >
                <div
                  className="w-7 rounded shadow-inner mb-1 flex items-center justify-center text-[10px] font-bold text-white relative"
                  style={{
                    backgroundColor: col.hex,
                    height: nt === 'Box4' ? 22 : nt === 'Box6' ? 28 : 34,
                  }}
                >
                  {cap}
                  {currentBoxType === 'Ice' && (
                    <Snowflake className="w-3.5 h-3.5 text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.9)] absolute" />
                  )}
                </div>
                <span className="text-[11px] font-medium text-slate-300 group-hover:text-cyan-400">
                  {nt}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Wool Color Palette */}
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

      {/* 4. Gimmicks & Portal Elements (Tunnel & Conveyor) */}
      <div className="p-3 border-b border-slate-800/80 space-y-2">
        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
          Elements & Gimmicks
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleAddTunnel}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-amber-300 hover:text-white border border-amber-500/40 hover:border-amber-400 text-xs font-semibold shadow transition active:scale-95"
            title="Add a Tunnel (Warehouse dispenser) with internal queue"
          >
            <span className="text-sm">🚇</span>
            <span>+ Tunnel</span>
          </button>

          <button
            onClick={handleAddConveyor}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-cyan-300 hover:text-white border border-cyan-500/40 hover:border-cyan-400 text-xs font-semibold shadow transition active:scale-95"
            title="Add a Conveyor Belt with looping circulating buses"
          >
            <span className="text-sm">🔄</span>
            <span>+ Conveyor</span>
          </button>
        </div>
      </div>

      {/* 5. Inspectors (Box / Tunnel / Conveyor) */}
      {selectedTunnel ? (
        /* Tunnel Inspector */
        <div className="p-3 border-b border-slate-800/80 space-y-3 bg-slate-950/40 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
              <span>🚇 Tunnel #{selectedTunnel.id}</span>
            </span>
            <span className="text-[10px] bg-amber-950/70 border border-amber-500/40 text-amber-300 font-mono px-2 py-0.5 rounded-full">
              {selectedTunnel.queue.length} stored buses
            </span>
          </div>

          {/* Position & Angle */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-slate-400 text-[10px] block mb-0.5">X Position</label>
              <input
                type="number"
                step="0.1"
                value={selectedTunnel.x}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  onUpdateTunnels?.(
                    tunnels.map((t) => (t.id === selectedTunnel.id ? { ...t, x: val } : t))
                  );
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-white text-xs"
              />
            </div>
            <div>
              <label className="text-slate-400 text-[10px] block mb-0.5">Z Position</label>
              <input
                type="number"
                step="0.1"
                value={selectedTunnel.z}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  onUpdateTunnels?.(
                    tunnels.map((t) => (t.id === selectedTunnel.id ? { ...t, z: val } : t))
                  );
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-white text-xs"
              />
            </div>
          </div>

          {/* Tunnel Orientation & Opposite Exit Direction */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-400 text-[10px] block">Tunnel Orientation</label>
              <span className="text-[10px] text-amber-400 font-mono">
                Box Exit: {((selectedTunnel.angle || 0) + 180) % 360}° ({
                  ((selectedTunnel.angle || 0) + 180) % 360 === 0 ? '⬆ Up' :
                  ((selectedTunnel.angle || 0) + 180) % 360 === 90 ? '➡ Right' :
                  ((selectedTunnel.angle || 0) + 180) % 360 === 180 ? '⬇ Down' : '⬅ Left'
                })
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1 text-xs">
              {[
                { deg: 0, label: '0° ⬆' },
                { deg: 90, label: '90° ➡' },
                { deg: 180, label: '180° ⬇' },
                { deg: 270, label: '270° ⬅' },
              ].map(({ deg, label }) => (
                <button
                  key={deg}
                  onClick={() => {
                    sounds.playPop();
                    onUpdateTunnels?.(
                      tunnels.map((t) => (t.id === selectedTunnel.id ? { ...t, angle: deg } : t))
                    );
                  }}
                  className={`py-1 rounded text-[10px] font-mono border transition ${
                    selectedTunnel.angle === deg
                      ? 'bg-amber-600 text-white border-amber-400 font-bold'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                  }`}
                  title={`Tunnel ${deg}°, Ready Box exits ${((deg + 180) % 360)}°`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[9.5px] text-slate-400 mt-1 leading-tight">
              Tunnel shows 2 objects: the tunnel & the ready box in front. The box direction is always opposite to the tunnel ({((selectedTunnel.angle || 0) + 180) % 360}°).
            </p>
          </div>

          {/* Stored Buses Queue */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
              <span>Internal Bus Queue ({selectedTunnel.queue.length})</span>
            </div>

            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
              {selectedTunnel.queue.map((b, idx) => {
                const col = getWoolColor(b.color);
                return (
                  <div
                    key={b.id || idx}
                    className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-400">
                        {idx === 0 ? 'READY' : `#${idx + 1}`}
                      </span>
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/20"
                        style={{ backgroundColor: col.hex }}
                      />
                      <span className="font-semibold text-slate-200">
                        {b.numType} ({b.capacity})
                      </span>
                    </div>

                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => {
                          if (idx === 0) return;
                          sounds.playPop();
                          const q = [...selectedTunnel.queue];
                          const tmp = q[idx];
                          q[idx] = q[idx - 1];
                          q[idx - 1] = tmp;
                          onUpdateTunnels?.(
                            tunnels.map((t) => (t.id === selectedTunnel.id ? { ...t, queue: q } : t))
                          );
                        }}
                        disabled={idx === 0}
                        className="p-1 text-slate-400 hover:text-white disabled:opacity-20"
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => {
                          if (idx === selectedTunnel.queue.length - 1) return;
                          sounds.playPop();
                          const q = [...selectedTunnel.queue];
                          const tmp = q[idx];
                          q[idx] = q[idx + 1];
                          q[idx + 1] = tmp;
                          onUpdateTunnels?.(
                            tunnels.map((t) => (t.id === selectedTunnel.id ? { ...t, queue: q } : t))
                          );
                        }}
                        disabled={idx === selectedTunnel.queue.length - 1}
                        className="p-1 text-slate-400 hover:text-white disabled:opacity-20"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => {
                          sounds.playPop();
                          const q = selectedTunnel.queue.filter((_, i) => i !== idx);
                          onUpdateTunnels?.(
                            tunnels.map((t) => (t.id === selectedTunnel.id ? { ...t, queue: q } : t))
                          );
                        }}
                        className="p-1 text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add Bus to Queue Tool */}
            <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg space-y-1.5">
              <span className="text-[10px] text-slate-400 block font-semibold">
                + Add Bus to Tunnel Queue
              </span>
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  {(['Box4', 'Box6', 'Box10'] as BoxNumType[]).map((nt) => (
                    <button
                      key={nt}
                      onClick={() => setTunnelAddNumType(nt)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                        tunnelAddNumType === nt
                          ? 'bg-amber-600 text-white border-amber-400'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {nt}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    sounds.playPop();
                    const newId = Date.now();
                    const cap = BOX_DIMENSIONS[tunnelAddNumType].capacity;
                    const newBus: BoxItem = {
                      id: newId,
                      x: selectedTunnel.x,
                      z: selectedTunnel.z,
                      angle: selectedTunnel.angle,
                      numType: tunnelAddNumType,
                      capacity: cap,
                      color: tunnelAddColor,
                      boxType: 'Normal',
                    };
                    onUpdateTunnels?.(
                      tunnels.map((t) =>
                        t.id === selectedTunnel.id ? { ...t, queue: [...t.queue, newBus] } : t
                      )
                    );
                  }}
                  className="px-2 py-0.5 bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold rounded shadow transition"
                >
                  Add
                </button>
              </div>

              {/* Color swatch row */}
              <div className="flex items-center gap-1 pt-0.5">
                {Object.values(WOOL_COLORS).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setTunnelAddColor(c.id)}
                    className={`w-4 h-4 rounded-full transition-transform ${
                      tunnelAddColor === c.id ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Delete Tunnel */}
          <button
            onClick={() => {
              sounds.playPop();
              onUpdateTunnels?.(tunnels.filter((t) => t.id !== selectedTunnel.id));
              onSelectTunnel?.(null);
            }}
            className="w-full py-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800/60 text-rose-400 hover:text-white rounded-lg text-xs font-medium transition flex items-center justify-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Tunnel</span>
          </button>
        </div>
      ) : selectedConveyor ? (
        /* Conveyor Inspector */
        <div className="p-3 border-b border-slate-800/80 space-y-3 bg-slate-950/40 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-400 flex items-center gap-1">
              <span>🔄 Conveyor #{selectedConveyor.id}</span>
            </span>
            <span className="text-[10px] bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 font-mono px-2 py-0.5 rounded-full">
              {selectedConveyor.boxes.length} buses on belt
            </span>
          </div>

          {/* Z Position & Speed */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-slate-400 text-[10px] block mb-0.5">Z Track Position</label>
              <input
                type="number"
                step="0.1"
                value={selectedConveyor.z}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  onUpdateConveyors?.(
                    conveyors.map((c) => (c.id === selectedConveyor.id ? { ...c, z: val } : c))
                  );
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-white text-xs"
              />
            </div>
            <div>
              <label className="text-slate-400 text-[10px] block mb-0.5">Speed</label>
              <input
                type="number"
                step="0.1"
                min="0.2"
                max="2.0"
                value={selectedConveyor.speed}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0.6;
                  onUpdateConveyors?.(
                    conveyors.map((c) => (c.id === selectedConveyor.id ? { ...c, speed: val } : c))
                  );
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-white text-xs"
              />
            </div>
          </div>

          {/* Direction */}
          <div>
            <label className="text-slate-400 text-[10px] block mb-1">Belt Movement Direction</label>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <button
                onClick={() => {
                  sounds.playPop();
                  onUpdateConveyors?.(
                    conveyors.map((c) =>
                      c.id === selectedConveyor.id ? { ...c, direction: 'left-to-right' } : c
                    )
                  );
                }}
                className={`py-1 rounded text-xs font-semibold border transition ${
                  selectedConveyor.direction === 'left-to-right'
                    ? 'bg-cyan-600 text-white border-cyan-400'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                }`}
              >
                Left → Right
              </button>
              <button
                onClick={() => {
                  sounds.playPop();
                  onUpdateConveyors?.(
                    conveyors.map((c) =>
                      c.id === selectedConveyor.id ? { ...c, direction: 'right-to-left' } : c
                    )
                  );
                }}
                className={`py-1 rounded text-xs font-semibold border transition ${
                  selectedConveyor.direction === 'right-to-left'
                    ? 'bg-cyan-600 text-white border-cyan-400'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                }`}
              >
                Right → Left
              </button>
            </div>
          </div>

          {/* Active Preset Zone */}
          <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg space-y-1.5">
            <label className="text-slate-400 text-[10px] block font-semibold">
              Interactive Preset Zone (Min X to Max X)
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-slate-400">Min X:</span>
                <input
                  type="number"
                  step="0.1"
                  value={selectedConveyor.activeZoneMinX}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || -2.6;
                    onUpdateConveyors?.(
                      conveyors.map((c) =>
                        c.id === selectedConveyor.id ? { ...c, activeZoneMinX: val } : c
                      )
                    );
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-0.5 font-mono text-white text-xs"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-400">Max X:</span>
                <input
                  type="number"
                  step="0.1"
                  value={selectedConveyor.activeZoneMaxX}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 2.6;
                    onUpdateConveyors?.(
                      conveyors.map((c) =>
                        c.id === selectedConveyor.id ? { ...c, activeZoneMaxX: val } : c
                      )
                    );
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-0.5 font-mono text-white text-xs"
                />
              </div>
            </div>
          </div>

          {/* Buses on Conveyor */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] font-semibold text-slate-300 block">
              Buses on Belt ({selectedConveyor.boxes.length})
            </span>

            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
              {selectedConveyor.boxes.map((b, idx) => {
                const col = getWoolColor(b.color);
                return (
                  <div
                    key={b.id || idx}
                    className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-400">#{idx + 1}</span>
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/20"
                        style={{ backgroundColor: col.hex }}
                      />
                      <span className="font-semibold text-slate-200">
                        {b.numType} ({b.capacity})
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        sounds.playPop();
                        const remaining = selectedConveyor.boxes.filter((_, i) => i !== idx);
                        const updated = evenlySpreadConveyorBoxes(
                          remaining,
                          selectedConveyor.startX,
                          selectedConveyor.endX
                        );
                        onUpdateConveyors?.(
                          conveyors.map((c) =>
                            c.id === selectedConveyor.id ? { ...c, boxes: updated } : c
                          )
                        );
                      }}
                      className="p-1 text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Evenly Spread Buses Button */}
            {selectedConveyor.boxes.length > 1 && (
              <button
                onClick={() => {
                  sounds.playPop();
                  const updated = evenlySpreadConveyorBoxes(
                    selectedConveyor.boxes,
                    selectedConveyor.startX,
                    selectedConveyor.endX
                  );
                  onUpdateConveyors?.(
                    conveyors.map((c) =>
                      c.id === selectedConveyor.id ? { ...c, boxes: updated } : c
                    )
                  );
                }}
                className="w-full py-1 bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/30 text-cyan-300 hover:text-white rounded text-[10px] font-semibold transition flex items-center justify-center gap-1 active:scale-95"
                title="Distribute all buses evenly along the conveyor belt"
              >
                <span>⚡ Evenly Spread Buses</span>
              </button>
            )}

            {/* Add Bus to Belt Tool */}
            <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg space-y-1.5">
              <span className="text-[10px] text-slate-400 block font-semibold">
                + Add Bus to Conveyor Belt
              </span>
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  {(['Box4', 'Box6', 'Box10'] as BoxNumType[]).map((nt) => (
                    <button
                      key={nt}
                      onClick={() => setConveyorAddNumType(nt)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                        conveyorAddNumType === nt
                          ? 'bg-cyan-600 text-white border-cyan-400'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {nt}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    sounds.playPop();
                    const newId = Date.now();
                    const cap = BOX_DIMENSIONS[conveyorAddNumType].capacity;
                    const newBus: BoxItem = {
                      id: newId,
                      x: 0,
                      z: selectedConveyor.z,
                      angle: 0,
                      numType: conveyorAddNumType,
                      capacity: cap,
                      color: conveyorAddColor,
                      boxType: 'Normal',
                    };
                    const updated = evenlySpreadConveyorBoxes(
                      [...selectedConveyor.boxes, newBus],
                      selectedConveyor.startX,
                      selectedConveyor.endX
                    );
                    onUpdateConveyors?.(
                      conveyors.map((c) =>
                        c.id === selectedConveyor.id ? { ...c, boxes: updated } : c
                      )
                    );
                  }}
                  className="px-2 py-0.5 bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-semibold rounded shadow transition"
                >
                  Add
                </button>
              </div>

              {/* Color swatch row */}
              <div className="flex items-center gap-1 pt-0.5">
                {Object.values(WOOL_COLORS).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setConveyorAddColor(c.id)}
                    className={`w-4 h-4 rounded-full transition-transform ${
                      conveyorAddColor === c.id ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Delete Conveyor */}
          <button
            onClick={() => {
              sounds.playPop();
              onUpdateConveyors?.(conveyors.filter((c) => c.id !== selectedConveyor.id));
              onSelectConveyor?.(null);
            }}
            className="w-full py-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800/60 text-rose-400 hover:text-white rounded-lg text-xs font-medium transition flex items-center justify-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Conveyor</span>
          </button>
        </div>
      ) : singleSelected ? (
        /* Box Inspector */
        <div className="p-3 border-b border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-400">
              Box #{singleSelected.id}
            </span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                isBoxFrozen(singleSelected)
                  ? 'bg-sky-950/80 border-sky-400/60 text-sky-300'
                  : singleExitStatus?.isBlocked
                  ? 'bg-rose-950/70 border-rose-500/50 text-rose-400'
                  : 'bg-emerald-950/70 border-emerald-500/50 text-emerald-400'
              }`}
            >
              {isBoxFrozen(singleSelected)
                ? '❄️ Frozen (Locked)'
                : singleExitStatus?.isBlocked
                ? `Blocked by #${singleExitStatus.blockingBoxId}`
                : 'Clear Path'}
            </span>
          </div>

          {/* Box Type Switcher (Normal vs Frozen) */}
          <div>
            <label className="text-slate-400 text-[10px] block mb-1">Box State / Type</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setBoxType('Normal')}
                className={`py-1.5 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition ${
                  !isBoxFrozen(singleSelected)
                    ? 'bg-cyan-600 text-white border-cyan-400 shadow'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                }`}
              >
                <Box className="w-3.5 h-3.5" />
                <span>Normal</span>
              </button>
              <button
                onClick={() => setBoxType('Ice')}
                className={`py-1.5 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition ${
                  isBoxFrozen(singleSelected)
                    ? 'bg-sky-500 text-white border-sky-300 shadow'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-sky-300'
                }`}
              >
                <Snowflake className="w-3.5 h-3.5 text-sky-200" />
                <span>❄️ Frozen</span>
              </button>
            </div>
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
          Click any box, tunnel, or conveyor on canvas to inspect and configure.
        </div>
      )}

      {/* 6. View & Grid Settings */}
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

        {/* Randomize Layout Button */}
        {onRandomizeLayout && (
          <div className="pt-1 border-t border-slate-800/60">
            <button
              onClick={onRandomizeLayout}
              className="w-full py-1.5 bg-indigo-950/40 hover:bg-indigo-900/60 border border-indigo-700/50 hover:border-indigo-500 text-indigo-300 hover:text-white rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 active:scale-95 shadow-sm"
              title="Generate randomized 49-box tight fit layout (similar to 49-box demo preset)"
            >
              <Dices className="w-3.5 h-3.5 text-indigo-300" />
              <span>Randomize Layout (49)</span>
            </button>
          </div>
        )}

        {/* Clear Entire Board Button */}
        {onClearBoard && (
          <div className="pt-1 border-t border-slate-800/60">
            <button
              onClick={onClearBoard}
              className="w-full py-1.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 hover:border-rose-600 text-rose-300 hover:text-white rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 active:scale-95 shadow-sm"
              title="Clear all boxes, elements (tunnels, conveyors), and dragon config"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Entire Board</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
