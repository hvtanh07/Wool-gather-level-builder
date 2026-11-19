import React, { useMemo, useState } from 'react';
import { CleanLevelData, LevelType } from '../types/level';
import { AuditIssue, BotSummary, botEstimate, layoutSimilarity, woolTotals } from '../utils/levelAudit';
import { sounds } from '../utils/audio';
import { Bot, ClipboardCopy } from 'lucide-react';

export type InspectorTab = 'level' | 'boxes' | 'dragon' | 'check' | 'json';

interface InspectorProps {
  tab: InspectorTab;
  onSetTab: (tab: InspectorTab) => void;
  levelData: CleanLevelData;
  levels: CleanLevelData[];
  activeIndex: number;
  issues: AuditIssue[];
  onUpdateLevelData: (updater: (prev: CleanLevelData) => CleanLevelData) => void;
  onLoadPreset: (preset: string) => void;
  onShowBoxes: (ids: number[]) => void;
  onOpenLevel: (index: number) => void;
  boxesPane: React.ReactNode;
  dragonPane: React.ReactNode;
}

const ISSUE_LABEL: Record<AuditIssue['kind'], string> = {
  overlap: 'Boxes overlap',
  'tunnel-blocked': 'Tunnel blocked',
  'wool-mismatch': 'Wool count',
  deadlock: 'Stuck',
  'too-hard': 'Too hard',
  similar: 'Similar layout',
};

export const Inspector: React.FC<InspectorProps> = ({
  tab,
  onSetTab,
  levelData,
  levels,
  activeIndex,
  issues,
  onUpdateLevelData,
  onLoadPreset,
  onShowBoxes,
  onOpenLevel,
  boxesPane,
  dragonPane,
}) => {
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warns = issues.length - errors;

  const tabs: { id: InspectorTab; label: string; badge?: React.ReactNode }[] = [
    { id: 'level', label: 'Level' },
    { id: 'boxes', label: 'Boxes' },
    { id: 'dragon', label: 'Dragon' },
    {
      id: 'check',
      label: 'Check',
      badge: (
        <span className={`badge ${errors ? 'bad' : warns ? 'warn' : 'ok'}`}>{errors || warns || '✓'}</span>
      ),
    },
    { id: 'json', label: 'JSON' },
  ];

  return (
    <aside className="insp" aria-label="Inspector">
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => onSetTab(t.id)}>
            {t.label}
            {t.badge}
          </button>
        ))}
      </div>
      <div className="pane-host" role="tabpanel">
        {tab === 'level' && (
          <LevelPane levelData={levelData} onUpdateLevelData={onUpdateLevelData} onLoadPreset={onLoadPreset} />
        )}
        {tab === 'boxes' && boxesPane}
        {tab === 'dragon' && dragonPane}
        {tab === 'check' && (
          <CheckPane
            levelData={levelData}
            levels={levels}
            activeIndex={activeIndex}
            issues={issues}
            onShowBoxes={onShowBoxes}
            onOpenLevel={onOpenLevel}
          />
        )}
        {tab === 'json' && <JsonPane levelData={levelData} />}
      </div>
    </aside>
  );
};

// ---------------------------------------------------------------------------

