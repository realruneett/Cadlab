"use client";

import React, { useRef, useState } from 'react';
import { UploadCloud, FileUp } from 'lucide-react';
import { FileEntry } from '@/utils/fileUtils';

interface FileImporterProps {
  onFilesImported: (files: FileEntry[]) => void;
  className?: string;
}

export default function FileImporter({ onFilesImported, className = "" }: FileImporterProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = e.dataTransfer.files;
    if (!droppedFiles || droppedFiles.length === 0) return;

    await processFiles(droppedFiles);
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = e.target.files;
    if (!inputFiles || inputFiles.length === 0) return;

    await processFiles(inputFiles);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const processFiles = async (fileList: FileList) => {
    const entries: FileEntry[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      
      // Determine if file is binary by reading first 8KB
      const slice = file.slice(0, 8192);
      const buffer = await slice.arrayBuffer();
      const arr = new Uint8Array(buffer);
      let isBin = false;
      for (let j = 0; j < arr.length; j++) {
        if (arr[j] === 0) {
          isBin = true;
          break;
        }
      }

      entries.push({
        name: file.name,
        relativePath: file.name,
        size: file.size,
        lastModified: file.lastModified,
        isBinary: isBin,
        file
      });
    }
    onFilesImported(entries);
  };

  return (
    <div className={`w-full ${className}`}>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple
        aria-label="Upload files"
        onChange={handleFileInputChange}
      />
      
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`glass-panel border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-4 text-center cursor-pointer transition-all duration-300 ${
          isDragging
            ? "border-blue-500 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.3)] scale-[1.01]"
            : "border-slate-700 hover:border-slate-500 hover:bg-slate-800/20"
        }`}
      >
        <div className={`p-4 rounded-full bg-slate-800/80 border border-slate-700 text-slate-400 transition-all ${
          isDragging ? "text-blue-400 bg-blue-950/40 border-blue-500/50 scale-110" : ""
        }`}>
          {isDragging ? (
            <FileUp className="w-8 h-8 animate-bounce" />
          ) : (
            <UploadCloud className="w-8 h-8" />
          )}
        </div>
        
        <div>
          <p className="text-sm font-semibold text-slate-200">
            Drag & drop files here, or <span className="text-blue-400 hover:underline">browse</span>
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Supports text or hardware design files (max 5MB for instant diff)
          </p>
        </div>
      </div>
    </div>
  );
}
