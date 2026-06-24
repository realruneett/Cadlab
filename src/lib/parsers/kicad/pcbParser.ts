import { SExpr, tokenize, parseSExpr, findNode, findNodes } from './s-expression';

export interface Point {
  x: number;
  y: number;
}

export interface Pad {
  name: string;
  x: number;
  y: number;
  shape: string; // "circle", "rect", "oval", etc.
  width: number;
  height: number;
  drill: number;
  layer: string;
}

export interface Component {
  id: string;
  designator: string; // e.g. R1
  value: string;      // e.g. 10k
  footprint: string;  // package name
  x: number;
  y: number;
  rotation: number;   // in degrees
  layer: string;
  pads: Pad[];
}

export interface Trace {
  net: string;
  layer: string;
  width: number;
  points: Point[];
}

export interface Via {
  net: string;
  x: number;
  y: number;
  drill: number;
  diameter: number;
  layers: string[];
}

export interface PCBData {
  type: 'pcb';
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  layers: string[];
  components: Component[];
  traces: Trace[];
  vias: Via[];
}

/**
 * Helper to parse float or return 0
 */
function pf(val: any): number {
  const parsed = parseFloat(val);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Rotates relative coordinates DX, DY by angle degrees around (0,0)
 */
function rotatePoint(dx: number, dy: number, angleDegrees: number): Point {
  const theta = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos
  };
}

