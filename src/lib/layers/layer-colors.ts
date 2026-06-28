// src/lib/layers/layer-colors.ts
// Universal EDA layer color mapping based on Eagle/KiCad conventions
// Matches your layer-role-38.csv exactly

export interface LayerStyle {
  color: string;        // Hex color
  rgba: string;         // RGBA string
  opacity?: number;     // Default opacity (0-1)
  strokeDash?: number[]; // SVG/Canvas dash pattern
  fillStyle?: 'solid' | 'hatched' | 'outline';
  strokeWidth?: number;
  zIndex: number;       // Render order (lower = below)
}

// Your exact CSV data as the canonical source of truth
export const LAYER_COLOR_MAP: Record<string, LayerStyle> = {
  // === COPPER SIGNALS ===
  'Top':           { color: '#D9534F', rgba: 'rgba(217,83,79,1.0)',   zIndex: 10, strokeWidth: 0 },
  'F.Cu':          { color: '#D9534F', rgba: 'rgba(217,83,79,1.0)',   zIndex: 10, strokeWidth: 0 },
  'Bottom':        { color: '#2B8CFF', rgba: 'rgba(43,140,255,1.0)',  zIndex: 10, strokeWidth: 0 },
  'B.Cu':          { color: '#2B8CFF', rgba: 'rgba(43,140,255,1.0)',  zIndex: 10, strokeWidth: 0 },
  'Route2':        { color: '#2B8CFF', rgba: 'rgba(43,140,255,0.7)',  zIndex: 9,  strokeWidth: 0 },
  'Route15':       { color: '#2B8CFF', rgba: 'rgba(43,140,255,0.7)',  zIndex: 9,  strokeWidth: 0 },
  'In1.Cu':        { color: '#9B59B6', rgba: 'rgba(155,89,182,0.8)',  zIndex: 9,  strokeWidth: 0 },
  'In2.Cu':        { color: '#9B59B6', rgba: 'rgba(155,89,182,0.8)',  zIndex: 9,  strokeWidth: 0 },

  // === PADS ===
  'Pads':          { color: '#28A745', rgba: 'rgba(40,167,69,1.0)',   zIndex: 20, fillStyle: 'solid', strokeWidth: 0.5 },
  'MultiLayer':    { color: '#28A745', rgba: 'rgba(40,167,69,1.0)',   zIndex: 20, fillStyle: 'solid', strokeWidth: 0.5 },
  'F.Pads':        { color: '#28A745', rgba: 'rgba(40,167,69,1.0)',   zIndex: 20, fillStyle: 'solid', strokeWidth: 0.5 },
  'B.Pads':        { color: '#28A745', rgba: 'rgba(40,167,69,0.8)',   zIndex: 20, fillStyle: 'solid', strokeWidth: 0.5 },

  // === VIAS ===
  'Vias':          { color: '#F0AD4E', rgba: 'rgba(240,173,78,1.0)',   zIndex: 25, fillStyle: 'solid' },
  'Via':           { color: '#F0AD4E', rgba: 'rgba(240,173,78,1.0)',   zIndex: 25, fillStyle: 'solid' },

  // === UNROUTED ===
  'Unrouted':      { color: '#8B8B00', rgba: 'rgba(139,139,0,1.0)',   zIndex: 5,  strokeDash: [4, 4] },

  // === DIMENSION / BOARD OUTLINE ===
  'Dimension':     { color: '#4B4B4B', rgba: 'rgba(75,75,75,1.0)',    zIndex: 1,  strokeWidth: 1.5 },
  'Edge.Cuts':     { color: '#4B4B4B', rgba: 'rgba(75,75,75,1.0)',    zIndex: 1,  strokeWidth: 1.5 },
  'Outline':       { color: '#4B4B4B', rgba: 'rgba(75,75,75,1.0)',    zIndex: 1,  strokeWidth: 1.5 },

  // === PLACEMENT (Silkscreen) ===
  'tPlace':        { color: '#BFBFBF', rgba: 'rgba(191,191,191,1.0)', zIndex: 30, opacity: 0.9 },
  'F.SilkS':       { color: '#BFBFBF', rgba: 'rgba(191,191,191,1.0)', zIndex: 30, opacity: 0.9 },
  'bPlace':        { color: '#AFAFAF', rgba: 'rgba(175,175,175,1.0)', zIndex: 30, opacity: 0.9 },
  'B.SilkS':       { color: '#AFAFAF', rgba: 'rgba(175,175,175,1.0)', zIndex: 30, opacity: 0.9 },

  // === SOLDER PASTE (Cream) ===
  'tCream':        { color: '#E6B3FF', rgba: 'rgba(230,179,255,1.0)', zIndex: 15, opacity: 0.6, fillStyle: 'solid' },
  'F.Paste':       { color: '#E6B3FF', rgba: 'rgba(230,179,255,1.0)', zIndex: 15, opacity: 0.6, fillStyle: 'solid' },
  'bCream':        { color: '#C77DFF', rgba: 'rgba(199,125,255,1.0)', zIndex: 15, opacity: 0.6, fillStyle: 'solid' },
  'B.Paste':       { color: '#C77DFF', rgba: 'rgba(199,125,255,1.0)', zIndex: 15, opacity: 0.6, fillStyle: 'solid' },

  // === FINISH MASK ===
  'tFinish':       { color: '#FFB3B3', rgba: 'rgba(255,179,179,0.4)', zIndex: 12, opacity: 0.4, fillStyle: 'solid' },
  'F.Mask':        { color: '#FFB3B3', rgba: 'rgba(255,179,179,0.4)', zIndex: 12, opacity: 0.4, fillStyle: 'solid' },
  'bFinish':       { color: '#B3D9FF', rgba: 'rgba(179,217,255,0.4)', zIndex: 12, opacity: 0.4, fillStyle: 'solid' },
  'B.Mask':        { color: '#B3D9FF', rgba: 'rgba(179,217,255,0.4)', zIndex: 12, opacity: 0.4, fillStyle: 'solid' },

  // === GLUE ===
  'tGlue':         { color: '#FFD9B3', rgba: 'rgba(255,217,179,0.5)', zIndex: 14, opacity: 0.5 },
  'bGlue':         { color: '#FFE6CC', rgba: 'rgba(255,230,204,0.5)', zIndex: 14, opacity: 0.5 },

  // === TESTPOINTS ===
  'tTest':         { color: '#FF7F50', rgba: 'rgba(255,127,80,1.0)',   zIndex: 28 },
  'bTest':         { color: '#FF9966', rgba: 'rgba(255,153,102,1.0)',  zIndex: 28 },

  // === KEEPOUT ===
  'tKeepout':      { color: '#6C757D', rgba: 'rgba(108,117,125,0.3)',  zIndex: 3,  fillStyle: 'hatched', opacity: 0.3 },
  'bKeepout':      { color: '#2E6DA4', rgba: 'rgba(46,109,164,0.3)',  zIndex: 3,  fillStyle: 'hatched', opacity: 0.3 },

  // === RESTRICT ===
  'tRestrict':     { color: '#8B0000', rgba: 'rgba(139,0,0,0.5)',      zIndex: 2,  fillStyle: 'hatched', opacity: 0.5 },
  'bRestrict':     { color: '#0056B3', rgba: 'rgba(0,86,179,0.5)',      zIndex: 2,  fillStyle: 'hatched', opacity: 0.5 },
  'vRestrict':     { color: '#2ECC71', rgba: 'rgba(46,204,113,0.5)',   zIndex: 2,  fillStyle: 'outline', opacity: 0.5, strokeWidth: 1 },

  // === DRILLS & HOLES ===
  'Drills':        { color: '#BFBFBF', rgba: 'rgba(191,191,191,1.0)',  zIndex: 26 },
  'Holes':         { color: '#D3D3D3', rgba: 'rgba(211,211,211,1.0)',  zIndex: 26 },
  'NPTH':          { color: '#D3D3D3', rgba: 'rgba(211,211,211,1.0)',  zIndex: 26 },

  // === MILLING ===
  'Milling':       { color: '#9AD3DE', rgba: 'rgba(154,211,222,1.0)',  zIndex: 4,  strokeWidth: 1 },

  // === MEASURES ===
  'Measures':      { color: '#6C757D', rgba: 'rgba(108,117,125,1.0)',  zIndex: 35 },

  // === DOCUMENTATION ===
  'Document':      { color: '#2B6CB0', rgba: 'rgba(43,108,176,0.6)',   zIndex: 32, opacity: 0.6 },
  'tDocu':         { color: '#B0BEC5', rgba: 'rgba(176,190,197,1.0)',  zIndex: 32 },
  'F.Fab':         { color: '#B0BEC5', rgba: 'rgba(176,190,197,1.0)',  zIndex: 32 },
  'bDocu':         { color: '#90A4AE', rgba: 'rgba(144,164,174,1.0)',  zIndex: 32 },
  'B.Fab':         { color: '#90A4AE', rgba: 'rgba(144,164,174,1.0)',  zIndex: 32 },

  // === REFERENCE LAYERS ===
  'ReferenceLC':   { color: '#9B59B6', rgba: 'rgba(155,89,182,1.0)',  zIndex: 33 },
  'ReferenceLS':   { color: '#E74C3C', rgba: 'rgba(231,76,60,1.0)',   zIndex: 33 },

  // === ORIGINS ===
  'tOrigins':      { color: '#1ABC9C', rgba: 'rgba(26,188,156,1.0)',   zIndex: 34 },
  'bOrigins':      { color: '#16A085', rgba: 'rgba(22,160,133,1.0)',   zIndex: 34 },

  // === NAMES (Reference Designators) ===
  'tNames':        { color: '#34495E', rgba: 'rgba(52,73,94,1.0)',     zIndex: 31 },
  'F.Ref':         { color: '#34495E', rgba: 'rgba(52,73,94,1.0)',     zIndex: 31 },
  'bNames':        { color: '#2C3E50', rgba: 'rgba(44,62,80,1.0)',     zIndex: 31 },
  'B.Ref':         { color: '#2C3E50', rgba: 'rgba(44,62,80,1.0)',     zIndex: 31 },

  // === VALUES ===
  'tValues':       { color: '#7F8C8D', rgba: 'rgba(127,140,141,1.0)',  zIndex: 31 },
  'F.Val':         { color: '#7F8C8D', rgba: 'rgba(127,140,141,1.0)',  zIndex: 31 },
  'bValues':       { color: '#95A5A6', rgba: 'rgba(149,165,166,1.0)',  zIndex: 31 },
  'B.Val':         { color: '#95A5A6', rgba: 'rgba(149,165,166,1.0)',  zIndex: 31 },

  // === SOLDER MASK STOP ===
  'tStop':         { color: '#F39C12', rgba: 'rgba(243,156,18,1.0)',   zIndex: 13, fillStyle: 'solid', strokeWidth: 0.5 },
  'F.Stop':        { color: '#F39C12', rgba: 'rgba(243,156,18,1.0)',   zIndex: 13, fillStyle: 'solid', strokeWidth: 0.5 },
  'bStop':         { color: '#D35400', rgba: 'rgba(211,84,0,1.0)',     zIndex: 13, fillStyle: 'solid', strokeWidth: 0.5 },
  'B.Stop':        { color: '#D35400', rgba: 'rgba(211,84,0,1.0)',     zIndex: 13, fillStyle: 'solid', strokeWidth: 0.5 },
};

