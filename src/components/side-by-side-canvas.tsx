"use client";

import React, { useRef, useEffect, useState, MouseEvent, WheelEvent, useCallback, useMemo } from 'react';
import { Point } from '../lib/parsers/kicad/pcbParser';
import { toScreen, toNative, fitBounds, ViewportTransform } from '../lib/canvas/coordinate-translator';
import { DiffedHardwareData } from '../lib/diff/diffEngine';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Link2, 
  Link2Off,
  ChevronRight,
  ChevronLeft,
  Layers,
  SlidersHorizontal,
  RefreshCw,
  Copy,
  Eye,
  EyeOff
} from 'lucide-react';
import { resolveLayerStyle, getOrderedLayers } from '../lib/layers/layer-colors';

interface SideBySideCanvasProps {
  diffData: DiffedHardwareData;
  visibleLayers?: string[];
  projectSlug?: string;
}

export default function SideBySideCanvas({
  diffData,
  visibleLayers: initialVisibleLayers = [],
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

  // Colorblind and Sidebars States
  const [isColorblind, setIsColorblind] = useState<boolean>(false);

  const [sidebarOpenA, setSidebarOpenA] = useState<boolean>(true);
  const [visibleLayersA, setVisibleLayersA] = useState<string[]>([]);
  const [layerOpacitiesA, setLayerOpacitiesA] = useState<Record<string, number>>({});
  const [customColorsA, setCustomColorsA] = useState<Record<string, string>>({});
  const [showOnlyDiffA, setShowOnlyDiffA] = useState<boolean>(false);

  const [sidebarOpenB, setSidebarOpenB] = useState<boolean>(true);
  const [visibleLayersB, setVisibleLayersB] = useState<string[]>([]);
  const [layerOpacitiesB, setLayerOpacitiesB] = useState<Record<string, number>>({});
  const [customColorsB, setCustomColorsB] = useState<Record<string, string>>({});
  const [showOnlyDiffB, setShowOnlyDiffB] = useState<boolean>(false);

  // Computed layout variables
  const sidebarWidth = 200;
  const colWidth = Math.max(100, Math.floor(dimensions.width / 2));
  
  // Detect theme colors
  const swatchOutlineColor = isDarkMode ? '#ffffff' : '#000000';

  // Load and apply persistent settings per project
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const loadLocal = (suffix: string, fallback: any) => {
      const val = localStorage.getItem(`project:${projectSlug}.${suffix}`);
      if (val !== null) {
        try { return JSON.parse(val); } catch { return val; }
      }
      return fallback;
    };

    setSidebarOpenA(loadLocal('panelA.sidebarVisible', true));
    setSidebarOpenB(loadLocal('panelB.sidebarVisible', true));
    setIsColorblind(loadLocal('isColorblindDiff', false));
    setIsLocked(loadLocal('diff-zoom-locked', true));
    setIsBorderVisible(loadLocal('diffBorderVisible', true));

    const stateA = loadLocal('panelA.layerStates', null);
    if (stateA) {
      if (stateA.visibleLayers) setVisibleLayersA(stateA.visibleLayers);
      if (stateA.layerOpacities) setLayerOpacitiesA(stateA.layerOpacities);
      if (stateA.customColors) setCustomColorsA(stateA.customColors);
    } else {
      setVisibleLayersA(diffData.type === 'pcb' ? (diffData.oldRevision as any).layers || [] : []);
    }

    const stateB = loadLocal('panelB.layerStates', null);
    if (stateB) {
      if (stateB.visibleLayers) setVisibleLayersB(stateB.visibleLayers);
      if (stateB.layerOpacities) setLayerOpacitiesB(stateB.layerOpacities);
      if (stateB.customColors) setCustomColorsB(stateB.customColors);
    } else {
      setVisibleLayersB(diffData.type === 'pcb' ? (diffData.newRevision as any).layers || [] : []);
    }
  }, [projectSlug, diffData]);

  // Persistence helpers
  const saveStateA = useCallback((visible: string[], opacities: Record<string, number>, colors: Record<string, string>) => {
    localStorage.setItem(`project:${projectSlug}.panelA.layerStates`, JSON.stringify({
      visibleLayers: visible,
      layerOpacities: opacities,
      customColors: colors
    }));
  }, [projectSlug]);

  const saveStateB = useCallback((visible: string[], opacities: Record<string, number>, colors: Record<string, string>) => {
    localStorage.setItem(`project:${projectSlug}.panelB.layerStates`, JSON.stringify({
      visibleLayers: visible,
      layerOpacities: opacities,
      customColors: colors
    }));
  }, [projectSlug]);

  const saveSidebarAVisible = useCallback((open: boolean) => {
    localStorage.setItem(`project:${projectSlug}.panelA.sidebarVisible`, String(open));
  }, [projectSlug]);

  const saveSidebarBVisible = useCallback((open: boolean) => {
    localStorage.setItem(`project:${projectSlug}.panelB.sidebarVisible`, String(open));
  }, [projectSlug]);

  // Sidebar transition resize trigger to reflow canvases
  const handleSidebarToggle = () => {
    const handleResize = () => {
      window.dispatchEvent(new Event('resize'));
    };
    const interval = setInterval(handleResize, 16);
    setTimeout(() => {
      clearInterval(interval);
      handleResize();
    }, 220);
  };

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

  // Fit bounds initially
  useEffect(() => {
    if (colWidth > 0 && dimensions.height > 0 && diffData) {
      const fitLeft = fitBounds(diffData.bounds, colWidth - (sidebarOpenA ? sidebarWidth : 0), dimensions.height);
      const fitRight = fitBounds(diffData.bounds, colWidth - (sidebarOpenB ? sidebarWidth : 0), dimensions.height);
      setLeftTransform(fitLeft);
      setRightTransform(isLocked ? fitLeft : fitRight);
    }
  }, [diffData, colWidth, dimensions.height, sidebarOpenA, sidebarOpenB, isLocked]);

  // Theme observer
  useEffect(() => {
    const checkTheme = () => {
      const isDark = document.documentElement.classList.contains('dark') || 
                     document.documentElement.style.colorScheme === 'dark' ||
                     window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDarkMode(isDark);
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Sync Lock Toggle
  const toggleLock = () => {
    setIsLocked(prev => {
      const next = !prev;
      localStorage.setItem(`project:${projectSlug}.diff-zoom-locked`, String(next));
      if (next) {
        setRightTransform(leftTransform);
      }
      return next;
    });
  };

  // Border Guideline Toggle
  const toggleBorder = () => {
    setIsBorderVisible(prev => {
      const next = !prev;
      localStorage.setItem(`project:${projectSlug}.diffBorderVisible`, String(next));
      return next;
    });
  };

  // Extract ordered layers lists
  const layersA = useMemo(() => getOrderedLayers(diffData.type === 'pcb' ? (diffData.oldRevision as any).layers || [] : []), [diffData]);
  const layersB = useMemo(() => getOrderedLayers(diffData.type === 'pcb' ? (diffData.newRevision as any).layers || [] : []), [diffData]);

  // Compute layers with differences (Show only relevant toggle)
  const diffLayersA = useMemo(() => {
    const s = new Set<string>();
    const rev = diffData.oldRevision as any;
    for (const t of rev.traces || []) {
      if (t.diffStatus !== 'unchanged') s.add(t.layer);
    }
    for (const v of rev.vias || []) {
      if (v.diffStatus !== 'unchanged') v.layers.forEach((l: string) => s.add(l));
    }
    for (const comp of rev.components || []) {
      if (comp.diffStatus !== 'unchanged') s.add(comp.layer);
      for (const pad of comp.pads || []) {
        if (pad.diffStatus !== 'unchanged') s.add(pad.layer);
      }
    }
    return Array.from(s);
  }, [diffData]);

  const diffLayersB = useMemo(() => {
    const s = new Set<string>();
    const rev = diffData.newRevision as any;
    for (const t of rev.traces || []) {
      if (t.diffStatus !== 'unchanged') s.add(t.layer);
    }
    for (const v of rev.vias || []) {
      if (v.diffStatus !== 'unchanged') v.layers.forEach((l: string) => s.add(l));
    }
    for (const comp of rev.components || []) {
      if (comp.diffStatus !== 'unchanged') s.add(comp.layer);
      for (const pad of comp.pads || []) {
        if (pad.diffStatus !== 'unchanged') s.add(pad.layer);
      }
    }
    return Array.from(s);
  }, [diffData]);

  const activeVisibleLayersA = useMemo(() => {
    if (showOnlyDiffA) {
      return visibleLayersA.filter(l => diffLayersA.includes(l));
    }
    return visibleLayersA;
  }, [visibleLayersA, showOnlyDiffA, diffLayersA]);

  const activeVisibleLayersB = useMemo(() => {
    if (showOnlyDiffB) {
      return visibleLayersB.filter(l => diffLayersB.includes(l));
    }
    return visibleLayersB;
  }, [visibleLayersB, showOnlyDiffB, diffLayersB]);

  // --- Main Draw Loop ---
  useEffect(() => {
    drawCanvas(leftCanvasRef.current, false, leftTransform, activeVisibleLayersA, layerOpacitiesA, customColorsA);
    drawCanvas(rightCanvasRef.current, true, rightTransform, activeVisibleLayersB, layerOpacitiesB, customColorsB);
  }, [diffData, leftTransform, rightTransform, activeVisibleLayersA, layerOpacitiesA, customColorsA, activeVisibleLayersB, layerOpacitiesB, customColorsB, dimensions, isColorblind]);

  // Zoom preset actions
  const handleApplyPreset = (side: 'left' | 'right', scalePct: number) => {
    const scale = scalePct / 100;
    const update = (prev: ViewportTransform) => ({ ...prev, scale });
    if (side === 'left') {
      setLeftTransform(update);
      if (isLocked) setRightTransform(update);
    } else {
      setRightTransform(update);
    }
  };

  const handleZoom = (side: 'left' | 'right', direction: 'in' | 'out') => {
    const factor = direction === 'in' ? 1.25 : 1 / 1.25;
    const update = (prev: ViewportTransform) => ({ ...prev, scale: Math.max(0.05, Math.min(prev.scale * factor, 150)) });
    if (side === 'left') {
      setLeftTransform(update);
      if (isLocked) setRightTransform(update);
    } else {
      setRightTransform(update);
    }
  };

  const handleReset = (side: 'left' | 'right') => {
    const fitLeft = fitBounds(diffData.bounds, colWidth - (sidebarOpenA ? sidebarWidth : 0), dimensions.height);
    const fitRight = fitBounds(diffData.bounds, colWidth - (sidebarOpenB ? sidebarWidth : 0), dimensions.height);
    if (side === 'left') {
      setLeftTransform(fitLeft);
      if (isLocked) setRightTransform(fitLeft);
    } else {
      setRightTransform(fitRight);
    }
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        toggleLock();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === '|' || e.key === '\\')) {
        e.preventDefault();
        toggleBorder();
      }
      if (e.altKey && e.key === '1') {
        e.preventDefault();
        handleZoom('left', 'in');
      }
      if (e.altKey && e.key === '2') {
        e.preventDefault();
        handleZoom('left', 'out');
      }
      if (e.altKey && e.key === '0') {
        e.preventDefault();
        handleReset('left');
      }
      if (e.altKey && e.key === '3' && !isLocked) {
        e.preventDefault();
        handleZoom('right', 'in');
      }
      if (e.altKey && e.key === '4' && !isLocked) {
        e.preventDefault();
        handleZoom('right', 'out');
      }
      if (e.altKey && e.key === '9' && !isLocked) {
        e.preventDefault();
        handleReset('right');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, leftTransform, rightTransform, colWidth, sidebarOpenA, sidebarOpenB, projectSlug]);

  // Helper to determine diff rendering styles
  const getDiffStyle = (
    status: 'added' | 'deleted' | 'modified' | 'unchanged', 
    isNewRevision: boolean,
    layerName?: string,
    layerOpacitiesMap: Record<string, number> = {},
    customColorsMap: Record<string, string> = {}
  ) => {
    const opacityVal = layerName ? (layerOpacitiesMap[layerName] ?? 1) : 1;

    if (status === 'unchanged') {
      const baseColor = layerName ? (customColorsMap[layerName] || resolveLayerStyle(layerName).color) : '#64748b';
      return { color: baseColor, opacity: 0.45 * opacityVal, dash: null };
    }
    if (status === 'added' && isNewRevision) {
      const color = isColorblind ? '#0072B2' : '#10b981'; // Colorblind blue vs Green
      return { color, opacity: 1.0 * opacityVal, dash: isColorblind ? [6, 4] : null };
    }
    if (status === 'deleted' && !isNewRevision) {
      const color = isColorblind ? '#D55E00' : '#ef4444'; // Colorblind Vermillion vs Red
      return { color, opacity: 1.0 * opacityVal, dash: isColorblind ? [2, 3] : null };
    }
    if (status === 'modified') {
      return { color: '#f59e0b', opacity: 1.0 * opacityVal, dash: null };
    }
    return { color: '#334155', opacity: 0.1, dash: null };
  };

  const drawCanvas = (
    canvas: HTMLCanvasElement | null, 
    isNewRevision: boolean, 
    currentTransform: ViewportTransform,
    visibleLayersList: string[],
    layerOpacitiesMap: Record<string, number>,
    customColorsMap: Record<string, string>
  ) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const revision = isNewRevision ? diffData.newRevision : diffData.oldRevision;
    const width = canvas.clientWidth || 400;
    const height = canvas.clientHeight || dimensions.height;

    // Sync canvas buffer sizing
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    // Substrate
    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, width, height);

    // Draw Grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;
    const gridSize = 20 * currentTransform.scale;
    const gridOffsetX = currentTransform.offsetX % gridSize;
    const gridOffsetY = currentTransform.offsetY % gridSize;

    for (let x = gridOffsetX; x < width; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = gridOffsetY; y < height; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    const isLayerVisible = (layerName: string): boolean => {
      if (diffData.type === 'schematic') return true;
      if (visibleLayersList.length === 0) return true;
      return visibleLayersList.includes(layerName) || layerName === 'MultiLayer';
    };

    if (diffData.type === 'pcb') {
      const pcbRev = revision as any;

      // 1. Draw traces
      for (const t of pcbRev.traces || []) {
        if (!isLayerVisible(t.layer)) continue;

        const style = getDiffStyle(t.diffStatus, isNewRevision, t.layer, layerOpacitiesMap, customColorsMap);
        if (style.opacity <= 0.15) continue;

        ctx.save();
        ctx.strokeStyle = style.color;
        ctx.globalAlpha = style.opacity;
        ctx.lineWidth = Math.max(1, t.width * currentTransform.scale);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (style.dash) {
          ctx.setLineDash(style.dash.map(d => d * currentTransform.scale));
        }

        ctx.beginPath();
        const p0 = toScreen(t.points[0].x, t.points[0].y, currentTransform);
        ctx.moveTo(p0.x, p0.y);
        for (let idx = 1; idx < t.points.length; idx++) {
          const pt = toScreen(t.points[idx].x, t.points[idx].y, currentTransform);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // 2. Draw Vias
      for (const v of pcbRev.vias || []) {
        const isViaVisible = v.layers.some((l: string) => isLayerVisible(l));
        if (!isViaVisible) continue;

        const style = getDiffStyle(v.diffStatus, isNewRevision, 'Vias', layerOpacitiesMap, customColorsMap);
        if (style.opacity <= 0.15) continue;

        const screenPos = toScreen(v.x, v.y, currentTransform);
        const radius = (v.diameter / 2) * currentTransform.scale;
        const drillRadius = (v.drill / 2) * currentTransform.scale;

        ctx.save();
        ctx.fillStyle = style.color;
        ctx.globalAlpha = style.opacity;
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Pattern outline boundary for accessibility
        if (isColorblind && style.dash) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.setLineDash(style.dash.map(d => d * currentTransform.scale));
          ctx.beginPath();
          ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle = '#0b0f19';
        ctx.globalAlpha = 1.0;
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, drillRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 3. Components & Pads
      for (const comp of pcbRev.components || []) {
        if (!isLayerVisible(comp.layer)) continue;

        const compStyle = getDiffStyle(comp.diffStatus, isNewRevision, comp.layer, layerOpacitiesMap, customColorsMap);
        if (compStyle.opacity <= 0.15) continue;

        // Render pads
        for (const pad of comp.pads || []) {
          if (!isLayerVisible(pad.layer)) continue;

          const style = getDiffStyle(pad.diffStatus, isNewRevision, pad.layer, layerOpacitiesMap, customColorsMap);
          const sp = toScreen(pad.x, pad.y, currentTransform);
          const pw = pad.width * currentTransform.scale;
          const ph = pad.height * currentTransform.scale;

          ctx.save();
          ctx.fillStyle = style.color;
          ctx.globalAlpha = style.opacity;

          if (pad.shape === 'circle' || pad.shape === 'round') {
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, pw / 2, 0, Math.PI * 2);
            ctx.fill();

            if (isColorblind && style.dash) {
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1;
              ctx.setLineDash(style.dash.map(d => d * currentTransform.scale));
              ctx.beginPath();
              ctx.arc(sp.x, sp.y, pw / 2, 0, Math.PI * 2);
              ctx.stroke();
            }
          } else {
            ctx.fillRect(sp.x - pw / 2, sp.y - ph / 2, pw, ph);

            if (isColorblind && style.dash) {
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1;
              ctx.setLineDash(style.dash.map(d => d * currentTransform.scale));
              ctx.strokeRect(sp.x - pw / 2, sp.y - ph / 2, pw, ph);
            }
          }

          if (pad.drill > 0) {
            ctx.fillStyle = '#0b0f19';
            ctx.globalAlpha = 1.0;
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, (pad.drill / 2) * currentTransform.scale, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // Anchor outlines
        const sc = toScreen(comp.x, comp.y, currentTransform);
        ctx.save();
        ctx.strokeStyle = compStyle.color;
        ctx.globalAlpha = compStyle.opacity;
        ctx.lineWidth = comp.diffStatus !== 'unchanged' ? 2 : 1;
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, 2 * currentTransform.scale, 0, Math.PI * 2);
        ctx.stroke();

        if (currentTransform.scale > 1.5) {
          ctx.fillStyle = compStyle.color;
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(comp.designator, sc.x, sc.y - 3 * currentTransform.scale);
        }
        ctx.restore();
      }
    } else {
      // Schematic rendering
      const schRev = revision as any;
      for (const net of schRev.nets || []) {
        const netStyle = getDiffStyle(net.diffStatus, isNewRevision);
        if (netStyle.opacity === 0.2) continue;

        ctx.save();
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
        ctx.restore();
      }

      for (const comp of schRev.components || []) {
        const compStyle = getDiffStyle(comp.diffStatus, isNewRevision);
        if (compStyle.opacity === 0.2) continue;

        const sc = toScreen(comp.x, comp.y, currentTransform);
        const size = 6 * currentTransform.scale;

        ctx.save();
        ctx.strokeStyle = compStyle.color;
        ctx.lineWidth = comp.diffStatus !== 'unchanged' ? 3 : 2;
        ctx.strokeRect(sc.x - size, sc.y - size, size * 2, size * 2);
        ctx.fillStyle = comp.diffStatus !== 'unchanged' ? 'rgba(245, 158, 11, 0.03)' : 'rgba(16, 185, 129, 0.02)';
        ctx.fillRect(sc.x - size, sc.y - size, size * 2, size * 2);

        for (const pin of comp.pins || []) {
          const sp = toScreen(pin.x, pin.y, currentTransform);
          ctx.strokeStyle = compStyle.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sc.x, sc.y);
          ctx.lineTo(sp.x, sp.y);
          ctx.stroke();
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(comp.designator, sc.x, sc.y - size - 5);
        ctx.restore();
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
    const canvas = side === 'left' ? leftCanvasRef.current : rightCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

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
        if (side === 'left') setLeftTransform(updateTransform);
        else setRightTransform(updateTransform);
      }
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    const native = toNative(sx, sy, currentTransform);
    let matchedText = "";
    let matchedSubText = "";

    const isLayerVisible = (layerName: string): boolean => {
      const list = side === 'left' ? activeVisibleLayersA : activeVisibleLayersB;
      if (diffData.type === 'schematic') return true;
      if (list.length === 0) return true;
      return list.includes(layerName) || layerName === 'MultiLayer';
    };

    const revision = side === 'left' ? diffData.oldRevision : diffData.newRevision;
    if (diffData.type === 'pcb') {
      const pcbRev = revision as any;
      for (const comp of pcbRev.components || []) {
        for (const pad of comp.pads || []) {
          if (!isLayerVisible(pad.layer)) continue;
          const pd = Math.hypot(pad.x - native.x, pad.y - native.y);
          if (pd < Math.max(pad.width, pad.height) / 2) {
            matchedText = `Pad: ${comp.designator}.${pad.name} (${pad.net || 'N/C'})`;
            matchedSubText = `Footprint: ${comp.footprint} | Layer: ${pad.layer} | Diff: ${pad.diffStatus.toUpperCase()}`;
            break;
          }
        }
        if (matchedText) break;
      }

      if (!matchedText) {
        for (const t of pcbRev.traces || []) {
          if (!isLayerVisible(t.layer)) continue;
          for (let k = 0; k < t.points.length - 1; k++) {
            const p1 = t.points[k];
            const p2 = t.points[k + 1];
            const d = pointToSegmentDistance(native, p1, p2);
            if (d < t.width / 2 + 0.3) {
              matchedText = `Trace Net: ${t.net}`;
              matchedSubText = `Layer: ${t.layer} | Width: ${t.width}mm | Diff: ${t.diffStatus.toUpperCase()}`;
              break;
            }
          }
          if (matchedText) break;
        }
      }
    } else {
      const schRev = revision as any;
      for (const comp of schRev.components || []) {
        const d = Math.hypot(comp.x - native.x, comp.y - native.y);
        if (d < 8.0) {
          matchedText = `Symbol: ${comp.designator}`;
          matchedSubText = `Value: ${comp.value} | Diff: ${comp.diffStatus.toUpperCase()}`;
          break;
        }
      }
    }

    if (matchedText) {
      setHoverInfo({ x: sx, y: sy, text: matchedText, subText: matchedSubText, side });
    } else {
      setHoverInfo(null);
    }
  };

  const handleMouseUp = () => setIsPanning(false);

  const handleWheel = (e: WheelEvent<HTMLCanvasElement>, side: 'left' | 'right') => {
    e.preventDefault();
    const canvas = side === 'left' ? leftCanvasRef.current : rightCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const currentTransform = side === 'left' ? leftTransform : rightTransform;
    const native = toNative(sx, sy, currentTransform);
    const zoomFactor = 1.15;
    const nextScale = e.deltaY < 0 ? currentTransform.scale * zoomFactor : currentTransform.scale / zoomFactor;
    const scale = Math.max(0.05, Math.min(nextScale, 150));

    const updated = {
      scale,
      offsetX: sx - native.x * scale,
      offsetY: sy - native.y * scale
    };

    if (isLocked) {
      setLeftTransform(updated);
      setRightTransform(updated);
    } else {
      if (side === 'left') setLeftTransform(updated);
      else setRightTransform(updated);
    }
  };

  // Helper resolving layer types tags
  const getLayerTypeTag = (layer: string): string => {
    const lower = layer.toLowerCase();
    if (lower.includes('cu') || lower === 'top' || lower === 'bottom') return 'copper';
    if (lower.includes('silk') || lower.includes('place')) return 'silk';
    if (lower.includes('mask') || lower.includes('stop')) return 'mask';
    if (lower.includes('paste') || lower.includes('cream')) return 'paste';
    if (lower === 'vias' || lower === 'pads') return 'drill';
    return 'other';
  };

  // Sync / Copy Options
  const handleApplyToBoth = (sourceSide: 'left' | 'right') => {
    if (sourceSide === 'left') {
      setVisibleLayersB([...visibleLayersA]);
      setLayerOpacitiesB({ ...layerOpacitiesA });
      setCustomColorsB({ ...customColorsA });
      saveStateB([...visibleLayersA], { ...layerOpacitiesA }, { ...customColorsA });
    } else {
      setVisibleLayersA([...visibleLayersB]);
      setLayerOpacitiesA({ ...layerOpacitiesB });
      setCustomColorsA({ ...customColorsB });
      saveStateA([...visibleLayersB], { ...layerOpacitiesB }, { ...customColorsB });
    }
  };

  // Revert / Reset overrides
  const handleResetDefaults = (side: 'left' | 'right') => {
    if (side === 'left') {
      const def = diffData.type === 'pcb' ? (diffData.oldRevision as any).layers || [] : [];
      setVisibleLayersA(def);
      setLayerOpacitiesA({});
      setCustomColorsA({});
      saveStateA(def, {}, {});
    } else {
      const def = diffData.type === 'pcb' ? (diffData.newRevision as any).layers || [] : [];
      setVisibleLayersB(def);
      setLayerOpacitiesB({});
      setCustomColorsB({});
      saveStateB(def, {}, {});
    }
  };

  return (
    <div ref={containerRef} className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative font-sans">
      
      {/* Top Diff Control Action Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-900 shrink-0 z-20 gap-4 flex-wrap bg-slate-950">
        
        {/* Left Panel Zoom Actions */}
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

        {/* Center Control Actions */}
        <div className="flex items-center gap-2">
          {/* Synchronized Lock Viewports toggle */}
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

          {/* Colorblind diff toggle */}
          <button
            onClick={() => setIsColorblind(prev => {
              const next = !prev;
              localStorage.setItem(`project:${projectSlug}.isColorblindDiff`, String(next));
              return next;
            })}
            className={`px-3 py-1.5 backdrop-blur-md rounded-full border shadow-xl flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-all ${
              isColorblind 
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20' 
                : 'bg-slate-900/90 text-slate-400 border-slate-800 hover:text-slate-300 hover:bg-slate-800'
            }`}
            title="Toggle Colorblind Accessible Diff Mode (replaces red/green with blue/orange-red & patterns)"
          >
            <span>👁️ Colorblind Diff</span>
          </button>
        </div>

        {/* Right Panel Zoom Actions */}
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
              const leftOffset = hoverInfo.side === 'left' 
                ? (sidebarOpenA ? sidebarWidth : 0) + 15
                : colWidth + (sidebarOpenB ? sidebarWidth : 0) + 15;
              el.style.left = `${hoverInfo.x + leftOffset}px`;
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
      <div className="flex flex-1 w-full h-full relative overflow-hidden">
        
        {/* ================= LEFT COLUMN (REV A) ================= */}
        <div className="flex-1 h-full relative flex overflow-hidden border-r border-slate-900/50">
          
          {/* Layer Sidebar A */}
          <aside 
            className="bg-slate-900/90 backdrop-blur-sm flex flex-col shrink-0 overflow-hidden transition-all duration-180 ease-out border-slate-800/80 h-full relative z-10"
            style={{ 
              width: sidebarOpenA ? `${sidebarWidth}px` : '0px',
              borderRight: sidebarOpenA ? '1px solid rgba(255, 255, 255, 0.08)' : '0px'
            }}
          >
            <div className="w-[200px] flex flex-col h-full overflow-hidden text-xs">
              
              {/* Header */}
              <div className="flex items-center justify-between p-2 border-b border-slate-800/80 bg-slate-950/20 shrink-0">
                <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-cyan-500" /> Rev A Layers
                </span>
                <button 
                  onClick={() => {
                    setSidebarOpenA(false);
                    saveSidebarAVisible(false);
                    handleSidebarToggle();
                  }}
                  className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-slate-300 cursor-pointer"
                  title="Collapse Sidebar"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Action Toolbar */}
              <div className="p-1.5 border-b border-slate-850 flex gap-1 items-center shrink-0 flex-wrap bg-slate-950/40">
                <button 
                  onClick={() => handleApplyToBoth('left')}
                  className="flex-1 py-1 px-1 text-[9px] hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 rounded transition-colors cursor-pointer flex items-center justify-center gap-1"
                  title="Copy left visibility/color to right panel"
                >
                  <Copy className="w-2.5 h-2.5" />
                  <span>Sync B</span>
                </button>
                <button 
                  onClick={() => handleResetDefaults('left')}
                  className="flex-1 py-1 px-1 text-[9px] hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 rounded transition-colors cursor-pointer flex items-center justify-center gap-1"
                  title="Reset overrides back to initial defaults"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  <span>Reset</span>
                </button>
              </div>

              {/* Show only diff checkbox */}
              <div className="p-2 border-b border-slate-850 flex items-center justify-between bg-slate-950/20 text-[10px] shrink-0 text-slate-400">
                <span>Show only diff layers</span>
                <input 
                  type="checkbox"
                  checked={showOnlyDiffA}
                  onChange={(e) => setShowOnlyDiffA(e.target.checked)}
                  className="w-3 h-3 bg-slate-950 border border-slate-800 rounded"
                />
              </div>

              {/* Scrollable list */}
              <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5 scrollbar-thin">
                {layersA.map(layer => {
                  const style = resolveLayerStyle(layer);
                  const isVisible = visibleLayersA.includes(layer);
                  const opacity = layerOpacitiesA[layer] ?? style.opacity ?? 1;
                  const activeColor = customColorsA[layer] || style.color;
                  const tag = getLayerTypeTag(layer);

                  return (
                    <div key={layer} className="p-1.5 rounded-lg bg-slate-950/60 border border-slate-900 flex flex-col gap-1 transition-all hover:border-slate-800">
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {/* Visibility Eye icon */}
                          <button
                            onClick={() => {
                              setVisibleLayersA(prev => {
                                const next = prev.includes(layer) ? prev.filter(l => l !== layer) : [...prev, layer];
                                saveStateA(next, layerOpacitiesA, customColorsA);
                                return next;
                              });
                            }}
                            className="text-slate-500 hover:text-white cursor-pointer"
                            title={isVisible ? "Hide Layer" : "Show Layer"}
                          >
                            {isVisible ? <Eye className="w-3 h-3 text-cyan-400" /> : <EyeOff className="w-3 h-3 text-slate-700" />}
                          </button>

                          {/* Color picker Swatch */}
                          <div className="w-3 h-3 rounded-full border relative shrink-0" style={{ backgroundColor: activeColor, borderColor: swatchOutlineColor }}>
                            <input 
                              type="color"
                              value={activeColor}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCustomColorsA(prev => {
                                  const next = { ...prev, [layer]: val };
                                  saveStateA(visibleLayersA, layerOpacitiesA, next);
                                  return next;
                                });
                              }}
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                              title="Recolor Layer"
                            />
                          </div>

                          <span className={`text-[10px] font-mono truncate ${isVisible ? 'text-slate-200 font-semibold' : 'text-slate-600'}`}>
                            {layer}
                          </span>
                        </div>

                        {/* Type Tag badge */}
                        <span className={`text-[8px] font-mono font-bold px-1 py-0.2 rounded shrink-0 ${
                          tag === 'copper' ? 'bg-red-500/10 text-red-400' :
                          tag === 'silk' ? 'bg-yellow-500/10 text-yellow-400' :
                          tag === 'mask' ? 'bg-purple-500/10 text-purple-400' :
                          tag === 'paste' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-slate-800 text-slate-500'
                        }`}>
                          {tag}
                        </span>
                      </div>

                      {/* Opacity slider */}
                      {isVisible && (
                        <div className="flex items-center gap-1.5 pl-4">
                          <input 
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={opacity}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setLayerOpacitiesA(prev => {
                                const next = { ...prev, [layer]: val };
                                saveStateA(visibleLayersA, next, customColorsA);
                                return next;
                              });
                            }}
                            className="flex-1 h-0.5 bg-slate-800 appearance-none cursor-pointer accent-cyan-500"
                          />
                          <span className="text-[8px] font-mono text-slate-500 font-bold min-w-[18px] text-right">
                            {Math.round(opacity * 100)}%
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>
          </aside>

          {/* Reveal Handle A */}
          {!sidebarOpenA && (
            <button 
              onClick={() => {
                setSidebarOpenA(true);
                saveSidebarAVisible(true);
                handleSidebarToggle();
              }}
              className="absolute left-0 top-0 bottom-0 w-3 bg-slate-900/90 hover:bg-slate-800 border-r border-slate-800 flex items-center justify-center cursor-pointer z-10 transition-colors"
              title="Expand Left Layers"
            >
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
            </button>
          )}

          {/* Left Canvas */}
          <div className="flex-1 h-full relative">
            <div className="absolute top-14 left-4 z-10 px-2 py-0.5 bg-red-950/60 backdrop-blur-sm border border-red-500/20 text-[10px] font-mono font-semibold text-red-400 rounded pointer-events-none">
              Base Revision A (Old)
            </div>
            <canvas
              ref={leftCanvasRef}
              onMouseDown={(e) => handleMouseDown(e, 'left')}
              onMouseMove={(e) => handleMouseMove(e, 'left')}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={(e) => handleWheel(e, 'left')}
              className={`w-full h-full block cursor-grab ${isPanning ? 'cursor-grabbing' : ''}`}
            />
          </div>
        </div>

        {/* ================= VERTICAL DIVIDERSPLITTER ================= */}
        {isBorderVisible && (
          <div
            ref={borderRef}
            tabIndex={0}
            className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[3px] z-10 rounded-full transition-colors duration-200 focus:outline-none pointer-events-auto"
            style={{
              backgroundColor: isBorderHovered || isBorderFocused
                ? '#2b6cb0' 
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

        {/* ================= RIGHT COLUMN (REV B) ================= */}
        <div className="flex-1 h-full relative flex overflow-hidden">
          
          {/* Layer Sidebar B */}
          <aside 
            className="bg-slate-900/90 backdrop-blur-sm flex flex-col shrink-0 overflow-hidden transition-all duration-180 ease-out border-slate-800/80 h-full relative z-10"
            style={{ 
              width: sidebarOpenB ? `${sidebarWidth}px` : '0px',
              borderRight: sidebarOpenB ? '1px solid rgba(255, 255, 255, 0.08)' : '0px'
            }}
          >
            <div className="w-[200px] flex flex-col h-full overflow-hidden text-xs">
              
              {/* Header */}
              <div className="flex items-center justify-between p-2 border-b border-slate-800/80 bg-slate-950/20 shrink-0">
                <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-emerald-500" /> Rev B Layers
                </span>
                <button 
                  onClick={() => {
                    setSidebarOpenB(false);
                    saveSidebarBVisible(false);
                    handleSidebarToggle();
                  }}
                  className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-slate-300 cursor-pointer"
                  title="Collapse Sidebar"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Action Toolbar */}
              <div className="p-1.5 border-b border-slate-850 flex gap-1 items-center shrink-0 flex-wrap bg-slate-950/40">
                <button 
                  onClick={() => handleApplyToBoth('right')}
                  className="flex-1 py-1 px-1 text-[9px] hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 rounded transition-colors cursor-pointer flex items-center justify-center gap-1"
                  title="Copy right visibility/color to left panel"
                >
                  <Copy className="w-2.5 h-2.5" />
                  <span>Sync A</span>
                </button>
                <button 
                  onClick={() => handleResetDefaults('right')}
                  className="flex-1 py-1 px-1 text-[9px] hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 rounded transition-colors cursor-pointer flex items-center justify-center gap-1"
                  title="Reset overrides back to initial defaults"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  <span>Reset</span>
                </button>
              </div>

              {/* Show only diff checkbox */}
              <div className="p-2 border-b border-slate-850 flex items-center justify-between bg-slate-950/20 text-[10px] shrink-0 text-slate-400">
                <span>Show only diff layers</span>
                <input 
                  type="checkbox"
                  checked={showOnlyDiffB}
                  onChange={(e) => setShowOnlyDiffB(e.target.checked)}
                  className="w-3 h-3 bg-slate-950 border border-slate-800 rounded"
                />
              </div>

              {/* Scrollable list */}
              <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5 scrollbar-thin">
                {layersB.map(layer => {
                  const style = resolveLayerStyle(layer);
                  const isVisible = visibleLayersB.includes(layer);
                  const opacity = layerOpacitiesB[layer] ?? style.opacity ?? 1;
                  const activeColor = customColorsB[layer] || style.color;
                  const tag = getLayerTypeTag(layer);

                  return (
                    <div key={layer} className="p-1.5 rounded-lg bg-slate-950/60 border border-slate-900 flex flex-col gap-1 transition-all hover:border-slate-800">
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {/* Visibility Eye checkbox */}
                          <button
                            onClick={() => {
                              setVisibleLayersB(prev => {
                                const next = prev.includes(layer) ? prev.filter(l => l !== layer) : [...prev, layer];
                                saveStateB(next, layerOpacitiesB, customColorsB);
                                return next;
                              });
                            }}
                            className="text-slate-500 hover:text-white cursor-pointer"
                            title={isVisible ? "Hide Layer" : "Show Layer"}
                          >
                            {isVisible ? <Eye className="w-3 h-3 text-cyan-400" /> : <EyeOff className="w-3 h-3 text-slate-700" />}
                          </button>

                          {/* Color Swatch */}
                          <div className="w-3 h-3 rounded-full border relative shrink-0" style={{ backgroundColor: activeColor, borderColor: swatchOutlineColor }}>
                            <input 
                              type="color"
                              value={activeColor}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCustomColorsB(prev => {
                                  const next = { ...prev, [layer]: val };
                                  saveStateB(visibleLayersB, layerOpacitiesB, next);
                                  return next;
                                });
                              }}
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                              title="Recolor Layer"
                            />
                          </div>

                          <span className={`text-[10px] font-mono truncate ${isVisible ? 'text-slate-200 font-semibold' : 'text-slate-600'}`}>
                            {layer}
                          </span>
                        </div>

                        {/* Type tag Badge */}
                        <span className={`text-[8px] font-mono font-bold px-1 py-0.2 rounded shrink-0 ${
                          tag === 'copper' ? 'bg-red-500/10 text-red-400' :
                          tag === 'silk' ? 'bg-yellow-500/10 text-yellow-400' :
                          tag === 'mask' ? 'bg-purple-500/10 text-purple-400' :
                          tag === 'paste' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-slate-800 text-slate-500'
                        }`}>
                          {tag}
                        </span>
                      </div>

                      {/* Opacity slider */}
                      {isVisible && (
                        <div className="flex items-center gap-1.5 pl-4">
                          <input 
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={opacity}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setLayerOpacitiesB(prev => {
                                const next = { ...prev, [layer]: val };
                                saveStateB(visibleLayersB, next, customColorsB);
                                return next;
                              });
                            }}
                            className="flex-1 h-0.5 bg-slate-800 appearance-none cursor-pointer accent-cyan-500"
                          />
                          <span className="text-[8px] font-mono text-slate-500 font-bold min-w-[18px] text-right">
                            {Math.round(opacity * 100)}%
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>
          </aside>

          {/* Reveal Handle B */}
          {!sidebarOpenB && (
            <button 
              onClick={() => {
                setSidebarOpenB(true);
                saveSidebarBVisible(true);
                handleSidebarToggle();
              }}
              className="absolute left-0 top-0 bottom-0 w-3 bg-slate-900/90 hover:bg-slate-800 border-r border-slate-800 flex items-center justify-center cursor-pointer z-10 transition-colors"
              title="Expand Right Layers"
            >
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
            </button>
          )}

          {/* Right Canvas */}
          <div className="flex-1 h-full relative">
            <div className="absolute top-14 left-4 z-10 px-2 py-0.5 bg-emerald-950/60 backdrop-blur-sm border border-emerald-500/20 text-[10px] font-mono font-semibold text-emerald-400 rounded pointer-events-none">
              Target Revision B (New)
            </div>
            <canvas
              ref={rightCanvasRef}
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
    </div>
  );
}

// Distance helper
function pointToSegmentDistance(pt: Point, p1: Point, p2: Point): number {
  const l2 = Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2);
  if (l2 === 0) return Math.hypot(pt.x - p1.x, pt.y - p1.y);
  let t = ((pt.x - p1.x) * (p2.x - p1.x) + (pt.y - p1.y) * (p2.y - p1.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(
    pt.x - (p1.x + t * (p2.x - p1.x)),
    pt.y - (p1.y + t * (p2.y - p1.y))
  );
}
