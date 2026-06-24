"use client";

import React, { useEffect, useState } from 'react';
import {
  getRepositories,
  getCommits,
  getFiles,
  getParsedFile,
  getVisualDiff,
  getAnnotations,
  addAnnotation,
  resolveAnnotation
} from './actions';
import { ParsedHardwareData } from '@/lib/parsers/parser';
import { DiffedHardwareData } from '@/lib/diff/diffEngine';
import HardwareCanvas from '@/components/hardware-canvas';
import DiffCanvas from '@/components/diff-canvas';
import {
  GitBranch,
  GitCommit,
  Layers,
  MessageSquare,
  FileCode,
  Sliders,
  CheckCircle,
  Plus,
  Play,
  RotateCw,
  FolderOpen,
  ArrowRight,
  Database,
  Activity,
  X,
  Lock,
  ChevronRight,
  Eye,
  EyeOff
} from 'lucide-react';

export default function Dashboard() {
  // Database / Repo states
  const [repositories, setRepositories] = useState<any[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<any | null>(null);
  const [commits, setCommits] = useState<any[]>([]);
  
  // Selection states
  const [currentCommit, setCurrentCommit] = useState<string>('');
  const [compareCommit, setCompareCommit] = useState<string>('');
  const [files, setFiles] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  
  // Visual states
  const [parsedData, setParsedData] = useState<ParsedHardwareData | null>(null);
  const [diffData, setDiffData] = useState<DiffedHardwareData | null>(null);
  const [visibleLayers, setVisibleLayers] = useState<string[]>([]);
  const [isDiffMode, setIsDiffMode] = useState<boolean>(false);
  const [opacity, setOpacity] = useState<number>(0.5);

  // Collaboration / Annotation states
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [reviewMode, setReviewMode] = useState<boolean>(false);
  const [isAddingAnnotation, setIsAddingAnnotation] = useState<boolean>(false);
  const [pendingCoords, setPendingCoords] = useState<{ x: number; y: number } | null>(null);
  const [commentText, setCommentText] = useState<string>('');

  // Simulation status states
  const [prCheckStatus, setPrCheckStatus] = useState<'idle' | 'running' | 'success'>('idle');
  const [prCheckLog, setPrCheckLog] = useState<string>('');

  // Initial Load
  useEffect(() => {
    async function loadRepos() {
      try {
        const repos = await getRepositories();
        setRepositories(repos);
        if (repos.length > 0) {
          setSelectedRepo(repos[0]);
        }
      } catch (err) {
        console.error("Failed to load repositories", err);
      }
    }
    loadRepos();
  }, []);

  // Fetch commits when repository changes
  useEffect(() => {
    if (!selectedRepo) return;
    async function loadCommits() {
      try {
        const list = await getCommits(selectedRepo.id);
        setCommits(list);
        if (list.length > 0) {
          setCurrentCommit(list[0].hash);
          if (list.length > 1) {
            setCompareCommit(list[1].hash); // Set secondary for diff
          }
        }
      } catch (err) {
        console.error("Failed to load commits", err);
      }
    }
    loadCommits();
  }, [selectedRepo]);

  // Fetch files when commit or repo changes
  useEffect(() => {
    if (!selectedRepo || !currentCommit) return;
    async function loadFiles() {
      try {
        const list = await getFiles(selectedRepo.id, currentCommit);
        setFiles(list);
        if (list.length > 0) {
          // Keep current selection if possible, otherwise default to first pcb/sch
          const hasSelected = list.some(f => f.path === selectedFile);
          if (!hasSelected) {
            setSelectedFile(list[0].path);
          }
        } else {
          setSelectedFile('');
        }
      } catch (err) {
        console.error("Failed to load files", err);
      }
    }
    loadFiles();
  }, [selectedRepo, currentCommit]);

  // Parse and load file layout
  useEffect(() => {
    if (!selectedRepo || !currentCommit || !selectedFile) return;

    async function loadFileData() {
      setParsedData(null);
      setDiffData(null);
      try {
        if (isDiffMode && compareCommit) {
          const diff = await getVisualDiff(selectedRepo.id, compareCommit, currentCommit, selectedFile);
          setDiffData(diff);
          // Set visible layers
          if (diff.type === 'pcb') {
            setVisibleLayers(diff.layers);
          } else {
            setVisibleLayers([]);
          }
        } else {
          const parsed = await getParsedFile(selectedRepo.id, currentCommit, selectedFile);
          setParsedData(parsed);
          if (parsed.type === 'pcb') {
            setVisibleLayers((parsed as any).layers);
          } else {
            setVisibleLayers([]);
          }
        }
      } catch (err) {
        console.error("Failed to load/parse hardware layout", err);
      }
    }
    loadFileData();
  }, [selectedRepo, currentCommit, compareCommit, selectedFile, isDiffMode]);

  // Fetch annotations
  useEffect(() => {
    if (!currentCommit || !selectedFile) return;
    async function loadAnnotations() {
      try {
        const list = await getAnnotations(currentCommit, selectedFile);
        setAnnotations(list);
      } catch (err) {
        console.error("Failed to load annotations", err);
      }
    }
    loadAnnotations();
  }, [currentCommit, selectedFile]);

  // Toggle Layer visibility
  const handleToggleLayer = (layerName: string) => {
    setVisibleLayers(prev =>
      prev.includes(layerName) ? prev.filter(l => l !== layerName) : [...prev, layerName]
    );
  };

  // Add annotation coordinate trigger
  const handleAddAnnotationPoint = (x: number, y: number) => {
    setPendingCoords({ x, y });
    setIsAddingAnnotation(true);
  };

  // Submit comment to DB
  const handleSubmitAnnotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !pendingCoords || !selectedFile || !currentCommit) return;

    // Estimate layer based on visible selection or default
    const activeLayer = visibleLayers.length > 0 ? visibleLayers[0] : 'Top';

    try {
      const newAnn = await addAnnotation(
        currentCommit,
        selectedFile,
        activeLayer,
        pendingCoords.x,
        pendingCoords.y,
        commentText
      );
      setAnnotations(prev => [...prev, newAnn]);
      setCommentText('');
      setIsAddingAnnotation(false);
      setPendingCoords(null);
    } catch (err) {
      console.error("Failed to save annotation", err);
    }
  };

  // Resolve comment in DB
  const handleResolve = async (id: string) => {
    try {
      await resolveAnnotation(id);
      setAnnotations(prev =>
        prev.map(ann => ann.id === id ? { ...ann, resolved: true } : ann)
      );
      if (selectedAnnotationId === id) setSelectedAnnotationId(null);
    } catch (err) {
      console.error("Failed to resolve annotation", err);
    }
  };

  // Simulate Github webhook PR build check
  const handleSimulateWebhook = () => {
    setPrCheckStatus('running');
    setPrCheckLog("Cloning PR repo... [OK]\nRunning visual-diff compliance analysis...\nComparing parent commit: init layout (commit-1-old)\nComparing head commit: route improvements (commit-2-new)\n");
    
    setTimeout(() => {
      setPrCheckLog(prev => prev + "Parsed KiCad board.kicad_pcb layout\nFound 1 element position shift: R1 (10,20)->(12,20)\nFound 1 footprint added: R3 (35,20)\nVisual delta reports generated.\n");
    }, 1000);

    setTimeout(() => {
      setPrCheckStatus('success');
      setPrCheckLog(prev => prev + "Status: Green checkmark published to GitHub PR pipeline.\nVisual review ready.");
    }, 2200);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#080b13] text-slate-100 antialiased overflow-hidden">
      {/* Top Glassmorphic Navigation Bar */}
      <header className="h-14 min-h-[56px] border-b border-slate-800 bg-slate-950/75 backdrop-blur-md px-6 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-emerald-500 flex items-center justify-center font-bold text-slate-900 shadow-[0_0_15px_rgba(6,182,212,0.4)]">
            CL
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm bg-gradient-to-r from-slate-50 to-slate-200 bg-clip-text text-transparent">CADLAB.io</span>
              <span className="text-[10px] bg-slate-800 text-slate-400 font-semibold px-1.5 py-0.5 rounded">Core-v1.0</span>
            </div>
            <p className="text-[10px] text-slate-500 -mt-0.5">Git-Based Hardware Visual Reviews</p>
          </div>
        </div>

        {/* Middle Repository Selector */}
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-cyan-400" />
          <select
            value={selectedRepo?.id || ''}
            onChange={(e) => setSelectedRepo(repositories.find(r => r.id === e.target.value))}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1 text-xs text-slate-200 font-semibold focus:outline-none focus:border-cyan-500 transition-all cursor-pointer"
          >
            {repositories.map(repo => (
              <option key={repo.id} value={repo.id}>{repo.name}</option>
            ))}
          </select>
          {selectedRepo?.isPrivate && <Lock className="w-3 h-3 text-slate-500" />}
        </div>

        {/* Right Dashboard Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] font-mono text-slate-400">Local Daemon: Online</span>
          </div>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Side: Repos, Commits, Files Tree */}
        <aside className="w-72 border-r border-slate-900 bg-slate-950/40 flex flex-col shrink-0 overflow-y-auto">
          {/* Commit Trees */}
          <div className="p-4 border-b border-slate-900/60">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase font-mono flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-cyan-400" /> Commit Logs
              </span>
              <button
                onClick={() => setIsDiffMode(!isDiffMode)}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-all flex items-center gap-1 border ${
                  isDiffMode 
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.15)]' 
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                <Sliders className="w-3 h-3" />
                {isDiffMode ? 'Diff Mode Active' : 'Enable Diff Mode'}
              </button>
            </div>

            <div className="space-y-2 mt-1">
              {commits.map((commit, index) => {
                const isCurrent = currentCommit === commit.hash;
                const isCompare = compareCommit === commit.hash;
                
                return (
                  <div
                    key={commit.hash}
                    onClick={() => {
                      if (isDiffMode) {
                        // Toggle logic for diff selection
                        if (isCompare) return;
                        setCurrentCommit(commit.hash);
                      } else {
                        setCurrentCommit(commit.hash);
                      }
                    }}
                    className={`p-3 rounded-lg border cursor-pointer transition-all glass-panel-hover ${
                      isCurrent && !isDiffMode
                        ? 'border-cyan-500/50 bg-cyan-950/10 shadow-[0_0_12px_rgba(6,182,212,0.06)]'
                        : isCurrent && isDiffMode
                        ? 'border-emerald-500/50 bg-emerald-950/10'
                        : isCompare && isDiffMode
                        ? 'border-red-500/40 bg-red-950/10'
                        : 'border-slate-900/80 hover:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <GitCommit className={`w-3.5 h-3.5 shrink-0 ${
                        isCurrent && !isDiffMode ? 'text-cyan-400' 
                        : isCurrent && isDiffMode ? 'text-emerald-400' 
                        : isCompare && isDiffMode ? 'text-red-400' 
                        : 'text-slate-600'
                      }`} />
                      <span className="text-[10px] font-mono text-slate-500 truncate" title={commit.hash}>
                        {commit.hash.slice(0, 7)}
                      </span>
                      {isDiffMode && (
                        <span className={`text-[8px] px-1.5 py-0.2 rounded font-bold uppercase shrink-0 ${
                          isCurrent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {isCurrent ? 'New (B)' : 'Old (A)'}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-medium text-slate-300 mt-1 line-clamp-2 leading-relaxed">
                      {commit.message}
                    </p>
                    <div className="flex items-center justify-between text-[9px] text-slate-500 mt-2 font-mono">
                      <span>{commit.authorName}</span>
                      <span>{new Date(commit.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Files Explorer Tree */}
          <div className="p-4 flex-1 flex flex-col">
            <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase font-mono flex items-center gap-1.5 mb-3">
              <FolderOpen className="w-3.5 h-3.5 text-yellow-500" /> Repository Files
            </span>

            <div className="space-y-1 overflow-y-auto flex-1 pr-1">
              {files.map(file => {
                const isSelected = selectedFile === file.path;
                return (
                  <div
                    key={file.path}
                    onClick={() => setSelectedFile(file.path)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all border text-xs font-mono ${
                      isSelected
                        ? 'bg-slate-900 border-slate-800 text-cyan-400 font-semibold'
                        : 'border-transparent hover:bg-slate-900/40 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <FileCode className={`w-3.5 h-3.5 shrink-0 ${
                      isSelected ? 'text-cyan-400' : 'text-slate-500'
                    }`} />
                    <span className="truncate">{file.name}</span>
                    <ChevronRight className={`w-3 h-3 ml-auto opacity-0 transition-opacity ${
                      isSelected ? 'opacity-100 text-cyan-400' : ''
                    }`} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Simulation Webhook Simulator Block */}
          <div className="p-4 border-t border-slate-900 bg-slate-950/60 mt-auto">
            <div className="flex items-center gap-2 justify-between mb-2">
              <span className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-wide">CI Webhook simulator</span>
              {prCheckStatus === 'success' && (
                <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-bold">Passed</span>
              )}
            </div>
            
            <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
              Verify how CADLAB.io integrates automatically with GitHub commits to run server checks.
            </p>

            {prCheckStatus === 'idle' ? (
              <button
                onClick={handleSimulateWebhook}
                className="w-full py-1.5 bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 hover:from-cyan-500/30 hover:to-emerald-500/30 border border-cyan-500/20 hover:border-cyan-500/40 text-slate-200 font-semibold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
              >
                <Play className="w-3.5 h-3.5 text-cyan-400" />
                Simulate PR Checks
              </button>
            ) : (
              <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg">
                <div className="flex items-center gap-1.5 text-[9px] text-slate-400 font-semibold font-mono mb-1.5">
                  <Activity className={`w-3 h-3 ${prCheckStatus === 'running' ? 'animate-spin text-cyan-400' : 'text-emerald-400'}`} />
                  {prCheckStatus === 'running' ? 'Processing Design Diff...' : 'Visual Report Complete'}
                </div>
                <pre className="text-[8px] text-slate-500 font-mono overflow-x-auto max-h-[80px] leading-relaxed whitespace-pre-wrap">
                  {prCheckLog}
                </pre>
                {prCheckStatus === 'success' && (
                  <button
                    onClick={() => { setPrCheckStatus('idle'); setPrCheckLog(''); }}
                    className="text-[9px] text-cyan-400 hover:text-cyan-300 font-semibold mt-2 underline"
                  >
                    Reset Simulation
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Center Panel: Active Rendering Canvas */}
        <main className="flex-1 bg-[#090c15] p-6 flex flex-col overflow-hidden relative">
          {/* Top Canvas Mode Toggle & Path Bar */}
          <div className="flex items-center justify-between mb-4 z-10">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
                <span>{selectedRepo?.name}</span>
                <ChevronRight className="w-3.5 h-3.5" />
                <span>{selectedFile || 'No file selected'}</span>
              </div>
              <h2 className="text-xl font-bold text-slate-200 tracking-tight mt-1 flex items-center gap-2">
                {selectedFile ? selectedFile.split('/').pop() : 'Empty Workspace'}
                {isDiffMode && (
                  <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono font-semibold">
                    Comparing revisions A ➔ B
                  </span>
                )}
              </h2>
            </div>

            {/* Slider Blending Control Panel */}
            {isDiffMode && diffData && (
              <div className="bg-slate-950/90 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-800 shadow-xl flex items-center gap-4">
                <span className="text-[10px] font-bold font-mono text-red-400 uppercase tracking-wide">Rev A (0%)</span>
                
                <div className="flex flex-col items-center min-w-[150px]">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={opacity}
                    onChange={(e) => setOpacity(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 focus:outline-none"
                  />
                  <span className="text-[9px] font-mono text-slate-400 mt-1">Blend: {Math.round(opacity * 100)}%</span>
                </div>

                <span className="text-[10px] font-bold font-mono text-emerald-400 uppercase tracking-wide">Rev B (100%)</span>
              </div>
            )}
          </div>

          {/* Canvas Wrapper */}
          <div className="flex-1 min-h-0 relative">
            {isDiffMode && diffData ? (
              <DiffCanvas
                diffData={diffData}
                visibleLayers={visibleLayers}
                opacity={opacity}
              />
            ) : parsedData ? (
              <HardwareCanvas
                data={parsedData}
                visibleLayers={visibleLayers}
                annotations={annotations}
                selectedAnnotationId={selectedAnnotationId}
                reviewMode={reviewMode}
                onAddAnnotation={handleAddAnnotationPoint}
                onSelectAnnotation={setSelectedAnnotationId}
              />
            ) : (
              <div className="w-full h-full rounded-xl border border-slate-800 bg-slate-950/30 flex flex-col items-center justify-center text-slate-500 gap-2">
                <RotateCw className="w-8 h-8 animate-spin text-slate-600" />
                <span className="text-sm font-semibold">Parsing PCB geometries...</span>
              </div>
            )}

            {/* Float form for dropping spatial comment pins */}
            {isAddingAnnotation && pendingCoords && (
              <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm z-25 flex items-center justify-center p-6">
                <form
                  onSubmit={handleSubmitAnnotation}
                  className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-5 shadow-2xl space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4 text-cyan-400" /> Pin Comment at Coordinates
                    </h3>
                    <button
                      type="button"
                      onClick={() => { setIsAddingAnnotation(false); setPendingCoords(null); }}
                      className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="text-[11px] font-mono text-slate-400 bg-slate-950 p-2 rounded border border-slate-800 flex justify-between">
                    <span>X: {pendingCoords.x.toFixed(3)}mm</span>
                    <span>Y: {pendingCoords.y.toFixed(3)}mm</span>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 font-semibold mb-1.5">Your Review Annotation</label>
                    <textarea
                      required
                      rows={3}
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="e.g. Clearance width looks too small here. Move trace 0.5mm left."
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-all"
                    />
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => { setIsAddingAnnotation(false); setPendingCoords(null); }}
                      className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-700 transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-cyan-500 text-slate-950 text-xs font-bold rounded-lg hover:bg-cyan-400 transition-all cursor-pointer shadow-lg"
                    >
                      Pin Comment
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </main>

        {/* Right Side: Layers Visibility & Annotations Threads */}
        <aside className="w-80 border-l border-slate-900 bg-slate-950/40 flex flex-col shrink-0 overflow-y-auto">
          {/* Layers Visibility Panel */}
          {parsedData?.type === 'pcb' || (isDiffMode && diffData?.type === 'pcb') ? (
            <div className="p-4 border-b border-slate-900/60">
              <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase font-mono flex items-center gap-1.5 mb-3">
                <Layers className="w-3.5 h-3.5 text-cyan-400" /> PCB Layer Manager
              </span>

              <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                {visibleLayers.map(layer => {
                  const isVisible = visibleLayers.includes(layer);
                  const isTop = layer.toLowerCase().includes('f.cu') || layer.toLowerCase() === 'top';
                  const isBottom = layer.toLowerCase().includes('b.cu') || layer.toLowerCase() === 'bottom';
                  const isSilk = layer.toLowerCase().includes('silk') || layer.toLowerCase().includes('place') || layer.toLowerCase().includes('name');
                  
                  let dotColor = 'bg-slate-600';
                  if (isTop) dotColor = 'bg-red-500';
                  else if (isBottom) dotColor = 'bg-blue-500';
                  else if (isSilk) dotColor = 'bg-yellow-500';

                  return (
                    <div
                      key={layer}
                      onClick={() => handleToggleLayer(layer)}
                      className="flex items-center justify-between px-2.5 py-1.5 bg-slate-900/50 hover:bg-slate-900 rounded-lg cursor-pointer border border-slate-900 hover:border-slate-800 transition-all"
                    >
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`}></span>
                        <span className="truncate">{layer}</span>
                      </div>
                      <button className="text-slate-500 hover:text-slate-300">
                        {isVisible ? <Eye className="w-3.5 h-3.5 text-cyan-400" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Spatial Annotations Section */}
          <div className="p-4 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase font-mono flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-orange-400" /> Spatial Comments
              </span>
              <button
                onClick={() => setReviewMode(!reviewMode)}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-all flex items-center gap-1 border ${
                  reviewMode
                    ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                {reviewMode ? 'Review Mode Active' : 'Enter Review Mode'}
              </button>
            </div>

            {reviewMode && (
              <div className="mb-3 bg-orange-950/20 border border-orange-500/20 p-2.5 rounded-lg text-[10px] text-orange-300 leading-relaxed">
                Review Mode: Click anywhere on the board canvas to place a pin-point annotation comment at that coordinate.
              </div>
            )}

            {/* Annotations List */}
            <div className="space-y-2 overflow-y-auto flex-1 pr-1">
              {annotations.filter(ann => !ann.resolved).length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 py-12">
                  <MessageSquare className="w-8 h-8 opacity-40 mb-2" />
                  <p className="text-xs">No active annotation pins</p>
                  <p className="text-[10px] opacity-75 mt-0.5">Use Review Mode to place a pin</p>
                </div>
              ) : (
                annotations.map(ann => {
                  if (ann.resolved) return null;
                  const isSelected = selectedAnnotationId === ann.id;
                  
                  return (
                    <div
                      key={ann.id}
                      onClick={() => setSelectedAnnotationId(ann.id)}
                      className={`p-3 rounded-lg border transition-all cursor-pointer flex flex-col ${
                        isSelected
                          ? 'border-orange-500 bg-orange-950/10 shadow-[0_0_12px_rgba(249,115,22,0.06)]'
                          : 'border-slate-900 bg-slate-900/30 hover:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[9px] font-mono text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 shrink-0">
                          X:{ann.x.toFixed(2)} Y:{ann.y.toFixed(2)}
                        </span>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResolve(ann.id);
                          }}
                          className="text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/20 cursor-pointer"
                        >
                          Resolve
                        </button>
                      </div>

                      <p className="text-xs text-slate-200 mt-1 leading-relaxed break-words font-medium">
                        {ann.content}
                      </p>

                      <span className="text-[9px] text-slate-500 mt-2 font-mono self-end">
                        {new Date(ann.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