export function parseKiCadPCB(fileContent: string): PCBData {
  const tokens = tokenize(fileContent);
  const tree = parseSExpr(tokens);

  if (tree.length === 0 || !Array.isArray(tree[0]) || tree[0][0] !== 'kicad_pcb') {
    throw new Error("Invalid KiCad PCB file");
  }

  const root = tree[0] as SExpr[];

  const components: Component[] = [];
  const traces: Trace[] = [];
  const vias: Via[] = [];
  const layersSet = new Set<string>();

  // Helper to extract nested node contents
  function getAtCoordinates(node: SExpr[]): { x: number; y: number; rotation: number } {
    const atNode = findNode(node, 'at');
    if (atNode && atNode.length >= 3) {
      return {
        x: pf(atNode[1]),
        y: pf(atNode[2]),
        rotation: atNode.length >= 4 ? pf(atNode[3]) : 0
      };
    }
    return { x: 0, y: 0, rotation: 0 };
  }

  // Iterate over root nodes
  for (const node of root) {
    if (!Array.isArray(node)) continue;

    const type = node[0];

    // Footprints / Modules
    if (type === 'footprint' || type === 'module') {
      const footprintName = String(node[1] || 'Unknown');
      const { x: fx, y: fy, rotation: fr } = getAtCoordinates(node);
      const layerNode = findNode(node, 'layer');
      const fpLayer = layerNode && layerNode.length >= 2 ? String(layerNode[1]) : 'F.Cu';
      layersSet.add(fpLayer);

      // Find designator and value from fp_text subnodes
      let designator = "";
      let value = "";

      const fpTexts = findNodes(node, 'fp_text');
      for (const textNode of fpTexts) {
        if (textNode.length >= 3) {
          const textType = textNode[1];
          const textVal = String(textNode[2]);
          if (textType === 'reference') {
            designator = textVal;
          } else if (textType === 'value') {
            value = textVal;
          }
        }
      }

      // If no reference was found, generate a fallback
      if (!designator) {
        designator = `U_${Math.random().toString(36).substr(2, 4)}`;
      }

      // Extract pads
      const pads: Pad[] = [];
      const padNodes = findNodes(node, 'pad');
      for (const padNode of padNodes) {
        if (padNode.length >= 3) {
          const padName = String(padNode[1]);
          const padType = String(padNode[2]); // smd, thru_hole, np_thru_hole
          const padShape = String(padNode[3]); // circle, rect, oval, roundrect

          // Pad relative position
          const padAt = findNode(padNode, 'at');
          const pdx = padAt && padAt.length >= 2 ? pf(padAt[1]) : 0;
          const pdy = padAt && padAt.length >= 3 ? pf(padAt[2]) : 0;
          const padRot = padAt && padAt.length >= 4 ? pf(padAt[3]) : 0;

          // Pad size
          const padSize = findNode(padNode, 'size');
          const psw = padSize && padSize.length >= 2 ? pf(padSize[1]) : 1.0;
          const psh = padSize && padSize.length >= 3 ? pf(padSize[2]) : 1.0;

          // Pad drill
          const padDrill = findNode(padNode, 'drill');
          const pdrill = padDrill && padDrill.length >= 2 ? pf(padDrill[1]) : 0;

          // Pad layer
          const padLayersNode = findNode(padNode, 'layers');
          const padLayer = padLayersNode && padLayersNode.length >= 2 ? String(padLayersNode[1]) : 'F.Cu';
          layersSet.add(padLayer);

          // Apply rotation math relative to footprint anchor
          const rotated = rotatePoint(pdx, pdy, fr);
          const px = fx + rotated.x;
          const py = fy + rotated.y;

          pads.push({
            name: padName,
            x: px,
            y: py,
            shape: padShape,
            width: psw,
            height: psh,
            drill: pdrill,
            layer: padLayer
          });
        }
      }

      components.push({
        id: designator,
        designator,
        value,
        footprint: footprintName,
        x: fx,
        y: fy,
        rotation: fr,
        layer: fpLayer,
        pads
      });
    }

    // Segment (PCB Traces)
    else if (type === 'segment') {
      const startNode = findNode(node, 'start');
      const endNode = findNode(node, 'end');
      const widthNode = findNode(node, 'width');
      const layerNode = findNode(node, 'layer');
      const netNode = findNode(node, 'net');

      const x1 = startNode && startNode.length >= 3 ? pf(startNode[1]) : 0;
      const y1 = startNode && startNode.length >= 3 ? pf(startNode[2]) : 0;
      const x2 = endNode && endNode.length >= 3 ? pf(endNode[1]) : 0;
      const y2 = endNode && endNode.length >= 3 ? pf(endNode[2]) : 0;
      const width = widthNode && widthNode.length >= 2 ? pf(widthNode[1]) : 0.2;
      const layer = layerNode && layerNode.length >= 2 ? String(layerNode[1]) : 'B.Cu';
      const netIndex = netNode && netNode.length >= 2 ? String(netNode[1]) : '0';

      layersSet.add(layer);

      traces.push({
        net: `Net-${netIndex}`,
        layer,
        width,
        points: [{ x: x1, y: y1 }, { x: x2, y: y2 }]
      });
    }

    // Via
    else if (type === 'via') {
      const atNode = findNode(node, 'at');
      const sizeNode = findNode(node, 'size');
      const drillNode = findNode(node, 'drill');
      const layersNode = findNode(node, 'layers');
      const netNode = findNode(node, 'net');

      const vx = atNode && atNode.length >= 3 ? pf(atNode[1]) : 0;
      const vy = atNode && atNode.length >= 3 ? pf(atNode[2]) : 0;
      const diameter = sizeNode && sizeNode.length >= 2 ? pf(sizeNode[1]) : 0.6;
      const drill = drillNode && drillNode.length >= 2 ? pf(drillNode[1]) : 0.3;
      const vLayers = layersNode ? layersNode.slice(1).map(String) : ['F.Cu', 'B.Cu'];
      const netIndex = netNode && netNode.length >= 2 ? String(netNode[1]) : '0';

      vLayers.forEach(l => layersSet.add(l));

      vias.push({
        net: `Net-${netIndex}`,
        x: vx,
        y: vy,
        drill,
        diameter,
        layers: vLayers
      });
    }
  }

  // Calculate bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  components.forEach(c => {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);

    c.pads.forEach(p => {
      minX = Math.min(minX, p.x - p.width / 2);
      minY = Math.min(minY, p.y - p.height / 2);
      maxX = Math.max(maxX, p.x + p.width / 2);
      maxY = Math.max(maxY, p.y + p.height / 2);
    });
  });

  traces.forEach(t => {
    t.points.forEach(pt => {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    });
  });

  vias.forEach(v => {
    minX = Math.min(minX, v.x - v.diameter / 2);
    minY = Math.min(minY, v.y - v.diameter / 2);
    maxX = Math.max(maxX, v.x + v.diameter / 2);
    maxY = Math.max(maxY, v.y + v.diameter / 2);
  });

  // Fallback if empty bounds
  if (minX === Infinity) {
    minX = 0; minY = 0; maxX = 100; maxY = 100;
  } else {
    // Add margins
    minX -= 10;
    minY -= 10;
    maxX += 10;
    maxY += 10;
  }

  return {
    type: 'pcb',
    bounds: { minX, minY, maxX, maxY },
    layers: Array.from(layersSet),
    components,
    traces,
    vias
  };
}
