"use client";

import React, { useRef, useEffect, useState, MouseEvent, WheelEvent } from 'react';
import { Point, Pad, Component, Trace, Via, PCBData } from '../lib/parsers/kicad/pcbParser';
import { SchematicComponent, SchematicComponentPin, SchematicNet, SchematicNetSegment, SchematicData } from '../lib/parsers/kicad/schParser';
import { ParsedHardwareData } from '../lib/parsers/parser';
import { toScreen, toNative, fitBounds, ViewportTransform } from '../lib/canvas/coordinate-translator';
import { ZoomIn, ZoomOut, Maximize, MessageSquarePlus, Eye, EyeOff } from 'lucide-react';

interface HardwareCanvasProps {
  data: ParsedHardwareData;
  visibleLayers?: string[];
  annotations?: Array<{
    id: string;
    commitHash: string;
    filePath: string;
    layerId: string;
    x: number;
    y: number;
    content: string;
    resolved: boolean;
  }>;
  selectedAnnotationId?: string | null;
  reviewMode?: boolean;
  onAddAnnotation?: (x: number, y: number) => void;
  onSelectAnnotation?: (id: string) => void;
}

export default function HardwareCanvas({
  data,
  visibleLayers = [],
  annotations = [],
  selectedAnnotationId = null,
  reviewMode = false,
  onAddAnnotation,
  onSelectAnnotation
}: HardwareCanvasProps) {
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
    if (dimensions.width > 0 && dimensions.height > 0 && data) {
      const fit = fitBounds(data.bounds, dimensions.width, dimensions.height);
      setTransform(fit);
    }
  }, [data, dimensions.width, dimensions.height]);

  // Main Draw Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear background (dark grid pattern)
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

    // Layer checks
    const isLayerVisible = (layerName: string) => {
      if (data.type === 'schematic') return true;
      if (visibleLayers.length === 0) return true; // Default show all
      return visibleLayers.includes(layerName) || layerName === 'MultiLayer';
    };

    if (data.type === 'pcb') {
      // 1. Draw traces
      for (const t of data.traces) {
        if (!isLayerVisible(t.layer)) continue;

        ctx.strokeStyle = getLayerColor(t.layer);
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
      }

      // 2. Draw Vias
      for (const v of data.vias) {
        const isViaVisible = v.layers.some(l => isLayerVisible(l));
        if (!isViaVisible) continue;

        const screenPos = toScreen(v.x, v.y, transform);
        const radius = (v.diameter / 2) * transform.scale;
        const drillRadius = (v.drill / 2) * transform.scale;

        // Outer copper ring
        ctx.fillStyle = '#b45309'; // gold/brown amber-700
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Inner hole
        ctx.fillStyle = '#0f172a'; // match background
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, drillRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Draw Footprints (components & pads)
      for (const comp of data.components) {
        if (!isLayerVisible(comp.layer)) continue;

        // Render pads
        for (const pad of comp.pads) {
          if (!isLayerVisible(pad.layer)) continue;

          const sp = toScreen(pad.x, pad.y, transform);
          const pw = pad.width * transform.scale;
          const ph = pad.height * transform.scale;

          ctx.fillStyle = getLayerColor(pad.layer);
          
          if (pad.shape === 'circle' || pad.shape === 'round') {
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, pw / 2, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw drill hole if through-hole
            if (pad.drill > 0) {
              ctx.fillStyle = '#0f172a';
              ctx.beginPath();
              ctx.arc(sp.x, sp.y, (pad.drill / 2) * transform.scale, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            // Draw rectangle centered on pad coordinate
            ctx.fillRect(sp.x - pw / 2, sp.y - ph / 2, pw, ph);

            // Draw drill hole
            if (pad.drill > 0) {
              ctx.fillStyle = '#0f172a';
              ctx.beginPath();
              ctx.arc(sp.x, sp.y, (pad.drill / 2) * transform.scale, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          // Pad label text
          if (transform.scale > 8) {
            ctx.fillStyle = '#ffffff';
            ctx.font = `${Math.max(8, Math.min(12, transform.scale))}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(pad.name, sp.x, sp.y);
          }
        }

        // Draw component outline / center anchor
        const sc = toScreen(comp.x, comp.y, transform);
        ctx.strokeStyle = '#facc15'; // yellow silk screen
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, 1.5 * transform.scale, 0, Math.PI * 2);
        ctx.stroke();

        // Draw designator text
        if (transform.scale > 2) {
          ctx.fillStyle = '#e2e8f0'; // slate-200
          ctx.font = '10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(comp.designator, sc.x, sc.y - 2.5 * transform.scale);
        }
      }
    } else {
      // 1. Draw Wires (Nets) for Schematic
      for (const net of data.nets) {
        ctx.strokeStyle = '#06b6d4'; // cyan-500
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

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
      }

      // 2. Draw Schematic Components
      for (const comp of data.components) {
        const sc = toScreen(comp.x, comp.y, transform);
        const size = 6 * transform.scale;

        // Draw component body (green/cyan rectangle outline)
        ctx.strokeStyle = '#10b981'; // emerald-500
        ctx.lineWidth = 2;
        ctx.strokeRect(sc.x - size, sc.y - size, size * 2, size * 2);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.05)';
        ctx.fillRect(sc.x - size, sc.y - size, size * 2, size * 2);

        // Draw pins
        for (const pin of comp.pins) {
          const sp = toScreen(pin.x, pin.y, transform);
          
          ctx.strokeStyle = '#14b8a6'; // teal-500
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sc.x, sc.y);
          ctx.lineTo(sp.x, sp.y);
          ctx.stroke();

          ctx.fillStyle = '#f43f5e'; // rose-500 pin connection dot
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 2, 0, Math.PI * 2);
          ctx.fill();

          if (transform.scale > 3) {
            ctx.fillStyle = '#94a3b8'; // slate-400
            ctx.font = '8px sans-serif';
            ctx.textAlign = sp.x > sc.x ? 'left' : 'right';
            ctx.fillText(pin.name, sp.x + (sp.x > sc.x ? 4 : -4), sp.y - 2);
          }
        }

        // Draw designator label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(comp.designator, sc.x, sc.y - size - 6);

        // Draw value label
        ctx.fillStyle = '#94a3b8'; // slate-400
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(comp.value, sc.x, sc.y + size + 12);
      }
    }

    // 4. Draw spatial annotation pins
    for (const ann of annotations) {
      if (ann.resolved) continue;
      
      const sp = toScreen(ann.x, ann.y, transform);
      const isSelected = ann.id === selectedAnnotationId;
      
      // Draw outer pulse ring if selected
      if (isSelected) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; // red ring
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 16, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw pin body
      ctx.fillStyle = isSelected ? '#ef4444' : '#f97316'; // red vs orange
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 8, 0, Math.PI * 2);
      ctx.stroke();

      // Draw annotation index number / comment icon
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText("💬", sp.x, sp.y - 0.5);
    }
  }, [data, transform, visibleLayers, annotations, selectedAnnotationId, dimensions]);

  // Mouse pan/zoom handlers
  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0) { // Left click
      if (reviewMode) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const native = toNative(sx, sy, transform);

          // Check if clicked close to an existing pin first
          const clickedAnn = annotations.find(ann => {
            const sp = toScreen(ann.x, ann.y, transform);
            const dist = Math.hypot(sp.x - sx, sp.y - sy);
            return dist < 12;
          });

          if (clickedAnn) {
            onSelectAnnotation?.(clickedAnn.id);
          } else if (onAddAnnotation) {
            onAddAnnotation(native.x, native.y);
          }
        }
      } else {
        // Drag to pan
        setIsPanning(true);
        setDragStart({ x: e.clientX - transform.offsetX, y: e.clientY - transform.offsetY });
      }
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

    // Hover detection
    const native = toNative(sx, sy, transform);
    let matchedText = "";
    let matchedSubText = "";

    if (data.type === 'pcb') {
      // Check pads
      for (const comp of data.components) {
        for (const pad of comp.pads) {
          const pd = Math.hypot(pad.x - native.x, pad.y - native.y);
          if (pd < Math.max(pad.width, pad.height) / 2) {
            matchedText = `Pad: ${comp.designator}.${pad.name}`;
            matchedSubText = `Package: ${comp.footprint} | Layer: ${pad.layer}`;
            break;
          }
        }
        if (matchedText) break;
      }

      // Check component body center
      if (!matchedText) {
        for (const comp of data.components) {
          const d = Math.hypot(comp.x - native.x, comp.y - native.y);
          if (d < 4.0) { // radius trigger
            matchedText = `Component: ${comp.designator}`;
            matchedSubText = `Value: ${comp.value} | Footprint: ${comp.footprint}`;
            break;
          }
        }
      }

      // Check traces
      if (!matchedText) {
        for (const t of data.traces) {
          for (let k = 0; k < t.points.length - 1; k++) {
            const p1 = t.points[k];
            const p2 = t.points[k + 1];
            // Point-to-segment distance
            const d = pointToSegmentDistance(native, p1, p2);
            if (d < t.width / 2 + 0.3) {
              matchedText = `Net: ${t.net}`;
              matchedSubText = `Layer: ${t.layer} | Width: ${t.width}mm`;
              break;
            }
          }
          if (matchedText) break;
        }
      }
    } else {
      // Schematic hover detection
      for (const comp of data.components) {
        const d = Math.hypot(comp.x - native.x, comp.y - native.y);
        if (d < 8.0) {
          matchedText = `Part: ${comp.designator}`;
          matchedSubText = `Value: ${comp.value} | Symbol: ${comp.symbol}`;
          break;
        }
      }
    }

    if (matchedText) {
      setHoverInfo({ x: sx, y: sy, text: matchedText, subText: matchedSubText });
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

    // Cap scale bounds
    const scale = Math.max(0.05, Math.min(nextScale, 150));

    const nextOffsetX = sx - native.x * scale;
    const nextOffsetY = sy - native.y * scale;

    setTransform({ scale, offsetX: nextOffsetX, offsetY: nextOffsetY });
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
    const fit = fitBounds(data.bounds, dimensions.width, dimensions.height);
    setTransform(fit);
  };

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col select-none overflow-hidden bg-slate-950 rounded-xl border border-slate-800">
      {/* Top Floating Controls Bar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10 pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 flex items-center gap-4 pointer-events-auto">
          <span>{data.type.toUpperCase()} View</span>
          <span className="text-slate-500">|</span>
          <span>Zoom: {Math.round(transform.scale * 100)}%</span>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => handleZoom('in')}
            className="p-2 bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md rounded-lg border border-slate-800 text-slate-300 hover:text-white transition-all shadow-lg"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleZoom('out')}
            className="p-2 bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md rounded-lg border border-slate-800 text-slate-300 hover:text-white transition-all shadow-lg"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            className="p-2 bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md rounded-lg border border-slate-800 text-slate-300 hover:text-white transition-all shadow-lg"
            title="Reset View"
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
        className={`w-full h-full block ${reviewMode ? 'cursor-cell' : isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
      />
    </div>
  );
}

// Distance helper from point to line segment
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

// Standard EDA layer color styles
function getLayerColor(layer: string): string {
  const l = layer.toLowerCase();
  if (l === 'f.cu' || l === 'top') return '#ef4444'; // Red
  if (l === 'b.cu' || l === 'bottom') return '#3b82f6'; // Blue
  if (l === 'f.silks' || l === 'tplace' || l === 'tnames') return '#eab308'; // Silk Top (Yellow)
  if (l === 'b.silks' || l === 'bplace' || l === 'bnames') return '#ffffff'; // Silk Bottom (White)
  if (l === 'f.mask' || l === 'tsolder') return 'rgba(16, 185, 129, 0.3)'; // Green mask (translucent)
  if (l === 'b.mask' || l === 'bsolder') return 'rgba(59, 130, 246, 0.3)'; // Blue mask (translucent)
  if (l === 'edge.cuts' || l === '20' || l === 'outline') return '#10b981'; // Green border
  if (l === 'multilayer') return '#f59e0b'; // Vias/Pads inner (Gold)
  return '#94a3b8'; // default slate-400
}
