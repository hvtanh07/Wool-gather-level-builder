import React, { useEffect, useRef, useState } from 'react';
import { CleanLevelData } from '../types/level';
import { parseLevelListJson } from '../utils/levelIO';
import { sounds } from '../utils/audio';
import { Plus, Copy, ChevronUp, ChevronDown, Trash2, Upload, Download, RotateCcw } from 'lucide-react';

export type LevelStatus = 'ok' | 'warn' | 'bad';

interface LevelRailProps {
  levels: CleanLevelData[];
  activeIndex: number;
  statuses: LevelStatus[];
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onImportLevels: (levels: CleanLevelData[], mode: 'append' | 'replace') => void;
  onResetToPack: () => void;
}

/** A button that needs a second click within 3 s, instead of a confirm dialog. */
function useArmed(): [boolean, (run: () => void) => void] {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const press = (run: () => void) => {
    window.clearTimeout(timer.current);
    if (armed) {
      setArmed(false);
      run();
      return;
    }
    setArmed(true);
    timer.current = window.setTimeout(() => setArmed(false), 3000);
  };
  return [armed, press];
}

export const LevelRail: React.FC<LevelRailProps> = ({
  levels,
  activeIndex,
  statuses,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
  onImportLevels,
  onResetToPack,
}) => {
  const [filter, setFilter] = useState('');
  const [deleteArmed, pressDelete] = useArmed();
  const [resetArmed, pressReset] = useArmed();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const list = parseLevelListJson(String(ev.target?.result || ''));
        if (list.length === 0) throw new Error('No levels found in file.');
        // One level is added at the end. For several, OK replaces the list and Cancel adds them at the end.
        const mode: 'append' | 'replace' =
          list.length > 1 &&
          window.confirm(
            `"${file.name}" has ${list.length} levels.\n\nOK: replace all ${levels.length} levels in the list.\nCancel: add them at the end.`
          )
            ? 'replace'
            : 'append';
        onImportLevels(list, mode);
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
    .filter(
      ({ lvl, idx }) =>
        !q ||
        String(lvl.levelId).includes(q) ||
        String(idx + 1) === q ||
        lvl.levelType.toLowerCase().includes(q) ||
        (q === 'error' && statuses[idx] === 'bad') ||
        (q === 'warn' && statuses[idx] === 'warn')
    );

  return (
    <aside className="rail" aria-label="Levels">
      <div className="brand">
        <div className="logo" aria-hidden>🧶</div>
        <div>
          <h1>Wool Gather</h1>
          <p>Level builder · {levels.length} levels</p>
        </div>
      </div>
      <div className="rail-tools">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter: id, hard, error, warn"
          aria-label="Filter levels"
        />
      </div>
      <div className="rail-tools">
        <button className="rbtn" onClick={onAdd} title="Add an empty level at the end">
          <Plus size={13} /> New
        </button>
        <button className="rbtn" onClick={() => onDuplicate(activeIndex)} title="Duplicate this level">
          <Copy size={13} /> Copy
        </button>
        <button className="rbtn" onClick={() => onMove(activeIndex, -1)} disabled={activeIndex === 0} title="Move up" aria-label="Move up">
          <ChevronUp size={13} />
        </button>
        <button
          className="rbtn"
          onClick={() => onMove(activeIndex, 1)}
          disabled={activeIndex === levels.length - 1}
          title="Move down"
          aria-label="Move down"
        >
          <ChevronDown size={13} />
        </button>
        <button
          className={`rbtn${deleteArmed ? ' armed' : ''}`}
          disabled={levels.length <= 1}
          onClick={() => pressDelete(() => onDelete(activeIndex))}
          title="Delete this level (click twice)"
          aria-label="Delete this level"
        >
          <Trash2 size={13} /> {deleteArmed ? 'Sure?' : ''}
        </button>
      </div>

      <ul className="lvlist">
        {rows.map(({ lvl, idx }) => {
          const active = idx === activeIndex;
          const parts = [`${lvl.boxes.length} box`];
          const t = lvl.tunnels?.length || 0;
          const c = lvl.conveyors?.length || 0;
          if (t) parts.push(`${t} tunnel`);
          if (c) parts.push(`${c} conveyor`);
          if (lvl.dragon.trackId !== undefined) parts.push(`track ${lvl.dragon.trackId}`);
          const st = statuses[idx] ?? 'ok';
          return (
            <li key={idx}>
              <button
                ref={active ? activeRef : undefined}
                className="lv"
                aria-current={active}
                onClick={() => onSelect(idx)}
              >
                <span className="n">{idx + 1}</span>
                <span>
                  <span className="t">
                    Level {lvl.levelId}
                    {lvl.levelType === 'Hard' && <i>HARD</i>}
                  </span>
                  <span className="m">{parts.join(' · ')}</span>
                </span>
                <span
                  className={`dot${st === 'ok' ? '' : ' ' + st}`}
                  title={st === 'bad' ? 'Has layout errors (see Check tab)' : st === 'warn' ? 'Has warnings' : 'No issues found'}
                />
              </button>
            </li>
          );
        })}
        {rows.length === 0 && <li className="hint" style={{ padding: 12, color: 'var(--rail-muted)' }}>No levels match.</li>}
      </ul>

      <div className="rail-foot">
        <button className="rbtn" onClick={() => fileInputRef.current?.click()} title="Import a .json file with one level or a list of levels">
          <Upload size={13} /> Import
        </button>
        <button className="rbtn" onClick={handleExportAll} title="Download every level as one JSON array">
          <Download size={13} /> Export all
        </button>
        <button
          className={`rbtn${resetArmed ? ' armed' : ''}`}
          onClick={() => pressReset(onResetToPack)}
          title="Restore the 40 levels from the sheet (click twice)"
        >
          <RotateCcw size={13} /> {resetArmed ? 'Sure?' : 'Reset to sheet'}
        </button>
        <small>Changes are saved in this browser.</small>
        <input type="file" ref={fileInputRef} onChange={handleFile} accept=".json,.txt,application/json,text/plain" hidden />
      </div>
    </aside>
  );
};