const LevelPane: React.FC<{
  levelData: CleanLevelData;
  onUpdateLevelData: InspectorProps['onUpdateLevelData'];
  onLoadPreset: (preset: string) => void;
}> = ({ levelData, onUpdateLevelData, onLoadPreset }) => {
  const slots = levelData.slots?.unlockedCount ?? levelData.slots?.count ?? 4;
  const wool = woolTotals(levelData);
  const sum = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  return (
    <div className="pane">
      <h2>Level {levelData.levelId}</h2>
      <div className="fields">
        <label className="fld">
          <span>Level ID</span>
          <input
            type="number"
            value={levelData.levelId}
            onChange={(e) => {
              const id = parseInt(e.target.value, 10) || 1;
              onUpdateLevelData((prev) => ({ ...prev, levelId: id }));
            }}
          />
        </label>
        <div className="fld">
          <span>Type</span>
          <div className="seg" role="group" aria-label="Level type">
            {(['Normal', 'Hard'] as LevelType[]).map((type) => (
              <button
                key={type}
                aria-pressed={levelData.levelType === type}
                onClick={() => {
                  sounds.playPop();
                  onUpdateLevelData((prev) => ({ ...prev, levelType: type }));
                }}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
        <label className="fld">
          <span>Slots</span>
          <select
            value={slots}
            onChange={(e) => {
              const count = parseInt(e.target.value, 10);
              onUpdateLevelData((prev) => ({ ...prev, slots: { count, unlockedCount: count } }));
            }}
          >
            {[3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n} slots
              </option>
            ))}
          </select>
        </label>
        <label className="fld">
          <span>Camera size</span>
          <input
            type="number"
            step="0.1"
            value={levelData.camera.cameraSize}
            onChange={(e) => {
              const sz = parseFloat(e.target.value) || 7.8;
              onUpdateLevelData((prev) => ({ ...prev, camera: { ...prev.camera, cameraSize: sz } }));
            }}
          />
        </label>
      </div>

      <h3>Contents</h3>
      <table className="stats">
        <tbody>
          <tr>
            <td>Boxes on board</td>
            <td>{levelData.boxes.length}</td>
          </tr>
          <tr>
            <td>Tunnels</td>
            <td>{levelData.tunnels?.length || 0}</td>
          </tr>
          <tr>
            <td>Conveyors</td>
            <td>{levelData.conveyors?.length || 0}</td>
          </tr>
          <tr>
            <td>Frozen boxes</td>
            <td>{levelData.boxes.filter((b) => b.boxType === 'Frozen').length}</td>
          </tr>
          <tr>
            <td>Dragon track</td>
            <td>{levelData.dragon.trackId !== undefined ? `#${levelData.dragon.trackId}` : 'custom'}</td>
          </tr>
          <tr>
            <td>Wool in boxes / on dragon</td>
            <td>
              {sum(wool.boxes)} / {sum(wool.dragon)}
            </td>
          </tr>
        </tbody>
      </table>

      <h3>Start from a preset</h3>
      <p className="hint">A preset opens as a new level after this one, so this level is kept.</p>
      <div className="btns">
        <button className="btn" onClick={() => onLoadPreset('demo')}>
          Demo (49 boxes)
        </button>
        <button className="btn" onClick={() => onLoadPreset('starter')}>
          Starter (16)
        </button>
        <button className="btn" onClick={() => onLoadPreset('empty')}>
          Blank
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

const CheckPane: React.FC<{
  levelData: CleanLevelData;
  levels: CleanLevelData[];
  activeIndex: number;
  issues: AuditIssue[];
  onShowBoxes: (ids: number[]) => void;
  onOpenLevel: (index: number) => void;
}> = ({ levelData, levels, activeIndex, issues, onShowBoxes, onOpenLevel }) => {
  // The result is kept with the level it was run on; a new or edited level shows no stale result.
  const [botRun, setBotRun] = useState<{ level: CleanLevelData; summary: BotSummary } | null>(null);
  const [running, setRunning] = useState(false);
  const bot = botRun && botRun.level === levelData ? botRun.summary : null;

  const similar = useMemo(() => {
    let best = { idx: -1, score: 0 };
    levels.forEach((l, i) => {
      if (i === activeIndex) return;
      const s = layoutSimilarity(levelData, l);
      if (s > best.score) best = { idx: i, score: s };
    });
    return best;
  }, [levelData, levels, activeIndex]);

  const runBot = () => {
    setRunning(true);
    window.setTimeout(() => {
      setBotRun({ level: levelData, summary: botEstimate(levelData, 40) });
      setRunning(false);
    }, 20);
  };

  return (
    <div className="pane">
      <h2>Layout check</h2>
      <p className="hint">Uses the in-game box sizes. Click “show” to select the boxes on the board.</p>
      <ul className="issues">
        {issues.length === 0 && (
          <li className="ok">
            <b>No layout problems.</b> No overlaps, no blocked tunnels, wool counts match.
          </li>
        )}
        {issues.map((iss, i) => (
          <li key={i} className={iss.severity === 'error' ? 'bad' : 'warn'}>
            <b>{ISSUE_LABEL[iss.kind]}:</b> {iss.message}
            {iss.boxIds && iss.boxIds.length > 0 && <button onClick={() => onShowBoxes(iss.boxIds!)}>show</button>}
          </li>
        ))}
      </ul>

      <h3>Difficulty (bot)</h3>
      <p className="hint">
        A simple bot plays the level 40 times with some randomness. It is weaker than a careful player, so a low win
        rate means hard, and 0 wins usually means the level cannot be finished.
      </p>
      <div className="btns">
        <button className="btn primary" onClick={runBot} disabled={running}>
          <Bot /> {running ? 'Playing…' : bot ? 'Run again' : 'Run bot (40 games)'}
        </button>
      </div>
      {bot && (
        <table className="stats" style={{ marginTop: 10 }}>
          <tbody>
            <tr>
              <td>Wins</td>
              <td style={{ color: bot.wins === 0 ? 'var(--bad)' : bot.wins < bot.runs * 0.75 ? 'var(--warn)' : 'var(--ok)' }}>
                {bot.wins}/{bot.runs}
              </td>
            </tr>
            <tr>
              <td>Track left before the robot, best game</td>
              <td>{Math.max(0, bot.bestMargin).toFixed(2)}</td>
            </tr>
            <tr>
              <td>Average game time</td>
              <td>{bot.avgTime.toFixed(0)} s</td>
            </tr>
            {bot.typicalLoss && (
              <tr>
                <td>Most common loss</td>
                <td>{bot.typicalLoss}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <h3>Most similar level</h3>
      {similar.idx < 0 ? (
        <p className="hint">No other level to compare.</p>
      ) : (
        <p>
          <button className="btn" onClick={() => onOpenLevel(similar.idx)}>
            Level {levels[similar.idx].levelId}
          </button>{' '}
          <span className="hint">
            {Math.round(similar.score * 100)}% of boxes in the same place (mirror counted). Above 35% looks repeated.
          </span>
        </p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const JsonPane: React.FC<{ levelData: CleanLevelData }> = ({ levelData }) => {
  const text = useMemo(() => JSON.stringify(levelData, null, 2), [levelData]);
  const [copied, setCopied] = useState(false);
  return (
    <div className="pane" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="btns" style={{ marginTop: 0, marginBottom: 8 }}>
        <button
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked: the text can still be selected by hand */
            }
          }}
        >
          <ClipboardCopy /> {copied ? 'Copied' : 'Copy'}
        </button>
        <span className="hint" style={{ alignSelf: 'center' }}>
          Read only. Use Import / Export to paste a level.
        </span>
      </div>
      <textarea className="json" readOnly value={text} spellCheck={false} />
    </div>
  );
};
