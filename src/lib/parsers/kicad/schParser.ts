import { SExpr, tokenize, parseSExpr, findNode, findNodes } from './s-expression';
import { Point } from './pcbParser';

export interface SchematicComponentPin {
  name: string;
  num: string;
  x: number;
  y: number;
}

export interface SchematicComponent {
  id: string;
  designator: string; // e.g. R1
  value: string;      // e.g. 10k
  symbol: string;     // symbol identifier, e.g. "Device:R"
  x: number;
  y: number;
  rotation: number;
  pins: SchematicComponentPin[];
}

export interface SchematicNetSegment {
  points: Point[];
}

export interface SchematicNet {
  name: string;
  segments: SchematicNetSegment[];
}

export interface SchematicData {
  type: 'schematic';
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  components: SchematicComponent[];
  nets: SchematicNet[];
}

function pf(val: any): number {
  const parsed = parseFloat(val);
  return isNaN(parsed) ? 0 : parsed;
}

export function parseKiCadSchematic(fileContent: string): SchematicData {
  const tokens = tokenize(fileContent);
  const tree = parseSExpr(tokens);

  if (tree.length === 0 || !Array.isArray(tree[0]) || tree[0][0] !== 'kicad_sch') {
    throw new Error("Invalid KiCad Schematic file");
  }

  const root = tree[0] as SExpr[];

  const components: SchematicComponent[] = [];
  const netsMap = new Map<string, SchematicNetSegment[]>();

  // Helper to extract position & rotation
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

  // Iterate over nodes
  for (const node of root) {
    if (!Array.isArray(node)) continue;

    const type = node[0];

    // Symbols (Components)
    if (type === 'symbol') {
      const libIdNode = findNode(node, 'lib_id');
      const symbolLibId = libIdNode && libIdNode.length >= 2 ? String(libIdNode[1]) : "Unknown";
      const { x, y, rotation } = getAtCoordinates(node);

      let designator = "";
      let value = "";

      // Properties like "Reference" and "Value"
      const properties = findNodes(node, 'property');
      for (const propNode of properties) {
        if (propNode.length >= 3) {
          const name = String(propNode[1]);
          const val = String(propNode[2]);
          if (name === 'Reference') {
            designator = val;
          } else if (name === 'Value') {
            value = val;
          }
        }
      }

      if (!designator) {
        designator = `U_${Math.random().toString(36).substr(2, 4)}`;
      }

      // In KiCad, pin coordinates on symbols are defined inside their library definition, 
      // but schematic symbol instances can also list dynamic properties or pin details.
      // Let's extract symbol pins if they exist, or mock them based on symbol type (e.g. R has 2 pins, U has multiple).
      const pins: SchematicComponentPin[] = [];
      const pinNodes = findNodes(node, 'pin');
      for (const pinNode of pinNodes) {
        if (pinNode.length >= 3) {
          const pinNum = String(pinNode[1]);
          const pinName = pinNode.length >= 4 ? String(pinNode[2]) : pinNum;
          // Pin position
          const pinAt = findNode(pinNode, 'at');
          const px = pinAt && pinAt.length >= 2 ? pf(pinAt[1]) : 0;
          const py = pinAt && pinAt.length >= 3 ? pf(pinAt[2]) : 0;
          pins.push({
            name: pinName,
            num: pinNum,
            x: x + px,
            y: y + py
          });
        }
      }

      // If pins are empty, create default standard ones for basic components to render nicely
      if (pins.length === 0) {
        if (symbolLibId.toLowerCase().includes('resistor') || symbolLibId.toLowerCase().includes(':r')) {
          pins.push({ name: '1', num: '1', x: x - 5.08, y: y });
          pins.push({ name: '2', num: '2', x: x + 5.08, y: y });
        } else if (symbolLibId.toLowerCase().includes('capacitor') || symbolLibId.toLowerCase().includes(':c')) {
          pins.push({ name: '1', num: '1', x: x - 2.54, y: y });
          pins.push({ name: '2', num: '2', x: x + 2.54, y: y });
        } else if (symbolLibId.toLowerCase().includes('diode') || symbolLibId.toLowerCase().includes(':d')) {
          pins.push({ name: 'A', num: '1', x: x - 2.54, y: y });
          pins.push({ name: 'K', num: '2', x: x + 2.54, y: y });
        } else {
          // Standard IC block pins placeholder
          pins.push({ name: 'VCC', num: '8', x: x - 7.62, y: y + 5.08 });
          pins.push({ name: 'GND', num: '4', x: x - 7.62, y: y - 5.08 });
          pins.push({ name: 'IN', num: '1', x: x - 7.62, y: y });
          pins.push({ name: 'OUT', num: '2', x: x + 7.62, y: y });
        }
      }

      components.push({
        id: designator,
        designator,
        value,
        symbol: symbolLibId,
        x,
        y,
        rotation,
        pins
      });
    }

    // Wires (Nets)
    else if (type === 'wire') {
      const ptsNode = findNode(node, 'pts');
      if (ptsNode) {
        const xyNodes = findNodes(ptsNode, 'xy');
        const points: Point[] = [];
        for (const xy of xyNodes) {
          if (xy.length >= 3) {
            points.push({ x: pf(xy[1]), y: pf(xy[2]) });
          }
        }
        if (points.length >= 2) {
          // Determine net name. In schematics, wires connect pins geometrically.
          // For simplicty, we will group overlapping wires into named nets, or treat them as a default Net name.
          const defaultNetName = "NET";
          if (!netsMap.has(defaultNetName)) {
            netsMap.set(defaultNetName, []);
          }
          netsMap.get(defaultNetName)!.push({ points });
        }
      }
    }
  }

  // Calculate bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  components.forEach(c => {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
    c.pins.forEach(p => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
  });

  netsMap.forEach((segments) => {
    segments.forEach(seg => {
      seg.points.forEach(pt => {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      });
    });
  });

  if (minX === Infinity) {
    minX = 0; minY = 0; maxX = 100; maxY = 100;
  } else {
    minX -= 20;
    minY -= 20;
    maxX += 20;
    maxY += 20;
  }

  const nets: SchematicNet[] = Array.from(netsMap.entries()).map(([name, segments]) => ({
    name,
    segments
  }));

  return {
    type: 'schematic',
    bounds: { minX, minY, maxX, maxY },
    components,
    nets
  };
}
