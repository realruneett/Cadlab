"use client";

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Settings, 
  FolderOpen, 
  Loader2, 
  AlertCircle, 
  FileCode,
  Globe,
  Database,
  Lock,
  ArrowRightLeft,
  PanelLeft,
  ChevronRight,
  Keyboard,
  Upload,
  HelpCircle,
  X as XIcon,
  Zap,
  Eye
} from 'lucide-react';

const Github = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
  </svg>
);
import { getCurrentUser, getGitHubToken, getRepositories } from '../actions';
import FolderPicker from '@/components/FolderPicker';
import FileImporter from '@/components/FileImporter';
import FileList from '@/components/FileList';
import CompareToolbar from '@/components/CompareToolbar';
import CompareView from '@/components/CompareView';
import SideBySideCanvas from '@/components/side-by-side-canvas';
import { FileEntry, readFileText } from '@/utils/fileUtils';
import { listRepoFiles, fetchRepoFile } from '@/utils/github';
import { parseHardwareFile } from '@/lib/parsers/parser';
import { computeVisualDiff } from '@/lib/diff/diffEngine';
import { usePreview } from '@/hooks/usePreview';
import PreviewPanel from '@/components/PreviewPanel';
import InWorkspacePreview from '@/components/InWorkspacePreview';

export default function ComparePage() {
  // Authentication & GitHub states
  const [user, setUser] = useState<any | null>(null);
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [repositories, setRepositories] = useState<any[]>([]);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Tab mode: 'local' (compare local files) or 'github' (fetch from repo)
  const [mode, setMode] = useState<'local' | 'github'>('local');

  // View type: 'code' or 'visual' for hardware files
  const [viewType, setViewType] = useState<'code' | 'visual'>('code');

  // Local files state
  const [localFiles, setLocalFiles] = useState<FileEntry[]>([]);
  
  // GitHub search states
  const [selectedRepoSlug, setSelectedRepoSlug] = useState<string>('');
  const [githubOwner, setGithubOwner] = useState<string>('');
  const [githubRepo, setGithubRepo] = useState<string>('');
  const [githubRef, setGithubRef] = useState<string>('main');
  const [githubFiles, setGithubFiles] = useState<FileEntry[]>([]);
  const [loadingGithubFiles, setLoadingGithubFiles] = useState(false);

  // Core Comparison State
  const [selectedLeft, setSelectedLeft] = useState<FileEntry | null>(null);
  
  // Preview Drawer hook
  const preview = usePreview();

  const handlePreviewFile = async (file: FileEntry) => {
    let content = file.content;
    if (!content && file.file) {
      try {
        content = await readFileText(file.file);
      } catch (err) {
        console.error("Error reading local preview file content:", err);
        alert("Failed to read local file content.");
        return;
      }
    } else if (!content && !file.file) {
      // GitHub file
      try {
        const res = await fetchRepoFile(
          githubOwner,
          githubRepo,
          file.relativePath,
          githubRef,
          githubToken || undefined
        );
        content = res.content;
      } catch (err: any) {
        console.error("Failed to fetch file content for preview from GitHub:", err);
        alert(`Failed to fetch file content for preview: ${err.message || 'Check path/permissions'}`);
        return;
      }
    }
    
    preview.openPreview(file.relativePath, file.name, content);
  };
  const [selectedRight, setSelectedRight] = useState<FileEntry | null>(null);
  const [leftContent, setLeftContent] = useState<string | null>(null);
  const [rightContent, setRightContent] = useState<string | null>(null);
  const [loadingRightContent, setLoadingRightContent] = useState(false);

  // Diff Options State
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [crlfToLf, setCrlfToLf] = useState(true);
  const [additionsCount, setAdditionsCount] = useState(0);
  const [deletionsCount, setDeletionsCount] = useState(0);

  // Sidebar Toggling & Animation States
  const [isSidebarVisible, setIsSidebarVisible] = useState<boolean>(true);

  // Keyboard Shortcut Help Overlay
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);

  // Auto-detect toast state
  const [showAutoDetectToast, setShowAutoDetectToast] = useState(false);

  // Drag-over visual state for empty zone
  const [isDragOver, setIsDragOver] = useState(false);

  // Keyboard shortcut listener (Ctrl+B / Cmd+B) to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarVisible(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Keyboard shortcut listener to toggle preview (Shortcut P) and help overlay (?)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      // ? key — toggle keyboard shortcut help
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowShortcutHelp(prev => !prev);
        return;
      }

      // Esc — close help overlay
      if (e.key === 'Escape' && showShortcutHelp) {
        e.preventDefault();
        setShowShortcutHelp(false);
        return;
      }

      // P key — toggle preview
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (preview.isOpen) {
          preview.closePreview();
        } else if (selectedLeft) {
          handlePreviewFile(selectedLeft);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [preview.isOpen, selectedLeft, showShortcutHelp]);

  // Persist sidebar state per repository slug (or local mode)
  useEffect(() => {
    const key = mode === 'github' && selectedRepoSlug 
      ? `sidebar-visible-${selectedRepoSlug}` 
      : 'sidebar-visible-local';
    const persisted = localStorage.getItem(key);
    if (persisted !== null) {
      setIsSidebarVisible(persisted === 'true');
    } else {
      setIsSidebarVisible(true);
    }
  }, [mode, selectedRepoSlug]);

  const toggleSidebar = () => {
    setIsSidebarVisible(prev => {
      const next = !prev;
      const key = mode === 'github' && selectedRepoSlug 
        ? `sidebar-visible-${selectedRepoSlug}` 
        : 'sidebar-visible-local';
      localStorage.setItem(key, String(next));
      return next;
    });
  };

  // Dispatch continuous resize events during the 300ms transition to keep canvas fluid
  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
    let frameId: number;
    const startTime = performance.now();
    const tick = () => {
      window.dispatchEvent(new Event('resize'));
      if (performance.now() - startTime < 350) {
        frameId = requestAnimationFrame(tick);
      }
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isSidebarVisible]);

  // 1. Load User Session and OAuth Token
  useEffect(() => {
    async function initAuth() {
      try {
        const activeUser = await getCurrentUser();
        setUser(activeUser);
        if (activeUser) {
          const token = await getGitHubToken();
          setGithubToken(token);
          if (token) {
            const repos = await getRepositories();
            setRepositories(repos);
            if (repos.length > 0) {
              setSelectedRepoSlug(repos[0].slug);
              const [owner, repoName] = repos[0].slug.split('/');
              setGithubOwner(owner);
              setGithubRepo(repoName);
            }
          }
        }
      } catch (err) {
        console.error("Auth initialization failed:", err);
      } finally {
        setLoadingAuth(false);
      }
    }
    initAuth();
  }, []);

  // 2. Automatically load file contents for Left (File A) when selected
  useEffect(() => {
    if (!selectedLeft) {
      setLeftContent(null);
      return;
    }

    if (selectedLeft.file) {
      readFileText(selectedLeft.file)
        .then(setLeftContent)
        .catch(err => {
          console.error("Error reading local Left file text:", err);
          alert("Failed to read local file content.");
          setSelectedLeft(null);
        });
    } else if (selectedLeft.content !== undefined) {
      setLeftContent(selectedLeft.content);
    }
  }, [selectedLeft]);

  // 3. Automatically load file contents for Right (File B) when selected
  useEffect(() => {
    if (!selectedRight) {
      setRightContent(null);
      return;
    }

    // If it's a local file
    if (selectedRight.file) {
      readFileText(selectedRight.file)
        .then(setRightContent)
        .catch(err => {
          console.error("Error reading local Right file text:", err);
          alert("Failed to read local file content.");
          setSelectedRight(null);
        });
    } else if (selectedRight.content !== undefined) {
      setRightContent(selectedRight.content);
    }
  }, [selectedRight]);

  const isHardwareFile = (name?: string) => {
    if (!name) return false;
    const ext = name.split('.').pop()?.toLowerCase();
    return ext === 'kicad_pcb' || ext === 'kicad_sch' || ext === 'brd' || ext === 'sch';
  };

  // Automatically switch viewType to visual when two hardware files are loaded
  useEffect(() => {
    if (selectedLeft && selectedRight && isHardwareFile(selectedLeft.name) && isHardwareFile(selectedRight.name)) {
      setViewType('visual');
      setShowAutoDetectToast(true);
      const timer = setTimeout(() => setShowAutoDetectToast(false), 4000);
      return () => clearTimeout(timer);
    } else {
      setViewType('code');
    }
  }, [selectedLeft, selectedRight]);

  const canShowVisualDiff = selectedLeft && selectedRight && 
                            isHardwareFile(selectedLeft.name) && 
                            isHardwareFile(selectedRight.name) &&
                            leftContent !== null && rightContent !== null;

  let clientDiffData: any = null;
  let visualDiffError: string | null = null;

  if (canShowVisualDiff) {
    try {
      const oldData = parseHardwareFile(selectedLeft.name, leftContent || '');
      const newData = parseHardwareFile(selectedRight.name, rightContent || '');
      clientDiffData = computeVisualDiff(oldData, newData);
    } catch (err: any) {
      console.error("Failed to parse or diff files for visual rendering:", err);
      visualDiffError = err.message || "Failed to generate visual diff";
    }
  }

  // 4. Handle Repo slug selection from dropdown
  const handleRepoDropdownChange = (slug: string) => {
    setSelectedRepoSlug(slug);
    if (slug) {
      const [owner, repoName] = slug.split('/');
      setGithubOwner(owner);
      setGithubRepo(repoName);
    }
  };

  // 5. Fetch GitHub File List
  const handleFetchGithubFiles = async () => {
    if (!githubOwner.trim() || !githubRepo.trim()) {
      alert("Please enter both Owner and Repository name.");
      return;
    }

    setLoadingGithubFiles(true);
    setGithubFiles([]);
    try {
      const entries = await listRepoFiles(
        githubOwner.trim(),
        githubRepo.trim(),
        githubRef.trim(),
        githubToken || undefined
      );

      // Convert GitHubFileEntry to FileEntry
      const fileEntries: FileEntry[] = entries.map(entry => ({
        name: entry.name,
        relativePath: entry.path,
        size: entry.size || 0,
        lastModified: Date.now(),
        isBinary: false, // We will evaluate binary content on-demand or based on file extension
      }));

      setGithubFiles(fileEntries);
    } catch (err: any) {
      console.error("Failed to load repo files:", err);
      alert(`Failed to fetch file list: ${err.message || 'Check owner/repo configuration and authorization status'}`);
    } finally {
      setLoadingGithubFiles(false);
    }
  };

  // 6. Handle selection of Right File (can be local or GitHub)
  const handleSelectRight = async (file: FileEntry | null) => {
    if (!file) {
      setSelectedRight(null);
      setRightContent(null);
      return;
    }

    // Check if it's a remote GitHub file
    if (!file.file && file.content === undefined) {
      setLoadingRightContent(true);
      try {
        const { content, size } = await fetchRepoFile(
          githubOwner,
          githubRepo,
          file.relativePath,
          githubRef,
          githubToken || undefined
        );
        
        // Update selection with content cache
        const updatedFile = { ...file, content, size };
        setSelectedRight(updatedFile);
      } catch (err: any) {
        console.error("Failed to fetch file from GitHub:", err);
        alert(`Failed to fetch file content from GitHub: ${err.message || 'Verify path and permissions'}`);
      } finally {
        setLoadingRightContent(false);
      }
    } else {
      setSelectedRight(file);
    }
  };

  // 7. Shortcut: Compare selected Local file with the same path from GitHub
  const handleCompareWithGithubVersion = async () => {
    if (!selectedLeft) {
      alert("Please select a local file first.");
      return;
    }
    if (!githubOwner.trim() || !githubRepo.trim()) {
      alert("Please configure/select a GitHub repository first.");
      return;
    }

    setLoadingRightContent(true);
    try {
      const path = selectedLeft.relativePath;
      const { content, size } = await fetchRepoFile(
        githubOwner.trim(),
        githubRepo.trim(),
        path,
        githubRef.trim(),
        githubToken || undefined
      );

      const githubFile: FileEntry = {
        name: selectedLeft.name,
        relativePath: path,
        size,
        lastModified: Date.now(),
        isBinary: selectedLeft.isBinary,
        content
      };

      setSelectedRight(githubFile);
    } catch (err: any) {
      console.error("Local vs GitHub shortcut fetch failed:", err);
      alert(`Could not fetch the corresponding file '${selectedLeft.relativePath}' from the repository: ${err.message || 'Check if file exists in the specified branch.'}`);
    } finally {
      setLoadingRightContent(false);
    }
  };

  // 8. Swap operands
  const handleSwap = () => {
    const tempLeft = selectedLeft;
    const tempRight = selectedRight;
    const tempLeftContent = leftContent;
    const tempRightContent = rightContent;

    setSelectedLeft(tempRight);
    setSelectedRight(tempLeft);
    setLeftContent(tempRightContent);
    setRightContent(tempLeftContent);
  };

  // 9. Reset comparison workspace
  const handleClear = () => {
    setSelectedLeft(null);
    setSelectedRight(null);
    setLeftContent(null);
    setRightContent(null);
  };

  // 10. Import local files
  const handleImportLocalFiles = (newFiles: FileEntry[]) => {
    // Deduplicate and append
    setLocalFiles(prev => {
      const merged = [...prev];
      newFiles.forEach(nf => {
        const idx = merged.findIndex(f => f.relativePath === nf.relativePath);
        if (idx !== -1) {
          merged[idx] = nf; // Overwrite duplicate
        } else {
          merged.push(nf);
        }
      });
      return merged;
    });
  };

  // 11. Download Patch Diff
  const handleDownloadDiff = () => {
    if (!selectedLeft || !selectedRight || leftContent === null || rightContent === null) return;
    
    // Generate simple unified diff header patch
    const patchContent = `--- A/${selectedLeft.relativePath}\n+++ B/${selectedRight.relativePath}\n` + 
                         `# Generated by CadLab Compare Studio\n\n` + 
                         `// Reference diff output is loaded in the viewer.`;
    
    const blob = new Blob([patchContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedLeft.name}_vs_${selectedRight.name}.diff`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#0b0f19] text-[#f8fafc]">
      {/* Top Navbar */}
      <header className="h-14 shrink-0 glass-panel border-b border-slate-800/80 px-6 flex items-center justify-between z-20">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:text-white transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <button
            onClick={toggleSidebar}
            title="Toggle Sidebar (Ctrl+B)"
            aria-label="Toggle Sidebar"
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              Compare Studio
            </h1>
            <p className="text-[10px] text-slate-500 font-medium">Side-by-side local & remote file diffs</p>
          </div>
        </div>

        {/* User Auth Status Info */}
        <div className="flex items-center gap-3">
          {loadingAuth ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
          ) : user ? (
            <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-900/60 border border-slate-800 rounded-lg text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              <span className="text-slate-300 font-medium">{user.name}</span>
            </div>
          ) : (
            <a
              href="/api/auth/github"
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 rounded-lg cursor-pointer transition-all"
            >
              <Github className="w-3.5 h-3.5" />
              <span>Connect GitHub</span>
            </a>
          )}
        </div>
      </header>

      {/* Main Workspace Area */}
      <main className="flex-1 flex overflow-hidden p-6">
        
        {/* Sidebar Reveal Handle (visible when sidebar hidden) */}
        {!isSidebarVisible && (
          <div
            onClick={toggleSidebar}
            onKeyDown={(e) => e.key === 'Enter' && toggleSidebar()}
            role="button"
            tabIndex={0}
            aria-label="Show sidebar (Ctrl+B)"
            title="Show sidebar (Ctrl+B)"
            className="shrink-0 w-2 h-full flex items-center justify-center cursor-pointer group transition-all duration-200 mr-1 rounded-full"
          >
            <div className="w-full h-full rounded-full bg-slate-800/30 group-hover:bg-blue-500/10 transition-all relative flex items-center justify-center">
              <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all absolute" />
            </div>
          </div>
        )}

        {/* SIDEBAR Panel: File Lists, Fetchers, & Configs */}
        <aside className={`shrink-0 flex flex-col gap-4 overflow-hidden h-full transition-all duration-300 ease-in-out ${
          isSidebarVisible ? 'w-80 opacity-100 mr-6' : 'w-0 opacity-0 pointer-events-none mr-0'
        }`}>
          
          {/* Tab Selector */}
          <div className="flex bg-slate-950/40 p-1 border border-slate-800/80 rounded-xl">
            <button
              onClick={() => setMode('local')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-all ${
                mode === 'local'
                  ? "bg-slate-800 text-white shadow-sm border border-slate-700/60"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Local Files
            </button>
            <button
              onClick={() => setMode('github')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-all ${
                mode === 'github'
                  ? "bg-slate-800 text-white shadow-sm border border-slate-700/60"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              GitHub Repo
            </button>
          </div>

          {/* Configuration Panel depending on active tab */}
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            
            {mode === 'local' ? (
              // LOCAL FILES INTERFACE
              <div className="flex flex-col gap-4 flex-1 overflow-hidden">
                <div className="flex flex-col gap-2 shrink-0">
                  <FolderPicker onFolderSelected={handleImportLocalFiles} className="w-full" />
                  <FileImporter onFilesImported={handleImportLocalFiles} className="w-full" />
                </div>
                
                <div className="flex-1 overflow-hidden">
                  <FileList
                    files={localFiles}
                    selectedLeft={selectedLeft}
                    selectedRight={selectedRight}
                    onSelectLeft={setSelectedLeft}
                    onSelectRight={handleSelectRight}
                    onRemoveFile={(idx) => setLocalFiles(prev => prev.filter((_, i) => i !== idx))}
                    onClearAll={() => setLocalFiles([])}
                    onPreviewFile={handlePreviewFile}
                  />
                </div>
              </div>
            ) : (
              // GITHUB INTERFACE
              <div className="flex flex-col gap-4 flex-1 overflow-hidden">
                <div className="glass-panel rounded-xl p-4 flex flex-col gap-3 shrink-0 text-xs">
                  
                  {/* Repo Dropdown (Authenticated User) */}
                  {repositories.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <label className="text-slate-400 font-medium">Select Repository</label>
                      <select
                        value={selectedRepoSlug}
                        title="Select Repository"
                        onChange={(e) => handleRepoDropdownChange(e.target.value)}
                        className="bg-slate-900 border border-slate-700/80 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-blue-500"
                      >
                        <option value="">-- Choose Repository --</option>
                        {repositories.map(repo => (
                          <option key={repo.id} value={repo.slug}>
                            {repo.name} {repo.isPrivate ? "🔒" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Manual Owner / Repo Input */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-slate-400 font-medium">Owner</label>
                      <input
                        type="text"
                        placeholder="e.g. facebook"
                        value={githubOwner}
                        onChange={(e) => setGithubOwner(e.target.value)}
                        className="bg-slate-900 border border-slate-700/80 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-slate-400 font-medium">Repository</label>
                      <input
                        type="text"
                        placeholder="e.g. react"
                        value={githubRepo}
                        onChange={(e) => setGithubRepo(e.target.value)}
                        className="bg-slate-900 border border-slate-700/80 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* Ref/Branch */}
                  <div className="flex flex-col gap-1">
                    <label className="text-slate-400 font-medium">Branch / Commit SHA</label>
                    <input
                      type="text"
                      placeholder="main"
                      value={githubRef}
                      onChange={(e) => setGithubRef(e.target.value)}
                      className="bg-slate-900 border border-slate-700/80 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Fetch Button */}
                  <button
                    onClick={handleFetchGithubFiles}
                    disabled={loadingGithubFiles || !githubOwner || !githubRepo}
                    className="w-full flex items-center justify-center gap-1.5 py-2 mt-1.5 bg-slate-900 border border-slate-700/80 hover:bg-slate-800 hover:border-slate-600 text-slate-200 rounded-lg font-semibold cursor-pointer transition-all disabled:opacity-50"
                  >
                    {loadingGithubFiles ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Fetching files...</span>
                      </>
                    ) : (
                      <>
                        <Globe className="w-3.5 h-3.5" />
                        <span>Load Repository Tree</span>
                      </>
                    )}
                  </button>
                </div>

                {/* GitHub File List */}
                <div className="flex-1 overflow-hidden">
                  <FileList
                    files={githubFiles}
                    selectedLeft={selectedLeft}
                    selectedRight={selectedRight}
                    onSelectLeft={setSelectedLeft}
                    onSelectRight={handleSelectRight}
                    onPreviewFile={handlePreviewFile}
                  />
                </div>
              </div>
            )}
            
          </div>
        </aside>

        {/* COMPARISON PANELS (TOOLBAR + VIEW) */}
        <section className="flex-1 flex flex-col gap-4 overflow-hidden h-full">
          
          {/* Toolbar */}
          <CompareToolbar
            onSwap={handleSwap}
            ignoreWhitespace={ignoreWhitespace}
            setIgnoreWhitespace={setIgnoreWhitespace}
            crlfToLf={crlfToLf}
            setCrlfToLf={setCrlfToLf}
            onClear={handleClear}
            leftName={selectedLeft?.relativePath || null}
            rightName={selectedRight?.relativePath || null}
            additionsCount={additionsCount}
            deletionsCount={deletionsCount}
            onDownloadDiff={handleDownloadDiff}
          />

          {/* Quick Comparison Shortcuts */}
          {selectedLeft && mode === 'github' && !selectedRight && (
            <div className="shrink-0 flex items-center justify-between p-3.5 bg-blue-950/20 border border-blue-900/30 rounded-xl text-xs">
              <span className="text-slate-300">
                You selected local file <strong className="text-blue-400 font-semibold">{selectedLeft.name}</strong>. Compare it with the repo version?
              </span>
              <button
                onClick={handleCompareWithGithubVersion}
                disabled={loadingRightContent || !githubOwner || !githubRepo}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold cursor-pointer transition-all disabled:opacity-50"
              >
                {loadingRightContent ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                )}
                <span>Compare with GitHub version</span>
              </button>
            </div>
          )}

          {/* Loading Right Content indicator */}
          {loadingRightContent && (
            <div className="shrink-0 flex items-center justify-center p-4 bg-slate-900/40 border border-slate-800 rounded-xl text-xs text-slate-400 gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <span>Fetching remote file content from GitHub...</span>
            </div>
          )}

          {/* View Mode Toggle (Visual vs Code) */}
          {canShowVisualDiff && (
            <div className="flex bg-slate-950/40 p-1 border border-slate-800/80 rounded-xl max-w-[200px] self-end">
              <button
                onClick={() => setViewType('visual')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-all ${
                  viewType === 'visual'
                    ? "bg-slate-800 text-white shadow-sm border border-slate-700/60"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Visual Diff
              </button>
              <button
                onClick={() => setViewType('code')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-all ${
                  viewType === 'code'
                    ? "bg-slate-800 text-white shadow-sm border border-slate-700/60"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Code Diff
              </button>
            </div>
          )}

          {/* Auto-detect toast */}
          {showAutoDetectToast && (
            <div className="shrink-0 flex items-center justify-between p-3 bg-blue-950/25 border border-blue-900/30 rounded-xl text-xs animate-fade-in">
              <div className="flex items-center gap-2">
                <Eye className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-slate-300">
                  Hardware files detected — switched to <strong className="text-blue-400">Visual Diff</strong> mode
                </span>
              </div>
              <button
                onClick={() => { setViewType('code'); setShowAutoDetectToast(false); }}
                className="text-blue-400 hover:text-blue-300 text-[10px] font-semibold underline underline-offset-2 cursor-pointer transition-colors"
              >
                Switch to Code
              </button>
            </div>
          )}

          {/* Side-by-Side Diff Component or Canvas */}
          <div 
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setIsDragOver(false);
              const files = e.dataTransfer.files;
              if (files && files.length > 0) {
                const file = files[0];
                try {
                  const content = await readFileText(file);
                  preview.openPreview(file.name, file.name, content);
                } catch (err) {
                  console.error("Error reading dropped file:", err);
                  alert("Failed to read dropped file.");
                }
              }
            }}
            className={`flex-1 min-h-[400px] flex overflow-hidden transition-all duration-200 ${isDragOver ? 'drop-zone-active rounded-2xl' : ''}`}
          >
            {preview.isOpen ? (
              <div className="flex-1 flex overflow-hidden gap-4">
                <div className="flex-1 flex overflow-hidden border border-slate-800 rounded-2xl bg-slate-950/40">
                  <InWorkspacePreview
                    fileName={preview.fileName || ''}
                    data={preview.data}
                    onClose={preview.closePreview}
                    projectSlug={(mode === 'github' && selectedRepoSlug) ? selectedRepoSlug : 'local'}
                    preview={preview}
                  />
                </div>
                {canShowVisualDiff && viewType === 'visual' && !visualDiffError && clientDiffData && (
                  <div className="flex-1 flex overflow-hidden border border-slate-800 rounded-2xl bg-slate-950/40">
                    <SideBySideCanvas
                      diffData={clientDiffData}
                      projectSlug={mode === 'github' ? selectedRepoSlug : 'local'}
                      preview={preview}
                    />
                  </div>
                )}
              </div>
            ) : canShowVisualDiff && viewType === 'visual' ? (
              visualDiffError ? (
                <div className="flex-1 glass-panel rounded-2xl flex flex-col items-center justify-center p-8 text-center min-h-[400px] border-slate-800/80 bg-slate-950/20">
                  <div className="text-red-500 font-semibold mb-2">Failed to render visual diff</div>
                  <div className="text-xs text-slate-500 max-w-md font-mono">{visualDiffError}</div>
                </div>
              ) : (
                clientDiffData && (
                  <SideBySideCanvas
                    diffData={clientDiffData}
                    projectSlug={mode === 'github' ? selectedRepoSlug : 'local'}
                    preview={preview}
                  />
                )
              )
            ) : !selectedLeft && !selectedRight ? (
              /* ── Rich Empty State / Onboarding ── */
              <div className={`flex-1 glass-panel rounded-2xl flex flex-col items-center justify-center p-10 text-center border-2 border-dashed transition-all duration-300 ${
                isDragOver ? 'border-blue-500/50 bg-blue-950/10' : 'border-slate-800/50 bg-slate-950/20'
              }`}>
                <div className="animate-float-subtle mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/20 flex items-center justify-center">
                    <Upload className="w-7 h-7 text-blue-400/80" />
                  </div>
                </div>

                <h3 className="text-lg font-bold text-slate-200 mb-2">Start Comparing</h3>
                <p className="text-xs text-slate-500 max-w-md mb-6 leading-relaxed">
                  Select files from the sidebar, drag & drop files here, or connect a GitHub repository to begin side-by-side comparison.
                </p>

                {/* Supported format badges */}
                <div className="flex flex-wrap gap-2 mb-6 justify-center">
                  {[
                    { label: '.kicad_pcb', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
                    { label: '.kicad_sch', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
                    { label: '.brd', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
                    { label: '.sch', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
                    { label: 'Any text file', color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
                  ].map(fmt => (
                    <span key={fmt.label} className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${fmt.color}`}>
                      {fmt.label}
                    </span>
                  ))}
                </div>

                {/* Quick action hints */}
                <div className="flex flex-col gap-1.5 text-[10px] text-slate-600">
                  <div className="flex items-center gap-2">
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 font-mono text-[9px]">Ctrl+B</kbd>
                    <span>Toggle sidebar</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 font-mono text-[9px]">P</kbd>
                    <span>Preview selected file</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 font-mono text-[9px]">?</kbd>
                    <span>Show all keyboard shortcuts</span>
                  </div>
                </div>
              </div>
            ) : (
              <CompareView
                leftFile={selectedLeft}
                rightFile={selectedRight}
                leftContent={leftContent}
                rightContent={rightContent}
                ignoreWhitespace={ignoreWhitespace}
                crlfToLf={crlfToLf}
                onStatsComputed={(adds, dels) => {
                  setAdditionsCount(adds);
                  setDeletionsCount(dels);
                }}
              />
            )}
          </div>
        </section>

      </main>

      {/* ── Keyboard Shortcut Help Overlay ── */}
      {showShortcutHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setShowShortcutHelp(false)}>
          <div className="glass-panel rounded-2xl p-6 max-w-md w-full mx-4 border border-slate-700/60 animate-scale-in shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold text-slate-200">Keyboard Shortcuts</h3>
              </div>
              <button onClick={() => setShowShortcutHelp(false)} className="p-1 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-white transition-all cursor-pointer" title="Close keyboard shortcut help">
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {[
                { section: 'Navigation', shortcuts: [
                  { keys: 'Ctrl+B', desc: 'Toggle sidebar' },
                  { keys: 'P', desc: 'Toggle file preview' },
                  { keys: '?', desc: 'Show / hide this help' },
                  { keys: 'Esc', desc: 'Close overlays & modals' },
                ]},
                { section: 'Zoom (Visual Diff)', shortcuts: [
                  { keys: 'Alt+1', desc: 'Zoom in left panel' },
                  { keys: 'Alt+2', desc: 'Zoom out left panel' },
                  { keys: 'Alt+3', desc: 'Zoom in right panel' },
                  { keys: 'Alt+4', desc: 'Zoom out right panel' },
                  { keys: 'Alt+L', desc: 'Toggle sync lock' },
                ]},
                { section: 'Display', shortcuts: [
                  { keys: 'Ctrl+\\', desc: 'Toggle panel border' },
                ]},
              ].map(group => (
                <div key={group.section}>
                  <div className="text-[9px] uppercase tracking-widest text-slate-600 font-bold mb-2">{group.section}</div>
                  <div className="space-y-1.5">
                    {group.shortcuts.map(s => (
                      <div key={s.keys} className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">{s.desc}</span>
                        <kbd className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-slate-300 font-mono text-[10px] min-w-[48px] text-center">{s.keys}</kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 pt-3 border-t border-slate-800/60 text-center">
              <span className="text-[10px] text-slate-600">Press <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 font-mono text-[9px]">?</kbd> or <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 font-mono text-[9px]">Esc</kbd> to close</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
