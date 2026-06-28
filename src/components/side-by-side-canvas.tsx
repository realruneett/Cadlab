"use client";

import React, { useRef, useEffect, useState, MouseEvent, WheelEvent } from 'react';
import { Point } from '../lib/parsers/kicad/pcbParser';
import { toScreen, toNative, fitBounds, ViewportTransform } from '../lib/canvas/coordinate-translator';
import { DiffedHardwareData } from '../lib/diff/diffEngine';
import { ZoomIn, ZoomOut, Maximize, Link2, Link2Off } from 'lucide-react';
import { getLayerColor } from '../lib/layers/layer-colors';

interface SideBySideCanvasProps {
  diffData: DiffedHardwareData;
  visibleLayers?: string[];
  projectSlug?: string;
}

export default function SideBySideCanvas({
  diffData,
  visibleLayers = [],
  projectSlug = 'local',
}: SideBySideCanvasProps) {
  const leftCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const borderRef = useRef<HTMLDivElement | null>(null);

  // Per-panel independent transform states
  const [leftTransform, setLeftTransform] = useState<ViewportTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [rightTransform, setRightTransform] = useState<ViewportTransform>({ scale: 1, offsetX: 0, offsetY: 0 });

  // Synchronization Lock state
  const [isLocked, setIsLocked] = useState<boolean>(true);
  const [activeSide, setActiveSide] = useState<'left' | 'right'>('left');
  
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; text: string; subText?: string; side: 'left' | 'right' } | null>(null);

  // Theme & Border states
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [isBorderVisible, setIsBorderVisible] = useState<boolean>(true);
  const [isBorderHovered, setIsBorderHovered] = useState<boolean>(false);
  const [isBorderFocused, setIsBorderFocused] = useState<boolean>(false);

  const canvasWidth = Math.max(100, Math.floor(dimensions.width / 2) - 8); // split width minus padding/border

  // Resize handler
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width: width || 800, height: height || 600 });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Fit bounds initially or when diffData changes
  useEffect(() => {
    if (canvasWidth > 0 && dimensions.height > 0 && diffData) {
      const fit = fitBounds(diffData.bounds, canvasWidth, dimensions.height);
      setLeftTransform(fit);
      setRightTransform(fit);
    }
  }, [diffData, canvasWidth, dimensions.height]);

  // Mode detection: Automatically detect class 'dark' or colorScheme on documentElement
  useEffect(() => {
    const checkTheme = () => {
      const isDark = document.documentElement.classList.contains('dark') || 
                     document.documentElement.style.colorScheme === 'dark' ||
                     window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDarkMode(isDark);
    };

    checkTheme();

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', checkTheme);
    
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      mediaQuery.removeEventListener('change', checkTheme);
      observer.disconnect();
    };
  }, []);

  // Persist Lock state per project slug
  useEffect(() => {
    if (projectSlug) {
      const persisted = localStorage.getItem(`diff-zoom-locked-${projectSlug}`);
      if (persisted !== null) {
        setIsLocked(persisted === 'true');
      }
    }
  }, [projectSlug]);

  // Persist Border visibility preference per project
  useEffect(() => {
    if (projectSlug) {
      const persisted = localStorage.getItem(`project:${projectSlug}.diffBorderVisible`);
      if (persisted !== null) {
        setIsBorderVisible(persisted === 'true');
      } else {
        setIsBorderVisible(true);
      }
    }
  }, [projectSlug]);

  const toggleLock = () => {
    setIsLocked(prev => {
      const next = !prev;
      if (projectSlug) {
        localStorage.setItem(`diff-zoom-locked-${projectSlug}`, String(next));
      }
      if (next) {
        // Force sync: align Revision B (right) with Revision A (left) viewport
        setRightTransform(leftTransform);
      }
      return next;
    });
  };

  const toggleBorder = () => {
    setIsBorderVisible(prev => {
      const next = !prev;
      if (projectSlug) {
        localStorage.setItem(`project:${projectSlug}.diffBorderVisible`, String(next));
      }
      return next;
    });
  };

  // Emit event on change so other UI components can react
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('diff-zoom-changed', {
      detail: {
        isLocked,
        leftTransform,
        rightTransform,
        projectSlug
      }
    }));
  }, [isLocked, leftTransform, rightTransform, projectSlug]);

  // Main Draw Loop for both canvases
  useEffect(() => {
    drawCanvas(leftCanvasRef.current, false, leftTransform);
    drawCanvas(rightCanvasRef.current, true, rightTransform);
  }, [diffData, visibleLayers, leftTransform, rightTransform, canvasWidth, dimensions.height]);

  // Keyboard accessibility listeners (Alt + Key / Ctrl + Key combinations)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+L: Toggle Sync Lock
      if (e.altKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        toggleLock();
      }
      // Ctrl+| or Cmd+| (Toggle Border visibility)
      if ((e.ctrlKey || e.metaKey) && (e.key === '|' || e.key === '\\')) {
        e.preventDefault();
        toggleBorder();
      }
      // Alt+1: Zoom In Left
      if (e.altKey && e.key === '1') {
        e.preventDefault();
        handleZoom('left', 'in');
      }
      // Alt+2: Zoom Out Left
      if (e.altKey && e.key === '2') {
        e.preventDefault();
        handleZoom('left', 'out');
      }
      // Alt+0: Reset Left
      if (e.altKey && e.key === '0') {
        e.preventDefault();
        handleReset('left');
      }
      // Alt+3: Zoom In Right (if unlocked)
      if (e.altKey && e.key === '3' && !isLocked) {
        e.preventDefault();
        handleZoom('right', 'in');
      }
      // Alt+4: Zoom Out Right (if unlocked)
      if (e.altKey && e.key === '4' && !isLocked) {
        e.preventDefault();
        handleZoom('right', 'out');
      }
      // Alt+9: Reset Right (if unlocked)
      if (e.altKey && e.key === '9' && !isLocked) {
        e.preventDefault();
        handleReset('right');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, leftTransform, rightTransform, canvasWidth, projectSlug]);

  const isLayerVisible = (layerName: string) => {
    if (diffData.type === 'schematic') return true;
    if (visibleLayers.length === 0) return true;
    return visibleLayers.includes(layerName) || layerName === 'MultiLayer';
  };

  const getDiffStyle = (status: 'added' | 'deleted' | 'modified' | 'unchanged', isNewRevision: boolean) => {
    if (status === 'unchanged') {
      return { color: '#64748b', opacity: 0.6 }; // Slate-500 gray
    }
    if (status === 'added' && isNewRevision) {
      return { color: '#10b981', opacity: 1.0 }; // Green addition
    }
    if (status === 'deleted' && !isNewRevision) {
      return { color: '#ef4444', opacity: 1.0 }; // Red deletion
    }
    if (status === 'modified') {
      return { color: '#f59e0b', opacity: 1.0 }; // Yellow modification
    }
    return { color: '#334155', opacity: 0.2 }; // Hidden/ignored status on opposite side
  };

  const drawCanvas = (canvas: HTMLCanvasElement | null, isNewRevision: boolean, currentTransform: ViewportTransform) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const revision = isNewRevision ? diffData.newRevision : diffData.oldRevision;

    // Clear background
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.fillRect(0, 0, canvasWidth, dimensions.height);

    // Draw grid
    ctx.strokeStyle = '#1e293b'; // slate-800
    ctx.lineWidth = 0.5;
    const gridSize = 20 * currentTransform.scale;
    const gridOffsetX = currentTransform.offsetX % gridSize;
    const gridOffsetY = currentTransform.offsetY % gridSize;

    for (let x = gridOffsetX; x < canvasWidth; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, dimensions.height);
      ctx.stroke();
    }
    for (let y = gridOffsetY; y < dimensions.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
    }

    if (diffData.type === 'pcb') {
      // 1. Draw traces
      const pcbRev = revision as any;
      for (const t of pcbRev.traces || []) {
        if (!isLayerVisible(t.layer)) continue;

        const style = getDiffStyle(t.diffStatus, isNewRevision);
        if (style.opacity === 0.2) continue; // Skip displaying added on old / deleted on new

        ctx.strokeStyle = style.color;
        ctx.lineWidth = Math.max(1, t.width * currentTransform.scale);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        const p0 = toScreen(t.points[0].x, t.points[0].y, currentTransform);
        ctx.moveTo(p0.x, p0.y);
        for (let idx = 1; idx < t.points.length; idx++) {
          const pt = toScreen(t.points[idx].x, t.points[idx].y, currentTransform);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
      }

      // 2. Draw Vias
      for (const v of pcbRev.vias || []) {
        const isViaVisible = v.layers.some((l: string) => isLayerVisible(l));
        if (!isViaVisible) continue;

        const style = getDiffStyle(v.diffStatus, isNewRevision);
        if (style.opacity === 0.2) continue;

        const screenPos = toScreen(v.x, v.y, currentTransform);
        const radius = (v.diameter / 2) * currentTransform.scale;
        const drillRadius = (v.drill / 2) * currentTransform.scale;

        // Outer ring
        ctx.fillStyle = style.color;
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Inner hole
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, drillRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Draw Footprints (components & pads)
      for (const comp of pcbRev.components || []) {
        if (!isLayerVisible(comp.layer)) continue;

        const compStyle = getDiffStyle(comp.diffStatus, isNewRevision);
        if (compStyle.opacity === 0.2) continue;

        // Render pads
        for (const pad of comp.pads || []) {
          if (!isLayerVisible(pad.layer)) continue;

          const sp = toScreen(pad.x, pad.y, currentTransform);
          const pw = pad.width * currentTransform.scale;
          const ph = pad.height * currentTransform.scale;

          ctx.fillStyle = comp.diffStatus === 'unchanged' ? getLayerColor(pad.layer) : compStyle.color;

          if (pad.shape === 'circle' || pad.shape === 'round') {
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, pw / 2, 0, Math.PI * 2);
            ctx.fill();
            if (pad.drill > 0) {
              ctx.fillStyle = '#0f172a';
              ctx.beginPath();
              ctx.arc(sp.x, sp.y, (pad.drill / 2) * currentTransform.scale, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            ctx.fillRect(sp.x - pw / 2, sp.y - ph / 2, pw, ph);
            if (pad.drill > 0) {
              ctx.fillStyle = '#0f172a';
              ctx.beginPath();
              ctx.arc(sp.x, sp.y, (pad.drill / 2) * currentTransform.scale, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }

        // Draw component outline / anchor
        const sc = toScreen(comp.x, comp.y, currentTransform);
        ctx.strokeStyle = compStyle.color;
        ctx.lineWidth = comp.diffStatus !== 'unchanged' ? 2 : 1;
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, 2 * currentTransform.scale, 0, Math.PI * 2);
        ctx.stroke();

        // Designator
        if (currentTransform.scale > 1.5) {
          ctx.fillStyle = compStyle.color;
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(comp.designator, sc.x, sc.y - 3 * currentTransform.scale);
        }
      }
    } else {
      // Schematic drawing
      const schRev = revision as any;
      // Wires (Nets)
      for (const net of schRev.nets || []) {
        const netStyle = getDiffStyle(net.diffStatus, isNewRevision);
        if (netStyle.opacity === 0.2) continue;

        ctx.strokeStyle = netStyle.color;
        ctx.lineWidth = net.diffStatus !== 'unchanged' ? 2.5 : 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const seg of net.segments || []) {
          ctx.beginPath();
          const p0 = toScreen(seg.points[0].x, seg.points[0].y, currentTransform);
          ctx.moveTo(p0.x, p0.y);
          for (let idx = 1; idx < seg.points.length; idx++) {
            const pt = toScreen(seg.points[idx].x, seg.points[idx].y, currentTransform);
            ctx.lineTo(pt.x, pt.y);
          }
          ctx.stroke();
        }
      }

      // Schematic Components
      for (const comp of schRev.components || []) {
        const compStyle = getDiffStyle(comp.diffStatus, isNewRevision);
        if (compStyle.opacity === 0.2) continue;

        const sc = toScreen(comp.x, comp.y, currentTransform);
        const size = 6 * currentTransform.scale;

        // Outline
        ctx.strokeStyle = compStyle.color;
        ctx.lineWidth = comp.diffStatus !== 'unchanged' ? 3 : 2;
        ctx.strokeRect(sc.x - size, sc.y - size, size * 2, size * 2);
        ctx.fillStyle = comp.diffStatus !== 'unchanged' ? 'rgba(245, 158, 11, 0.03)' : 'rgba(16, 185, 129, 0.02)';
        ctx.fillRect(sc.x - size, sc.y - size, size * 2, size * 2);

        // Pins
        for (const pin of comp.pins || []) {
          const sp = toScreen(pin.x, pin.y, currentTransform);
          ctx.strokeStyle = compStyle.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sc.x, sc.y);
          ctx.lineTo(sp.x, sp.y);
          ctx.stroke();

          ctx.fillStyle = '#f43f5e';
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Labels
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(comp.designator, sc.x, sc.y - size - 5);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(comp.value, sc.x, sc.y + size + 10);
      }
    }
  };

  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>, side: 'left' | 'right') => {
    setIsPanning(true);
    setActiveSide(side);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>, side: 'left' | 'right') => {
    const currentTransform = side === 'left' ? leftTransform : rightTransform;

    if (isPanning) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      
      const updateTransform = (prev: ViewportTransform) => ({
        ...prev,
        offsetX: prev.offsetX + dx,
        offsetY: prev.offsetY + dy,
      });

      if (isLocked) {
        setLeftTransform(updateTransform);
        setRightTransform(updateTransform);
      } else {
        if (activeSide === 'left') {
          setLeftTransform(updateTransform);
        } else {
          setRightTransform(updateTransform);
        }
      }
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // Hover detection logic
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const nativeCoords = toNative(mouseX, mouseY, currentTransform);

    const revision = side === 'right' ? diffData.newRevision : diffData.oldRevision;
    let foundItemText = '';
    let foundSubText = '';

    // Check components
    for (const comp of revision.components || []) {
      if (diffData.type === 'pcb' && !isLayerVisible((comp as any).layer)) continue;
      const dist = Math.hypot(nativeCoords.x - comp.x, nativeCoords.y - comp.y);
      if (dist < 4) {
        const stateWord = comp.diffStatus.toUpperCase();
        const layerStr = diffData.type === 'pcb' ? ` | Layer: ${(comp as any).layer}` : '';
        foundItemText = `${comp.designator} (${comp.value})`;
        foundSubText = `Status: ${stateWord}${layerStr}`;
        break;
      }
    }

    if (foundItemText) {
      setHoverInfo({
        x: mouseX,
        y: mouseY,
        text: foundItemText,
        subText: foundSubText,
        side,
      });
    } else {
      setHoverInfo(null);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: WheelEvent<HTMLCanvasElement>, side: 'left' | 'right') => {
    const currentTransform = side === 'left' ? leftTransform : rightTransform;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newScale = Math.max(0.1, Math.min(100, currentTransform.scale * zoomFactor));

    const nativeCoords = toNative(mouseX, mouseY, currentTransform);
    const newOffsetX = mouseX - nativeCoords.x * newScale;
    const newOffsetY = mouseY - nativeCoords.y * newScale;

    const updateTransform = (prev: ViewportTransform) => ({
      scale: newScale,
      offsetX: newOffsetX,
      offsetY: newOffsetY,
    });

    if (isLocked) {
      setLeftTransform(updateTransform);
      setRightTransform(updateTransform);
    } else {
      if (side === 'left') {
        setLeftTransform(updateTransform);
      } else {
        setRightTransform(updateTransform);
      }
    }
  };

  const handleZoom = (side: 'left' | 'right', dir: 'in' | 'out') => {
    const factor = dir === 'in' ? 1.3 : 0.7;

    const applyZoom = (t: ViewportTransform) => {
      const newScale = Math.max(0.1, Math.min(100, t.scale * factor));
      const centerX = canvasWidth / 2;
      const centerY = dimensions.height / 2;
      const nativeCoords = toNative(centerX, centerY, t);
      return {
        scale: newScale,
        offsetX: centerX - nativeCoords.x * newScale,
        offsetY: centerY - nativeCoords.y * newScale,
      };
    };

    if (isLocked) {
      setLeftTransform(prev => {
        const next = applyZoom(prev);
        setRightTransform(next);
        return next;
      });
    } else {
      if (side === 'left') {
        setLeftTransform(prev => applyZoom(prev));
      } else {
        setRightTransform(prev => applyZoom(prev));
      }
    }
  };

  const handleApplyPreset = (side: 'left' | 'right', percentage: number) => {
    const scale = percentage / 100;

    const applyPreset = (t: ViewportTransform) => {
      const centerX = canvasWidth / 2;
      const centerY = dimensions.height / 2;
      const nativeCoords = toNative(centerX, centerY, t);
      return {
        scale,
        offsetX: centerX - nativeCoords.x * scale,
        offsetY: centerY - nativeCoords.y * scale,
      };
    };

    if (isLocked) {
      setLeftTransform(prev => {
        const next = applyPreset(prev);
        setRightTransform(next);
        return next;
      });
    } else {
      if (side === 'left') {
        setLeftTransform(prev => applyPreset(prev));
      } else {
        setRightTransform(prev => applyPreset(prev));
      }
    }
  };

  const handleReset = (side: 'left' | 'right' | 'both') => {
    const fit = fitBounds(diffData.bounds, canvasWidth, dimensions.height);
    if (isLocked || side === 'both') {
      setLeftTransform(fit);
      setRightTransform(fit);
    } else {
      if (side === 'left') {
        setLeftTransform(fit);
      } else {
        setRightTransform(fit);
      }
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col select-none overflow-hidden bg-slate-950 rounded-xl border border-slate-800">
      
      {/* Top Floating Controls Bar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10 pointer-events-auto">
        
        {/* Left Side: Revision A Controls */}
        <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2.5 text-xs font-mono text-slate-300 shadow-xl">
          <span className="font-semibold text-red-400">Rev A:</span>
          <span>{Math.round(leftTransform.scale * 100)}%</span>
          <button
            onClick={() => handleZoom('left', 'in')}
            className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-white cursor-pointer"
            title="Zoom In Rev A (Alt+1)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleZoom('left', 'out')}
            className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-white cursor-pointer"
            title="Zoom Out Rev A (Alt+2)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleReset('left')}
            className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-white cursor-pointer"
            title="Reset Rev A (Alt+0)"
          >
            <Maximize className="w-3.5 h-3.5" />
          </button>
          <select
            value={Math.round(leftTransform.scale * 100)}
            title="Left Preset"
            onChange={(e) => handleApplyPreset('left', parseInt(e.target.value))}
            className="bg-slate-950 border border-slate-800 text-[10px] text-slate-300 rounded px-1.5 py-0.5 outline-none cursor-pointer hover:border-slate-700 transition-colors"
          >
            <option value="50">50%</option>
            <option value="100">100%</option>
            <option value="200">200%</option>
            <option value="400">400%</option>
            <option value="800">800%</option>
          </select>
        </div>

        {/* Center: Sync Lock Toggle */}
        <button
          onClick={toggleLock}
          className={`px-4 py-1.5 backdrop-blur-md rounded-full border shadow-xl flex items-center gap-2 text-xs font-semibold cursor-pointer transition-all ${
            isLocked 
              ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/20' 
              : 'bg-slate-900/90 text-slate-400 border-slate-800 hover:text-slate-300 hover:bg-slate-800'
          }`}
          title="Toggle Synchronized Viewports (Alt+L)"
        >
          {isLocked ? (
            <>
              <Link2 className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span>Synchronized Viewports</span>
            </>
          ) : (
            <>
              <Link2Off className="w-4 h-4 text-slate-500" />
              <span>Independent Viewports</span>
            </>
          )}
        </button>

        {/* Right Side: Revision B Controls */}
        <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2.5 text-xs font-mono text-slate-300 shadow-xl">
          <span className="font-semibold text-emerald-400">Rev B:</span>
          <span>{isLocked ? Math.round(leftTransform.scale * 100) : Math.round(rightTransform.scale * 100)}%</span>
          <button
            onClick={() => handleZoom('right', 'in')}
            disabled={isLocked}
            className={`p-1 hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-white cursor-pointer ${isLocked ? 'opacity-30 cursor-not-allowed' : ''}`}
            title={isLocked ? "Zoom is synchronized (Unlock to customize)" : "Zoom In Rev B (Alt+3)"}
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleZoom('right', 'out')}
            disabled={isLocked}
            className={`p-1 hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-white cursor-pointer ${isLocked ? 'opacity-30 cursor-not-allowed' : ''}`}
            title={isLocked ? "Zoom is synchronized (Unlock to customize)" : "Zoom Out Rev B (Alt+4)"}
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleReset('right')}
            disabled={isLocked}
            className={`p-1 hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-white cursor-pointer ${isLocked ? 'opacity-30 cursor-not-allowed' : ''}`}
            title={isLocked ? "Zoom is synchronized (Unlock to customize)" : "Reset Rev B (Alt+9)"}
          >
            <Maximize className="w-3.5 h-3.5" />
          </button>
          <select
            value={isLocked ? Math.round(leftTransform.scale * 100) : Math.round(rightTransform.scale * 100)}
            title="Right Preset"
            disabled={isLocked}
            onChange={(e) => handleApplyPreset('right', parseInt(e.target.value))}
            className={`bg-slate-950 border border-slate-800 text-[10px] text-slate-300 rounded px-1.5 py-0.5 outline-none cursor-pointer hover:border-slate-700 transition-colors ${isLocked ? 'opacity-30 cursor-not-allowed' : ''}`}
          >
            <option value="50">50%</option>
            <option value="100">100%</option>
            <option value="200">200%</option>
            <option value="400">400%</option>
            <option value="800">800%</option>
          </select>
        </div>

      </div>

      {/* Floating Hover Tooltip */}
      {hoverInfo && (
        <div
          ref={(el) => {
            if (el) {
              el.style.left = `${hoverInfo.side === 'left' ? hoverInfo.x + 15 : hoverInfo.x + canvasWidth + 25}px`;
              el.style.top = `${hoverInfo.y + 15}px`;
            }
          }}
          className="absolute z-20 pointer-events-none bg-slate-900/95 backdrop-blur-md border border-slate-700 px-3 py-2 rounded-lg text-xs shadow-2xl transition-all max-w-[250px]"
        >
          <div className="font-bold text-slate-100">{hoverInfo.text}</div>
          {hoverInfo.subText && <div className="text-[10px] text-slate-400 mt-0.5">{hoverInfo.subText}</div>}
        </div>
      )}

      {/* Synchronized Side-by-Side Canvas Columns */}
      <div className="flex flex-1 w-full h-full relative">
        {/* Left Column: Old Revision */}
        <div className="flex-1 h-full relative">
          <div className="absolute top-14 left-4 z-10 px-2 py-0.5 bg-red-950/60 backdrop-blur-sm border border-red-500/20 text-[10px] font-mono font-semibold text-red-400 rounded">
            Base Revision A (Old)
          </div>
          <canvas
            ref={leftCanvasRef}
            width={canvasWidth}
            height={dimensions.height}
            onMouseDown={(e) => handleMouseDown(e, 'left')}
            onMouseMove={(e) => handleMouseMove(e, 'left')}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={(e) => handleWheel(e, 'left')}
            className={`w-full h-full block cursor-grab ${isPanning ? 'cursor-grabbing' : ''}`}
          />
        </div>

        {/* Dynamic Vertical Separation Border splitter */}
        {isBorderVisible && (
          <div
            ref={borderRef}
            tabIndex={0}
            className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[3px] z-10 rounded-full transition-colors duration-200 focus:outline-none pointer-events-auto"
            style={{
              backgroundColor: isBorderHovered || isBorderFocused
                ? '#2B6CB0' 
                : (isDarkMode ? '#BFBFBF' : '#4B4B4B'),
              cursor: 'col-resize'
            }}
            onMouseEnter={() => setIsBorderHovered(true)}
            onMouseLeave={() => setIsBorderHovered(false)}
            onFocus={() => setIsBorderFocused(true)}
            onBlur={() => setIsBorderFocused(false)}
            aria-label="Diff panel separator"
          />
        )}

        {/* Right Column: New Revision */}
        <div className="flex-1 h-full relative">
          <div className="absolute top-14 left-4 z-10 px-2 py-0.5 bg-emerald-950/60 backdrop-blur-sm border border-emerald-500/20 text-[10px] font-mono font-semibold text-emerald-400 rounded">
            Target Revision B (New)
          </div>
          <canvas
            ref={rightCanvasRef}
            width={canvasWidth}
            height={dimensions.height}
            onMouseDown={(e) => handleMouseDown(e, 'right')}
            onMouseMove={(e) => handleMouseMove(e, 'right')}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={(e) => handleWheel(e, 'right')}
            className={`w-full h-full block cursor-grab ${isPanning ? 'cursor-grabbing' : ''}`}
          />
        </div>
      </div>
    </div>
  );
}
