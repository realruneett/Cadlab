"use client";

import React, { useState, useMemo } from 'react';
import { Search, FileText, FileCode, Binary, Trash2, ArrowLeftRight, HelpCircle, Eye } from 'lucide-react';
import { FileEntry } from '@/utils/fileUtils';

interface FileListProps {
  files: FileEntry[];
  selectedLeft: FileEntry | null;
  selectedRight: FileEntry | null;
  onSelectLeft: (file: FileEntry | null) => void;
  onSelectRight: (file: FileEntry | null) => void;
  onRemoveFile?: (index: number) => void;
  onClearAll?: () => void;
  onPreviewFile?: (file: FileEntry) => void;
}

export default function FileList({
  files,
  selectedLeft,
  selectedRight,
  onSelectLeft,
  onSelectRight,
  onRemoveFile,
  onClearAll,
  onPreviewFile,
}: FileListProps) {
  const [search, setSearch] = useState('');
  const [selectedExtension, setSelectedExtension] = useState<string>('all');
  const [hideBinary, setHideBinary] = useState(false);

  // 1. Format bytes utility
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // 2. Gather unique extensions for filtering
  const extensions = useMemo(() => {
    const extSet = new Set<string>();
    files.forEach(f => {
      const parts = f.name.split('.');
      if (parts.length > 1) {
        extSet.add('.' + parts.pop()?.toLowerCase());
      }
    });
    return Array.from(extSet);
  }, [files]);

  // 3. Filter files based on search, extension, and binary selection
  const filteredFiles = useMemo(() => {
    return files.filter(file => {
      const matchesSearch = file.relativePath.toLowerCase().includes(search.toLowerCase());
      
      const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
      const matchesExt = selectedExtension === 'all' || fileExt === selectedExtension;
      
      const matchesBinary = !hideBinary || !file.isBinary;

      return matchesSearch && matchesExt && matchesBinary;
    });
  }, [files, search, selectedExtension, hideBinary]);

  // 4. File extension icon matcher
  const getFileIcon = (file: FileEntry) => {
    if (file.isBinary) return <Binary className="w-4 h-4 text-amber-500" />;
    
    const ext = file.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
      case 'json':
      case 'html':
      case 'css':
        return <FileCode className="w-4 h-4 text-blue-400" />;
      default:
        return <FileText className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Search and Hide Binary Switch */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900/60 border border-slate-700/80 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400 px-1 mt-1">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideBinary}
              onChange={(e) => setHideBinary(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span>Hide Binary Files</span>
          </label>

          {onClearAll && files.length > 0 && (
            <button
              onClick={onClearAll}
              className="flex items-center gap-1 text-red-400 hover:text-red-300 font-medium cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All</span>
            </button>
          )}
        </div>
      </div>

      {/* Extension Filters */}
      {extensions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pr-1">
          <button
            onClick={() => setSelectedExtension('all')}
            className={`px-2 py-0.5 rounded text-xs font-medium border cursor-pointer transition-all ${
              selectedExtension === 'all'
                ? "bg-slate-700/70 text-slate-200 border-slate-600"
                : "bg-slate-900/40 text-slate-400 border-slate-800 hover:border-slate-700"
            }`}
          >
            All
          </button>
          {extensions.map(ext => (
            <button
              key={ext}
              onClick={() => setSelectedExtension(ext)}
              className={`px-2 py-0.5 rounded text-xs font-medium border cursor-pointer transition-all ${
                selectedExtension === ext
                  ? "bg-blue-900/50 text-blue-300 border-blue-800/80"
                  : "bg-slate-900/40 text-slate-400 border-slate-800 hover:border-slate-700"
              }`}
            >
              {ext}
            </button>
          ))}
        </div>
      )}

      {/* Selected Slots Preview */}
      {(selectedLeft || selectedRight) && (
        <div className="grid grid-cols-2 gap-2 p-2 bg-slate-900/40 border border-slate-800/80 rounded-lg text-xs">
          <div className="flex flex-col gap-1 border-r border-slate-800/80 pr-2">
            <span className="text-slate-500 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Left (File A)
            </span>
            {selectedLeft ? (
              <div className="flex items-center justify-between gap-1 group">
                <span className="text-slate-300 truncate" title={selectedLeft.relativePath}>
                  {selectedLeft.name}
                </span>
                <button
                  onClick={() => onSelectLeft(null)}
                  className="text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  ✕
                </button>
              </div>
            ) : (
              <span className="text-slate-600 italic">None selected</span>
            )}
          </div>
          <div className="flex flex-col gap-1 pl-1">
            <span className="text-slate-500 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Right (File B)
            </span>
            {selectedRight ? (
              <div className="flex items-center justify-between gap-1 group">
                <span className="text-slate-300 truncate" title={selectedRight.relativePath}>
                  {selectedRight.name}
                </span>
                <button
                  onClick={() => onSelectRight(null)}
                  className="text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  ✕
                </button>
              </div>
            ) : (
              <span className="text-slate-600 italic">None selected</span>
            )}
          </div>
        </div>
      )}

      {/* Files List */}
      <div className="flex-1 overflow-y-auto border border-slate-800/80 rounded-lg bg-slate-950/20">
        {filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 p-4">
            <HelpCircle className="w-8 h-8 opacity-20 mb-2" />
            <p className="text-sm">No files found</p>
            <p className="text-xs mt-1 text-slate-600">Try importing or picking a folder</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-900/50">
            {filteredFiles.map((file, idx) => {
              const isLeft = selectedLeft?.relativePath === file.relativePath;
              const isRight = selectedRight?.relativePath === file.relativePath;

              return (
                <div
                  key={file.relativePath}
                  className={`flex items-center justify-between p-2.5 hover:bg-slate-900/40 group transition-all ${
                    isLeft || isRight ? "bg-slate-900/20" : ""
                  }`}
                >
                  {/* File Metadata Info */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="shrink-0">
                      {getFileIcon(file)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-300 truncate" title={file.relativePath}>
                        {file.name}
                      </p>
                      <p className="text-xs text-slate-500 truncate" title={file.relativePath}>
                        {file.relativePath.includes('/') 
                          ? file.relativePath.substring(0, file.relativePath.lastIndexOf('/')) 
                          : './'}
                        {" • "}{formatBytes(file.size)}
                      </p>
                    </div>
                  </div>

                  {/* Quick Select Actions */}
                  <div className="flex gap-1 shrink-0 ml-2 items-center">
                    {onPreviewFile && (
                      <button
                        onClick={() => onPreviewFile(file)}
                        className="p-1 hover:bg-slate-800 rounded opacity-0 group-hover:opacity-100 transition-all text-slate-400 hover:text-slate-200 cursor-pointer"
                        title="Preview File"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => onSelectLeft(isLeft ? null : file)}
                      className={`px-2 py-1 text-xs font-semibold rounded transition-all cursor-pointer ${
                        isLeft
                          ? "bg-red-500/20 text-red-400 border border-red-500/40"
                          : "opacity-0 group-hover:opacity-100 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-transparent"
                      }`}
                    >
                      Left
                    </button>
                    <button
                      onClick={() => onSelectRight(isRight ? null : file)}
                      className={`px-2 py-1 text-xs font-semibold rounded transition-all cursor-pointer ${
                        isRight
                          ? "bg-green-500/20 text-green-400 border border-green-500/40"
                          : "opacity-0 group-hover:opacity-100 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-transparent"
                      }`}
                    >
                      Right
                    </button>
                    {onRemoveFile && (
                      <button
                        onClick={() => onRemoveFile(files.findIndex(f => f.relativePath === file.relativePath))}
                        className="p-1 hover:bg-red-950/20 hover:text-red-400 rounded opacity-0 group-hover:opacity-100 transition-all text-slate-500 cursor-pointer"
                        title="Remove file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
