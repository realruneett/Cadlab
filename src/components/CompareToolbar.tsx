"use client";

import React from 'react';
import { ArrowLeftRight, Download, X, FileCode, Zap } from 'lucide-react';

const CircuitBoard = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="2" width="20" height="20" rx="2" />
    <circle cx="12" cy="12" r="2" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  </svg>
);

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

function getFileTypeMeta(name: string | null): { icon: React.ReactNode; tag: string; tagColor: string } {
  if (!name) return { icon: <FileCode className="w-3.5 h-3.5 text-slate-500" />, tag: 'File', tagColor: 'bg-slate-800 text-slate-500' };
  
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'kicad_pcb':
      return { icon: <CircuitBoard className="w-3.5 h-3.5 text-blue-400" />, tag: 'KiCad PCB', tagColor: 'bg-blue-500/10 text-blue-400' };
    case 'kicad_sch':
      return { icon: <Zap className="w-3.5 h-3.5 text-amber-400" />, tag: 'KiCad SCH', tagColor: 'bg-amber-500/10 text-amber-400' };
    case 'brd':
      return { icon: <CircuitBoard className="w-3.5 h-3.5 text-emerald-400" />, tag: 'Eagle BRD', tagColor: 'bg-emerald-500/10 text-emerald-400' };
    case 'sch':
      return { icon: <Zap className="w-3.5 h-3.5 text-purple-400" />, tag: 'Eagle SCH', tagColor: 'bg-purple-500/10 text-purple-400' };
    default:
      return { icon: <FileCode className="w-3.5 h-3.5 text-slate-400" />, tag: ext?.toUpperCase() || 'File', tagColor: 'bg-slate-800 text-slate-500' };
  }
}

function getBaseName(path: string | null): string {
  if (!path) return 'No file';
  const parts = path.split('/');
  return parts[parts.length - 1];
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
  const leftMeta = getFileTypeMeta(leftName);
  const rightMeta = getFileTypeMeta(rightName);
  const isDiffActive = hasFiles && (additionsCount > 0 || deletionsCount > 0);

  return (
    <div className="glass-panel rounded-xl px-4 py-3 flex flex-col gap-3 animate-fade-in">
      
      {/* Row 1: File Info Cards */}
      <div className="flex items-center gap-3 w-full flex-wrap">
        
        {/* ── Files Section ── */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          
          <span className="text-[9px] uppercase tracking-widest text-slate-600 font-bold shrink-0 hidden lg:block">Files</span>
          
          {/* Left File Card */}
          <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all min-w-0 max-w-[220px] ${
            leftName 
              ? 'bg-red-950/20 border-red-900/30' 
              : 'bg-slate-900/40 border-slate-800/60'
          }`}>
            {leftMeta.icon}
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-semibold text-slate-200 truncate" title={leftName || ''}>
                {getBaseName(leftName) || 'Left File'}
              </span>
              <span className={`text-[8px] font-bold uppercase tracking-wider ${leftMeta.tagColor} px-1 py-0 rounded w-fit`}>
                {leftMeta.tag}
              </span>
            </div>
          </div>

          {/* VS Divider with active pulse */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isDiffActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse-dot" />
            )}
            <span className="text-slate-600 text-[10px] font-bold">VS</span>
            {isDiffActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse-dot" />
            )}
          </div>

          {/* Right File Card */}
          <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all min-w-0 max-w-[220px] ${
            rightName 
              ? 'bg-emerald-950/20 border-emerald-900/30' 
              : 'bg-slate-900/40 border-slate-800/60'
          }`}>
            {rightMeta.icon}
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-semibold text-slate-200 truncate" title={rightName || ''}>
                {getBaseName(rightName) || 'Right File'}
              </span>
              <span className={`text-[8px] font-bold uppercase tracking-wider ${rightMeta.tagColor} px-1 py-0 rounded w-fit`}>
                {rightMeta.tag}
              </span>
            </div>
          </div>

          {/* Diff Stats Badges */}
          {isDiffActive && (
            <div className="flex gap-1.5 text-xs font-bold shrink-0 ml-1">
              {additionsCount > 0 && (
                <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20 text-[10px]">
                  +{additionsCount.toLocaleString()}
                </span>
              )}
              {deletionsCount > 0 && (
                <span className="px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded border border-red-500/20 text-[10px]">
                  -{deletionsCount.toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Vertical Divider */}
        <div className="h-8 w-px bg-slate-800/80 shrink-0 hidden md:block" />

        {/* ── Options Section ── */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] uppercase tracking-widest text-slate-600 font-bold shrink-0 hidden lg:block">Options</span>
          
          <label className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-slate-900/40 border border-slate-800/60 text-[10px] text-slate-400 cursor-pointer hover:bg-slate-800/60 hover:text-slate-300 transition-all select-none">
            <input
              type="checkbox"
              checked={ignoreWhitespace}
              onChange={(e) => setIgnoreWhitespace(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-0 cursor-pointer w-3 h-3"
            />
            <span>Whitespace</span>
          </label>

          <label className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-slate-900/40 border border-slate-800/60 text-[10px] text-slate-400 cursor-pointer hover:bg-slate-800/60 hover:text-slate-300 transition-all select-none">
            <input
              type="checkbox"
              checked={crlfToLf}
              onChange={(e) => setCrlfToLf(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-0 cursor-pointer w-3 h-3"
            />
            <span>CRLF→LF</span>
          </label>
        </div>

        {/* Vertical Divider */}
        <div className="h-8 w-px bg-slate-800/80 shrink-0 hidden md:block" />

        {/* ── Actions Section ── */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] uppercase tracking-widest text-slate-600 font-bold shrink-0 hidden lg:block">Actions</span>
          
          <button
            onClick={onSwap}
            disabled={!leftName || !rightName}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900/40 border border-slate-800/60 hover:bg-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-lg text-[10px] font-semibold cursor-pointer transition-all disabled:opacity-30 disabled:pointer-events-none"
            title="Swap Left & Right operands"
          >
            <ArrowLeftRight className="w-3 h-3" />
            <span className="hidden sm:inline">Swap</span>
          </button>

          {onDownloadDiff && (
            <button
              onClick={onDownloadDiff}
              disabled={!leftName || !rightName}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900/40 border border-slate-800/60 hover:bg-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-lg text-[10px] font-semibold cursor-pointer transition-all disabled:opacity-30 disabled:pointer-events-none"
              title="Download Diff Patch"
            >
              <Download className="w-3 h-3" />
              <span className="hidden sm:inline">Export</span>
            </button>
          )}

          <button
            onClick={onClear}
            disabled={!hasFiles}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-950/15 border border-red-900/25 hover:bg-red-950/30 hover:border-red-900/40 text-red-400/80 hover:text-red-400 rounded-lg text-[10px] font-semibold cursor-pointer transition-all disabled:opacity-30 disabled:pointer-events-none"
            title="Reset comparison"
          >
            <X className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </div>
  );
}
