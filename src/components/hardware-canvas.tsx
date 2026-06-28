"use client";

import { useRef, useEffect, useState, useCallback } from 'react';
import { Point, PCBData } from '../lib/parsers/kicad/pcbParser';
import { SchematicData } from '../lib/parsers/kicad/schParser';
import { ViewportTransform, toScreen, toNative, fitBounds } from '../lib/canvas/coordinate-translator';
import { resolveLayerStyle, getOrderedLayers, DIFF_HIGHLIGHT, getNetColor } from '../lib/layers/layer-colors';
import { PreviewChange } from '../hooks/usePreview';

interface HardwareCanvasProps {
  data: PCBData | SchematicData;
  visibleLayers?: string[];
  layerOpacities?: Record<string, number>;
  customColors?: Record<string, string>;
  highlightedChange?: PreviewChange | null;
  annotations?: any[];
  selectedAnnotationId?: string | null;
  reviewMode?: boolean;
  previewMode?: boolean;
  onAddAnnotation?: (x: number, y: number) => void;
  onSelectAnnotation?: (id: string) => void;
  transform?: ViewportTransform | null;
  onTransformChange?: (transform: ViewportTransform) => void;
  renderMode?: 'vector' | 'raster';
  isColorblind?: boolean;
}

export default function HardwareCanvas({
  data,
  visibleLayers = [],
  layerOpacities = {},
  customColors = {},
  highlightedChange = null,
  annotations = [],
  selectedAnnotationId = null,
  reviewMode = false,
  previewMode = false,
  onAddAnnotation,
  onSelectAnnotation,
  transform: propTransform = null,
  onTransformChange,
  renderMode = 'vector',
  isColorblind = false
}: HardwareCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rasterCacheRef = useRef<{ canvas: HTMLCanvasElement; key: string } | null>(null);
  
  const [internalTransform, setInternalTransform] = useState<ViewportTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const transform = propTransform !== null ? propTransform : internalTransform;
  
  const setTransform = useCallback((t: ViewportTransform | ((prev: ViewportTransform) => ViewportTransform)) => {
    const next = typeof t === 'function' ? t(transform) : t;
    if (onTransformChange) {
      onTransformChange(next);
    } else {
      setInternalTransform(next);
    }
  }, [transform, onTransformChange]);

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; text: string; subText?: string } | null>(null);
  const [hoveredNet, setHoveredNet] = useState<string | null>(null);

  // Helper to apply user custom color overrides
  const getStyleWithOverride = useCallback((layerName: string) => {
    const style = resolveLayerStyle(layerName);
    if (customColors && customColors[layerName]) {
      return { ...style, color: customColors[layerName] };
    }
    return style;
  }, [customColors]);

  // Resize observer to auto-adapt dimensions
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

  // Center and fit canvas bounds when design file changes
  useEffect(() => {
    if (dimensions.width > 0 && dimensions.height > 0 && data) {
      const fit = fitBounds(data.bounds, dimensions.width, dimensions.height);
      setTransform(fit);
    }
  }, [data, dimensions.width, dimensions.height]);

  // Bind keydown for F key shortcut (Fit Bounds)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        if (data && dimensions.width > 0) {
          const fit = fitBounds(data.bounds, dimensions.width, dimensions.height);
          setTransform(fit);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [data, dimensions]);

  const isInHighlightBounds = useCallback((x: number, y: number): boolean => {
    if (!highlightedChange) return false;
    const b = highlightedChange.bounds;
    return x >= b.xMin && x <= b.xMax && y >= b.yMin && y <= b.yMax;
  }, [highlightedChange]);

  const getHighlightColor = useCallback((): { color: string; rgba: string; style: string } | null => {
    if (!highlightedChange) return null;
    const base = DIFF_HIGHLIGHT[highlightedChange.type];
    if (isColorblind) {
      if (highlightedChange.type === 'added') {
        return { color: '#0072B2', rgba: 'rgba(0, 114, 178, 0.6)', style: 'solid-glow' };
      }
      if (highlightedChange.type === 'removed') {
        return { color: '#D55E00', rgba: 'rgba(213, 94, 0, 0.6)', style: 'dashed-outline' };
      }
    }
    return base;
  }, [highlightedChange, isColorblind]);

  // Main canvas draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isLayerVisible = (layerName: string): boolean => {
      if (data.type === 'schematic') return true;
      if (visibleLayers.length === 0) return true;
      return visibleLayers.includes(layerName) || layerName === 'MultiLayer';
    };

    const getOpacity = (layerName: string): number => {
      return layerOpacities[layerName] ?? resolveLayerStyle(layerName).opacity ?? 1;
    };

    const drawDesignGeometry = (targetCtx: CanvasRenderingContext2D, currentTransform: ViewportTransform) => {
      if (data.type === 'pcb') {
        const renderQueue: Array<{
          type: 'trace' | 'via' | 'pad' | 'component' | 'outline';
          layer: string;
          zIndex: number;
          data: any;
        }> = [];

        for (const t of data.traces) {
          if (!isLayerVisible(t.layer)) continue;
          const style = getStyleWithOverride(t.layer);
          renderQueue.push({ type: 'trace', layer: t.layer, zIndex: style.zIndex, data: t });
        }

        for (const v of data.vias) {
          const isViaVisible = v.layers.some(l => isLayerVisible(l));
          if (!isViaVisible) continue;
          const style = getStyleWithOverride('Vias');
          renderQueue.push({ type: 'via', layer: 'Vias', zIndex: style.zIndex, data: v });
        }

        for (const comp of data.components) {
          if (!isLayerVisible(comp.layer)) continue;
          for (const pad of comp.pads) {
            if (!isLayerVisible(pad.layer)) continue;
            const style = getStyleWithOverride(pad.layer);
            renderQueue.push({ type: 'pad', layer: pad.layer, zIndex: style.zIndex, data: { pad, comp } });
          }
          const compStyle = getStyleWithOverride(comp.layer);
          renderQueue.push({ type: 'component', layer: comp.layer, zIndex: compStyle.zIndex + 0.5, data: comp });
        }

        renderQueue.sort((a, b) => a.zIndex - b.zIndex);

        for (const item of renderQueue) {
          switch (item.type) {
            case 'trace': {
              const t = item.data;
              const style = getStyleWithOverride(t.layer);
              const opacity = getOpacity(t.layer);
              const isHighlighted = highlightedChange && highlightedChange.layerIds.includes(t.layer) && 
                t.points.some((p: Point) => isInHighlightBounds(p.x, p.y));
              const hl = isHighlighted ? getHighlightColor() : null;

              targetCtx.save();
              targetCtx.strokeStyle = hl ? hl.color : style.color;
              targetCtx.globalAlpha = hl ? 0.9 : opacity;
              targetCtx.lineWidth = Math.max(0.5, t.width * currentTransform.scale);
              targetCtx.lineCap = 'round';
              targetCtx.lineJoin = 'round';
              
              if (style.strokeDash && !hl) {
                targetCtx.setLineDash(style.strokeDash.map(d => d * currentTransform.scale));
              }
              if (hl?.style === 'dashed-outline') {
                targetCtx.setLineDash([6, 4].map(d => d * currentTransform.scale));
              }

              targetCtx.beginPath();
              const p0 = toScreen(t.points[0].x, t.points[0].y, currentTransform);
              targetCtx.moveTo(p0.x, p0.y);
              for (let idx = 1; idx < t.points.length; idx++) {
                const pt = toScreen(t.points[idx].x, t.points[idx].y, currentTransform);
                targetCtx.lineTo(pt.x, pt.y);
              }
              targetCtx.stroke();

              if (hl && (hl.style === 'solid-glow' || hl.style === 'pulse-outline')) {
                targetCtx.shadowColor = hl.color;
                targetCtx.shadowBlur = 8 * currentTransform.scale;
                targetCtx.stroke();
                targetCtx.shadowBlur = 0;
              }
              targetCtx.restore();
              break;
            }

            case 'via': {
              const v = item.data;
              const style = getStyleWithOverride('Vias');
              const opacity = getOpacity('Vias');
              const isHighlighted = highlightedChange && isInHighlightBounds(v.x, v.y);
              const hl = isHighlighted ? getHighlightColor() : null;
              const screenPos = toScreen(v.x, v.y, currentTransform);
              const radius = Math.max(0.5, (v.diameter / 2) * currentTransform.scale);
              const drillRadius = Math.max(0.3, (v.drill / 2) * currentTransform.scale);

              targetCtx.save();
              targetCtx.fillStyle = hl ? hl.color : style.color;
              targetCtx.globalAlpha = hl ? 0.9 : opacity;
              targetCtx.beginPath();
              targetCtx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
              targetCtx.fill();

              if (hl?.style === 'solid-glow') {
                targetCtx.shadowColor = hl.color;
                targetCtx.shadowBlur = 10 * currentTransform.scale;
                targetCtx.fill();
                targetCtx.shadowBlur = 0;
              }

              if (isColorblind && hl?.style === 'dashed-outline') {
                targetCtx.strokeStyle = '#ffffff';
                targetCtx.lineWidth = 1.5;
                targetCtx.setLineDash([6, 4].map(d => d * currentTransform.scale));
                targetCtx.beginPath();
                targetCtx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
                targetCtx.stroke();
              }

              targetCtx.fillStyle = '#0f172a';
              targetCtx.globalAlpha = 1;
              targetCtx.beginPath();
              targetCtx.arc(screenPos.x, screenPos.y, drillRadius, 0, Math.PI * 2);
              targetCtx.fill();
              targetCtx.restore();
              break;
            }

            case 'pad': {
              const { pad, comp } = item.data;
              const style = getStyleWithOverride(pad.layer);
              const opacity = getOpacity(pad.layer);
              const isHighlighted = highlightedChange && highlightedChange.layerIds.includes(pad.layer) &&
                isInHighlightBounds(pad.x, pad.y);
              const hl = isHighlighted ? getHighlightColor() : null;
              const sp = toScreen(pad.x, pad.y, currentTransform);
              const pw = Math.max(0.5, pad.width * currentTransform.scale);
              const ph = Math.max(0.5, pad.height * currentTransform.scale);

              targetCtx.save();
              targetCtx.fillStyle = hl ? hl.color : style.color;
              targetCtx.globalAlpha = hl ? 0.9 : opacity;

              if (pad.shape === 'circle' || pad.shape === 'round') {
                targetCtx.beginPath();
                targetCtx.arc(sp.x, sp.y, Math.max(pw, ph) / 2, 0, Math.PI * 2);
                targetCtx.fill();
              } else {
                targetCtx.fillRect(sp.x - pw / 2, sp.y - ph / 2, pw, ph);
              }

              if (hl?.style === 'solid-glow') {
                targetCtx.shadowColor = hl.color;
                targetCtx.shadowBlur = 8 * currentTransform.scale;
                if (pad.shape === 'circle' || pad.shape === 'round') {
                  targetCtx.beginPath();
                  targetCtx.arc(sp.x, sp.y, Math.max(pw, ph) / 2, 0, Math.PI * 2);
                  targetCtx.fill();
                } else {
                  targetCtx.fillRect(sp.x - pw / 2, sp.y - ph / 2, pw, ph);
                }
                targetCtx.shadowBlur = 0;
              }

              if (isColorblind && hl?.style === 'dashed-outline') {
                targetCtx.strokeStyle = '#ffffff';
                targetCtx.lineWidth = 1.5;
                targetCtx.setLineDash([6, 4].map(d => d * currentTransform.scale));
                if (pad.shape === 'circle' || pad.shape === 'round') {
                  targetCtx.beginPath();
                  targetCtx.arc(sp.x, sp.y, Math.max(pw, ph) / 2, 0, Math.PI * 2);
                  targetCtx.stroke();
                } else {
                  targetCtx.strokeRect(sp.x - pw / 2, sp.y - ph / 2, pw, ph);
                }
              }

              if (pad.drill > 0) {
                targetCtx.fillStyle = '#0f172a';
                targetCtx.globalAlpha = 1;
                targetCtx.beginPath();
                targetCtx.arc(sp.x, sp.y, Math.max(0.3, (pad.drill / 2) * currentTransform.scale), 0, Math.PI * 2);
                targetCtx.fill();
              }

              if (currentTransform.scale > 8) {
                targetCtx.fillStyle = '#ffffff';
                targetCtx.font = `${Math.max(8, Math.min(12, currentTransform.scale))}px sans-serif`;
                targetCtx.textAlign = 'center';
                targetCtx.textBaseline = 'middle';
                targetCtx.globalAlpha = 1;
                targetCtx.fillText(pad.name, sp.x, sp.y);
              }
              targetCtx.restore();
              break;
            }

            case 'component': {
              const comp = item.data;
              const sc = toScreen(comp.x, comp.y, currentTransform);
              
              targetCtx.save();
              targetCtx.strokeStyle = '#facc15';
              targetCtx.lineWidth = 1;
              const crossSize = 3 * currentTransform.scale;
              targetCtx.beginPath();
              targetCtx.moveTo(sc.x - crossSize, sc.y);
              targetCtx.lineTo(sc.x + crossSize, sc.y);
              targetCtx.moveTo(sc.x, sc.y - crossSize);
              targetCtx.lineTo(sc.x, sc.y + crossSize);
              targetCtx.stroke();

              if (currentTransform.scale > 2) {
                targetCtx.fillStyle = '#e2e8f0';
                targetCtx.font = '10px monospace';
                targetCtx.textAlign = 'center';
                targetCtx.globalAlpha = 1;
                targetCtx.fillText(comp.designator, sc.x, sc.y - 2.5 * currentTransform.scale);
              }
              targetCtx.restore();
              break;
            }
          }
        }

        const edgeCuts = data.traces.filter(t => {
          const l = t.layer.toLowerCase();
          return l === 'edge.cuts' || l === 'dimension' || l === 'outline';
        });
        
        if (edgeCuts.length > 0) {
          const outlineStyle = getStyleWithOverride('Edge.Cuts');
          targetCtx.save();
          targetCtx.strokeStyle = outlineStyle.color;
          targetCtx.lineWidth = 2;
          targetCtx.setLineDash([]);
          
          for (const t of edgeCuts) {
            targetCtx.beginPath();
            const p0 = toScreen(t.points[0].x, t.points[0].y, currentTransform);
            targetCtx.moveTo(p0.x, p0.y);
            for (let idx = 1; idx < t.points.length; idx++) {
              const pt = toScreen(t.points[idx].x, t.points[idx].y, currentTransform);
              targetCtx.lineTo(pt.x, pt.y);
            }
            targetCtx.stroke();
          }
          targetCtx.restore();
        }

        if (hoveredNet && !highlightedChange) {
          const netColor = getNetColor(hoveredNet);
          targetCtx.save();
          targetCtx.strokeStyle = netColor;
          targetCtx.globalAlpha = 0.3;
          targetCtx.lineWidth = 3;
          for (const t of data.traces) {
            if (t.net !== hoveredNet) continue;
            if (!isLayerVisible(t.layer)) continue;
            targetCtx.beginPath();
            const p0 = toScreen(t.points[0].x, t.points[0].y, currentTransform);
            targetCtx.moveTo(p0.x, p0.y);
            for (let idx = 1; idx < t.points.length; idx++) {
              const pt = toScreen(t.points[idx].x, t.points[idx].y, currentTransform);
              targetCtx.lineTo(pt.x, pt.y);
            }
            targetCtx.stroke();
          }
          targetCtx.restore();
        }

      } else {
        for (const net of data.nets) {
          targetCtx.save();
          targetCtx.strokeStyle = '#06b6d4';
          targetCtx.lineWidth = 1.5;
          targetCtx.lineCap = 'round';
          targetCtx.lineJoin = 'round';
          
          for (const seg of net.segments) {
            targetCtx.beginPath();
            const p0 = toScreen(seg.points[0].x, seg.points[0].y, currentTransform);
            targetCtx.moveTo(p0.x, p0.y);
            for (let idx = 1; idx < seg.points.length; idx++) {
              const pt = toScreen(seg.points[idx].x, seg.points[idx].y, currentTransform);
              targetCtx.lineTo(pt.x, pt.y);
            }
            targetCtx.stroke();
          }
          targetCtx.restore();
        }

        for (const comp of data.components) {
          const sc = toScreen(comp.x, comp.y, currentTransform);
          const size = 6 * currentTransform.scale;

          targetCtx.save();
          targetCtx.strokeStyle = '#10b981';
          targetCtx.lineWidth = 2;
          targetCtx.strokeRect(sc.x - size, sc.y - size, size * 2, size * 2);
          targetCtx.fillStyle = 'rgba(16, 185, 129, 0.05)';
          targetCtx.fillRect(sc.x - size, sc.y - size, size * 2, size * 2);

          for (const pin of comp.pins) {
            const sp = toScreen(pin.x, pin.y, currentTransform);
            targetCtx.strokeStyle = '#14b8a6';
            targetCtx.lineWidth = 1;
            targetCtx.beginPath();
            targetCtx.moveTo(sc.x, sc.y);
            targetCtx.lineTo(sp.x, sp.y);
            targetCtx.stroke();

            targetCtx.fillStyle = '#f43f5e';
            targetCtx.beginPath();
            targetCtx.arc(sp.x, sp.y, 2, 0, Math.PI * 2);
            targetCtx.fill();

            if (currentTransform.scale > 3) {
              targetCtx.fillStyle = '#94a3b8';
              targetCtx.font = '8px sans-serif';
              targetCtx.textAlign = sp.x > sc.x ? 'left' : 'right';
              targetCtx.fillText(pin.name, sp.x + (sp.x > sc.x ? 4 : -4), sp.y - 2);
            }
          }

          targetCtx.fillStyle = '#ffffff';
          targetCtx.font = 'bold 12px monospace';
          targetCtx.textAlign = 'center';
          targetCtx.fillText(comp.designator, sc.x, sc.y - size - 6);

          targetCtx.fillStyle = '#94a3b8';
          targetCtx.font = '10px monospace';
          targetCtx.fillText(comp.value, sc.x, sc.y + size + 12);
          targetCtx.restore();
        }
      }
    };

    const bounds = data.bounds;
    const cacheKey = JSON.stringify({
      visibleLayers,
      layerOpacities,
      customColors,
      dataBounds: data.bounds,
      highlight: highlightedChange?.id
    });

    if (renderMode === 'raster' && (!rasterCacheRef.current || rasterCacheRef.current.key !== cacheKey)) {
      const R = 8;
      const bW = Math.max(10, bounds.maxX - bounds.minX);
      const bH = Math.max(10, bounds.maxY - bounds.minY);
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = Math.ceil(bW * R);
      offscreenCanvas.height = Math.ceil(bH * R);

      const offCtx = offscreenCanvas.getContext('2d');
      if (offCtx) {
        offCtx.fillStyle = '#0f172a';
        offCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
        const offTransform = {
          scale: R,
          offsetX: -bounds.minX * R,
          offsetY: -bounds.minY * R
        };
        drawDesignGeometry(offCtx, offTransform);
        rasterCacheRef.current = { canvas: offscreenCanvas, key: cacheKey };
      }
    }

    if (renderMode === 'raster' && rasterCacheRef.current) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 0.5;
      const gridSize = 20 * transform.scale;
      const gridOffsetX = transform.offsetX % gridSize;
      const gridOffsetY = transform.offsetY % gridSize;

      for (let x = gridOffsetX; x < dimensions.width; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, dimensions.height); ctx.stroke();
      }
      for (let y = gridOffsetY; y < dimensions.height; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(dimensions.width, y); ctx.stroke();
      }

      const pMin = toScreen(bounds.minX, bounds.minY, transform);
      const pMax = toScreen(bounds.maxX, bounds.maxY, transform);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(rasterCacheRef.current.canvas, pMin.x, pMin.y, pMax.x - pMin.x, pMax.y - pMin.y);
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 0.5;
      const gridSize = 20 * transform.scale;
      const gridOffsetX = transform.offsetX % gridSize;
      const gridOffsetY = transform.offsetY % gridSize;

      for (let x = gridOffsetX; x < dimensions.width; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, dimensions.height); ctx.stroke();
      }
      for (let y = gridOffsetY; y < dimensions.height; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(dimensions.width, y); ctx.stroke();
      }

      drawDesignGeometry(ctx, transform);
    }

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
  }, [data, transform, visibleLayers, layerOpacities, customColors, highlightedChange, hoveredNet, annotations, selectedAnnotationId, dimensions, getStyleWithOverride, renderMode, isColorblind]);

  // Click & Drag panning/adding annotation handlers
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

    const isLayerVisible = (layerName: string): boolean => {
      if (data.type === 'schematic') return true;
      if (visibleLayers.length === 0) return true;
      return visibleLayers.includes(layerName) || layerName === 'MultiLayer';
    };

    if (data.type === 'pcb') {
      for (const comp of data.components) {
        for (const pad of comp.pads) {
          if (!isLayerVisible(pad.layer)) continue;
          const pd = Math.hypot(pad.x - native.x, pad.y - native.y);
          if (pd < Math.max(pad.width, pad.height) / 2) {
            matchedText = `Pad: ${comp.designator}.${pad.name}`;
            matchedSubText = `Package: ${comp.footprint} | Layer: ${pad.layer} | Color: ${getStyleWithOverride(pad.layer).color}`;
            break;
          }
        }
        if (matchedText) break;
      }

      if (!matchedText) {
        for (const comp of data.components) {
          if (!isLayerVisible(comp.layer)) continue;
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
          if (!isLayerVisible(t.layer)) continue;
          for (let k = 0; k < t.points.length - 1; k++) {
            const p1 = t.points[k];
            const p2 = t.points[k + 1];
            const d = pointToSegmentDistance(native, p1, p2);
            if (d < t.width / 2 + 0.3) {
              matchedText = `Net: ${t.net}`;
              matchedSubText = `Layer: ${t.layer} | Width: ${t.width}mm | Color: ${getStyleWithOverride(t.layer).color}`;
              setHoveredNet(t.net);
              break;
            }
          }
          if (matchedText) break;
        }
      }
      if (!matchedText) {
        setHoveredNet(null);
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
      {!previewMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 bg-slate-800/90 backdrop-blur-sm px-4 py-2 rounded-full border border-slate-700 shadow-lg">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            {data.type.toUpperCase()} View
          </span>
          <div className="w-px h-4 bg-slate-600" />
          <button onClick={() => handleZoom('in')} className="text-slate-300 hover:text-white transition-colors text-sm cursor-pointer">+</button>
          <span className="text-xs text-slate-400 min-w-[3rem] text-center">
            {Math.round(transform.scale * 100)}%
          </span>
          <button onClick={() => handleZoom('out')} className="text-slate-300 hover:text-white transition-colors text-sm cursor-pointer">−</button>
          <div className="w-px h-4 bg-slate-600" />
          <button onClick={handleReset} className="text-xs text-slate-300 hover:text-white transition-colors cursor-pointer">Fit</button>
        </div>
      )}

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
        className="block cursor-crosshair w-full h-full"
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
