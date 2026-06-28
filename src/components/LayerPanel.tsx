// src/components/LayerPanel.tsx
import { resolveLayerStyle } from '../lib/layers/layer-colors';

interface LayerPanelProps {
  layers: string[];
  visibleLayers: string[];
  onToggleLayer: (layer: string) => void;
  onSetAll: (layers: string[]) => void;
}

export default function LayerPanel({ layers, visibleLayers, onToggleLayer, onSetAll }: LayerPanelProps) {
  const ordered = [...layers].sort((a, b) => {
    const za = resolveLayerStyle(a).zIndex;
    const zb = resolveLayerStyle(b).zIndex;
    return za - zb;
  });

  const isAllVisible = visibleLayers.length === 0 || visibleLayers.length === layers.length;

  return (
    <div className="bg-slate-800/90 backdrop-blur-sm border border-slate-700 rounded-xl p-3 w-full shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Layers</h3>
        <button 
          onClick={() => isAllVisible ? onSetAll([]) : onSetAll(layers)}
          className="text-[10px] text-slate-400 hover:text-white transition-colors"
        >
          {isAllVisible ? 'Hide All' : 'Show All'}
        </button>
      </div>
      
      <div className="space-y-0.5 max-h-96 overflow-y-auto pr-1">
        {ordered.map(layer => {
          const style = resolveLayerStyle(layer);
          const isVisible = visibleLayers.length === 0 || visibleLayers.includes(layer);
          
          return (
            <button
              key={layer}
              onClick={() => onToggleLayer(layer)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all ${
                isVisible ? 'bg-slate-700/50 hover:bg-slate-700' : 'opacity-40 hover:opacity-60'
              }`}
            >
              <svg className="w-3 h-3 rounded-sm border border-slate-500/50 shrink-0" viewBox="0 0 10 10">
                <rect width="10" height="10" fill={style.color} fillOpacity={style.opacity ?? 1} />
              </svg>
              <div className="min-w-0">
                <div className="text-[11px] text-slate-200 font-medium truncate">{layer}</div>
                <div className="text-[9px] text-slate-500 truncate">{style.color}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
