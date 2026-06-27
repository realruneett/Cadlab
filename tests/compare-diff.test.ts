import { computeSideBySideDiff } from '../src/utils/diff';

function runCompareTests() {
  console.log("==========================================");
  console.log("CADLAB.io - Running Side-by-Side Diff Tests");
  console.log("==========================================\n");

  try {
    // Test 1: CRLF normalization
    console.log("1. Testing CRLF to LF Normalization...");
    const oldStr = "line1\r\nline2\r\n";
    const newStr = "line1\nline2\n";
    const diffNorm = computeSideBySideDiff(oldStr, newStr, { crlfToLf: true });
    
    const allNormal = diffNorm.every(row => row.left.type === 'normal' && row.right.type === 'normal');
    if (allNormal) {
      console.log("   [PASS] CRLF normalization worked correctly.");
    } else {
      throw new Error("CRLF normalization failed to treat inputs as identical.");
    }

    // Test 2: Ignore whitespace
    console.log("2. Testing Ignore Whitespace...");
    const oldWS = "const x = 10;";
    const newWS = "const   x   =   10;";
    const diffWS = computeSideBySideDiff(oldWS, newWS, { ignoreWhitespace: true });

    if (diffWS[0].left.type === 'normal' && diffWS[0].right.type === 'normal') {
      console.log("   [PASS] Ignore whitespace comparison worked correctly.");
    } else {
      throw new Error("Ignore whitespace failed to match lines.");
    }

    // Test 3: Side-by-side alignment (deleted & added line matching)
    console.log("3. Testing Side-by-Side Alignment...");
    const oldAlign = "line1\nline2\nline3\n";
    const newAlign = "line1\nline2_changed\nline3\n";
    const diffAlign = computeSideBySideDiff(oldAlign, newAlign);

    if (diffAlign.length === 3) {
      console.log("   [PASS] Row counts match expected aligned outputs.");
    } else {
      throw new Error(`Expected 3 rows, got ${diffAlign.length}`);
    }

    if (diffAlign[1].left.type === 'modified' && diffAlign[1].right.type === 'modified') {
      console.log("   [PASS] Aligned change identified as modification.");
    } else {
      throw new Error("Alignment failed to flag matching lines as modified.");
    }

    if (diffAlign[1].left.words && diffAlign[1].right.words) {
      console.log("   [PASS] Inline word diff computed for modified lines.");
    } else {
      throw new Error("Word diff missing for modified lines.");
    }

    console.log("\n==========================================");
    console.log("ALL COMPARE DIFF TESTS PASSED SUCCESSFULLY!");
    console.log("==========================================");
  } catch (err: any) {
    console.error(`\n[FAIL] Test suite execution failed: ${err.message}`);
    process.exit(1);
  }
}

runCompareTests();
