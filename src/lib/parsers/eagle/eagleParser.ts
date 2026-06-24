import { XMLParser } from 'fast-xml-parser';
import { Point, Pad, Component, Trace, Via, PCBData } from '../kicad/pcbParser';
import { SchematicComponent, SchematicComponentPin, SchematicNet, SchematicNetSegment, SchematicData } from '../kicad/schParser';

function pf(val: any): number {
  if (val === undefined || val === null) return 0;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? 0 : parsed;
}

function parseRotation(rotStr: string | undefined): number {
  if (!rotStr) return 0;
  // Match "R90", "SR270", "MR180" etc.
  const match = rotStr.match(/R(-?\d+(\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

function rotatePoint(dx: number, dy: number, angleDegrees: number): Point {
  const theta = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos
  };
}

/**
 * Ensures a value is always returned as an array, even if the XML parser parses it as a single object.
 */
function ensureArray<T>(val: any): T[] {
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) return val;
  return [val];
}

export function parseEagleFile(fileContent: string): PCBData | SchematicData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
  });
  
  const obj = parser.parse(fileContent);
  if (!obj.eagle || !obj.eagle.drawing) {
    throw new Error("Invalid Eagle XML file");
  }

  const drawing = obj.eagle.drawing;

  if (drawing.board) {
    return parseEagleBoard(drawing.board);
  } else if (drawing.schematic) {
    return parseEagleSchematic(drawing.schematic);
  } else {
    throw new Error("Unknown Eagle drawing type");
  }
}

