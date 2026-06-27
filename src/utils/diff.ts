import { diffLines, diffWords, Change } from 'diff';

export interface DiffLine {
  lineNum: number | null;
  content: string;
  type: 'added' | 'removed' | 'normal' | 'modified';
  words?: Change[];
}

export interface DiffRow {
  left: DiffLine;
  right: DiffLine;
}

export interface DiffOptions {
  ignoreWhitespace?: boolean;
  crlfToLf?: boolean;
}

/**
 * Splits a hunk's value into individual lines, removing the trailing empty line
 * if it is caused by a trailing newline character.
 */
function splitHunkIntoLines(value: string): string[] {
  if (!value) return [];
  const lines = value.split('\n');
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

/**
 * Normalizes line endings from CRLF (\r\n) to LF (\n).
 */
function normalizeLineEndings(str: string): string {
  return str.replace(/\r\n/g, '\n');
}

/**
 * Computes a side-by-side diff between two strings.
 * Aligns deleted and added lines horizontally, performing word-level diffing
 * on modified lines.
 */
export function computeSideBySideDiff(
  oldStr: string,
  newStr: string,
  options: DiffOptions = {}
): DiffRow[] {
  const cleanOld = options.crlfToLf ? normalizeLineEndings(oldStr) : oldStr;
  const cleanNew = options.crlfToLf ? normalizeLineEndings(newStr) : newStr;

  const hunks = diffLines(cleanOld, cleanNew, {
    ignoreWhitespace: options.ignoreWhitespace,
  });

  const rows: DiffRow[] = [];
  let leftLineNum = 1;
  let rightLineNum = 1;

  let removedLines: DiffLine[] = [];
  let addedLines: DiffLine[] = [];

  const flushPending = () => {
    const maxLen = Math.max(removedLines.length, addedLines.length);
    for (let i = 0; i < maxLen; i++) {
      let leftCell: DiffLine = i < removedLines.length
        ? removedLines[i]
        : { lineNum: null, content: '', type: 'normal' };

      let rightCell: DiffLine = i < addedLines.length
        ? addedLines[i]
        : { lineNum: null, content: '', type: 'normal' };

      // If both cells exist in the paired row, treat it as a modification.
      // Compute word-level differences to highlight inline changes.
      if (i < removedLines.length && i < addedLines.length) {
        leftCell.type = 'modified';
        rightCell.type = 'modified';

        try {
          // Note: diffWords does not support ignoreWhitespace (only diffLines does).
          // Word-level diffing already normalises whitespace by design.
          const wordDiff = diffWords(leftCell.content, rightCell.content);

          // Left cell shows original text, so exclude words that were added.
          leftCell.words = wordDiff.filter(w => !w.added);

          // Right cell shows new text, so exclude words that were removed.
          rightCell.words = wordDiff.filter(w => !w.removed);
        } catch (err) {
          console.error("Word diff computation failed for line", leftCell.content, err);
        }
      }

      rows.push({ left: leftCell, right: rightCell });
    }

    removedLines = [];
    addedLines = [];
  };

  for (const hunk of hunks) {
    const hunkLines = splitHunkIntoLines(hunk.value);

    if (hunk.removed) {
      for (const line of hunkLines) {
        removedLines.push({
          lineNum: leftLineNum++,
          content: line,
          type: 'removed',
        });
      }
    } else if (hunk.added) {
      for (const line of hunkLines) {
        addedLines.push({
          lineNum: rightLineNum++,
          content: line,
          type: 'added',
        });
      }
    } else {
      // Common block: first flush any pending changes
      flushPending();

      for (const line of hunkLines) {
        rows.push({
          left: { lineNum: leftLineNum++, content: line, type: 'normal' },
          right: { lineNum: rightLineNum++, content: line, type: 'normal' },
        });
      }
    }
  }

  // Flush any remaining trailing additions/removals
  flushPending();

  return rows;
}
