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

  const bounds = {
    minX: Math.min(oldData.bounds.minX, newData.bounds.minX),
    minY: Math.min(oldData.bounds.minY, newData.bounds.minY),
    maxX: Math.max(oldData.bounds.maxX, newData.bounds.maxX),
    maxY: Math.max(oldData.bounds.maxY, newData.bounds.maxY)
  };

  if (oldData.type === 'pcb' && newData.type === 'pcb') {
    const oldPCB = oldData as PCBData;
    const newPCB = newData as PCBData;

    const oldComps: DiffedComponent[] = [];
    const newComps: DiffedComponent[] = [];

    const oldCompsMap = new Map<string, Component>();
    oldPCB.components.forEach(c => oldCompsMap.set(c.designator, c));

    const newCompsMap = new Map<string, Component>();
    newPCB.components.forEach(c => newCompsMap.set(c.designator, c));

    oldPCB.components.forEach(c => {
      const match = newCompsMap.get(c.designator);
      if (!match) {
        oldComps.push({ ...c, diffStatus: 'deleted' });
      } else {
        const moved = Math.hypot(c.x - match.x, c.y - match.y) > 0.05 || 
                      Math.abs(c.rotation - match.rotation) > 0.5 ||
                      c.value !== match.value;
        oldComps.push({ ...c, diffStatus: moved ? 'modified' : 'unchanged' });
      }
    });

    newPCB.components.forEach(c => {
      const match = oldCompsMap.get(c.designator);
      if (!match) {
        newComps.push({ ...c, diffStatus: 'added' });
      } else {
        const moved = Math.hypot(c.x - match.x, c.y - match.y) > 0.05 || 
                      Math.abs(c.rotation - match.rotation) > 0.5 ||
                      c.value !== match.value;
        newComps.push({ ...c, diffStatus: moved ? 'modified' : 'unchanged' });
      }
    });

    // SURGICAL TRACE DIFFING: Map every segment down to 2-point objects
    const oldTraces: DiffedTrace[] = [];
    const newTraces: DiffedTrace[] = [];

    const oldSegMap = new Map<string, boolean>();
    oldPCB.traces.forEach(t => {
      for (let i = 0; i < t.points.length - 1; i++) {
        const key = getSegmentKey(t.points[i], t.points[i + 1], t.layer);
        oldSegMap.set(key, true);
      }
    });

    const newSegMap = new Map<string, boolean>();
    newPCB.traces.forEach(t => {
      for (let i = 0; i < t.points.length - 1; i++) {
        const key = getSegmentKey(t.points[i], t.points[i + 1], t.layer);
        newSegMap.set(key, true);
      }
    });

    // Breakdown compound old traces into standalone single-segment diff items
    oldPCB.traces.forEach(t => {
      for (let i = 0; i < t.points.length - 1; i++) {
        const p1 = t.points[i];
        const p2 = t.points[i + 1];
        const key = getSegmentKey(p1, p2, t.layer);
        const existsInNew = newSegMap.has(key);

        oldTraces.push({
          ...t,
          points: [p1, p2], // Slice trace array to single vector segment
          diffStatus: existsInNew ? 'unchanged' : 'deleted'
        });
      }
    });

    // Breakdown compound new traces into standalone single-segment diff items
    newPCB.traces.forEach(t => {
      for (let i = 0; i < t.points.length - 1; i++) {
        const p1 = t.points[i];
        const p2 = t.points[i + 1];
        const key = getSegmentKey(p1, p2, t.layer);
        const existsInOld = oldSegMap.has(key);

        newTraces.push({
          ...t,
          points: [p1, p2], // Slice trace array to single vector segment
          diffStatus: existsInOld ? 'unchanged' : 'added'
        });
      }
    });

    const oldVias: DiffedVia[] = [];
    const newVias: DiffedVia[] = [];
    const oldViasMap = new Map<string, Via>();
    oldPCB.vias.forEach(v => oldViasMap.set(getViaKey(v), v));
    const newViasMap = new Map<string, Via>();
    newPCB.vias.forEach(v => newViasMap.set(getViaKey(v), v));

    oldPCB.vias.forEach(v => {
      const match = newViasMap.get(getViaKey(v));
      if (!match) oldVias.push({ ...v, diffStatus: 'deleted' });
      else {
        const modified = v.drill !== match.drill || v.diameter !== match.diameter;
        oldVias.push({ ...v, diffStatus: modified ? 'modified' : 'unchanged' });
      }
    });

    newPCB.vias.forEach(v => {
      const match = oldViasMap.get(getViaKey(v));
      if (!match) newVias.push({ ...v, diffStatus: 'added' });
      else {
        const modified = v.drill !== match.drill || v.diameter !== match.diameter;
        newVias.push({ ...v, diffStatus: modified ? 'modified' : 'unchanged' });
      }
    });

    const layers = Array.from(new Set([...oldPCB.layers, ...newPCB.layers]));

    return {
      type: 'pcb',
      bounds,
      layers,
      oldRevision: { components: oldComps, traces: oldTraces, vias: oldVias },
      newRevision: { components: newComps, traces: newTraces, vias: newVias }
    };
  } else {
    // Schematic Diffing Engine
    const oldSch = oldData as SchematicData;
    const newSch = newData as SchematicData;

    const oldComps: DiffedSchematicComponent[] = [];
    const newComps: DiffedSchematicComponent[] = [];
    const oldCompsMap = new Map<string, SchematicComponent>();
    oldSch.components.forEach(c => oldCompsMap.set(c.designator, c));
    const newCompsMap = new Map<string, SchematicComponent>();
    newSch.components.forEach(c => newCompsMap.set(c.designator, c));

    oldSch.components.forEach(c => {
      const match = newCompsMap.get(c.designator);
      if (!match) oldComps.push({ ...c, diffStatus: 'deleted' });
      else {
        const moved = Math.hypot(c.x - match.x, c.y - match.y) > 0.05 || c.value !== match.value || c.symbol !== match.symbol;
        oldComps.push({ ...c, diffStatus: moved ? 'modified' : 'unchanged' });
      }
    });

    newSch.components.forEach(c => {
      const match = oldCompsMap.get(c.designator);
      if (!match) newComps.push({ ...c, diffStatus: 'added' });
      else {
        const moved = Math.hypot(c.x - match.x, c.y - match.y) > 0.05 || c.value !== match.value || c.symbol !== match.symbol;
        newComps.push({ ...c, diffStatus: moved ? 'modified' : 'unchanged' });
      }
    });

    const oldNets: DiffedSchematicNet[] = [];
    const newNets: DiffedSchematicNet[] = [];

    const oldSegMap = new Map<string, boolean>();
    oldSch.nets.forEach(n => {
      n.segments.forEach(seg => {
        for (let i = 0; i < seg.points.length - 1; i++) {
          oldSegMap.set(getSegmentKey(seg.points[i], seg.points[i + 1], 'Schematic'), true);
        }
      });
    });

    const newSegMap = new Map<string, boolean>();
    newSch.nets.forEach(n => {
      n.segments.forEach(seg => {
        for (let i = 0; i < seg.points.length - 1; i++) {
          newSegMap.set(getSegmentKey(seg.points[i], seg.points[i + 1], 'Schematic'), true);
        }
      });
    });

    // Process granular old schematic segments
    oldSch.nets.forEach(n => {
      n.segments.forEach(seg => {
        for (let i = 0; i < seg.points.length - 1; i++) {
          const p1 = seg.points[i];
          const p2 = seg.points[i + 1];
          const existsInNew = newSegMap.has(getSegmentKey(p1, p2, 'Schematic'));

          oldNets.push({
            ...n,
            segments: [{ points: [p1, p2] }], // Isolate vector path line
            diffStatus: existsInNew ? 'unchanged' : 'deleted'
          });
        }
      });
    });

    // Process granular new schematic segments
    newSch.nets.forEach(n => {
      n.segments.forEach(seg => {
        for (let i = 0; i < seg.points.length - 1; i++) {
          const p1 = seg.points[i];
          const p2 = seg.points[i + 1];
          const existsInOld = oldSegMap.has(getSegmentKey(p1, p2, 'Schematic'));

          newNets.push({
            ...n,
            segments: [{ points: [p1, p2] }], // Isolate vector path line
            diffStatus: existsInOld ? 'unchanged' : 'added'
          });
        }
      });
    });

    return {
      type: 'schematic',
      bounds,
      oldRevision: { components: oldComps, nets: oldNets },
      newRevision: { components: newComps, nets: newNets }
    };
  }
}
