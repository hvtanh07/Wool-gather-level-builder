import React, { useState, useRef } from 'react';
import { CleanLevelData, LegacyLvMap } from '../types/level';
import { convertLegacyLvMapToClean } from '../data/demoLevel';
import { sounds } from '../utils/audio';
import {
  Copy,
  Check,
  Download,
  Upload,
  AlertCircle,
  FileJson,
  X,
  FolderOpen,
  FileUp,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

export function parseLevelJson(jsonText: string): CleanLevelData {
  const parsed = JSON.parse(jsonText);

  // Check if legacy format (contains lvmap file, boxes with pos.x, numType etc.)
  if (parsed.boxes && Array.isArray(parsed.boxes) && parsed.boxes.length > 0 && parsed.boxes[0].pos) {
    return convertLegacyLvMapToClean(parsed as LegacyLvMap);
  }

  // Check if clean format (contains version, camera, dragon, boxes with x, z)
  if (parsed.boxes && Array.isArray(parsed.boxes)) {
    return parsed as CleanLevelData;
  }

  throw new Error('Unrecognized JSON format. Must contain a "boxes" array.');
}

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
  const [isDragging, setIsDragging] = useState(false);
  const [loadedFileInfo, setLoadedFileInfo] = useState<{
    name: string;
    size: number;
    boxCount: number;
    levelId: number;
    isLegacy: boolean;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Process a loaded file
  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      setImportText(text);
      try {
        const clean = parseLevelJson(text);
        setLoadedFileInfo({
          name: file.name,
          size: file.size,
          boxCount: clean.boxes.length,
          levelId: clean.levelId,
          isLegacy: text.includes('"pos"'),
        });
        setImportError(null);
        sounds.playPop();
      } catch (err: unknown) {
        setImportError(err instanceof Error ? err.message : 'Invalid JSON file format.');
        setLoadedFileInfo(null);
        sounds.playBlocked();
      }
    };
    reader.readAsText(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Import JSON handler
  const handleImport = () => {
    setImportError(null);
    try {
      const clean = parseLevelJson(importText);
      sounds.playBoxComplete();
      onImportLevel(clean);
      onClose();
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
            Import JSON File / Text
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
              {/* File Dropzone */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileInputChange}
                accept=".json,.txt,application/json,text/plain"
                className="hidden"
              />

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 ${
                  isDragging
                    ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300 scale-[1.01]'
                    : loadedFileInfo
                    ? 'border-emerald-500/60 bg-emerald-950/20 text-emerald-300'
                    : 'border-slate-700 hover:border-cyan-500/60 hover:bg-slate-800/40 text-slate-300'
                }`}
              >
                {loadedFileInfo ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-emerald-900/60 border border-emerald-500/50 flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white flex items-center gap-1.5 justify-center">
                        <span>{loadedFileInfo.name}</span>
                        <span className="text-xs font-normal text-emerald-400">
                          ({(loadedFileInfo.size / 1024).toFixed(1)} KB)
                        </span>
                      </p>
                      <div className="flex items-center gap-2 mt-1 justify-center">
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-cyan-300 font-mono">
                          Level #{loadedFileInfo.levelId}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-amber-300 font-mono">
                          {loadedFileInfo.boxCount} Boxes
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-emerald-300">
                          {loadedFileInfo.isLegacy ? 'Legacy lvmap auto-converted' : 'Clean JSON format'}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Click to choose another file, or click <strong>Load Level</strong> below
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                      <FileUp className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-white">
                        Click to select a <span className="text-cyan-400 font-bold">.json file</span> or drag & drop here
                      </p>
                      <p className="text-xs text-slate-400">
                        Supports both <strong>Clean Level JSON</strong> and <strong>legacy lvmap_*.json</strong>
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Error Alert */}
              {importError && (
                <div className="flex items-center gap-2 p-3 bg-rose-950/80 border border-rose-500/50 rounded-xl text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Manual JSON textarea */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Or paste / inspect raw JSON text:</span>
                  {importText.trim() && (
                    <button
                      onClick={() => {
                        setImportText('');
                        setLoadedFileInfo(null);
                        setImportError(null);
                      }}
                      className="text-[11px] text-slate-500 hover:text-slate-300 transition"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <textarea
                  placeholder="Paste JSON here or drop file above..."
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    setLoadedFileInfo(null);
                  }}
                  className="w-full h-44 bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-cyan-500 focus:outline-none resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between items-center pt-1">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-xl text-xs font-semibold border border-slate-700 transition"
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>Browse File...</span>
                </button>

                <div className="flex items-center gap-2">
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
