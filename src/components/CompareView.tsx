"use client";

import React, { useRef, useState, useEffect } from 'react';
import { AlertTriangle, Binary, FileText, ChevronDown, Check } from 'lucide-react';
import { DiffRow, computeSideBySideDiff } from '@/utils/diff';
import { FileEntry } from '@/utils/fileUtils';

interface CompareViewProps {
  leftFile: FileEntry | null;
  rightFile: FileEntry | null;
  leftContent: string | null;
  rightContent: string | null;
  ignoreWhitespace: boolean;
  crlfToLf: boolean;
  onStatsComputed?: (additions: number, deletions: number) => void;
}

export default function CompareView({
  leftFile,
  rightFile,
  leftContent,
  rightContent,
  ignoreWhitespace,
  crlfToLf,
  onStatsComputed,
}: CompareViewProps) {
  const [showLargeAnyway, setShowLargeAnyway] = useState(false);
  const [diffRows, setDiffRows] = useState<DiffRow[]>([]);
  const [loading, setLoading] = useState(false);

  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const scrollDriver = useRef<'left' | 'right' | null>(null);

  // 1. Check if files are too large (> 5MB)
  const isLargeFile = (leftFile && leftFile.size > 5 * 1024 * 1024) || 
                      (rightFile && rightFile.size > 5 * 1024 * 1024);

  const isBinaryMode = (leftFile && leftFile.isBinary) || (rightFile && rightFile.isBinary);

  // 2. Compute diff on input change
  useEffect(() => {
    if (isBinaryMode) {
      setDiffRows([]);
      if (onStatsComputed) onStatsComputed(0, 0);
      return;
    }

    if (leftContent === null && rightContent === null) {
      setDiffRows([]);
      if (onStatsComputed) onStatsComputed(0, 0);
      return;
    }

    const compute = () => {
      setLoading(true);
      try {
        const textA = leftContent || '';
        const textB = rightContent || '';

        // If files are large and user hasn't explicitly allowed full load, truncate lines to 1000
        let finalA = textA;
        let finalB = textB;
        if (isLargeFile && !showLargeAnyway) {
          finalA = textA.split('\n').slice(0, 1000).join('\n');
          finalB = textB.split('\n').slice(0, 1000).join('\n');
        }

        const rows = computeSideBySideDiff(finalA, finalB, {
          ignoreWhitespace,
          crlfToLf,
        });

        setDiffRows(rows);

        // Compute statistics (additions & deletions)
        let additions = 0;
        let deletions = 0;
        rows.forEach(row => {
          if (row.left.type === 'removed') deletions++;
          else if (row.right.type === 'added') additions++;
          else if (row.left.type === 'modified' || row.right.type === 'modified') {
            deletions++;
            additions++;
          }
        });

        if (onStatsComputed) {
          onStatsComputed(additions, deletions);
        }
      } catch (err) {
        console.error("Diff calculation failed:", err);
      } finally {
        setLoading(false);
      }
    };

    // Run in requestIdleCallback or setTimeout to keep UI responsive
    const timer = setTimeout(compute, 50);
    return () => clearTimeout(timer);
  }, [leftContent, rightContent, ignoreWhitespace, crlfToLf, isLargeFile, showLargeAnyway, isBinaryMode]);

  // 3. Synced scroll handlers
  const handleLeftScroll = () => {
    if (scrollDriver.current === 'right') return;
    scrollDriver.current = 'left';
    if (leftScrollRef.current && rightScrollRef.current) {
      rightScrollRef.current.scrollTop = leftScrollRef.current.scrollTop;
      rightScrollRef.current.scrollLeft = leftScrollRef.current.scrollLeft;
    }
  };

  const handleRightScroll = () => {
    if (scrollDriver.current === 'left') return;
    scrollDriver.current = 'right';
    if (leftScrollRef.current && rightScrollRef.current) {
      leftScrollRef.current.scrollTop = rightScrollRef.current.scrollTop;
      leftScrollRef.current.scrollLeft = rightScrollRef.current.scrollLeft;
    }
  };

  const handleMouseEnter = (side: 'left' | 'right') => {
    scrollDriver.current = side;
  };

  // Render inline word highlights
  const renderLineContent = (line: typeof diffRows[0]['left']) => {
    if (!line.content) return '\u00A0'; // Non-breaking space for blank line alignment

    if (line.words && line.words.length > 0) {
      return (
        <>
          {line.words.map((part, idx) => {
            if (part.added) {
              return (
                <span key={idx} className="bg-green-500/30 text-green-300 font-semibold px-0.5 rounded border-b border-green-400/40">
                  {part.value}
                </span>
              );
            }
            if (part.removed) {
              return (
                <span key={idx} className="bg-red-500/30 text-red-300 font-semibold px-0.5 rounded border-b border-red-400/40 line-through">
                  {part.value}
                </span>
              );
            }
            return <span key={idx}>{part.value}</span>;
          })}
        </>
      );
    }

    return line.content;
  };

  // Helper for background styling
  const getLineClass = (type: string, side: 'left' | 'right') => {
    switch (type) {
      case 'added':
        return "bg-green-950/20 text-green-300/90 border-l-[3px] border-l-green-500/50";
      case 'removed':
        return "bg-red-950/20 text-red-300/90 border-l-[3px] border-l-red-500/50";
      case 'modified':
        return side === 'left'
          ? "bg-red-950/30 text-red-200/95 border-l-[3px] border-l-red-500/80"
          : "bg-green-950/30 text-green-200/95 border-l-[3px] border-l-green-500/80";
      default:
        return "text-slate-400/80 hover:bg-slate-900/10 border-l-[3px] border-l-transparent";
    }
  };

  // Helper for line number styling
  const getLineNumberClass = (type: string, side: 'left' | 'right') => {
    const base = "w-12 text-right pr-3 select-none text-xs font-mono border-r border-slate-800/60 ";
    switch (type) {
      case 'added':
        return base + "text-green-600 bg-green-950/30";
      case 'removed':
        return base + "text-red-600 bg-red-950/30";
      case 'modified':
        return side === 'left'
          ? base + "text-red-500 bg-red-950/40"
          : base + "text-green-500 bg-green-950/40";
      default:
        return base + "text-slate-600 bg-slate-950/30";
    }
  };

  // 4. Render binary fallback
  if (isBinaryMode) {
    return (
      <div className="flex-1 glass-panel rounded-2xl flex flex-col items-center justify-center p-8 text-center min-h-[400px]">
        <div className="p-4 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 mb-4 animate-pulse">
          <Binary className="w-12 h-12" />
        </div>
        <h3 className="text-lg font-semibold text-slate-200">Binary File Comparison Unsupported</h3>
        <p className="text-sm text-slate-400 mt-2 max-w-md">
          Diffing binary files visually is not supported. You can download the files to compare them in external local analysis tools.
        </p>
        <div className="flex gap-4 mt-6">
          {leftFile && (
            <a
              href={leftFile.file ? URL.createObjectURL(leftFile.file) : '#'}
              download={leftFile.name}
              className="px-4 py-2 bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-200 rounded-lg text-sm font-medium transition-all"
            >
              Download {leftFile.name}
            </a>
          )}
          {rightFile && (
            <a
              href={rightFile.file ? URL.createObjectURL(rightFile.file) : '#'}
              download={rightFile.name}
              className="px-4 py-2 bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-200 rounded-lg text-sm font-medium transition-all"
            >
              Download {rightFile.name}
            </a>
          )}
        </div>
      </div>
    );
  }

  // 5. Render Empty State
  if (!leftFile && !rightFile) {
    return (
      <div className="flex-1 glass-panel rounded-2xl flex flex-col items-center justify-center p-8 text-center min-h-[400px] border-slate-800/80">
        <FileText className="w-12 h-12 text-slate-600 opacity-30 mb-4" />
        <h3 className="text-lg font-medium text-slate-400">No Files Selected</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">
          Select files from the left list to generate a side-by-side code diff.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden glass-panel rounded-2xl border border-slate-800/80 bg-slate-950/20">
      {/* Large File Warning Panel */}
      {isLargeFile && !showLargeAnyway && (
        <div className="bg-amber-950/30 border-b border-amber-900/40 p-3.5 flex items-center justify-between text-sm text-amber-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span>
              Large file detected. Visualizing only the first <strong>1,000 lines</strong> for performance.
            </span>
          </div>
          <button
            onClick={() => setShowLargeAnyway(true)}
            className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-md font-semibold text-xs cursor-pointer transition-all"
          >
            Load Full Diff
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[300px]">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
            <span className="text-xs text-slate-500 font-medium">Analyzing file differences...</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden min-h-[400px]">
          {/* LEFT COLUMN - File A */}
          <div
            ref={leftScrollRef}
            onScroll={handleLeftScroll}
            onMouseEnter={() => handleMouseEnter('left')}
            className="w-1/2 overflow-auto border-r border-slate-900 flex flex-col select-text"
          >
            <div className="sticky top-0 bg-slate-950/90 backdrop-blur border-b border-slate-900/80 px-4 py-2 flex items-center justify-between z-10">
              <span className="text-xs font-semibold text-red-400 font-mono truncate max-w-full">
                {leftFile?.relativePath || 'empty'}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {leftContent ? leftContent.split('\n').length : 0} lines
              </span>
            </div>
            
            <div className="flex-1 font-mono text-xs py-2 min-w-max">
              {diffRows.map((row, idx) => (
                <div key={`left-${idx}`} className={`flex min-h-[1.25rem] ${getLineClass(row.left.type, 'left')}`}>
                  {row.left.lineNum !== null ? (
                    <div className={getLineNumberClass(row.left.type, 'left')}>
                      {row.left.lineNum}
                    </div>
                  ) : (
                    <div className="w-12 border-r border-slate-900 bg-slate-950/20"></div>
                  )}
                  <div className="px-4 whitespace-pre leading-relaxed font-mono">
                    {renderLineContent(row.left)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT COLUMN - File B */}
          <div
            ref={rightScrollRef}
            onScroll={handleRightScroll}
            onMouseEnter={() => handleMouseEnter('right')}
            className="w-1/2 overflow-auto flex flex-col select-text"
          >
            <div className="sticky top-0 bg-slate-950/90 backdrop-blur border-b border-slate-900/80 px-4 py-2 flex items-center justify-between z-10">
              <span className="text-xs font-semibold text-green-400 font-mono truncate max-w-full">
                {rightFile?.relativePath || 'empty'}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {rightContent ? rightContent.split('\n').length : 0} lines
              </span>
            </div>

            <div className="flex-1 font-mono text-xs py-2 min-w-max">
              {diffRows.map((row, idx) => (
                <div key={`right-${idx}`} className={`flex min-h-[1.25rem] ${getLineClass(row.right.type, 'right')}`}>
                  {row.right.lineNum !== null ? (
                    <div className={getLineNumberClass(row.right.type, 'right')}>
                      {row.right.lineNum}
                    </div>
                  ) : (
                    <div className="w-12 border-r border-slate-900 bg-slate-950/20"></div>
                  )}
                  <div className="px-4 whitespace-pre leading-relaxed font-mono">
                    {renderLineContent(row.right)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
