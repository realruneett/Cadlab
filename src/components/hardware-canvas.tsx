"use client";

// src/components/hardware-canvas.tsx
// UPDATED — Universal Layer Color System Integration

import { useRef, useEffect, useState } from 'react';
import { Point, PCBData } from '../lib/parsers/kicad/pcbParser';
import { SchematicData } from '../lib/parsers/kicad/schParser';
import { ViewportTransform, toScreen, toNative, fitBounds } from '../lib/canvas/coordinate-translator';
import { resolveLayerStyle, getOrderedLayers } from '../lib/layers/layer-colors';
import { RotateCw, MessageSquare } from 'lucide-react';

interface HardwareCanvasProps {
  data: PCBData | SchematicData;
  visibleLayers?: string[];
  annotations?: any[];
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [transform, setTransform] = useState<ViewportTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
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

  // Main Draw Loop — UNIVERSAL LAYER SYSTEM
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear background (dark PCB substrate)
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    // Draw grid
    ctx.strokeStyle = '#1e293b';
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

    // Layer visibility check
    const isLayerVisible = (layerName: string): boolean => {
      if (data.type === 'schematic') return true;
      if (visibleLayers.length === 0) return true;
      return visibleLayers.includes(layerName) || layerName === 'MultiLayer';
    };

