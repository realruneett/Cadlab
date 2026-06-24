import { parseKiCadPCB } from './kicad/pcbParser';
import { parseKiCadSchematic } from './kicad/schParser';
import { parseEagleFile } from './eagle/eagleParser';
import { PCBData } from './kicad/pcbParser';
import { SchematicData } from './kicad/schParser';

export type ParsedHardwareData = PCBData | SchematicData;

export function parseHardwareFile(filename: string, content: string): ParsedHardwareData {
  const extension = filename.split('.').pop()?.toLowerCase();
  
  if (extension === 'kicad_pcb') {
    return parseKiCadPCB(content);
  } else if (extension === 'kicad_sch') {
    return parseKiCadSchematic(content);
  } else if (extension === 'brd' || extension === 'sch') {
    const trimmed = content.trim();
    if (trimmed.startsWith('<?xml') || trimmed.includes('<eagle')) {
      return parseEagleFile(content);
    }
    throw new Error('Unsupported file structure (Autodesk Eagle files must be XML v6+)');
  }
  
  throw new Error(`Unsupported file format: .${extension}`);
}
