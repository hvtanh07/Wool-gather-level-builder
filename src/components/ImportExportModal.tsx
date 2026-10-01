import React, { useState } from 'react';
import { CleanLevelData, LegacyLvMap } from '../types/level';
import { convertLegacyLvMapToClean } from '../data/demoLevel';
import { sounds } from '../utils/audio';
import { Copy, Check, Download, Upload, AlertCircle, FileJson, X } from 'lucide-react';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  levelData: CleanLevelData;
  onImportLevel: (data: CleanLevelData) => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  onClose,
  levelData,
  onImportLevel,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [copied, setCopied] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  if (!isOpen) return null;

  const jsonString = JSON.stringify(levelData, null, 2);

  // Copy to clipboard
  const handleCopy = () => {
    sounds.playPop();
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download .json file
  const handleDownload = () => {
    sounds.playPop();
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `level_${levelData.levelId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Import JSON handler
  const handleImport = () => {
    setImportError(null);
    try {
      const parsed = JSON.parse(importText);

      // Check if legacy format (contains lvmap file, boxes with pos.x, numType etc.)
      if (parsed.boxes && Array.isArray(parsed.boxes) && parsed.boxes.length > 0 && parsed.boxes[0].pos) {
        // Legacy lvmap format
        const clean = convertLegacyLvMapToClean(parsed as LegacyLvMap);
        sounds.playBoxComplete();
        onImportLevel(clean);
        onClose();
        return;
      }

      // Check if clean format (contains version, camera, dragon, boxes with x, z)
      if (parsed.boxes && Array.isArray(parsed.boxes)) {
        sounds.playBoxComplete();
        onImportLevel(parsed as CleanLevelData);
        onClose();
        return;
      }

      throw new Error('Unrecognized JSON format. Must contain a "boxes" array.');
    } catch (err: unknown) {
      sounds.playBlocked();
      const msg = err instanceof Error ? err.message : 'Invalid JSON format.';
      setImportError(msg);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileJson className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-white">Level JSON Data Manager</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-800 px-5 pt-2">
          <button
            onClick={() => setActiveTab('export')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition ${
              activeTab === 'export'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Export Clean JSON
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition ${
              activeTab === 'import'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Import JSON (Clean or Legacy)
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 flex-1 overflow-y-auto">
          {activeTab === 'export' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-300">
                  This is the clean, simplified JSON schema containing only the core level building data:
                  camera setup, box layout, dragon sequence, level ID, and level type.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied!' : 'Copy JSON'}</span>
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold transition shadow-md shadow-cyan-600/20"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .json</span>
                  </button>
                </div>
              </div>

              <textarea
                readOnly
                value={jsonString}
                className="w-full h-80 bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-cyan-300 focus:outline-none resize-none select-all"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-slate-300">
                Paste JSON data below. The parser automatically detects whether it is the <strong>new Clean JSON format</strong> or the <strong>legacy lvmap_*.json format</strong> and converts it automatically.
              </p>

              {importError && (
                <div className="flex items-center gap-2 p-3 bg-rose-950/80 border border-rose-500/50 rounded-xl text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              <textarea
                placeholder="Paste JSON here..."
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="w-full h-72 bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-cyan-500 focus:outline-none resize-none"
              />

              <div className="flex justify-end gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={!importText.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition shadow-lg shadow-cyan-600/30"
                >
                  <Upload className="w-4 h-4" />
                  <span>Load Level</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
