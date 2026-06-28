"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  X, 
  Settings, 
  ChevronRight, 
  ChevronLeft, 
  Columns, 
  Layers, 
  Eye, 
  EyeOff, 
  SlidersHorizontal 
} from 'lucide-react';
import HardwareCanvas from './hardware-canvas';
import { PCBData } from '../lib/parsers/kicad/pcbParser';
import { SchematicData } from '../lib/parsers/kicad/schParser';
import { getOrderedLayers, resolveLayerStyle } from '../lib/layers/layer-colors';

import { usePreview } from '../hooks/usePreview';

interface InWorkspacePreviewProps {
  fileName: string;
  data: PCBData | SchematicData | null;
  onClose: () => void;
  projectSlug: string;
  preview?: ReturnType<typeof usePreview>;
}

export default function InWorkspacePreview({
  fileName,
  data,
  onClose,
  projectSlug,
  preview
}: InWorkspacePreviewProps) {
  // --- Persistent Settings via LocalStorage ---
  const [layoutMode, setLayoutMode] = useState<'merged' | 'mirrored'>('merged');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [visibleLayers, setVisibleLayers] = useState<string[]>([]);
  const [layerOpacities, setLayerOpacities] = useState<Record<string, number>>({});
  const [customColors, setCustomColors] = useState<Record<string, string>>({});
  const [isColorblind, setIsColorblind] = useState<boolean>(false);
  
  // Divider & guidelines
  const [dividerVisibleInMerged, setDividerVisibleInMerged] = useState(true);
  const [isHexOverride, setIsHexOverride] = useState(false);
  const [overrideDividerColor, setOverrideDividerColor] = useState('#ff0000');
  const [overrideAccentColor, setOverrideAccentColor] = useState('#00ff00');
  const [overrideOutlineColor, setOverrideOutlineColor] = useState('#0000ff');

  // UI States
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [isDividerHovered, setIsDividerHovered] = useState(false);

  // Initialize and load saved project settings
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const loadLocal = (suffix: string, fallback: any) => {
      const val = localStorage.getItem(`project:${projectSlug}.preview.${suffix}`);
      if (val !== null) {
        try { return JSON.parse(val); } catch { return val; }
      }
      return fallback;
    };

    setLayoutMode(loadLocal('layoutMode', 'merged'));
    setSidebarOpen(loadLocal('sidebarOpen', true));
    setDividerVisibleInMerged(loadLocal('dividerVisibleInMerged', true));
    setIsHexOverride(loadLocal('isHexOverride', false));
    setOverrideDividerColor(loadLocal('overrideDividerColor', '#e11d48'));
    setOverrideAccentColor(loadLocal('overrideAccentColor', '#2563eb'));
    setOverrideOutlineColor(loadLocal('overrideOutlineColor', '#475569'));
    setIsColorblind(localStorage.getItem(`project:${projectSlug}.isColorblindDiff`) === 'true');

    const savedLayers = loadLocal('visibleLayers', null);
    if (savedLayers) {
      setVisibleLayers(savedLayers);
    } else if (data && data.type === 'pcb') {
      setVisibleLayers(data.layers);
    }

    setLayerOpacities(loadLocal('layerOpacities', {}));
    setCustomColors(loadLocal('customColors', {}));
  }, [projectSlug, data]);

  // Listen for storage events to synchronize colorblind preference
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleStorage = () => {
      setIsColorblind(localStorage.getItem(`project:${projectSlug}.isColorblindDiff`) === 'true');
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [projectSlug]);

  // Save changes helper
  const updateSetting = useCallback((suffix: string, val: any) => {
    localStorage.setItem(`project:${projectSlug}.preview.${suffix}`, JSON.stringify(val));
  }, [projectSlug]);

  // Sidebar transition resize trigger to redraw canvas
  useEffect(() => {
    const handleResize = () => {
      window.dispatchEvent(new Event('resize'));
    };
    // Emit resize events over the duration of the transition (180ms)
    const interval = setInterval(handleResize, 16);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      handleResize();
    }, 220);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [sidebarOpen]);

  // Theme observer
  useEffect(() => {
    const checkTheme = () => {
      const isDark = document.documentElement.classList.contains('dark') || 
                     document.body.classList.contains('dark') || 
                     window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(isDark ? 'dark' : 'light');
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Theme-aware color computation
  const isDarkTheme = theme === 'dark';
  const defaultDivider = isDarkTheme ? '#BFBFBF' : '#4B4B4B';
  const defaultOutline = isDarkTheme ? '#ffffff' : '#000000';
  const defaultAccent = '#2B6CB0';

  const activeDividerColor = isHexOverride ? overrideDividerColor : defaultDivider;
  const activeOutlineColor = isHexOverride ? overrideOutlineColor : defaultOutline;
  const activeAccentColor = isHexOverride ? overrideAccentColor : defaultAccent;

  // Ordered layers
  const orderedLayers = useMemo(() => {
    if (!data || data.type !== 'pcb') return [];
    return getOrderedLayers(data.layers);
  }, [data]);

  const activeVisibleLayers = preview ? preview.visibleLayers : visibleLayers;
  const activeLayerOpacities = preview ? preview.layerOpacities : layerOpacities;
  const activeCustomColors = preview ? preview.customColors : customColors;

  // Sync initial visible layers if empty
  useEffect(() => {
    if (data && data.type === 'pcb' && activeVisibleLayers.length === 0) {
      if (preview) {
        // usePreview initializes its own layers on open, but just in case
      } else {
        setVisibleLayers(data.layers);
      }
    }
  }, [data, activeVisibleLayers, preview]);

  // Layer handlers
  const handleToggleLayer = (layer: string) => {
    if (preview) {
      preview.toggleLayer(layer);
    } else {
      setVisibleLayers(prev => {
        const next = prev.includes(layer) ? prev.filter(l => l !== layer) : [...prev, layer];
        updateSetting('visibleLayers', next);
        return next;
      });
    }
  };

  const handleSetOpacity = (layer: string, opacity: number) => {
    if (preview) {
      preview.setLayerOpacity(layer, opacity);
    } else {
      setLayerOpacities(prev => {
        const next = { ...prev, [layer]: opacity };
        updateSetting('layerOpacities', next);
        return next;
      });
    }
  };

  const handleSetColor = (layer: string, color: string) => {
    if (preview) {
      preview.setLayerColor(layer, color);
    } else {
      setCustomColors(prev => {
        const next = { ...prev, [layer]: color };
        updateSetting('customColors', next);
        return next;
      });
    }
  };

  const handleShowAll = () => {
    if (preview) {
      preview.showAllLayers();
    } else {
      if (!data || data.type !== 'pcb') return;
      setVisibleLayers(data.layers);
      updateSetting('visibleLayers', data.layers);
    }
  };

  const handleHideAll = () => {
    if (preview) {
      preview.hideAllLayers();
    } else {
      setVisibleLayers([]);
      updateSetting('visibleLayers', []);
    }
  };

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950 text-slate-400">
        <p className="animate-pulse">Loading design workspace geometry...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative border border-slate-850 rounded-2xl">
      {/* --- PREVIEW HEADER --- */}
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0 z-20">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">Workspace Preview Mode</span>
            <span className="text-xs font-bold text-white truncate font-mono">{fileName}</span>
          </div>

          {/* Compact Layer Swatch Legend */}
          <div className="hidden lg:flex items-center gap-2 overflow-x-auto max-w-[450px] scrollbar-none px-2 py-1 bg-slate-950/40 rounded-lg border border-slate-800/60">
            {orderedLayers.slice(0, 7).map(layer => {
              const style = resolveLayerStyle(layer);
              const customColor = activeCustomColors[layer] || style.color;
              const isVisible = activeVisibleLayers.includes(layer);
              if (!isVisible) return null;
              
              return (
                <div key={layer} className="flex items-center gap-1 shrink-0 text-[10px] font-mono text-slate-300">
                  <span 
                    className="w-2.5 h-2.5 rounded-full inline-block border shrink-0" 
                    style={{ 
                      backgroundColor: customColor, 
                      borderColor: activeOutlineColor,
                      opacity: activeLayerOpacities[layer] ?? style.opacity ?? 1
                    }}
                  />
                  <span>{layer}</span>
                  <span className="text-slate-500 font-semibold">{customColor}</span>
                </div>
              );
            })}
            {orderedLayers.length > 7 && (
              <span className="text-[9px] text-slate-500 font-mono font-bold shrink-0">+{orderedLayers.length - 7} more</span>
            )}
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-2">
          {/* Merged / Mirrored Layout Toggle */}
          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => {
                setLayoutMode('merged');
                updateSetting('layoutMode', 'merged');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                layoutMode === 'merged' 
                  ? 'bg-slate-800 text-white font-bold' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Merged View (One large screen)"
            >
              <Columns className="w-3.5 h-3.5 rotate-90" />
              <span>Merged</span>
            </button>
            <button
              onClick={() => {
                setLayoutMode('mirrored');
                updateSetting('layoutMode', 'mirrored');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                layoutMode === 'mirrored' 
                  ? 'bg-slate-800 text-white font-bold' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Mirrored View (Dual sync screen)"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Mirrored</span>
            </button>
          </div>

          {/* Render Mode Toggle (Vector / Raster) */}
          {preview && (
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => preview.setRenderMode('vector')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                  preview.renderMode === 'vector' 
                    ? 'bg-slate-800 text-white font-bold' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Vector Mode (Sharp graphics)"
              >
                Vector
              </button>
              <button
                onClick={() => preview.setRenderMode('raster')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                  preview.renderMode === 'raster' 
                    ? 'bg-slate-800 text-white font-bold' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Raster Mode (Pixelated snapshot)"
              >
                Raster
              </button>
            </div>
          )}

          {/* Colorblind Toggle */}
          <button
            onClick={() => {
              const next = !isColorblind;
              setIsColorblind(next);
              localStorage.setItem(`project:${projectSlug}.isColorblindDiff`, String(next));
              window.dispatchEvent(new Event('storage'));
            }}
            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${
              isColorblind 
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20' 
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-805'
            }`}
            title="Toggle Colorblind Mode"
          >
            👁️ Colorblind
          </button>

          {/* Theme / Guideline Settings Button */}
          <div className="relative">
            <button 
              onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
              className={`p-1.5 hover:bg-slate-800 border rounded-lg transition-all text-slate-400 hover:text-white cursor-pointer ${
                showSettingsDropdown ? 'bg-slate-800 border-slate-700 text-white' : 'border-slate-800 bg-slate-950'
              }`}
              title="Preview Settings"
            >
              <Settings className="w-4 h-4" />
            </button>

            {showSettingsDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-4 z-50 text-xs space-y-4 animate-slide-in-right">
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <span className="font-bold text-slate-200">Workspace Settings</span>
                  <button onClick={() => setShowSettingsDropdown(false)} className="text-slate-500 hover:text-white" title="Close settings dropdown">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Divider guideline toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Divider guideline in Merged</span>
                  <input 
                    type="checkbox"
                    checked={dividerVisibleInMerged}
                    onChange={(e) => {
                      setDividerVisibleInMerged(e.target.checked);
                      updateSetting('dividerVisibleInMerged', e.target.checked);
                    }}
                    className="w-3.5 h-3.5 bg-slate-950 border border-slate-800 rounded"
                    title="Divider guideline in Merged"
                  />
                </div>

                {/* Explicit Color Overrides */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-300">Custom UI Colors</span>
                    <input 
                      type="checkbox"
                      checked={isHexOverride}
                      onChange={(e) => {
                        setIsHexOverride(e.target.checked);
                        updateSetting('isHexOverride', e.target.checked);
                      }}
                      className="w-3.5 h-3.5 bg-slate-950 border border-slate-800 rounded"
                      title="Custom UI Colors"
                    />
                  </div>

                  {isHexOverride && (
                    <div className="space-y-2 mt-2 font-mono text-[10px]">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Divider:</span>
                        <div className="flex items-center gap-1">
                          <input 
                            type="text" 
                            value={overrideDividerColor} 
                            onChange={(e) => {
                              setOverrideDividerColor(e.target.value);
                              updateSetting('overrideDividerColor', e.target.value);
                            }}
                            className="w-16 bg-slate-950 border border-slate-800 px-1 py-0.5 rounded text-slate-300 outline-none"
                            title="Divider color hex value"
                            placeholder="#xxxxxx"
                          />
                          <input 
                            type="color" 
                            value={overrideDividerColor} 
                            onChange={(e) => {
                              setOverrideDividerColor(e.target.value);
                              updateSetting('overrideDividerColor', e.target.value);
                            }}
                            className="w-4 h-4 rounded cursor-pointer border border-slate-700"
                            title="Divider color picker override"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Accent:</span>
                        <div className="flex items-center gap-1">
                          <input 
                            type="text" 
                            value={overrideAccentColor} 
                            onChange={(e) => {
                              setOverrideAccentColor(e.target.value);
                              updateSetting('overrideAccentColor', e.target.value);
                            }}
                            className="w-16 bg-slate-950 border border-slate-800 px-1 py-0.5 rounded text-slate-300 outline-none"
                            title="Accent color hex value"
                            placeholder="#xxxxxx"
                          />
                          <input 
                            type="color" 
                            value={overrideAccentColor} 
                            onChange={(e) => {
                              setOverrideAccentColor(e.target.value);
                              updateSetting('overrideAccentColor', e.target.value);
                            }}
                            className="w-4 h-4 rounded cursor-pointer border border-slate-700"
                            title="Accent color picker override"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Outline:</span>
                        <div className="flex items-center gap-1">
                          <input 
                            type="text" 
                            value={overrideOutlineColor} 
                            onChange={(e) => {
                              setOverrideOutlineColor(e.target.value);
                              updateSetting('overrideOutlineColor', e.target.value);
                            }}
                            className="w-16 bg-slate-950 border border-slate-800 px-1 py-0.5 rounded text-slate-300 outline-none"
                            title="Outline color hex value"
                            placeholder="#xxxxxx"
                          />
                          <input 
                            type="color" 
                            value={overrideOutlineColor} 
                            onChange={(e) => {
                              setOverrideOutlineColor(e.target.value);
                              updateSetting('overrideOutlineColor', e.target.value);
                            }}
                            className="w-4 h-4 rounded cursor-pointer border border-slate-700"
                            title="Outline color picker override"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Close preview */}
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-red-950/20 border border-slate-800 hover:border-red-500/20 rounded-lg text-slate-400 hover:text-red-400 transition-all cursor-pointer bg-slate-950"
            title="Exit Preview Mode (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* --- PREVIEW BODY --- */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* --- LEFT LAYER SIDEBAR --- */}
        <aside 
          className="bg-slate-900/90 backdrop-blur-sm flex flex-col shrink-0 overflow-hidden transition-all duration-180 ease-out z-10"
          style={{ 
            width: sidebarOpen ? '256px' : '0px',
            borderRight: sidebarOpen ? '1px solid rgba(255, 255, 255, 0.08)' : '0px'
          }}
        >
          <div className="w-64 flex flex-col h-full overflow-hidden">
            {/* Sidebar Header */}
            <div className="flex items-center justify-between p-3 border-b border-slate-800 shrink-0">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" /> Layer Controls
              </span>
              <button 
                onClick={() => {
                  setSidebarOpen(false);
                  updateSetting('sidebarOpen', false);
                }}
                className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-slate-300 cursor-pointer"
                title="Collapse Sidebar"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2 p-2 border-b border-slate-800/60 bg-slate-950/30 shrink-0 text-[10px] font-semibold">
              <button onClick={handleShowAll} className="flex-1 py-1 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded transition-all cursor-pointer">
                Show All
              </button>
              <button onClick={handleHideAll} className="flex-1 py-1 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded transition-all cursor-pointer">
                Hide All
              </button>
            </div>

            {/* Layers List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
              {orderedLayers.map(layer => {
                const style = resolveLayerStyle(layer);
                const isVisible = activeVisibleLayers.includes(layer);
                const opacity = activeLayerOpacities[layer] ?? style.opacity ?? 1;
                const activeColor = activeCustomColors[layer] || style.color;

                return (
                  <div key={layer} className="p-2 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col gap-1.5 transition-all hover:border-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Visibility Checkbox */}
                        <button
                          onClick={() => handleToggleLayer(layer)}
                          className="text-slate-400 hover:text-white shrink-0 cursor-pointer"
                          title={isVisible ? "Hide Layer" : "Show Layer"}
                        >
                          {isVisible ? (
                            <Eye className="w-3.5 h-3.5 text-cyan-400" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-slate-600" />
                          )}
                        </button>

                        {/* Custom Color Swatch with Input Color Picker */}
                        <div className="w-3.5 h-3.5 rounded-full border relative shrink-0" style={{ backgroundColor: activeColor, borderColor: activeOutlineColor }}>
                          <input 
                            type="color" 
                            value={activeColor}
                            onChange={(e) => handleSetColor(layer, e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            title="Recolor Layer"
                          />
                        </div>

                        {/* Layer Name */}
                        <span className={`text-[11px] font-mono truncate ${isVisible ? 'text-slate-200 font-semibold' : 'text-slate-500'}`}>
                          {layer}
                        </span>
                      </div>

                      {/* Hex Value label */}
                      <span className="text-[9px] font-mono text-slate-500 font-bold">{activeColor}</span>
                    </div>

                    {/* Opacity Slider */}
                    {isVisible && (
                      <div className="flex items-center gap-2 pl-5.5 pr-1">
                        <SlidersHorizontal className="w-2.5 h-2.5 text-slate-600 shrink-0" />
                        <input 
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={opacity}
                          onChange={(e) => handleSetOpacity(layer, parseFloat(e.target.value))}
                          className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                          title="Layer Opacity"
                        />
                        <span className="text-[9px] font-mono text-slate-400 min-w-[24px] text-right font-bold">
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

        {/* Sidebar Reveal Trigger Strip (when hidden) */}
        {!sidebarOpen && (
          <button
            onClick={() => {
              setSidebarOpen(true);
              updateSetting('sidebarOpen', true);
            }}
            className="absolute left-0 top-0 bottom-0 w-3 bg-slate-900 hover:bg-slate-800 border-r border-slate-800 flex items-center justify-center cursor-pointer z-10 transition-colors"
            title="Expand Layer Sidebar"
          >
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          </button>
        )}

        {/* --- MAIN CANVAS AREA --- */}
        <main className="flex-1 flex overflow-hidden relative">
          {layoutMode === 'merged' ? (
            // Merged Layout (single canvas area)
            <div className="flex-1 w-full h-full relative">
              <HardwareCanvas 
                data={data}
                visibleLayers={activeVisibleLayers}
                layerOpacities={activeLayerOpacities}
                customColors={activeCustomColors}
                previewMode={true}
                transform={preview?.transform}
                onTransformChange={preview?.setTransform}
                renderMode={preview?.renderMode}
                isColorblind={isColorblind}
                highlightedChange={preview?.highlightedChange}
              />
              
              {/* Subtle guideline divider if chosen */}
              {dividerVisibleInMerged && (
                <div 
                  onMouseEnter={() => setIsDividerHovered(true)}
                  onMouseLeave={() => setIsDividerHovered(false)}
                  className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-0.5 z-10 transition-all pointer-events-auto"
                  style={{
                    backgroundColor: isDividerHovered ? activeAccentColor : activeDividerColor,
                    opacity: isDividerHovered ? 0.6 : 0.05,
                    width: '2px',
                    borderRadius: '9999px'
                  }}
                  title="Layout Center Guideline"
                />
              )}
            </div>
          ) : (
            // Mirrored Layout (Dual split canvases synced)
            <div className="flex-1 w-full h-full flex relative overflow-hidden">
              <div className="flex-1 h-full w-1/2">
                <HardwareCanvas 
                  data={data}
                  visibleLayers={activeVisibleLayers}
                  layerOpacities={activeLayerOpacities}
                  customColors={activeCustomColors}
                  previewMode={true}
                  transform={preview?.transform}
                  onTransformChange={preview?.setTransform}
                  renderMode={preview?.renderMode}
                  isColorblind={isColorblind}
                  highlightedChange={preview?.highlightedChange}
                />
              </div>

              {/* Theme-Aware Divider */}
              <div 
                onMouseEnter={() => setIsDividerHovered(true)}
                onMouseLeave={() => setIsDividerHovered(false)}
                className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-0.5 z-10 transition-all pointer-events-auto cursor-col-resize"
                style={{
                  backgroundColor: isDividerHovered ? activeAccentColor : activeDividerColor,
                  width: '2px',
                  borderRadius: '9999px',
                  boxShadow: isDividerHovered ? `0 0 8px ${activeAccentColor}` : 'none'
                }}
                title="Dual View Splitter"
              />

              <div className="flex-1 h-full w-1/2">
                <HardwareCanvas 
                  data={data}
                  visibleLayers={activeVisibleLayers}
                  layerOpacities={activeLayerOpacities}
                  customColors={activeCustomColors}
                  previewMode={true}
                  transform={preview?.transform}
                  onTransformChange={preview?.setTransform}
                  renderMode={preview?.renderMode}
                  isColorblind={isColorblind}
                  highlightedChange={preview?.highlightedChange}
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