    if (data.type === 'pcb') {
      // === UNIVERSAL LAYER RENDERING WITH Z-INDEX ===
      // Sort all renderable entities by their layer's zIndex
      const renderQueue: Array<{
        type: 'trace' | 'via' | 'pad' | 'component' | 'outline';
        layer: string;
        zIndex: number;
        data: any;
      }> = [];

      // Queue traces
      for (const t of data.traces) {
        if (!isLayerVisible(t.layer)) continue;
        const style = resolveLayerStyle(t.layer);
        renderQueue.push({ type: 'trace', layer: t.layer, zIndex: style.zIndex, data: t });
      }

      // Queue vias
      for (const v of data.vias) {
        const isViaVisible = v.layers.some(l => isLayerVisible(l));
        if (!isViaVisible) continue;
        const style = resolveLayerStyle('Vias');
        renderQueue.push({ type: 'via', layer: 'Vias', zIndex: style.zIndex, data: v });
      }

      // Queue pads (grouped by component for efficiency, but sorted by layer)
      for (const comp of data.components) {
        if (!isLayerVisible(comp.layer)) continue;
        for (const pad of comp.pads) {
          if (!isLayerVisible(pad.layer)) continue;
          const style = resolveLayerStyle(pad.layer);
          renderQueue.push({ 
            type: 'pad', 
            layer: pad.layer, 
            zIndex: style.zIndex, 
            data: { pad, comp } 
          });
        }
        // Component origin marker
        const compStyle = resolveLayerStyle(comp.layer);
        renderQueue.push({
          type: 'component',
          layer: comp.layer,
          zIndex: compStyle.zIndex + 0.5, // slightly above pads
          data: comp
        });
      }

      // Sort by zIndex (lower = drawn first / below)
      renderQueue.sort((a, b) => a.zIndex - b.zIndex);

      // Execute render queue
      for (const item of renderQueue) {
        switch (item.type) {
          case 'trace': {
            const t = item.data;
            const style = resolveLayerStyle(t.layer);
            
            ctx.save();
            ctx.strokeStyle = style.color;
            ctx.globalAlpha = style.opacity ?? 1.0;
            ctx.lineWidth = Math.max(0.5, t.width * transform.scale);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            if (style.strokeDash) {
              ctx.setLineDash(style.strokeDash.map(d => d * transform.scale));
            }

            ctx.beginPath();
            const p0 = toScreen(t.points[0].x, t.points[0].y, transform);
            ctx.moveTo(p0.x, p0.y);
            for (let idx = 1; idx < t.points.length; idx++) {
              const pt = toScreen(t.points[idx].x, t.points[idx].y, transform);
              ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
            ctx.restore();
            break;
          }

          case 'via': {
            const v = item.data;
            const style = resolveLayerStyle('Vias');
            const screenPos = toScreen(v.x, v.y, transform);
            const radius = (v.diameter / 2) * transform.scale;
            const drillRadius = (v.drill / 2) * transform.scale;

            ctx.save();
            // Outer copper ring with layer color
            ctx.fillStyle = style.color;
            ctx.globalAlpha = style.opacity ?? 1.0;
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, Math.max(0.5, radius), 0, Math.PI * 2);
            ctx.fill();

            // Inner hole (substrate color)
            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, Math.max(0.3, drillRadius), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            break;
          }

          case 'pad': {
            const { pad, comp } = item.data;
            const style = resolveLayerStyle(pad.layer);
            const sp = toScreen(pad.x, pad.y, transform);
            const pw = Math.max(0.5, pad.width * transform.scale);
            const ph = Math.max(0.5, pad.height * transform.scale);

            ctx.save();
            ctx.fillStyle = style.color;
            ctx.globalAlpha = style.opacity ?? 1.0;
            
            if (pad.shape === 'circle' || pad.shape === 'round') {
              ctx.beginPath();
              ctx.arc(sp.x, sp.y, Math.max(pw, ph) / 2, 0, Math.PI * 2);
              ctx.fill();
            } else {
              ctx.fillRect(sp.x - pw / 2, sp.y - ph / 2, pw, ph);
            }

            // Drill hole for through-hole
            if (pad.drill > 0) {
              ctx.fillStyle = '#0f172a';
              ctx.beginPath();
              ctx.arc(sp.x, sp.y, Math.max(0.3, (pad.drill / 2) * transform.scale), 0, Math.PI * 2);
              ctx.fill();
            }

            // Pad label at high zoom
            if (transform.scale > 8) {
              ctx.fillStyle = '#ffffff';
              ctx.font = `${Math.max(8, Math.min(12, transform.scale))}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.globalAlpha = 1.0;
              ctx.fillText(pad.name, sp.x, sp.y);
            }
            ctx.restore();
            break;
          }

          case 'component': {
            const comp = item.data;
            const sc = toScreen(comp.x, comp.y, transform);
            
            // Origin crosshair
            ctx.save();
            ctx.strokeStyle = '#facc15'; // Yellow anchor
            ctx.lineWidth = 1;
            const crossSize = 3 * transform.scale;
            ctx.beginPath();
            ctx.moveTo(sc.x - crossSize, sc.y);
            ctx.lineTo(sc.x + crossSize, sc.y);
            ctx.moveTo(sc.x, sc.y - crossSize);
            ctx.lineTo(sc.x, sc.y + crossSize);
            ctx.stroke();

            // Designator text
            if (transform.scale > 2) {
              ctx.fillStyle = '#e2e8f0';
              ctx.font = '10px monospace';
              ctx.textAlign = 'center';
              ctx.globalAlpha = 1.0;
              ctx.fillText(comp.designator, sc.x, sc.y - 2.5 * transform.scale);
            }
            ctx.restore();
            break;
          }
        }
      }

      // === BOARD OUTLINE (Always on top of substrate, below copper) ===
      // Draw edge cuts if present in traces
      const edgeCuts = data.traces.filter(t => {
        const l = t.layer.toLowerCase();
        return l === 'edge.cuts' || l === 'dimension' || l === 'outline';
      });
      
      if (edgeCuts.length > 0) {
        const outlineStyle = resolveLayerStyle('Edge.Cuts');
        ctx.save();
        ctx.strokeStyle = outlineStyle.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        
        for (const t of edgeCuts) {
          ctx.beginPath();
          const p0 = toScreen(t.points[0].x, t.points[0].y, transform);
          ctx.moveTo(p0.x, p0.y);
          for (let idx = 1; idx < t.points.length; idx++) {
            const pt = toScreen(t.points[idx].x, t.points[idx].y, transform);
            ctx.lineTo(pt.x, pt.y);
          }
          ctx.stroke();
        }
        ctx.restore();
      }

    } else {
      // === SCHEMATIC RENDERING ===
      // (Keep existing schematic logic, but with better colors)
      for (const net of data.nets) {
        ctx.save();
        ctx.strokeStyle = '#06b6d4';
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
        ctx.restore();
      }

      for (const comp of data.components) {
        const sc = toScreen(comp.x, comp.y, transform);
        const size = 6 * transform.scale;

        ctx.save();
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.strokeRect(sc.x - size, sc.y - size, size * 2, size * 2);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.05)';
        ctx.fillRect(sc.x - size, sc.y - size, size * 2, size * 2);

        for (const pin of comp.pins) {
          const sp = toScreen(pin.x, pin.y, transform);
          ctx.strokeStyle = '#14b8a6';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sc.x, sc.y);
          ctx.lineTo(sp.x, sp.y);
          ctx.stroke();

          ctx.fillStyle = '#f43f5e';
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 2, 0, Math.PI * 2);
          ctx.fill();

          if (transform.scale > 3) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '8px sans-serif';
            ctx.textAlign = sp.x > sc.x ? 'left' : 'right';
            ctx.fillText(pin.name, sp.x + (sp.x > sc.x ? 4 : -4), sp.y - 2);
          }
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(comp.designator, sc.x, sc.y - size - 6);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px monospace';
        ctx.fillText(comp.value, sc.x, sc.y + size + 12);
        ctx.restore();
      }
    }

    // === ANNOTATIONS ===
    for (const ann of annotations) {
      if (ann.resolved) continue;
      const sp = toScreen(ann.x, ann.y, transform);
      const isSelected = ann.id === selectedAnnotationId;

      ctx.save();
      if (isSelected) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 16, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = isSelected ? '#ef4444' : '#f97316';
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 8, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText("💬", sp.x, sp.y - 0.5);
      ctx.restore();
    }
  }, [data, transform, visibleLayers, annotations, selectedAnnotationId, dimensions]);

  // Mouse handlers (unchanged logic, preserved for brevity)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      if (reviewMode) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const native = toNative(sx, sy, transform);
          const clickedAnn = annotations.find((ann: any) => {
            const sp = toScreen(ann.x, ann.y, transform);
            return Math.hypot(sp.x - sx, sp.y - sy) < 12;
          });
          if (clickedAnn) {
            onSelectAnnotation?.(clickedAnn.id);
          } else if (onAddAnnotation) {
            onAddAnnotation(native.x, native.y);
          }
        }
      } else {
        setIsPanning(true);
        setDragStart({ x: e.clientX - transform.offsetX, y: e.clientY - transform.offsetY });
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
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

    const native = toNative(sx, sy, transform);
    let matchedText = "";
    let matchedSubText = "";

    if (data.type === 'pcb') {
      for (const comp of data.components) {
        for (const pad of comp.pads) {
          const pd = Math.hypot(pad.x - native.x, pad.y - native.y);
          if (pd < Math.max(pad.width, pad.height) / 2) {
            matchedText = `Pad: ${comp.designator}.${pad.name}`;
            matchedSubText = `Package: ${comp.footprint} | Layer: ${pad.layer} | Color: ${resolveLayerStyle(pad.layer).color}`;
            break;
          }
        }
        if (matchedText) break;
      }

      if (!matchedText) {
        for (const comp of data.components) {
          const d = Math.hypot(comp.x - native.x, comp.y - native.y);
          if (d < 4.0) {
            matchedText = `Component: ${comp.designator}`;
            matchedSubText = `Value: ${comp.value} | Footprint: ${comp.footprint} | Layer: ${comp.layer}`;
            break;
          }
        }
      }

      if (!matchedText) {
        for (const t of data.traces) {
          for (let k = 0; k < t.points.length - 1; k++) {
            const p1 = t.points[k];
            const p2 = t.points[k + 1];
            const d = pointToSegmentDistance(native, p1, p2);
            if (d < t.width / 2 + 0.3) {
              matchedText = `Net: ${t.net}`;
              matchedSubText = `Layer: ${t.layer} | Width: ${t.width}mm | Color: ${resolveLayerStyle(t.layer).color}`;
              break;
            }
          }
          if (matchedText) break;
        }
      }
    } else {
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

  const handleMouseUp = () => setIsPanning(false);

  const handleWheel = (e: React.WheelEvent) => {
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
    const fit = fitBounds(data.bounds, dimensions.width, dimensions.height);
    setTransform(fit);
  };

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-slate-900 rounded-lg">
      {/* Top Floating Controls Bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 bg-slate-800/90 backdrop-blur-sm px-4 py-2 rounded-full border border-slate-700 shadow-lg">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          {data.type.toUpperCase()} View
        </span>
        <div className="w-px h-4 bg-slate-600" />
        <button onClick={() => handleZoom('in')} className="text-slate-300 hover:text-white transition-colors text-sm">+</button>
        <span className="text-xs text-slate-400 min-w-[3rem] text-center">
          {Math.round(transform.scale * 100)}%
        </span>
        <button onClick={() => handleZoom('out')} className="text-slate-300 hover:text-white transition-colors text-sm">−</button>
        <div className="w-px h-4 bg-slate-600" />
        <button onClick={handleReset} className="text-xs text-slate-300 hover:text-white transition-colors">Fit</button>
      </div>

      {/* Hover Tooltip */}
      {hoverInfo && (
        <div 
          ref={(el) => {
            if (el) {
              el.style.left = `${hoverInfo.x + 12}px`;
              el.style.top = `${hoverInfo.y - 12}px`;
            }
          }}
          className="absolute z-20 pointer-events-none bg-slate-800/95 backdrop-blur-sm border border-slate-600 rounded-lg px-3 py-2 shadow-xl"
        >
          <div className="text-xs font-semibold text-white">{hoverInfo.text}</div>
          {hoverInfo.subText && (
            <div className="text-[10px] text-slate-400 mt-0.5">{hoverInfo.subText}</div>
          )}
        </div>
      )}

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="block cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
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
