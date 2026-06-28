"use client";

import React, { useRef, useEffect, useState, MouseEvent, WheelEvent } from 'react';
import { Point } from '../lib/parsers/kicad/pcbParser';
import { toScreen, toNative, fitBounds, ViewportTransform } from '../lib/canvas/coordinate-translator';
import { DiffedHardwareData } from '../lib/diff/diffEngine';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { getLayerColor } from '../lib/layers/layer-colors';

interface SideBySideCanvasProps {
  diffData: DiffedHardwareData;
  visibleLayers?: string[];
}

export default function SideBySideCanvas({
  diffData,
  visibleLayers = [],
}: SideBySideCanvasProps) {
  const leftCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [transform, setTransform] = useState<ViewportTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; text: string; subText?: string; side: 'left' | 'right' } | null>(null);

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

  // Fit bounds initially
  useEffect(() => {
    if (canvasWidth > 0 && dimensions.height > 0 && diffData) {
      const fit = fitBounds(diffData.bounds, canvasWidth, dimensions.height);
      setTransform(fit);
    }
  }, [diffData, canvasWidth, dimensions.height]);

  // Main Draw Loop for both canvases
  useEffect(() => {
    drawCanvas(leftCanvasRef.current, false);
    drawCanvas(rightCanvasRef.current, true);
  }, [diffData, visibleLayers, transform, canvasWidth, dimensions.height]);

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

  const drawCanvas = (canvas: HTMLCanvasElement | null, isNewRevision: boolean) => {
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
    const gridSize = 20 * transform.scale;
    const gridOffsetX = transform.offsetX % gridSize;
    const gridOffsetY = transform.offsetY % gridSize;

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
        ctx.lineWidth = Math.max(1, t.width * transform.scale);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        const p0 = toScreen(t.points[0].x, t.points[0].y, transform);
        ctx.moveTo(p0.x, p0.y);
        for (let idx = 1; idx < t.points.length; idx++) {
          const pt = toScreen(t.points[idx].x, t.points[idx].y, transform);
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

        const screenPos = toScreen(v.x, v.y, transform);
        const radius = (v.diameter / 2) * transform.scale;
        const drillRadius = (v.drill / 2) * transform.scale;

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

          const sp = toScreen(pad.x, pad.y, transform);
          const pw = pad.width * transform.scale;
          const ph = pad.height * transform.scale;

          ctx.fillStyle = comp.diffStatus === 'unchanged' ? getLayerColor(pad.layer) : compStyle.color;

          if (pad.shape === 'circle' || pad.shape === 'round') {
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, pw / 2, 0, Math.PI * 2);
            ctx.fill();
            if (pad.drill > 0) {
              ctx.fillStyle = '#0f172a';
              ctx.beginPath();
              ctx.arc(sp.x, sp.y, (pad.drill / 2) * transform.scale, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            ctx.fillRect(sp.x - pw / 2, sp.y - ph / 2, pw, ph);
            if (pad.drill > 0) {
              ctx.fillStyle = '#0f172a';
              ctx.beginPath();
              ctx.arc(sp.x, sp.y, (pad.drill / 2) * transform.scale, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }

        // Draw component outline / anchor
        const sc = toScreen(comp.x, comp.y, transform);
        ctx.strokeStyle = compStyle.color;
        ctx.lineWidth = comp.diffStatus !== 'unchanged' ? 2 : 1;
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, 2 * transform.scale, 0, Math.PI * 2);
        ctx.stroke();

        // Designator
        if (transform.scale > 1.5) {
          ctx.fillStyle = compStyle.color;
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(comp.designator, sc.x, sc.y - 3 * transform.scale);
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
          const p0 = toScreen(seg.points[0].x, seg.points[0].y, transform);
          ctx.moveTo(p0.x, p0.y);
          for (let idx = 1; idx < seg.points.length; idx++) {
            const pt = toScreen(seg.points[idx].x, seg.points[idx].y, transform);
            ctx.lineTo(pt.x, pt.y);
          }
          ctx.stroke();
        }
      }

      // Schematic Components
      for (const comp of schRev.components || []) {
        const compStyle = getDiffStyle(comp.diffStatus, isNewRevision);
        if (compStyle.opacity === 0.2) continue;

        const sc = toScreen(comp.x, comp.y, transform);
        const size = 6 * transform.scale;

        // Outline
        ctx.strokeStyle = compStyle.color;
        ctx.lineWidth = comp.diffStatus !== 'unchanged' ? 3 : 2;
        ctx.strokeRect(sc.x - size, sc.y - size, size * 2, size * 2);
        ctx.fillStyle = comp.diffStatus !== 'unchanged' ? 'rgba(245, 158, 11, 0.03)' : 'rgba(16, 185, 129, 0.02)';
        ctx.fillRect(sc.x - size, sc.y - size, size * 2, size * 2);

        // Pins
        for (const pin of comp.pins || []) {
          const sp = toScreen(pin.x, pin.y, transform);
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

  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    setIsPanning(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>, side: 'left' | 'right') => {
    if (isPanning) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setTransform((prev) => ({
        ...prev,
        offsetX: prev.offsetX + dx,
        offsetY: prev.offsetY + dy,
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // Hover detection logic
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const nativeCoords = toNative(mouseX, mouseY, transform);

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

  const handleWheel = (e: WheelEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newScale = Math.max(0.1, Math.min(100, transform.scale * zoomFactor));

    const nativeCoords = toNative(mouseX, mouseY, transform);
    const newOffsetX = mouseX - nativeCoords.x * newScale;
    const newOffsetY = mouseY - nativeCoords.y * newScale;

    setTransform({
      scale: newScale,
      offsetX: newOffsetX,
      offsetY: newOffsetY,
    });
  };

  const handleZoom = (dir: 'in' | 'out') => {
    const factor = dir === 'in' ? 1.3 : 0.7;
    const newScale = Math.max(0.1, Math.min(100, transform.scale * factor));
    
    // Zoom centered on canvas viewport center
    const centerX = canvasWidth / 2;
    const centerY = dimensions.height / 2;
    const nativeCoords = toNative(centerX, centerY, transform);
    
    setTransform({
      scale: newScale,
      offsetX: centerX - nativeCoords.x * newScale,
      offsetY: centerY - nativeCoords.y * newScale,
    });
  };

  const handleReset = () => {
    const fit = fitBounds(diffData.bounds, canvasWidth, dimensions.height);
    setTransform(fit);
  };

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col select-none overflow-hidden bg-slate-950 rounded-xl border border-slate-800">
      {/* Top Floating Controls Bar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10 pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 flex items-center gap-4 pointer-events-auto">
          <span className="font-semibold text-cyan-400">Side-by-Side Diff (Synchronized)</span>
          <span className="text-slate-500">|</span>
          <span>Zoom: {Math.round(transform.scale * 100)}%</span>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => handleZoom('in')}
            className="p-2 bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md rounded-lg border border-slate-800 text-slate-300 hover:text-white transition-all shadow-lg cursor-pointer"
            title="Zoom In"
            aria-label="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleZoom('out')}
            className="p-2 bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md rounded-lg border border-slate-800 text-slate-300 hover:text-white transition-all shadow-lg cursor-pointer"
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            className="p-2 bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md rounded-lg border border-slate-800 text-slate-300 hover:text-white transition-all shadow-lg cursor-pointer"
            title="Reset View"
            aria-label="Reset View"
          >
            <Maximize className="w-4 h-4" />
          </button>
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
        <div className="flex-1 h-full relative border-r border-slate-800/60">
          <div className="absolute top-14 left-4 z-10 px-2 py-0.5 bg-red-950/60 backdrop-blur-sm border border-red-500/20 text-[10px] font-mono font-semibold text-red-400 rounded">
            Base Revision A (Old)
          </div>
          <canvas
            ref={leftCanvasRef}
            width={canvasWidth}
            height={dimensions.height}
            onMouseDown={handleMouseDown}
            onMouseMove={(e) => handleMouseMove(e, 'left')}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            className={`w-full h-full block cursor-grab ${isPanning ? 'cursor-grabbing' : ''}`}
          />
        </div>

        {/* Right Column: New Revision */}
        <div className="flex-1 h-full relative">
          <div className="absolute top-14 left-4 z-10 px-2 py-0.5 bg-emerald-950/60 backdrop-blur-sm border border-emerald-500/20 text-[10px] font-mono font-semibold text-emerald-400 rounded">
            Target Revision B (New)
          </div>
          <canvas
            ref={rightCanvasRef}
            width={canvasWidth}
            height={dimensions.height}
            onMouseDown={handleMouseDown}
            onMouseMove={(e) => handleMouseMove(e, 'right')}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            className={`w-full h-full block cursor-grab ${isPanning ? 'cursor-grabbing' : ''}`}
          />
        </div>
      </div>
    </div>
  );
}