function parseEagleBoard(board: any): PCBData {
  const components: Component[] = [];
  const traces: Trace[] = [];
  const vias: Via[] = [];
  const layersSet = new Set<string>(['Top', 'Bottom', 'Route2', 'Route15', 'tPlace', 'bPlace', 'tNames', 'bNames']);

  // 1. Index Packages in Libraries
  const packageIndex = new Map<string, { smds: any[]; pads: any[] }>();
  
  const libraries = ensureArray<any>(board.libraries?.library);
  for (const lib of libraries) {
    const packages = ensureArray<any>(lib.packages?.package);
    for (const pkg of packages) {
      const pkgName = pkg["@_name"];
      const smds = ensureArray<any>(pkg.smd);
      const pads = ensureArray<any>(pkg.pad);
      packageIndex.set(pkgName, { smds, pads });
    }
  }

  // 2. Parse Elements (Components)
  const elements = ensureArray<any>(board.elements?.element);
  for (const el of elements) {
    const name = el["@_name"];
    const pkgName = el["@_package"];
    const value = el["@_value"] || "";
    const ex = pf(el["@_x"]);
    const ey = pf(el["@_y"]);
    const erot = parseRotation(el["@_rotated"]);
    const elayer = erot < 180 ? 'Top' : 'Bottom'; // Simple heuristic or attribute

    const pads: Pad[] = [];

    // Look up library footprint geometries
    const pkgGeo = packageIndex.get(pkgName);
    if (pkgGeo) {
      // SMDs (Surface Mount)
      for (const smd of pkgGeo.smds) {
        const sx = pf(smd["@_x"]);
        const sy = pf(smd["@_y"]);
        const sdx = pf(smd["@_dx"]);
        const sdy = pf(smd["@_dy"]);
        const sName = smd["@_name"];
        const sLayer = smd["@_layer"] === "1" ? "Top" : "Bottom";

        const rotated = rotatePoint(sx, sy, erot);
        pads.push({
          name: sName,
          x: ex + rotated.x,
          y: ey + rotated.y,
          shape: 'rect',
          width: sdx,
          height: sdy,
          drill: 0,
          layer: sLayer
        });
      }

      // Through-hole pads
      for (const pad of pkgGeo.pads) {
        const px = pf(pad["@_x"]);
        const py = pf(pad["@_y"]);
        const pdrill = pf(pad["@_drill"]);
        const pdiameter = pf(pad["@_diameter"]) || pdrill * 1.5;
        const pName = pad["@_name"];
        const pShape = pad["@_shape"] || 'circle';

        const rotated = rotatePoint(px, py, erot);
        pads.push({
          name: pName,
          x: ex + rotated.x,
          y: ey + rotated.y,
          shape: pShape === 'square' ? 'rect' : 'circle',
          width: pdiameter,
          height: pdiameter,
          drill: pdrill,
          layer: 'MultiLayer'
        });
      }
    }

    components.push({
      id: name,
      designator: name,
      value,
      footprint: pkgName,
      x: ex,
      y: ey,
      rotation: erot,
      layer: elayer,
      pads
    });
  }

  // 3. Parse Signals (Traces & Vias)
  const signals = ensureArray<any>(board.signals?.signal);
  for (const sig of signals) {
    const netName = sig["@_name"];
    
    // Traces (Wires in Eagle)
    const wires = ensureArray<any>(sig.wire);
    for (const wire of wires) {
      const x1 = pf(wire["@_x1"]);
      const y1 = pf(wire["@_y1"]);
      const x2 = pf(wire["@_x2"]);
      const y2 = pf(wire["@_y2"]);
      const wWidth = pf(wire["@_width"]);
      const wLayer = wire["@_layer"] === "1" ? "Top" : (wire["@_layer"] === "16" ? "Bottom" : `Layer-${wire["@_layer"]}`);

      layersSet.add(wLayer);

      traces.push({
        net: netName,
        layer: wLayer,
        width: wWidth,
        points: [{ x: x1, y: y1 }, { x: x2, y: y2 }]
      });
    }

    // Vias
    const sVias = ensureArray<any>(sig.via);
    for (const via of sVias) {
      const vx = pf(via["@_x"]);
      const vy = pf(via["@_y"]);
      const drill = pf(via["@_drill"]);
      const diameter = pf(via["@_diameter"]) || drill * 1.5;
      const extent = via["@_extent"] || "1-16"; // e.g. 1-16 (Top to Bottom)
      const vLayers = extent.split('-').map((l: string) => l === "1" ? "Top" : (l === "16" ? "Bottom" : `Layer-${l}`));

      vias.push({
        net: netName,
        x: vx,
        y: vy,
        drill,
        diameter,
        layers: vLayers
      });
    }
  }

  // Bounding box calculation
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

  if (minX === Infinity) {
    minX = 0; minY = 0; maxX = 100; maxY = 100;
  } else {
    minX -= 10; minY -= 10; maxX += 10; maxY += 10;
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

function parseEagleSchematic(schematic: any): SchematicData {
  const components: SchematicComponent[] = [];
  const nets: SchematicNet[] = [];

  // Parse parts list (to cross-reference symbol value and deviceset)
  const partsMap = new Map<string, { deviceset: string; value: string }>();
  const parts = ensureArray<any>(schematic.parts?.part);
  for (const part of parts) {
    const name = part["@_name"];
    partsMap.set(name, {
      deviceset: part["@_deviceset"] || "",
      value: part["@_value"] || ""
    });
  }

  // Parse instances from sheets
  const sheets = ensureArray<any>(schematic.sheets?.sheet);
  for (const sheet of sheets) {
    const instances = ensureArray<any>(sheet.instances?.instance);
    for (const inst of instances) {
      const partName = inst["@_part"];
      const partInfo = partsMap.get(partName) || { deviceset: "Unknown", value: "" };
      const ix = pf(inst["@_x"]);
      const iy = pf(inst["@_y"]);
      const irot = parseRotation(inst["@_rotated"]);

      // Mock pins based on symbol device
      const pins: SchematicComponentPin[] = [];
      const dsLower = partInfo.deviceset.toLowerCase();
      if (dsLower.includes('res') || dsLower.startsWith('r')) {
        pins.push({ name: '1', num: '1', x: ix - 5.08, y: iy });
        pins.push({ name: '2', num: '2', x: ix + 5.08, y: iy });
      } else if (dsLower.includes('cap') || dsLower.startsWith('c')) {
        pins.push({ name: '1', num: '1', x: ix - 2.54, y: iy });
        pins.push({ name: '2', num: '2', x: ix + 2.54, y: iy });
      } else {
        pins.push({ name: 'VCC', num: '8', x: ix - 7.62, y: iy + 5.08 });
        pins.push({ name: 'GND', num: '4', x: ix - 7.62, y: iy - 5.08 });
        pins.push({ name: '1', num: '1', x: ix - 7.62, y: iy });
        pins.push({ name: '2', num: '2', x: ix + 7.62, y: iy });
      }

      components.push({
        id: partName,
        designator: partName,
        value: partInfo.value,
        symbol: partInfo.deviceset,
        x: ix,
        y: iy,
        rotation: irot,
        pins
      });
    }

    // Parse nets
    const sNets = ensureArray<any>(sheet.nets?.net);
    for (const net of sNets) {
      const netName = net["@_name"];
      const segments: SchematicNetSegment[] = [];

      const sSegments = ensureArray<any>(net.segment);
      for (const seg of sSegments) {
        const wires = ensureArray<any>(seg.wire);
        for (const wire of wires) {
          const x1 = pf(wire["@_x1"]);
          const y1 = pf(wire["@_y1"]);
          const x2 = pf(wire["@_x2"]);
          const y2 = pf(wire["@_y2"]);
          segments.push({
            points: [{ x: x1, y: y1 }, { x: x2, y: y2 }]
          });
        }
      }

      if (segments.length > 0) {
        nets.push({
          name: netName,
          segments
        });
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

  nets.forEach(n => {
    n.segments.forEach(seg => {
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
    minX -= 20; minY -= 20; maxX += 20; maxY += 20;
  }

  return {
    type: 'schematic',
    bounds: { minX, minY, maxX, maxY },
    components,
    nets
  };
}