// Normalization helpers for KiCad/Eagle layer name variations
const LAYER_ALIASES: Record<string, string> = {
  // KiCad canonical → our key
  'f.cu': 'F.Cu',
  'b.cu': 'B.Cu',
  'f.silks': 'F.SilkS',
  'b.silks': 'B.SilkS',
  'f.mask': 'F.Mask',
  'b.mask': 'B.Mask',
  'f.paste': 'F.Paste',
  'b.paste': 'B.Paste',
  'f.fab': 'F.Fab',
  'b.fab': 'B.Fab',
  'edge.cuts': 'Edge.Cuts',
  'f.ref': 'F.Ref',
  'b.ref': 'B.Ref',
  'f.val': 'F.Val',
  'b.val': 'B.Val',
  'f.stop': 'F.Stop',
  'b.stop': 'B.Stop',
  
  // Eagle numeric → our key
  '1': 'Top',      // Eagle top copper
  '16': 'Bottom',  // Eagle bottom copper
  '21': 'tPlace',  // Eagle tPlace
  '22': 'bPlace',  // Eagle bPlace
  '25': 'tNames',  // Eagle tNames
  '26': 'bNames',  // Eagle bNames
  '27': 'tValues', // Eagle tValues
  '28': 'bValues', // Eagle bValues
  '29': 'tStop',   // Eagle tStop
  '30': 'bStop',   // Eagle bStop
  '31': 'tCream',  // Eagle tCream
  '32': 'bCream',  // Eagle bCream
  '33': 'tFinish', // Eagle tFinish
  '34': 'bFinish', // Eagle bFinish
  '35': 'tGlue',   // Eagle tGlue
  '36': 'bGlue',   // Eagle bGlue
  '37': 'tTest',   // Eagle tTest
  '38': 'bTest',   // Eagle bTest
  '39': 'tKeepout',// Eagle tKeepout
  '40': 'bKeepout',// Eagle bKeepout
  '41': 'tRestrict',// Eagle tRestrict
  '42': 'bRestrict',// Eagle bRestrict
  '43': 'vRestrict',// Eagle vRestrict
  '44': 'Drills',  // Eagle Drills
  '45': 'Holes',   // Eagle Holes
  '46': 'Milling', // Eagle Milling
  '47': 'Measures',// Eagle Measures
  '48': 'Document',// Eagle Document
  '49': 'ReferenceLC', // Eagle ReferenceLC
  '50': 'ReferenceLS', // Eagle ReferenceLS
  '51': 'tDocu',   // Eagle tDocu
  '52': 'bDocu',   // Eagle bDocu
  '23': 'tOrigins',// Eagle tOrigins
  '24': 'bOrigins',// Eagle bOrigins
};

