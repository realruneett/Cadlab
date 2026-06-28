// src/components/PreviewPanel.tsx
// Single-File Preview Mode — side panel with canvas, legend, and controls

'use client';

import { useRef, useEffect, useState } from 'react';
import HardwareCanvas from './hardware-canvas';
import LayerLegend from './LayerLegend';
import { PreviewChange } from '../hooks/usePreview';
import { PCBData } from '../lib/parsers/kicad/pcbParser';
import { SchematicData } from '../lib/parsers/kicad/schParser';

interface PreviewPanelProps {
  isOpen: boolean;
  fileName: string | null;
  data: PCBData | SchematicData | null;
  visibleLayers: string[];
  layerOpacities: Record<string, number>;
  highlightedChange: PreviewChange | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onToggleLayer: (layerId: string) => void;
  onSetOpacity: (layerId: string, opacity: number) => void;
  onShowAllLayers: () => void;
  onHideAllLayers: () => void;
  isColorblind?: boolean;
}

export default function PreviewPanel({
  isOpen,
  fileName,
  data,
  visibleLayers,
  layerOpacities,
  highlightedChange,
  isLoading,
  error,
  onClose,
  onToggleLayer,
  onSetOpacity,
  onShowAllLayers,
  onHideAllLayers,
  isColorblind = false,
}: PreviewPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [showLegend, setShowLegend] = useState(true);
  const [showDetails, setShowDetails] = useState(true);

  useEffect(() => {
    if (isOpen && panelRef.current) {
      panelRef.current.focus();
      const announcer = document.getElementById('sr-announcer');
      if (announcer && data) {
        const layerCount = data.type === 'pcb' ? (data as PCBData).layers.length : 0;
        announcer.textContent = `Preview opened for ${fileName}. ${layerCount} layers available. Active layer: ${visibleLayers[0] || 'none'}`;
      }
    }
  }, [isOpen, fileName, data, visibleLayers]);

  if (!isOpen) return null;

  const layerCount = data?.type === 'pcb' ? (data as PCBData).layers.length : 0;
  const traceCount = data?.type === 'pcb' ? (data as PCBData).traces.length : 0;
  const compCount = data?.type === 'pcb' ? (data as PCBData).components.length : data?.type === 'schematic' ? (data as SchematicData).components.length : 0;

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${fileName}`}
      className="fixed inset-y-0 right-0 w-[600px] max-w-[90vw] bg-slate-900 border-l border-slate-700 shadow-2xl z-50 flex flex-col animate-slide-in-right"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white truncate" title={fileName || ''}>
            {fileName || 'Preview'}
          </h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-slate-400">
              {data?.type === 'pcb' ? 'PCB' : 'Schematic'}
            </span>
            {highlightedChange && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                Change: {highlightedChange.type}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLegend(v => !v)}
            className={`p-1.5 rounded-md text-xs transition-colors cursor-pointer ${showLegend ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
            title="Toggle layer legend"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
            </svg>
          </button>

          <button
            onClick={() => setShowDetails(v => !v)}
            className={`p-1.5 rounded-md text-xs transition-colors cursor-pointer ${showDetails ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
            title="Toggle details panel"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
            </svg>
          </button>

          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
            title="Close preview (Esc)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {!highlightedChange && (
        <div className="px-4 py-1.5 bg-slate-800/30 border-b border-slate-700/50 flex items-center justify-between">
          <span className="text-[10px] text-slate-400">
            Previewing file — enable compare when ready
          </span>
          <span className="text-[10px] text-slate-500">
            Press Esc to close · F to fit
          </span>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-10">
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-slate-600 border-t-emerald-500 rounded-full animate-spin" />
                <span className="text-xs text-slate-400">Resolving structural geometry...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-10">
              <div className="text-center px-4">
                <div className="text-red-400 text-sm mb-1">Failed to load preview</div>
                <div className="text-xs text-slate-500">{error}</div>
              </div>
            </div>
          )}

          {data && (
            <HardwareCanvas
              data={data}
              visibleLayers={visibleLayers}
              layerOpacities={layerOpacities}
              highlightedChange={highlightedChange}
              previewMode={true}
              isColorblind={isColorblind}
            />
          )}
        </div>

        <div className="w-56 border-l border-slate-700 bg-slate-800/30 flex flex-col overflow-hidden">
          {showLegend && data?.type === 'pcb' && (
            <div className="flex-1 overflow-y-auto p-2">
              <LayerLegend
                layers={(data as PCBData).layers}
                visibleLayers={visibleLayers}
                layerOpacities={layerOpacities}
                onToggleLayer={onToggleLayer}
                onSetOpacity={onSetOpacity}
                onShowAll={onShowAllLayers}
                onHideAll={onHideAllLayers}
                compact={false}
              />
            </div>
          )}

          {showDetails && (
            <div className="border-t border-slate-700 p-3 space-y-2">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">File Details</h4>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Layers</span>
                  <span className="text-slate-300 font-mono">{layerCount}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Traces</span>
                  <span className="text-slate-300 font-mono">{traceCount}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Components</span>
                  <span className="text-slate-300 font-mono">{compCount}</span>
                </div>
                {data?.type === 'pcb' && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">Vias</span>
                    <span className="text-slate-300 font-mono">{(data as PCBData).vias.length}</span>
                  </div>
                )}
              </div>

              {highlightedChange && (
                <div className="mt-2 pt-2 border-t border-slate-700/50">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Change</h4>
                  <div className="text-[11px] text-slate-300">
                    Type: <span className="capitalize">{highlightedChange.type}</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Layers: {highlightedChange.layerIds.join(', ')}
                  </div>
                  {highlightedChange.nets && (
                    <div className="text-[11px] text-slate-400">
                      Nets: {highlightedChange.nets.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
