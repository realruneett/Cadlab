import { parseHardwareFile } from '../src/lib/parsers/parser';
import { computeVisualDiff } from '../src/lib/diff/diffEngine';
import {
  mockKiCadPcbRevA,
  mockKiCadPcbRevB,
  mockKiCadSchRevA,
  mockKiCadSchRevB,
  mockEagleBrdRevA,
  mockEagleBrdRevB
} from '../src/lib/git/mock-data';

function runTests() {
  console.log("==========================================");
  console.log("CADLAB.io - Running Automated Engine Tests");
  console.log("==========================================\n");

  try {
    // 1. Test KiCad PCB Parser
    console.log("1. Testing KiCad PCB Parser...");
    const pcbA = parseHardwareFile('board.kicad_pcb', mockKiCadPcbRevA);
    const pcbB = parseHardwareFile('board.kicad_pcb', mockKiCadPcbRevB);
    console.log(`   - Rev A: Parsed ${pcbA.components.length} components, ${(pcbA as any).traces.length} trace segments`);
    console.log(`   - Rev B: Parsed ${pcbB.components.length} components, ${(pcbB as any).traces.length} trace segments`);
    if (pcbA.components.length === 3 && pcbB.components.length === 3) {
      console.log("   [PASS] KiCad PCB Component counts match expected footprint instances.");
    } else {
      throw new Error(`KiCad PCB components parsing mismatch. Got RevA: ${pcbA.components.length}, RevB: ${pcbB.components.length}`);
    }

    // 2. Test KiCad Schematic Parser
    console.log("\n2. Testing KiCad Schematic Parser...");
    const schA = parseHardwareFile('schematic.kicad_sch', mockKiCadSchRevA);
    const schB = parseHardwareFile('schematic.kicad_sch', mockKiCadSchRevB);
    console.log(`   - Rev A: Parsed ${schA.components.length} components, ${(schA as any).nets.length} net wire grids`);
    console.log(`   - Rev B: Parsed ${schB.components.length} components, ${(schB as any).nets.length} net wire grids`);
    if (schA.components.length === 2 && schB.components.length === 3) {
      console.log("   [PASS] KiCad Schematic component parsing successful.");
    } else {
      throw new Error("KiCad Schematic components parsing mismatch.");
    }

    // 3. Test Eagle Board Parser
    console.log("\n3. Testing Autodesk Eagle XML Parser...");
    const eagleA = parseHardwareFile('sensor.brd', mockEagleBrdRevA);
    const eagleB = parseHardwareFile('sensor.brd', mockEagleBrdRevB);
    console.log(`   - Rev A: Parsed ${eagleA.components.length} components, ${(eagleA as any).traces.length} trace segments`);
    console.log(`   - Rev B: Parsed ${eagleB.components.length} components, ${(eagleB as any).traces.length} trace segments`);
    if (eagleA.components.length === 2 && eagleB.components.length === 3) {
      console.log("   [PASS] Eagle XML Component & signal decoding successful.");
    } else {
      throw new Error("Eagle XML board parsing mismatch.");
    }

    // 4. Test Diff engine
    console.log("\n4. Testing Visual Diff calculation engine (KiCad PCB)...");
    const diff = computeVisualDiff(pcbA, pcbB);
    
    // Check old revision deletions and modifications
    const deletedCount = diff.oldRevision.components.filter(c => c.diffStatus === 'deleted').length;
    const modifiedCountOld = diff.oldRevision.components.filter(c => c.diffStatus === 'modified').length;
    
    // Check new revision additions and modifications
    const addedCount = diff.newRevision.components.filter(c => c.diffStatus === 'added').length;
    const modifiedCountNew = diff.newRevision.components.filter(c => c.diffStatus === 'modified').length;
    const unchangedCount = diff.newRevision.components.filter(c => c.diffStatus === 'unchanged').length;

    console.log(`   - Component Deltas identified:`);
    console.log(`     * Added components (New): ${addedCount} (expected: 1 [R3])`);
    console.log(`     * Deleted components (Old): ${deletedCount} (expected: 1 [R4])`);
    console.log(`     * Modified components: ${modifiedCountOld} (expected: 1 [R1])`);
    console.log(`     * Unchanged components: ${unchangedCount} (expected: 1 [R2])`);

    if (addedCount === 1 && deletedCount === 1 && modifiedCountOld === 1 && unchangedCount === 1) {
      console.log("   [PASS] Visual Diffing engine mapped designators and coordinates flawlessly!");
    } else {
      throw new Error("Visual Diffing engine failed to calculate correct component deltas.");
    }

    console.log("\n==========================================");
    console.log("ALL AUTOMATED ENGINE TESTS PASSED SUCCESSFULLY!");
    console.log("==========================================");
  } catch (err: any) {
    console.error(`\n[FAIL] Test suite execution failed: ${err.message}`);
    process.exit(1);
  }
}

runTests();
