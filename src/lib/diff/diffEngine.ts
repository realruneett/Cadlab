import { PCBData, Component, Trace, Via, Pad, Point } from '../parsers/kicad/pcbParser';
import { SchematicData, SchematicComponent, SchematicNet } from '../parsers/kicad/schParser';
import { ParsedHardwareData } from '../parsers/parser';

export type DiffStatus = 'added' | 'deleted' | 'modified' | 'unchanged';

export interface DiffedComponent extends Component {
  diffStatus: DiffStatus;
}

export interface DiffedTrace extends Trace {
  diffStatus: DiffStatus;
}

export interface DiffedVia extends Via {
  diffStatus: DiffStatus;
}

export interface DiffedPCBData {
  type: 'pcb';
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  layers: string[];
  // Revisions representation
  oldRevision: {
    components: DiffedComponent[];
    traces: DiffedTrace[];
    vias: DiffedVia[];
  };
  newRevision: {
    components: DiffedComponent[];
    traces: DiffedTrace[];
    vias: DiffedVia[];
  };
}

export interface DiffedSchematicComponent extends SchematicComponent {
  diffStatus: DiffStatus;
}

export interface DiffedSchematicNet extends SchematicNet {
  diffStatus: DiffStatus;
}

export interface DiffedSchematicData {
  type: 'schematic';
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  oldRevision: {
    components: DiffedSchematicComponent[];
    nets: DiffedSchematicNet[];
  };
  newRevision: {
    components: DiffedSchematicComponent[];
    nets: DiffedSchematicNet[];
  };
}

export type DiffedHardwareData = DiffedPCBData | DiffedSchematicData;

/**
 * Standardizes trace segment endpoints to make them order-independent.
 */
function getSegmentKey(p1: Point, p2: Point, layer: string): string {
  const x1 = p1.x.toFixed(4);
  const y1 = p1.y.toFixed(4);
  const x2 = p2.x.toFixed(4);
  const y2 = p2.y.toFixed(4);
  const l = layer.toLowerCase();
  
  // Sort endpoints to guarantee order independence
  if (x1 < x2 || (x1 === x2 && y1 <= y2)) {
    return `${x1},${y1}_${x2},${y2}_${l}`;
  } else {
    return `${x2},${y2}_${x1},${y1}_${l}`;
  }
}

function getViaKey(v: Via): string {
  return `${v.x.toFixed(3)},${v.y.toFixed(3)}`;
}

