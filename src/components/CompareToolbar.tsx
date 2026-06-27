"use client";

import React from 'react';
import { ArrowLeftRight, Settings, AlignLeft, RefreshCw, X, Download, FileText } from 'lucide-react';

interface CompareToolbarProps {
  onSwap: () => void;
  ignoreWhitespace: boolean;
  setIgnoreWhitespace: (val: boolean) => void;
  crlfToLf: boolean;
  setCrlfToLf: (val: boolean) => void;
  onClear: () => void;
  leftName: string | null;
  rightName: string | null;
  additionsCount?: number;
  deletionsCount?: number;
  onDownloadDiff?: () => void;
}

export default function CompareToolbar({
  onSwap,
  ignoreWhitespace,
  setIgnoreWhitespace,
  crlfToLf,
  setCrlfToLf,
  onClear,
  leftName,
  rightName,
  additionsCount = 0,
  deletionsCount = 0,
  onDownloadDiff,
}: CompareToolbarProps) {
  const hasFiles = leftName || rightName;

  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
      {/* File Information / Stats */}
      <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
        <div className="flex items-center gap-2 max-w-xs md:max-w-md truncate">
          <span className="px-2 py-0.5 rounded bg-red-950/40 text-red-400 border border-red-900/30 text-xs font-semibold truncate max-w-[120px] md:max-w-[200px]" title={leftName || ""}>
            {leftName || "Left File"}
          </span>
          <span className="text-slate-500 text-sm">vs</span>
          <span className="px-2 py-0.5 rounded bg-green-950/40 text-green-400 border border-green-900/30 text-xs font-semibold truncate max-w-[120px] md:max-w-[200px]" title={rightName || ""}>
            {rightName || "Right File"}
          </span>
        </div>

        {hasFiles && (additionsCount > 0 || deletionsCount > 0) && (
          <div className="flex gap-2 text-xs font-semibold">
            {deletionsCount > 0 && (
              <span className="px-1.5 py-0.5 bg-red-500/10 text-red-500 rounded border border-red-500/20">
                -{deletionsCount}
              </span>
            )}
            {additionsCount > 0 && (
              <span className="px-1.5 py-0.5 bg-green-500/10 text-green-500 rounded border border-green-500/20">
                +{additionsCount}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Control Buttons and Settings */}
      <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
        {/* Toggle Ignore Whitespace */}
        <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-300 cursor-pointer hover:bg-slate-800/80 transition-all select-none">
          <input
            type="checkbox"
            checked={ignoreWhitespace}
            onChange={(e) => setIgnoreWhitespace(e.target.checked)}
            className="rounded bg-slate-950 border-slate-800 text-blue-600 focus:ring-0 cursor-pointer"
          />
          <span>Ignore Whitespace</span>
        </label>

        {/* Toggle CRLF -> LF */}
        <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-300 cursor-pointer hover:bg-slate-800/80 transition-all select-none">
          <input
            type="checkbox"
            checked={crlfToLf}
            onChange={(e) => setCrlfToLf(e.target.checked)}
            className="rounded bg-slate-950 border-slate-800 text-blue-600 focus:ring-0 cursor-pointer"
          />
          <span>Normalize CRLF</span>
        </label>

        <div className="h-6 w-[1px] bg-slate-800 mx-1 hidden sm:block"></div>

        {/* Swap Button */}
        <button
          onClick={onSwap}
          disabled={!leftName || !rightName}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/60 border border-slate-800 hover:bg-slate-800 hover:border-slate-700 text-slate-300 rounded-lg text-xs font-medium cursor-pointer transition-all disabled:opacity-40 disabled:pointer-events-none"
          title="Swap Left & Right operands"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Swap Sides</span>
        </button>

        {/* Download Diff Button */}
        {onDownloadDiff && (
          <button
            onClick={onDownloadDiff}
            disabled={!leftName || !rightName}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/60 border border-slate-800 hover:bg-slate-800 hover:border-slate-700 text-slate-300 rounded-lg text-xs font-medium cursor-pointer transition-all disabled:opacity-40 disabled:pointer-events-none"
            title="Download Diff Patch"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export Patch</span>
          </button>
        )}

        {/* Clear Button */}
        <button
          onClick={onClear}
          disabled={!hasFiles}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/20 border border-red-900/30 hover:bg-red-950/40 hover:border-red-900/50 text-red-400 rounded-lg text-xs font-medium cursor-pointer transition-all disabled:opacity-40 disabled:pointer-events-none"
        >
          <X className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>
      </div>
    </div>
  );
}
