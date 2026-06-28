// src/components/LayerLegend.tsx
// Interactive layer legend with color swatches, toggles, and opacity sliders

'use client';

import { useState } from 'react';
import { resolveLayerStyle, getOrderedLayers } from '../lib/layers/layer-colors';

interface LayerLegendProps {
  layers: string[];
  visibleLayers: string[];
  layerOpacities: Record<string, number>;
  onToggleLayer: (layerId: string) => void;
  onSetOpacity: (layerId: string, opacity: number) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  compact?: boolean;
}

export default function LayerLegend({
  layers,
  visibleLayers,
  layerOpacities,
  onToggleLayer,
  onSetOpacity,
  onShowAll,
  onHideAll,
  compact = false,
}: LayerLegendProps) {
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null);
  const ordered = getOrderedLayers(layers);

  return (
    <div className={`bg-slate-850 border border-slate-700/80 rounded-xl shadow-xl ${compact ? 'p-2 w-48' : 'p-3 w-60'}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
          Layers ({visibleLayers.length}/{layers.length})
        </h3>
        <div className="flex gap-1">
          <button
            onClick={onShowAll}
            className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors cursor-pointer"
            title="Show all layers"
          >
            All
          </button>
          <button
            onClick={onHideAll}
            className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors cursor-pointer"
            title="Hide all layers"
          >
            None
          </button>
        </div>
      </div>

      <div className={`space-y-0.5 ${compact ? 'max-h-64' : 'max-h-80'} overflow-y-auto pr-1 scrollbar-thin`}>
        {ordered.map(layer => {
          const style = resolveLayerStyle(layer);
          const isVisible = visibleLayers.includes(layer);
          const opacity = layerOpacities[layer] ?? style.opacity ?? 1;
          const isExpanded = expandedLayer === layer;

          return (
            <div key={layer} className="group">
              <button
                onClick={() => onToggleLayer(layer)}
                onMouseEnter={() => !compact && setExpandedLayer(layer)}
                onMouseLeave={() => setExpandedLayer(null)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all cursor-pointer ${
                  isVisible ? 'bg-slate-700/40 hover:bg-slate-700' : 'opacity-30 hover:opacity-50'
                }`}
              >
                <svg className="w-3.5 h-3.5 rounded-sm border border-slate-500/50 shrink-0 shadow-sm" viewBox="0 0 10 10">
                  <rect width="10" height="10" fill={style.color} fillOpacity={isVisible ? opacity : 0.2} />
                </svg>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-slate-200 font-medium truncate leading-tight">
                    {layer}
                  </div>
                  {!compact && (
                    <div className="text-[9px] text-slate-500 font-mono truncate">
                      {style.color}
                    </div>
                  )}
                </div>
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isVisible ? 'bg-emerald-400' : 'bg-slate-600'
                  }`}
                />
              </button>

              {isExpanded && isVisible && !compact && (
                <div className="px-2 pb-1.5 pt-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-400 w-8">{Math.round(opacity * 100)}%</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(opacity * 100)}
                      onChange={(e) => onSetOpacity(layer, parseInt(e.target.value) / 100)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 h-1 bg-slate-650 rounded-lg appearance-none accent-emerald-500 cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 pt-2 border-t border-slate-700/50 flex items-center justify-between">
        <span className="text-[9px] text-slate-500">Opacity defaults</span>
        <span className="text-[9px] text-slate-400">
          Cu 90% · Silk 45%
        </span>
      </div>
    </div>
  );
}
