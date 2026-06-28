// src/hooks/usePreview.ts
// State management for Single-File Preview Mode

import { useState, useCallback, useEffect } from 'react';
import { PCBData } from '../lib/parsers/kicad/pcbParser';
import { SchematicData } from '../lib/parsers/kicad/schParser';
import { getOrderedLayers, resolveLayerStyle } from '../lib/layers/layer-colors';

export interface PreviewChange {
  id: string;
  type: 'added' | 'removed' | 'modified';
  bounds: { xMin: number; yMin: number; xMax: number; yMax: number };
  layerIds: string[];
  nets?: string[];
}

export interface PreviewState {
  isOpen: boolean;
  fileId: string | null;
  fileName: string | null;
  data: PCBData | SchematicData | null;
  visibleLayers: string[];
  layerOpacities: Record<string, number>;
  highlightedChange: PreviewChange | null;
  isLoading: boolean;
  error: string | null;
}

const DEFAULT_OPACITIES: Record<string, number> = {
  copper: 0.9,
  pad: 0.9,
  silkscreen: 0.45,
  paste: 0.45,
  glue: 0.45,
  keepout: 0.35,
  restrict: 0.35,
  mask: 0.4,
};

function getDefaultOpacity(layerName: string): number {
  const l = layerName.toLowerCase();
  if (l.includes('cu') || l.includes('copper') || l.includes('top') || l.includes('bottom')) return DEFAULT_OPACITIES.copper;
  if (l.includes('pad')) return DEFAULT_OPACITIES.pad;
  if (l.includes('silk') || l.includes('place') || l.includes('names')) return DEFAULT_OPACITIES.silkscreen;
  if (l.includes('cream') || l.includes('paste')) return DEFAULT_OPACITIES.paste;
  if (l.includes('glue')) return DEFAULT_OPACITIES.glue;
  if (l.includes('keepout')) return DEFAULT_OPACITIES.keepout;
  if (l.includes('restrict')) return DEFAULT_OPACITIES.restrict;
  if (l.includes('mask') || l.includes('finish')) return DEFAULT_OPACITIES.mask;
  return 1.0;
}

export function usePreview() {
  const [state, setState] = useState<PreviewState>({
    isOpen: false,
    fileId: null,
    fileName: null,
    data: null,
    visibleLayers: [],
    layerOpacities: {},
    highlightedChange: null,
    isLoading: false,
    error: null,
  });

  const openPreview = useCallback(async (fileId: string, fileName: string, fileContent?: string) => {
    setState(prev => ({ ...prev, isOpen: true, fileId, fileName, isLoading: true, error: null }));

    try {
      let data: PCBData | SchematicData | null = null;

      if (fileContent) {
        const { parseHardwareFile } = await import('../lib/parsers/parser');
        data = parseHardwareFile(fileName, fileContent);
      } else {
        const res = await fetch(`/api/files/${fileId}/preview`);
        if (!res.ok) throw new Error(`Failed to load preview: ${res.status}`);
        const json = await res.json();
        data = json.data;
      }

      if (!data) throw new Error('No data returned');

      const allLayers = data.type === 'pcb' ? data.layers : [];
      const ordered = getOrderedLayers(allLayers);
      const opacities: Record<string, number> = {};
      ordered.forEach(l => { opacities[l] = resolveLayerStyle(l).opacity ?? getDefaultOpacity(l); });

      setState(prev => ({
        ...prev,
        data,
        visibleLayers: ordered,
        layerOpacities: opacities,
        isLoading: false,
      }));
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message, isLoading: false }));
    }
  }, []);

  const closePreview = useCallback(() => {
    setState({
      isOpen: false,
      fileId: null,
      fileName: null,
      data: null,
      visibleLayers: [],
      layerOpacities: {},
      highlightedChange: null,
      isLoading: false,
      error: null,
    });
  }, []);

  const toggleLayer = useCallback((layerId: string) => {
    setState(prev => ({
      ...prev,
      visibleLayers: prev.visibleLayers.includes(layerId)
        ? prev.visibleLayers.filter(l => l !== layerId)
        : [...prev.visibleLayers, layerId],
    }));
  }, []);

  const setLayerOpacity = useCallback((layerId: string, opacity: number) => {
    setState(prev => ({
      ...prev,
      layerOpacities: { ...prev.layerOpacities, [layerId]: Math.max(0, Math.min(1, opacity)) },
    }));
  }, []);

  const showAllLayers = useCallback(() => {
    setState(prev => ({
      ...prev,
      visibleLayers: prev.data?.type === 'pcb' ? prev.data.layers : [],
    }));
  }, []);

  const hideAllLayers = useCallback(() => {
    setState(prev => ({ ...prev, visibleLayers: [] }));
  }, []);

  const highlightChange = useCallback((change: PreviewChange | null) => {
    setState(prev => ({ ...prev, highlightedChange: change }));
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.isOpen) {
        closePreview();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [state.isOpen, closePreview]);

  return {
    ...state,
    openPreview,
    closePreview,
    toggleLayer,
    setLayerOpacity,
    showAllLayers,
    hideAllLayers,
    highlightChange,
  };
}
