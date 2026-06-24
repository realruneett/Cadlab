"use client";

import React, { useEffect, useState } from 'react';
import {
  getCurrentUser,
  logoutUser,
  getRepositories,
  getCommits,
  getFiles,
  getParsedFile,
  getVisualDiff,
  getAnnotations,
  addAnnotation,
  resolveAnnotation,
  persistTokenToDatabase
} from './actions';
import { ParsedHardwareData } from '@/lib/parsers/parser';
import { DiffedHardwareData } from '@/lib/diff/diffEngine';
import HardwareCanvas from '@/components/hardware-canvas';
import DiffCanvas from '@/components/diff-canvas';
import SideBySideCanvas from '@/components/side-by-side-canvas';
import {
  GitBranch,
  GitCommit,
  Layers,
  MessageSquare,
  FileCode,
  Sliders,
  Plus,
  RotateCw,
  FolderOpen,
  Database,
  X,
  Lock,
  ChevronRight,
  Eye,
  EyeOff,
  LogOut,
  ArrowRightLeft
} from 'lucide-react';

const Github = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
  </svg>
);

export default function Dashboard() {
  const [user, setUser] = useState<any | null>(null);
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true);

  // Core Data Lists
  const [repositories, setRepositories] = useState<any[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<any | null>(null);
  const [commits, setCommits] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);

  // Selection states (supports full unconstrained arbitrary comparison modeling)
  const [commitA, setCommitA] = useState<string>(''); // Base / Older Commit reference
  const [commitB, setCommitB] = useState<string>(''); // Head / Newer Target reference
  const [selectedFile, setSelectedFile] = useState<string>('');
  
  // Render pipeline tracking
  const [parsedData, setParsedData] = useState<ParsedHardwareData | null>(null);
  const [diffData, setDiffData] = useState<DiffedHardwareData | null>(null);
  const [visibleLayers, setVisibleLayers] = useState<string[]>([]);
  const [isDiffMode, setIsDiffMode] = useState<boolean>(false);
  const [opacity, setOpacity] = useState<number>(0.5);

  // Toggle modes for comparison display style and timeline scope
  const [diffDisplayMode, setDiffDisplayMode] = useState<'overlay' | 'sideBySide'>('overlay');
  const [diffScope, setDiffScope] = useState<'overall' | 'commit'>('overall');

  // Annotations
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [reviewMode, setReviewMode] = useState<boolean>(false);
  const [isAddingAnnotation, setIsAddingAnnotation] = useState<boolean>(false);
  const [pendingCoords, setPendingCoords] = useState<{ x: number; y: number } | null>(null);
  const [commentText, setCommentText] = useState<string>('');

  // 1. Initial Authentication validation checks
  useEffect(() => {
    async function checkAuth() {
      try {
        const activeUser = await getCurrentUser();
        setUser(activeUser);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingAuth(false);
      }
    }
    checkAuth();
  }, []);

  // 2. Fetch remote repos upon verified OAuth verification
  useEffect(() => {
    if (!user) return;
    async function loadRepos() {
      const repos = await getRepositories();
      setRepositories(repos);
      if (repos.length > 0) setSelectedRepo(repos[0]);
    }
    loadRepos();
  }, [user]);

  // 3. Fetch active commit history logs
  useEffect(() => {
    if (!selectedRepo) return;
    async function loadCommits() {
      try {
        const list = await getCommits(selectedRepo.id);
        setCommits(list);
        if (list.length > 0) {
          setCommitB(list[0].hash); // Set latest as default Target B
          setCommitA(list[1]?.hash || list[0].hash); // Fallback to same if single commit
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadCommits();
  }, [selectedRepo]);

  // 3b. Automatically select parent commit for 'per-commit' scope comparison
  useEffect(() => {
    if (diffScope === 'commit' && commitB && commits.length > 0) {
      const idx = commits.findIndex(c => c.hash === commitB);
      if (idx !== -1 && idx + 1 < commits.length) {
        setCommitA(commits[idx + 1].hash);
      } else {
        setCommitA(commitB); // Fallback to same if first commit
      }
    }
  }, [diffScope, commitB, commits]);

  // 4. Fetch structural folder design items mapping to current selections
  useEffect(() => {
    if (!selectedRepo || !commitB) return;
    async function loadFiles() {
      try {
        const list = await getFiles(selectedRepo.id, commitB);
        setFiles(list);
        if (list.length > 0 && !list.some(f => f.path === selectedFile)) {
          setSelectedFile(list[0].path);
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadFiles();
  }, [selectedRepo, commitB]);

  // 5. Build calculations and update layout elements
  useEffect(() => {
    if (!selectedRepo || !commitB || !selectedFile) return;

    async function loadFileData() {
      setParsedData(null);
      setDiffData(null);
      try {
        if (isDiffMode && commitA) {
          const diff = await getVisualDiff(selectedRepo.id, commitA, commitB, selectedFile);
          setDiffData(diff);
          if (diff.type === 'pcb') setVisibleLayers(diff.layers);
        } else {
          const parsed = await getParsedFile(selectedRepo.id, commitB, selectedFile);
          setParsedData(parsed);
          if (parsed.type === 'pcb') setVisibleLayers((parsed as any).layers);
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadFileData();
  }, [selectedRepo, commitA, commitB, selectedFile, isDiffMode]);

  // 6. Fetch annotations mapping
  useEffect(() => {
    if (!commitB || !selectedFile) return;
    async function loadAnnotations() {
      const list = await getAnnotations(commitB, selectedFile);
      setAnnotations(list);
    }
    loadAnnotations();
  }, [commitB, selectedFile]);

  const handleToggleLayer = (layerName: string) => {
    setVisibleLayers(p => p.includes(layerName) ? p.filter(l => l !== layerName) : [...p, layerName]);
  };

  const handleSubmitAnnotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !pendingCoords || !selectedFile || !commitB) return;
    const activeLayer = visibleLayers.length > 0 ? visibleLayers[0] : 'Top';
    try {
      const newAnn = await addAnnotation(commitB, selectedFile, activeLayer, pendingCoords.x, pendingCoords.y, commentText);
      setAnnotations(prev => [...prev, newAnn]);
      setCommentText('');
      setIsAddingAnnotation(false);
      setPendingCoords(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleResolve = async (annotationId: string) => {
    try {
      await resolveAnnotation(annotationId);
      setAnnotations(prev => prev.filter(a => a.id !== annotationId));
      if (selectedAnnotationId === annotationId) {
        setSelectedAnnotationId(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePersistToken = async () => {
    try {
      const updatedUser = await persistTokenToDatabase();
      setUser(updatedUser);
      alert("GitHub connection successfully saved to database!");
    } catch (err) {
      console.error(err);
      alert("Failed to save connection to database.");
    }
  };

  if (loadingAuth) {
    return (
      <div className="h-screen w-screen bg-[#080b13] flex items-center justify-center text-slate-400 font-mono">
        <RotateCw className="w-6 h-6 animate-spin text-cyan-400 mr-2" /> Initializing Cloud Workspace...
      </div>
    );
  }

  // Render Login Splash Screen if User is missing session details
  if (!user) {
    return (
      <div className="h-screen w-screen bg-[#080b13] flex flex-col items-center justify-center text-slate-100 px-4 antialiased">
        <div className="w-full max-w-md bg-slate-950/80 p-8 rounded-2xl border border-slate-800 text-center space-y-6 shadow-2xl backdrop-blur-lg">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-emerald-500 flex items-center justify-center font-bold text-slate-900 text-2xl mx-auto shadow-[0_0_30px_rgba(6,182,212,0.3)]">
            CL
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-slate-50 to-slate-300 bg-clip-text text-transparent">Connect to CADLAB.io</h1>
            <p className="text-xs text-slate-400">Git-Driven Multi-Layer Visual Hardware Reviews</p>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Authorize via GitHub to directly sync your design layouts. Works natively with public and private hardware projects across branches and commits.
          </p>
          <a
            href="/api/auth/github"
            className="w-full py-3 bg-slate-100 hover:bg-white text-slate-950 font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg group cursor-pointer"
          >
            <Github className="w-4 h-4" />
            Continue with GitHub
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[#080b13] text-slate-100 antialiased overflow-hidden">
      {/* Top App Bar */}
      <header className="h-14 min-h-[56px] border-b border-slate-800 bg-slate-950/75 backdrop-blur-md px-6 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-emerald-500 flex items-center justify-center font-bold text-slate-900 shadow-[0_0_15px_rgba(6,182,212,0.4)]">CL</div>
          <div>
            <span className="font-bold text-sm block">CADLAB.io</span>
            <p className="text-[10px] text-slate-500 -mt-0.5">Connected as {user.name}</p>
          </div>
        </div>

        {/* Repository Switcher & DB Persist Button */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-400" />
            <select
              value={selectedRepo?.id || ''}
              onChange={(e) => setSelectedRepo(repositories.find(r => r.id === e.target.value))}
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1 text-xs font-semibold cursor-pointer outline-none focus:border-cyan-500"
              title="Select repository"
              aria-label="Select repository"
            >
              {repositories.map(repo => (
                <option key={repo.id} value={repo.id}>{repo.slug}</option>
              ))}
            </select>
            {selectedRepo?.isPrivate && <Lock className="w-3 h-3 text-slate-500" />}
          </div>

          {user && !user.accessToken && (
            <button
              onClick={handlePersistToken}
              className="px-2.5 py-1 bg-gradient-to-tr from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-[10px] rounded-lg shadow-md transition-all flex items-center gap-1 cursor-pointer"
              title="Save GitHub connection to Database"
            >
              <Database className="w-3 h-3" /> Save Connection to DB
            </button>
          )}
        </div>

        <button 
          onClick={async () => { await logoutUser(); window.location.reload(); }}
          className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer"
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* Main UI Body Frame */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Side Navigation Panel */}
        <aside className="w-80 border-r border-slate-900 bg-slate-950/40 flex flex-col shrink-0">
          <div className="p-4 border-b border-slate-900/60 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 font-mono tracking-wider uppercase flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-cyan-400" /> Commit Diff Navigator
              </span>
              <button
                onClick={() => setIsDiffMode(!isDiffMode)}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-all border ${
                  isDiffMode ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}
              >
                {isDiffMode ? 'Diff Mode Active' : 'Enable Diff View'}
              </button>
            </div>

            {/* Unconstrained Target Picker Framework */}
            <div className="space-y-2.5 bg-slate-950/80 p-2.5 rounded-lg border border-slate-900 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-500 block uppercase">Target Commit B (Newer Head)</label>
                <select 
                  value={commitB} 
                  onChange={(e) => setCommitB(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 px-2 py-1 rounded text-slate-300 outline-none cursor-pointer"
                  title="Target commit B"
                  aria-label="Target commit B"
                >
                  {commits.map(c => <option key={c.hash} value={c.hash}>{c.message.slice(0, 30)}... [{c.hash.slice(0,6)}]</option>)}
                </select>
              </div>

              {isDiffMode && (
                <>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-900">
                    <span className="text-[9px] text-slate-500 font-mono uppercase">Diff Scope:</span>
                    <div className="flex gap-1 bg-slate-900 p-0.5 rounded border border-slate-800">
                      <button
                        onClick={() => setDiffScope('commit')}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-semibold transition-all cursor-pointer ${
                          diffScope === 'commit' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Per Commit
                      </button>
                      <button
                        onClick={() => setDiffScope('overall')}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-semibold transition-all cursor-pointer ${
                          diffScope === 'overall' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Overall
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-900">
                    <span className="text-[9px] text-slate-500 font-mono uppercase">Layout style:</span>
                    <div className="flex gap-1 bg-slate-900 p-0.5 rounded border border-slate-800">
                      <button
                        onClick={() => setDiffDisplayMode('overlay')}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-semibold transition-all cursor-pointer ${
                          diffDisplayMode === 'overlay' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Overlay
                      </button>
                      <button
                        onClick={() => setDiffDisplayMode('sideBySide')}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-semibold transition-all cursor-pointer ${
                          diffDisplayMode === 'sideBySide' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Split View
                      </button>
                    </div>
                  </div>

                  {diffScope === 'overall' && (
                    <div className="space-y-1 pt-1 border-t border-slate-900">
                      <label className="text-[10px] font-mono text-slate-500 block uppercase">Base Commit A (Older Root)</label>
                      <select 
                        value={commitA} 
                        onChange={(e) => setCommitA(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 px-2 py-1 rounded text-slate-300 outline-none cursor-pointer"
                        title="Base commit A"
                        aria-label="Base commit A"
                      >
                        {commits.map(c => <option key={c.hash} value={c.hash}>{c.message.slice(0, 30)}... [{c.hash.slice(0,6)}]</option>)}
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Core Repository File Navigation Structure */}
          <div className="p-4 flex-1 flex flex-col overflow-hidden">
            <span className="text-[11px] font-bold text-slate-400 font-mono tracking-wider uppercase mb-3 flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-yellow-500" /> Layer File Hierarchy
            </span>
            <div className="space-y-1 overflow-y-auto flex-1">
              {files.map(file => {
                const isSelected = selectedFile === file.path;
                return (
                  <div
                    key={file.path}
                    onClick={() => setSelectedFile(file.path)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs font-mono border ${
                      isSelected ? 'bg-slate-900 border-slate-800 text-cyan-400 font-semibold' : 'border-transparent text-slate-400 hover:bg-slate-900/20'
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate" title={file.path}>{file.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Center Interactive Drawing Canvas Panel */}
        <main className="flex-1 bg-[#090c15] p-6 flex flex-col overflow-hidden relative">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold tracking-tight">
                {selectedFile ? selectedFile.split('/').pop() : 'No File Active'}
              </h2>
              <p className="text-xs text-slate-500 font-mono">
                {isDiffMode ? `diff: ${commitA.slice(0,7)} ➔ ${commitB.slice(0,7)}` : `rev: ${commitB.slice(0,7)}`}
              </p>
            </div>

            {isDiffMode && diffData && diffDisplayMode === 'overlay' && (
              <div className="bg-slate-950 px-4 py-1.5 rounded-xl border border-slate-800 flex items-center gap-4 text-xs font-mono">
                <span className="text-red-400">Rev A (Red)</span>
                <input
                  type="range" min="0" max="1" step="0.01" value={opacity}
                  onChange={(e) => setOpacity(parseFloat(e.target.value))}
                  className="w-32 h-1 bg-slate-800 rounded-lg appearance-none accent-emerald-500 cursor-pointer"
                  title="Opacity blending slider"
                  aria-label="Opacity blending slider"
                />
                <span className="text-emerald-400">Rev B (Green)</span>
              </div>
            )}
          </div>

          <div className="flex-1 relative min-h-0">
            {isDiffMode && diffData ? (
              diffDisplayMode === 'sideBySide' ? (
                <SideBySideCanvas diffData={diffData} visibleLayers={visibleLayers} />
              ) : (
                <DiffCanvas diffData={diffData} visibleLayers={visibleLayers} opacity={opacity} />
              )
            ) : parsedData ? (
              <HardwareCanvas
                data={parsedData} visibleLayers={visibleLayers} annotations={annotations}
                selectedAnnotationId={selectedAnnotationId} reviewMode={reviewMode}
                onAddAnnotation={(x, y) => { setPendingCoords({ x, y }); setIsAddingAnnotation(true); }}
                onSelectAnnotation={setSelectedAnnotationId}
              />
            ) : (
              <div className="w-full h-full rounded-xl border border-slate-800 bg-slate-950/30 flex flex-col items-center justify-center text-slate-500 gap-2 font-mono text-xs">
                <RotateCw className="w-6 h-6 animate-spin" /> Querying remote board layout objects...
              </div>
            )}

            {/* Float dialog wrapper for dropping comment pin overlays */}
            {isAddingAnnotation && pendingCoords && (
              <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm z-20 flex items-center justify-center p-4">
                <form onSubmit={handleSubmitAnnotation} className="w-full max-w-sm bg-slate-900 border border-slate-700 p-5 rounded-xl space-y-4">
                  <h3 className="font-bold text-xs flex items-center gap-1.5"><MessageSquare className="w-4 h-4 text-cyan-400" /> Drop Layout Annotation</h3>
                  <textarea
                    required rows={3} value={commentText} onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Enter visual review notes..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                  <div className="flex gap-2 justify-end text-xs font-semibold">
                    <button type="button" onClick={() => setIsAddingAnnotation(false)} className="px-3 py-1 bg-slate-800 rounded">Cancel</button>
                    <button type="submit" className="px-3 py-1 bg-cyan-500 text-slate-950 font-bold rounded">Pin Comment</button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </main>

        {/* Right Panel: Layer Visibility Panels & Pin Tracking Threads */}
        <aside className="w-80 border-l border-slate-900 bg-slate-950/40 flex flex-col shrink-0 overflow-y-auto">
          {visibleLayers.length > 0 && (
            <div className="p-4 border-b border-slate-900/60">
              <span className="text-[11px] font-bold text-slate-400 font-mono tracking-wider uppercase flex items-center gap-1.5 mb-3">
                <Layers className="w-3.5 h-3.5 text-cyan-400" /> Interactive Layer Filters
              </span>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {visibleLayers.map(layer => (
                  <div
                    key={layer} onClick={() => handleToggleLayer(layer)}
                    className="flex items-center justify-between px-2.5 py-1.5 bg-slate-900/40 rounded-lg cursor-pointer text-xs font-mono"
                  >
                    <span>{layer}</span>
                    {visibleLayers.includes(layer) ? <Eye className="w-3.5 h-3.5 text-cyan-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-600" />}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-slate-400 font-mono tracking-wider uppercase flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-orange-400" /> Pin Reviews
              </span>
              <button
                onClick={() => setReviewMode(!reviewMode)}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                  reviewMode ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}
              >
                {reviewMode ? 'Active' : '+ Add Pin'}
              </button>
            </div>

            <div className="space-y-2 overflow-y-auto flex-1">
              {annotations.filter(a => !a.resolved).map(ann => (
                <div
                  key={ann.id} onClick={() => setSelectedAnnotationId(ann.id)}
                  className={`p-3 rounded-lg border text-xs space-y-2 ${selectedAnnotationId === ann.id ? 'border-orange-500 bg-orange-950/10' : 'border-slate-900 bg-slate-900/20'}`}
                >
                  <div className="flex justify-between items-center font-mono text-[9px] text-slate-500">
                    <span>X:{ann.x.toFixed(1)} Y:{ann.y.toFixed(1)}</span>
                    <button onClick={(e) => { e.stopPropagation(); handleResolve(ann.id); }} className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">Resolve</button>
                  </div>
                  <p className="text-slate-200 leading-relaxed font-medium">{ann.content}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
