"use client";

import React, { useRef, useEffect, useState, MouseEvent, WheelEvent } from 'react';
import { Point, PCBData } from '../lib/parsers/kicad/pcbParser';
import { toScreen, toNative, fitBounds, ViewportTransform } from '../lib/canvas/coordinate-translator';
import { DiffedHardwareData, DiffedComponent, DiffedTrace, DiffedVia } from '../lib/diff/diffEngine';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';

interface DiffCanvasProps {
  diffData: DiffedHardwareData;
  visibleLayers?: string[];
  opacity: number; // 0.0 to 1.0
}

export default function DiffCanvas({
  diffData,
  visibleLayers = [],
  opacity
}: DiffCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [transform, setTransform] = useState<ViewportTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; text: string; subText?: string } | null>(null);

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
    if (dimensions.width > 0 && dimensions.height > 0 && diffData) {
      const fit = fitBounds(diffData.bounds, dimensions.width, dimensions.height);
      setTransform(fit);
    }
  }, [diffData, dimensions.width, dimensions.height]);

  // Main Draw Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear background
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    // Draw grid
    ctx.strokeStyle = '#1e293b'; // slate-800
    ctx.lineWidth = 0.5;
    const gridSize = 20 * transform.scale;
    const gridOffsetX = transform.offsetX % gridSize;
    const gridOffsetY = transform.offsetY % gridSize;

    for (let x = gridOffsetX; x < dimensions.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, dimensions.height);
      ctx.stroke();
    }
    for (let y = gridOffsetY; y < dimensions.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(dimensions.width, y);
      ctx.stroke();
    }

    const isLayerVisible = (layerName: string) => {
      if (diffData.type === 'schematic') return true;
      if (visibleLayers.length === 0) return true;
      return visibleLayers.includes(layerName) || layerName === 'MultiLayer';
    };

    // Color mapper for diff status
    // Unchanged -> Muted Gray
    // Added -> Green
    // Deleted -> Red
    // Modified -> Red (Old), Green (New)
    const getDiffStyle = (status: 'added' | 'deleted' | 'modified' | 'unchanged', isNewRevision: boolean) => {
      if (status === 'unchanged') {
        return { color: '#64748b', opacity: 0.6 }; // Slate-500 gray
      }
      if (status === 'added' && isNewRevision) {
        return { color: '#22c55e', opacity: opacity }; // Emerald-500 Green
      }
      if (status === 'deleted' && !isNewRevision) {
        return { color: '#ef4444', opacity: 1 - opacity }; // Rose-500 Red
      }
      if (status === 'modified') {
        if (isNewRevision) {
          return { color: '#22c55e', opacity: opacity };
        } else {
          return { color: '#ef4444', opacity: 1 - opacity };
        }
      }
      return null; // Don't draw
    };

    if (diffData.type === 'pcb') {
      // Helper to draw PCB traces
      const drawPCBTraces = (traces: any[], isNewRev: boolean) => {
        for (const t of traces) {
          if (!isLayerVisible(t.layer)) continue;
          
          const style = getDiffStyle(t.diffStatus, isNewRev);
          if (!style || style.opacity === 0) continue;

          ctx.save();
          ctx.globalAlpha = style.opacity;
          ctx.strokeStyle = style.color;
          ctx.lineWidth = t.width * transform.scale;
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
          ctx.restore();
        }
      };

      // Helper to draw PCB Vias
      const drawPCBVias = (vias: any[], isNewRev: boolean) => {
        for (const v of vias) {
          const isViaVisible = v.layers.some((l: string) => isLayerVisible(l));
          if (!isViaVisible) continue;

          const style = getDiffStyle(v.diffStatus, isNewRev);
          if (!style || style.opacity === 0) continue;

          ctx.save();
          ctx.globalAlpha = style.opacity;
          
          const screenPos = toScreen(v.x, v.y, transform);
          const radius = (v.diameter / 2) * transform.scale;
          const drillRadius = (v.drill / 2) * transform.scale;

          ctx.fillStyle = style.color;
          ctx.beginPath();
          ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(screenPos.x, screenPos.y, drillRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      };

      // Helper to draw PCB Components
      const drawPCBComponents = (components: any[], isNewRev: boolean) => {
        for (const comp of components) {
          if (!isLayerVisible(comp.layer)) continue;

          const style = getDiffStyle(comp.diffStatus, isNewRev);
          if (!style || style.opacity === 0) continue;

          ctx.save();
          ctx.globalAlpha = style.opacity;

          // Draw pads
          for (const pad of comp.pads) {
            if (!isLayerVisible(pad.layer)) continue;

            const sp = toScreen(pad.x, pad.y, transform);
            const pw = pad.width * transform.scale;
            const ph = pad.height * transform.scale;

            ctx.fillStyle = style.color;
            if (pad.shape === 'circle' || pad.shape === 'round') {
              ctx.beginPath();
              ctx.arc(sp.x, sp.y, pw / 2, 0, Math.PI * 2);
              ctx.fill();
            } else {
              ctx.fillRect(sp.x - pw / 2, sp.y - ph / 2, pw, ph);
            }
          }

          // Anchor & Designator
          const sc = toScreen(comp.x, comp.y, transform);
          ctx.strokeStyle = style.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(sc.x, sc.y, 2 * transform.scale, 0, Math.PI * 2);
          ctx.stroke();

          if (transform.scale > 2) {
            ctx.fillStyle = style.color;
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(comp.designator, sc.x, sc.y - 3 * transform.scale);
          }

          ctx.restore();
        }
      };

      // Render Old Revision (Red / Unchanged)
      drawPCBTraces(diffData.oldRevision.traces, false);
      drawPCBVias(diffData.oldRevision.vias, false);
      drawPCBComponents(diffData.oldRevision.components, false);

      // Render New Revision (Green / Unchanged)
      drawPCBTraces(diffData.newRevision.traces, true);
      drawPCBVias(diffData.newRevision.vias, true);
      drawPCBComponents(diffData.newRevision.components, true);
    } else {
      // Helper to draw Schematic Components
      const drawSchComponents = (components: any[], isNewRev: boolean) => {
        for (const comp of components) {
          const style = getDiffStyle(comp.diffStatus, isNewRev);
          if (!style || style.opacity === 0) continue;

          ctx.save();
          ctx.globalAlpha = style.opacity;

          const sc = toScreen(comp.x, comp.y, transform);
          const size = 6 * transform.scale;

          ctx.strokeStyle = style.color;
          ctx.lineWidth = 2;
          ctx.strokeRect(sc.x - size, sc.y - size, size * 2, size * 2);

          // Draw pins
          for (const pin of comp.pins) {
            const sp = toScreen(pin.x, pin.y, transform);
            ctx.strokeStyle = style.color;
            ctx.beginPath();
            ctx.moveTo(sc.x, sc.y);
            ctx.lineTo(sp.x, sp.y);
            ctx.stroke();

            ctx.fillStyle = style.color;
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, 2, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.fillStyle = style.color;
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(comp.designator, sc.x, sc.y - size - 4);
          ctx.restore();
        }
      };

      // Helper to draw Schematic Nets
      const drawSchNets = (nets: any[], isNewRev: boolean) => {
        for (const net of nets) {
          const style = getDiffStyle(net.diffStatus, isNewRev);
          if (!style || style.opacity === 0) continue;

          ctx.save();
          ctx.globalAlpha = style.opacity;
          ctx.strokeStyle = style.color;
          ctx.lineWidth = 1.5;

          for (const seg of net.segments) {
            ctx.beginPath();
            const p0 = toScreen(seg.points[0].x, seg.points[0].y, transform);
            ctx.moveTo(p0.x, p0.y);
            for (let idx = 1; idx < seg.points.length; idx++) {
              const pt = toScreen(seg.points[idx].x, seg.points[idx].y, transform);
              ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
          }
          ctx.restore();
        }
      };

      // Draw old elements
      drawSchNets(diffData.oldRevision.nets, false);
      drawSchComponents(diffData.oldRevision.components, false);

      // Draw new elements
      drawSchNets(diffData.newRevision.nets, true);
      drawSchComponents(diffData.newRevision.components, true);
    }
  }, [diffData, transform, visibleLayers, opacity, dimensions]);

  // Mouse pan/zoom handlers
  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0) {
      setIsPanning(true);
      setDragStart({ x: e.clientX - transform.offsetX, y: e.clientY - transform.offsetY });
    }
  };

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (isPanning) {
      setTransform(prev => ({
        ...prev,
        offsetX: e.clientX - dragStart.x,
        offsetY: e.clientY - dragStart.y
      }));
      return;
    }

    // Diff Hover details
    const native = toNative(sx, sy, transform);
    let hoverText = "";
    let hoverSubText = "";

    // Simple component hover lookup in new revision
    const searchComps = diffData.type === 'pcb' 
      ? [...diffData.newRevision.components, ...diffData.oldRevision.components]
      : [...diffData.newRevision.components, ...diffData.oldRevision.components];

    for (const comp of searchComps) {
      const d = Math.hypot(comp.x - native.x, comp.y - native.y);
      const limit = diffData.type === 'pcb' ? 4.0 : 8.0;
      if (d < limit) {
        const stateStr = comp.diffStatus === 'added' ? 'Added (+)' 
                       : comp.diffStatus === 'deleted' ? 'Removed (-)'
                       : comp.diffStatus === 'modified' ? 'Modified (Position/Value)'
                       : 'Unchanged';
        hoverText = `${comp.designator}: ${stateStr}`;
        hoverSubText = `Package: ${'footprint' in comp ? comp.footprint : comp.symbol} | Value: ${comp.value}`;
        break;
      }
    }

    if (hoverText) {
      setHoverInfo({ x: sx, y: sy, text: hoverText, subText: hoverSubText });
    } else {
      setHoverInfo(null);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const native = toNative(sx, sy, transform);
    const zoomFactor = 1.1;
    const nextScale = e.deltaY < 0 ? transform.scale * zoomFactor : transform.scale / zoomFactor;

    const scale = Math.max(0.05, Math.min(nextScale, 150));
    setTransform({
      scale,
      offsetX: sx - native.x * scale,
      offsetY: sy - native.y * scale
    });
  };

  const handleZoom = (direction: 'in' | 'out') => {
    const factor = direction === 'in' ? 1.2 : 1 / 1.2;
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const native = toNative(centerX, centerY, transform);
    const scale = Math.max(0.05, Math.min(transform.scale * factor, 150));
    setTransform({
      scale,
      offsetX: centerX - native.x * scale,
      offsetY: centerY - native.y * scale
    });
  };

  const handleReset = () => {
    const fit = fitBounds(diffData.bounds, dimensions.width, dimensions.height);
    setTransform(fit);
  };

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col select-none overflow-hidden bg-slate-950 rounded-xl border border-slate-800">
      {/* Top Floating Controls Bar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10 pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 flex items-center gap-4 pointer-events-auto">
          <span className="font-semibold text-emerald-500">Visual Diff Blending</span>
          <span className="text-slate-500">|</span>
          <span>Zoom: {Math.round(transform.scale * 100)}%</span>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => handleZoom('in')}
            className="p-2 bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md rounded-lg border border-slate-800 text-slate-300 hover:text-white transition-all shadow-lg"
            title="Zoom In"
            aria-label="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleZoom('out')}
            className="p-2 bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md rounded-lg border border-slate-800 text-slate-300 hover:text-white transition-all shadow-lg"
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            className="p-2 bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md rounded-lg border border-slate-800 text-slate-300 hover:text-white transition-all shadow-lg"
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
          className="absolute z-20 pointer-events-none bg-slate-900/95 backdrop-blur-md border border-slate-700 px-3 py-2 rounded-lg text-xs shadow-2xl transition-all max-w-[250px]"
          style={{ left: hoverInfo.x + 15, top: hoverInfo.y + 15 }}
        >
          <div className="font-bold text-slate-100">{hoverInfo.text}</div>
          {hoverInfo.subText && <div className="text-[10px] text-slate-400 mt-0.5">{hoverInfo.subText}</div>}
        </div>
      )}

      {/* Main Canvas Drawing Element */}
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className={`w-full h-full block cursor-grab ${isPanning ? 'cursor-grabbing' : ''}`}
      />
    </div>
  );
}
