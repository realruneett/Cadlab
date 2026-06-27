"use client";

import React, { useRef, useState } from 'react';
import { FolderOpen, Loader2 } from 'lucide-react';
import { readDirectoryRecursive, FileEntry } from '@/utils/fileUtils';

interface FolderPickerProps {
  onFolderSelected: (files: FileEntry[]) => void;
  className?: string;
}

export default function FolderPicker({ onFolderSelected, className = "" }: FolderPickerProps) {
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFolderPick = async () => {
    // 1. Try to use modern File System Access API
    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      try {
        setLoading(true);
        const dirHandle = await (window as any).showDirectoryPicker();
        const files = await readDirectoryRecursive(dirHandle);
        onFolderSelected(files);
      } catch (err: any) {
        // User aborted, or other error
        if (err.name !== 'AbortError') {
          console.error("Directory picker error:", err);
          // Fall back to input click if directory picker fails
          fileInputRef.current?.click();
        }
      } finally {
        setLoading(false);
      }
    } else {
      // 2. Fallback to standard input element
      fileInputRef.current?.click();
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = e.target.files;
    if (!inputFiles || inputFiles.length === 0) return;

    setLoading(true);
    try {
      const entries: FileEntry[] = [];
      for (let i = 0; i < inputFiles.length; i++) {
        const file = inputFiles[i];
        
        // Extract relative path from webkitRelativePath
        // E.g. "my-folder/src/main.js" -> relativePath = "src/main.js" (we strip the top-level directory)
        const parts = file.webkitRelativePath.split('/');
        const relativePath = parts.slice(1).join('/');

        // Basic check if it is binary
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
          relativePath: relativePath || file.name,
          size: file.size,
          lastModified: file.lastModified,
          isBinary: isBin,
          file,
        });
      }
      onFolderSelected(entries);
    } catch (err) {
      console.error("Fallback directory input reading failed:", err);
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className={`inline-block ${className}`}>
      {/* Hidden input fallback */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple
        {...{
          webkitdirectory: "",
          directory: "",
        } as any}
        onChange={handleFileInputChange}
      />
      
      <button
        onClick={handleFolderPick}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg shadow-lg border border-blue-500/20 font-medium transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Scanning Folder...</span>
          </>
        ) : (
          <>
            <FolderOpen className="w-4 h-4" />
            <span>Open Local Folder</span>
          </>
        )}
      </button>
    </div>
  );
}
