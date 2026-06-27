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
  resolveAnnotation,
  getCurrentUser,
  logoutUser,
  addRepositoryCollaborator
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
  Plus,
  RotateCw,
  FolderOpen,
  Database,
  X,
  Lock,
  ChevronRight,
  Eye,
  EyeOff,
  Users,
  UserPlus,
  ShieldAlert,
  LogOut
} from 'lucide-react';

const Github = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
  </svg>
);

export default function Dashboard() {
  const [user, setUser] = useState<any | null>(null);
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true);

  const [repositories, setRepositories] = useState<any[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<any | null>(null);
  const [commits, setCommits] = useState<any[]>([]);
  
  const [currentCommit, setCurrentCommit] = useState<string>('');
  const [compareCommit, setCompareCommit] = useState<string>('');
  const [files, setFiles] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  
  const [parsedData, setParsedData] = useState<ParsedHardwareData | null>(null);
  const [diffData, setDiffData] = useState<DiffedHardwareData | null>(null);
  const [visibleLayers, setVisibleLayers] = useState<string[]>([]);
  const [isDiffMode, setIsDiffMode] = useState<boolean>(false);
  const [opacity, setOpacity] = useState<number>(0.5);

  const [annotations, setAnnotations] = useState<any[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [reviewMode, setReviewMode] = useState<boolean>(false);
  const [isAddingAnnotation, setIsAddingAnnotation] = useState<boolean>(false);
  const [pendingCoords, setPendingCoords] = useState<{ x: number; y: number } | null>(null);
  const [commentText, setCommentText] = useState<string>('');

  // Collaborator States
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "DEVELOPER" | "REVIEWER">('DEVELOPER');
  const [isInviting, setIsInviting] = useState<boolean>(false);

  useEffect(() => {
    async function initWorkspace() {
      try {
        const u = await getCurrentUser();
        setUser(u);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingAuth(false);
      }
    }
    initWorkspace();
  }, []);

  useEffect(() => {
    if (!user) return;
    async function loadRepos() {
      try {
        const repos = await getRepositories();
        setRepositories(repos);
        if (repos.length > 0) setSelectedRepo(repos[0]);
      } catch (err) {
        console.error(err);
      }
    }
    loadRepos();
  }, [user]);

  useEffect(() => {
    if (!selectedRepo) return;
    async function loadCommits() {
      try {
        const list = await getCommits(selectedRepo.id);
        setCommits(list);
        if (list.length > 0) {
          setCurrentCommit(list[0].hash);
          if (list.length > 1) setCompareCommit(list[1].hash);
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadCommits();
  }, [selectedRepo]);

  useEffect(() => {
    if (!selectedRepo || !currentCommit) return;
    async function loadFiles() {
      try {
        const list = await getFiles(selectedRepo.id, currentCommit);
        setFiles(list);
        if (list.length > 0 && !list.some(f => f.path === selectedFile)) {
          setSelectedFile(list[0].path);
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadFiles();
  }, [selectedRepo, currentCommit]);

  useEffect(() => {
    if (!selectedRepo || !currentCommit || !selectedFile) return;

    async function loadFileData() {
      setParsedData(null);
      setDiffData(null);
      try {
        if (isDiffMode && compareCommit) {
          const diff = await getVisualDiff(selectedRepo.id, compareCommit, currentCommit, selectedFile);
          setDiffData(diff);
          if (diff.type === 'pcb') setVisibleLayers(diff.layers);
        } else {
          const parsed = await getParsedFile(selectedRepo.id, currentCommit, selectedFile);
          setParsedData(parsed);
          if (parsed.type === 'pcb') setVisibleLayers((parsed as any).layers);
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadFileData();
  }, [selectedRepo, currentCommit, compareCommit, selectedFile, isDiffMode]);

  // Polling hook retrieves live annotations every 5 seconds
  useEffect(() => {
    if (!currentCommit || !selectedFile) return;
    
    async function loadAnnotations() {
      try {
        const list = await getAnnotations(currentCommit, selectedFile);
        setAnnotations(list);
      } catch (err) {
        console.error(err);
      }
    }

    loadAnnotations();
    const intervalId = setInterval(loadAnnotations, 5000);
    return () => clearInterval(intervalId);
  }, [currentCommit, selectedFile]);

  const handleToggleLayer = (layerName: string) => {
    setVisibleLayers(p => p.includes(layerName) ? p.filter(l => l !== layerName) : [...p, layerName]);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !selectedRepo) return;
    setIsInviting(true);
    try {
      await addRepositoryCollaborator(selectedRepo.id, inviteEmail, inviteRole);
      setInviteEmail('');
      const updated = await getRepositories();
      setRepositories(updated);
      setSelectedRepo(updated.find(r => r.id === selectedRepo.id));
    } catch (err: any) {
      alert(err.message || "Failed to invite teammate");
    } finally {
      setIsInviting(false);
    }
  };

  const handleSubmitAnnotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !pendingCoords || !selectedFile || !currentCommit) return;
    const activeLayer = visibleLayers.length > 0 ? visibleLayers[0] : 'Top';
    try {
      const newAnn = await addAnnotation(currentCommit, selectedFile, activeLayer, pendingCoords.x, pendingCoords.y, commentText);
      setAnnotations(prev => [...prev, newAnn]);
      setCommentText('');
      setIsAddingAnnotation(false);
      setPendingCoords(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await resolveAnnotation(id);
      setAnnotations(prev => prev.map(ann => ann.id === id ? { ...ann, resolved: true } : ann));
      if (selectedAnnotationId === id) setSelectedAnnotationId(null);
    } catch (err) {
      console.error(err);
    }
  };

  if (loadingAuth) {
    return (
      <div className="h-screen w-screen bg-[#080b13] flex items-center justify-center text-slate-400 font-mono">
        <RotateCw className="w-5 h-5 animate-spin text-cyan-400 mr-2" /> Synced Authentication Validation Processing...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen bg-[#080b13] flex flex-col items-center justify-center text-slate-100 px-4">
        <div className="w-full max-w-md bg-slate-950/90 p-8 rounded-2xl border border-slate-800 text-center space-y-6 shadow-2xl">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-500 flex items-center justify-center font-bold text-slate-900 text-xl mx-auto">CL</div>
          <h1 className="text-xl font-bold tracking-tight text-white">CADLAB.io Sign-In Required</h1>
          <a href="/api/auth/github" className="w-full py-2.5 bg-slate-100 hover:bg-white text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all">
            <Github className="w-4 h-4" /> Continue with GitHub OAuth
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[#080b13] text-slate-100 antialiased overflow-hidden">
      <header className="h-14 border-b border-slate-800 bg-slate-950/75 backdrop-blur-md px-6 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-emerald-500 flex items-center justify-center font-bold text-slate-900">CL</div>
          <div>
            <span className="font-bold text-sm block">CADLAB.io</span>
            <p className="text-[10px] text-slate-400 -mt-0.5">Workspace: {user.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-cyan-400" />
          <select
            value={selectedRepo?.id || ''}
            title="Select Repository"
            onChange={(e) => setSelectedRepo(repositories.find(r => r.id === e.target.value))}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1 text-xs font-semibold text-slate-200 outline-none cursor-pointer focus:border-cyan-500"
          >
            {repositories.map(repo => (
              <option key={repo.id} value={repo.id}>{repo.name}</option>
            ))}
          </select>
          {selectedRepo?.isPrivate && <Lock className="w-3 h-3 text-slate-500" />}
        </div>

        <button 
          onClick={async () => { await logoutUser(); window.location.reload(); }} 
          title="Log Out"
          aria-label="Log Out"
          className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white rounded-lg transition-all"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Side Workspace Management Side Navigation */}
        <aside className="w-80 border-r border-slate-900 bg-slate-950/40 flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 border-b border-slate-900/60 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 font-mono uppercase tracking-wider flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-cyan-400" /> Layer Revision Setup
              </span>
              <button
                onClick={() => setIsDiffMode(!isDiffMode)}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-all border ${
                  isDiffMode ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}
              >
                {isDiffMode ? 'Diff Active' : 'Enable Diff'}
              </button>
            </div>

            <div className="space-y-2 bg-slate-950 p-3 rounded-xl border border-slate-900 text-xs font-mono">
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 block uppercase font-bold">Target Commit B (Head)</label>
                <select value={currentCommit} title="Target Commit B" onChange={(e) => setCurrentCommit(e.target.value)} className="w-full bg-slate-900 border border-slate-800 px-2 py-1 rounded text-slate-300 outline-none">
                  {commits.map(c => <option key={c.hash} value={c.hash}>{c.message.slice(0, 22)}...</option>)}
                </select>
              </div>

              {isDiffMode && (
                <div className="space-y-1 pt-2 border-t border-slate-900">
                  <label className="text-[9px] text-slate-500 block uppercase font-bold">Base Commit A (Root)</label>
                  <select value={compareCommit} title="Base Commit A" onChange={(e) => setCompareCommit(e.target.value)} className="w-full bg-slate-900 border border-slate-800 px-2 py-1 rounded text-slate-300 outline-none">
                    {commits.map(c => <option key={c.hash} value={c.hash}>{c.message.slice(0, 22)}...</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 border-b border-slate-900/60 flex flex-col max-h-[160px] overflow-hidden">
            <span className="text-[11px] font-bold text-slate-400 font-mono uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-yellow-500" /> PCB Design Files
            </span>
            <div className="space-y-1 overflow-y-auto flex-1">
              {files.map(file => (
                <div
                  key={file.path} onClick={() => setSelectedFile(file.path)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer text-xs font-mono border transition-all ${
                    selectedFile === file.path ? 'bg-slate-900 border-slate-800 text-cyan-400 font-semibold' : 'border-transparent text-slate-400 hover:bg-slate-900/20'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="truncate">{file.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Collaborative Teammate Manager View */}
          <div className="p-4 flex-1 flex flex-col">
            <span className="text-[11px] font-bold text-slate-400 font-mono uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-400" /> Review Board Team
            </span>

            <form onSubmit={handleInvite} className="mb-4 space-y-2 bg-slate-900/50 p-2 rounded-xl border border-slate-900">
              <div className="flex gap-1.5">
                <input
                  type="email" 
                  required 
                  placeholder="engineer@company.com" 
                  title="Teammate Email Address"
                  aria-label="Teammate Email Address"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 outline-none"
                />
                <button 
                  type="submit" 
                  disabled={isInviting} 
                  title="Invite Teammate"
                  aria-label="Invite Teammate"
                  className="p-1 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-bold text-xs"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                <span>Access Profile:</span>
                <select 
                  value={inviteRole} 
                  title="Invite Role"
                  aria-label="Invite Role"
                  onChange={(e: any) => setInviteRole(e.target.value)} 
                  className="bg-slate-950 border border-slate-800 text-[10px] rounded px-1 outline-none"
                >
                  <option value="DEVELOPER">Developer (Write)</option>
                  <option value="REVIEWER">Reviewer (Read)</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
            </form>

            <div className="space-y-1.5 overflow-y-auto flex-1">
              <div className="flex items-center justify-between text-xs p-2 bg-slate-900/40 rounded-lg border border-slate-900/60">
                <div className="truncate"><span className="font-semibold block truncate text-slate-200">{selectedRepo?.owner?.name || "Workspace Host"}</span><span className="text-[9px] text-slate-500 font-mono truncate block">{selectedRepo?.owner?.email}</span></div>
                <span className="text-[8px] font-bold px-1.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded font-mono uppercase">OWNER</span>
              </div>
              {selectedRepo?.members?.map((member: any) => (
                <div key={member.id} className="flex items-center justify-between text-xs p-2 bg-slate-900/40 rounded-lg border border-slate-900/60">
                  <div className="truncate"><span className="font-semibold block truncate text-slate-200">{member.user.name}</span><span className="text-[9px] text-slate-500 font-mono truncate block">{member.user.email}</span></div>
                  <span className="text-[8px] font-bold px-1.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded font-mono uppercase">{member.role}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Center Active Renderer Canvas Component Layout */}
        <main className="flex-1 bg-[#090c15] p-6 flex flex-col overflow-hidden relative">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-200">{selectedFile ? selectedFile.split('/').pop() : 'Empty Repository Frame'}</h2>
              <p className="text-xs text-slate-500 font-mono">{isDiffMode ? 'Visual Comparison Matrix' : 'Static View'}</p>
            </div>

            {isDiffMode && diffData && (
              <div className="bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 flex items-center gap-4 text-xs font-mono">
                <span className="text-red-400 text-[10px] font-bold uppercase">Rev A</span>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.01" 
                  title="Opacity"
                  aria-label="Opacity"
                  value={opacity} 
                  onChange={(e) => setOpacity(parseFloat(e.target.value))} 
                  className="w-32 h-1 bg-slate-800 rounded-lg appearance-none accent-emerald-500 cursor-pointer" 
                />
                <span className="text-emerald-400 text-[10px] font-bold uppercase">Rev B</span>
              </div>
            )}
          </div>

          <div className="flex-1 relative min-h-0">
            {isDiffMode && diffData ? (
              <DiffCanvas diffData={diffData} visibleLayers={visibleLayers} opacity={opacity} />
            ) : parsedData ? (
              <HardwareCanvas
                data={parsedData} visibleLayers={visibleLayers} annotations={annotations}
                selectedAnnotationId={selectedAnnotationId} reviewMode={reviewMode}
                onAddAnnotation={(x, y) => { setPendingCoords({ x, y }); setIsAddingAnnotation(true); }}
                onSelectAnnotation={setSelectedAnnotationId}
              />
            ) : (
              <div className="w-full h-full rounded-xl border border-slate-800 bg-slate-950/30 flex flex-col items-center justify-center text-slate-500 gap-2 font-mono text-xs">
                <RotateCw className="w-5 h-5 animate-spin" /> Resolving structural geometry layers...
              </div>
            )}

            {isAddingAnnotation && pendingCoords && (
              <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm z-25 flex items-center justify-center p-4">
                <form onSubmit={handleSubmitAnnotation} className="w-full max-w-sm bg-slate-900 border border-slate-700 p-5 rounded-xl space-y-4">
                  <h3 className="font-bold text-xs flex items-center gap-1.5 text-slate-200"><MessageSquare className="w-4 h-4 text-cyan-400" /> Pin Comment Review</h3>
                  <textarea
                    required rows={3} value={commentText} onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Enter review pin data notations..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                  <div className="flex gap-2 justify-end text-xs font-semibold">
                    <button type="button" onClick={() => { setIsAddingAnnotation(false); setPendingCoords(null); }} className="px-3 py-1 bg-slate-800 rounded-md">Cancel</button>
                    <button type="submit" className="px-3 py-1 bg-cyan-500 text-slate-950 font-bold rounded-md">Pin Comment</button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </main>

        {/* Right Sidebar Interactive Filters & Threads */}
        <aside className="w-80 border-l border-slate-900 bg-slate-950/40 flex flex-col shrink-0 overflow-y-auto">
          {visibleLayers.length > 0 && (
            <div className="p-4 border-b border-slate-900/60">
              <span className="text-[11px] font-bold text-slate-400 font-mono uppercase tracking-wider flex items-center gap-1.5 mb-3">
                <Layers className="w-3.5 h-3.5 text-cyan-400" /> Layout Layers Manager
              </span>
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                {visibleLayers.map(layer => (
                  <div key={layer} onClick={() => handleToggleLayer(layer)} className="flex items-center justify-between px-2.5 py-1.5 bg-slate-900/50 hover:bg-slate-900 rounded-lg cursor-pointer text-xs font-mono border border-slate-900 hover:border-slate-800 transition-all">
                    <span>{layer}</span>
                    {visibleLayers.includes(layer) ? <Eye className="w-3.5 h-3.5 text-cyan-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-600" />}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-slate-400 font-mono uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-orange-400" /> Layout Reviews
              </span>
              <button
                onClick={() => setReviewMode(!reviewMode)}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                  reviewMode ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}
              >
                {reviewMode ? 'Pin Drop Active' : '+ Place Pin'}
              </button>
            </div>

            <div className="space-y-2 overflow-y-auto flex-1">
              {annotations.filter(a => !a.resolved).map(ann => (
                <div
                  key={ann.id} onClick={() => setSelectedAnnotationId(ann.id)}
                  className={`p-3 rounded-lg border text-xs space-y-2 cursor-pointer transition-all ${selectedAnnotationId === ann.id ? 'border-orange-500 bg-orange-950/10' : 'border-slate-900 bg-slate-900/20'}`}
                >
                  <div className="flex justify-between items-center font-mono text-[9px] text-slate-500">
                    <span className="flex items-center gap-1 font-semibold text-slate-300">
                      <ShieldAlert className="w-3 h-3 text-indigo-400 shrink-0" />
                      {ann.author?.name || "Pending Eng"}
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); handleResolve(ann.id); }} className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">Resolve</button>
                  </div>
                  <p className="text-slate-200 leading-relaxed font-medium break-words">{ann.content}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