/**
 * Resolve any layer name (KiCad, Eagle, numeric, or alias) to its canonical style
 */
export function resolveLayerStyle(layerName: string): LayerStyle {
  if (!layerName) return { color: '#94a3b8', rgba: 'rgba(148,163,184,1.0)', zIndex: 50 };
  
  const normalized = layerName.trim();
  
  // Direct hit
  if (LAYER_COLOR_MAP[normalized]) {
    return LAYER_COLOR_MAP[normalized];
  }
  
  // Case-insensitive direct hit
  const lower = normalized.toLowerCase();
  for (const [key, style] of Object.entries(LAYER_COLOR_MAP)) {
    if (key.toLowerCase() === lower) return style;
  }
  
  // Alias resolution
  const aliased = LAYER_ALIASES[lower];
  if (aliased && LAYER_COLOR_MAP[aliased]) {
    return LAYER_COLOR_MAP[aliased];
  }
  
  // Eagle "Layer-N" pattern (e.g., "Layer-1", "Layer-21")
  const layerNumMatch = normalized.match(/^layer[-\s]?(\d+)$/i);
  if (layerNumMatch) {
    const num = layerNumMatch[1];
    const mapped = LAYER_ALIASES[num];
    if (mapped && LAYER_COLOR_MAP[mapped]) {
      return LAYER_COLOR_MAP[mapped];
    }
  }
  
  // Generic fallback: derive from name heuristics
  if (lower.includes('cu') || lower.includes('copper')) {
    return lower.startsWith('b') || lower.includes('bottom') 
      ? LAYER_COLOR_MAP['B.Cu'] 
      : LAYER_COLOR_MAP['F.Cu'];
  }
  if (lower.includes('silk')) return LAYER_COLOR_MAP['F.SilkS'];
  if (lower.includes('mask')) return LAYER_COLOR_MAP['F.Mask'];
  if (lower.includes('paste')) return LAYER_COLOR_MAP['F.Paste'];
  if (lower.includes('edge') || lower.includes('cut')) return LAYER_COLOR_MAP['Edge.Cuts'];
  
  // Ultimate fallback
  return { color: '#94a3b8', rgba: 'rgba(148,163,184,1.0)', zIndex: 50 };
}

/**
 * Get just the color string for quick use
 */
export function getLayerColor(layerName: string): string {
  return resolveLayerStyle(layerName).color;
}

/**
 * Get the RGBA string for SVG/canvas with opacity
 */
export function getLayerRGBA(layerName: string): string {
  const style = resolveLayerStyle(layerName);
  return style.rgba;
}

/**
 * Get render-ordered list of layers from parsed data
 */
export function getOrderedLayers(layers: string[]): string[] {
  return [...layers].sort((a, b) => {
    const za = resolveLayerStyle(a).zIndex;
    const zb = resolveLayerStyle(b).zIndex;
    return za - zb;
  });
}