export function computeVisualDiff(oldData: ParsedHardwareData, newData: ParsedHardwareData): DiffedHardwareData {
  if (oldData.type !== newData.type) {
    throw new Error("Cannot diff files of different types (Schematic vs PCB)");
  }

  // Calculate union bounding box
  const bounds = {
    minX: Math.min(oldData.bounds.minX, newData.bounds.minX),
    minY: Math.min(oldData.bounds.minY, newData.bounds.minY),
    maxX: Math.max(oldData.bounds.maxX, newData.bounds.maxX),
    maxY: Math.max(oldData.bounds.maxY, newData.bounds.maxY)
  };

  if (oldData.type === 'pcb' && newData.type === 'pcb') {
    const oldPCB = oldData as PCBData;
    const newPCB = newData as PCBData;

    // Component Diffing (match by designator)
    const oldComps: DiffedComponent[] = [];
    const newComps: DiffedComponent[] = [];

    const oldCompsMap = new Map<string, Component>();
    oldPCB.components.forEach(c => oldCompsMap.set(c.designator, c));

    const newCompsMap = new Map<string, Component>();
    newPCB.components.forEach(c => newCompsMap.set(c.designator, c));

    // Process old components
    oldPCB.components.forEach(c => {
      const match = newCompsMap.get(c.designator);
      if (!match) {
        // Deleted
        oldComps.push({ ...c, diffStatus: 'deleted' });
      } else {
        const moved = Math.hypot(c.x - match.x, c.y - match.y) > 0.05 || 
                      Math.abs(c.rotation - match.rotation) > 0.5 ||
                      c.value !== match.value;
        if (moved) {
          oldComps.push({ ...c, diffStatus: 'modified' });
        } else {
          oldComps.push({ ...c, diffStatus: 'unchanged' });
        }
      }
    });

    // Process new components
    newPCB.components.forEach(c => {
      const match = oldCompsMap.get(c.designator);
      if (!match) {
        // Added
        newComps.push({ ...c, diffStatus: 'added' });
      } else {
        const moved = Math.hypot(c.x - match.x, c.y - match.y) > 0.05 || 
                      Math.abs(c.rotation - match.rotation) > 0.5 ||
                      c.value !== match.value;
        if (moved) {
          newComps.push({ ...c, diffStatus: 'modified' });
        } else {
          newComps.push({ ...c, diffStatus: 'unchanged' });
        }
      }
    });

    // Trace segment diffing
    const oldTraces: DiffedTrace[] = [];
    const newTraces: DiffedTrace[] = [];

    // Map trace segments
    const oldSegMap = new Map<string, Trace>();
    oldPCB.traces.forEach(t => {
      if (t.points.length >= 2) {
        for (let i = 0; i < t.points.length - 1; i++) {
          const key = getSegmentKey(t.points[i], t.points[i + 1], t.layer);
          oldSegMap.set(key, t);
        }
      }
    });

    const newSegMap = new Map<string, Trace>();
    newPCB.traces.forEach(t => {
      if (t.points.length >= 2) {
        for (let i = 0; i < t.points.length - 1; i++) {
          const key = getSegmentKey(t.points[i], t.points[i + 1], t.layer);
          newSegMap.set(key, t);
        }
      }
    });

    // Output traces
    oldPCB.traces.forEach(t => {
      // For multi-segment traces, classify each segment, or simplify to trace level
      let allUnchanged = true;
      for (let i = 0; i < t.points.length - 1; i++) {
        const key = getSegmentKey(t.points[i], t.points[i + 1], t.layer);
        if (!newSegMap.has(key)) {
          allUnchanged = false;
          break;
        }
      }
      oldTraces.push({
        ...t,
        diffStatus: allUnchanged ? 'unchanged' : 'deleted'
      });
    });

    newPCB.traces.forEach(t => {
      let allUnchanged = true;
      for (let i = 0; i < t.points.length - 1; i++) {
        const key = getSegmentKey(t.points[i], t.points[i + 1], t.layer);
        if (!oldSegMap.has(key)) {
          allUnchanged = false;
          break;
        }
      }
      newTraces.push({
        ...t,
        diffStatus: allUnchanged ? 'unchanged' : 'added'
      });
    });

    // Via diffing
    const oldVias: DiffedVia[] = [];
    const newVias: DiffedVia[] = [];

    const oldViasMap = new Map<string, Via>();
    oldPCB.vias.forEach(v => oldViasMap.set(getViaKey(v), v));

    const newViasMap = new Map<string, Via>();
    newPCB.vias.forEach(v => newViasMap.set(getViaKey(v), v));

    // Old vias check
    oldPCB.vias.forEach(v => {
      const match = newViasMap.get(getViaKey(v));
      if (!match) {
        oldVias.push({ ...v, diffStatus: 'deleted' });
      } else {
        const modified = v.drill !== match.drill || v.diameter !== match.diameter;
        oldVias.push({
          ...v,
          diffStatus: modified ? 'modified' : 'unchanged'
        });
      }
    });

    // New vias check
    newPCB.vias.forEach(v => {
      const match = oldViasMap.get(getViaKey(v));
      if (!match) {
        newVias.push({ ...v, diffStatus: 'added' });
      } else {
        const modified = v.drill !== match.drill || v.diameter !== match.diameter;
        newVias.push({
          ...v,
          diffStatus: modified ? 'modified' : 'unchanged'
        });
      }
    });

    const layers = Array.from(new Set([...oldPCB.layers, ...newPCB.layers]));

    return {
      type: 'pcb',
      bounds,
      layers,
      oldRevision: {
        components: oldComps,
        traces: oldTraces,
        vias: oldVias
      },
      newRevision: {
        components: newComps,
        traces: newTraces,
        vias: newVias
      }
    };
  } else {
    // Schematic Diffing
    const oldSch = oldData as SchematicData;
    const newSch = newData as SchematicData;

    const oldComps: DiffedSchematicComponent[] = [];
    const newComps: DiffedSchematicComponent[] = [];

    const oldCompsMap = new Map<string, SchematicComponent>();
    oldSch.components.forEach(c => oldCompsMap.set(c.designator, c));

    const newCompsMap = new Map<string, SchematicComponent>();
    newSch.components.forEach(c => newCompsMap.set(c.designator, c));

    // Old Schematic components check
    oldSch.components.forEach(c => {
      const match = newCompsMap.get(c.designator);
      if (!match) {
        oldComps.push({ ...c, diffStatus: 'deleted' });
      } else {
        const moved = Math.hypot(c.x - match.x, c.y - match.y) > 0.05 || 
                      c.value !== match.value || 
                      c.symbol !== match.symbol;
        oldComps.push({
          ...c,
          diffStatus: moved ? 'modified' : 'unchanged'
        });
      }
    });

    // New Schematic components check
    newSch.components.forEach(c => {
      const match = oldCompsMap.get(c.designator);
      if (!match) {
        newComps.push({ ...c, diffStatus: 'added' });
      } else {
        const moved = Math.hypot(c.x - match.x, c.y - match.y) > 0.05 || 
                      c.value !== match.value || 
                      c.symbol !== match.symbol;
        newComps.push({
          ...c,
          diffStatus: moved ? 'modified' : 'unchanged'
        });
      }
    });

    // Nets wire segment diffing
    const oldNets: DiffedSchematicNet[] = [];
    const newNets: DiffedSchematicNet[] = [];

    const oldSegMap = new Map<string, boolean>();
    oldSch.nets.forEach(n => {
      n.segments.forEach(seg => {
        if (seg.points.length >= 2) {
          for (let i = 0; i < seg.points.length - 1; i++) {
            const key = getSegmentKey(seg.points[i], seg.points[i + 1], 'Schematic');
            oldSegMap.set(key, true);
          }
        }
      });
    });

    const newSegMap = new Map<string, boolean>();
    newSch.nets.forEach(n => {
      n.segments.forEach(seg => {
        if (seg.points.length >= 2) {
          for (let i = 0; i < seg.points.length - 1; i++) {
            const key = getSegmentKey(seg.points[i], seg.points[i + 1], 'Schematic');
            newSegMap.set(key, true);
          }
        }
      });
    });

    // Mark old nets
    oldSch.nets.forEach(n => {
      let allUnchanged = true;
      n.segments.forEach(seg => {
        for (let i = 0; i < seg.points.length - 1; i++) {
          const key = getSegmentKey(seg.points[i], seg.points[i + 1], 'Schematic');
          if (!newSegMap.has(key)) allUnchanged = false;
        }
      });
      oldNets.push({
        ...n,
        diffStatus: allUnchanged ? 'unchanged' : 'deleted'
      });
    });

    // Mark new nets
    newSch.nets.forEach(n => {
      let allUnchanged = true;
      n.segments.forEach(seg => {
        for (let i = 0; i < seg.points.length - 1; i++) {
          const key = getSegmentKey(seg.points[i], seg.points[i + 1], 'Schematic');
          if (!oldSegMap.has(key)) allUnchanged = false;
        }
      });
      newNets.push({
        ...n,
        diffStatus: allUnchanged ? 'unchanged' : 'added'
      });
    });

    return {
      type: 'schematic',
      bounds,
      oldRevision: {
        components: oldComps,
        nets: oldNets
      },
      newRevision: {
        components: newComps,
        nets: newNets
      }
    };
  }
}
