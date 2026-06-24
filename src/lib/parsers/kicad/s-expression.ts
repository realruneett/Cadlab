export type SExpr = string | SExpr[];

/**
 * Tokenizes a KiCad S-expression string.
 * Handles strings, numbers, and escape characters.
 */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const char = input[i];

    // Skip whitespace
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      i++;
      continue;
    }

    // Parentheses are separate tokens
    if (char === '(' || char === ')') {
      tokens.push(char);
      i++;
      continue;
    }

    // Quoted strings
    if (char === '"') {
      let str = "";
      i++; // skip opening quote
      while (i < len) {
        if (input[i] === '"') {
          break;
        } else if (input[i] === '\\' && input[i + 1] === '"') {
          str += '"';
          i += 2;
        } else if (input[i] === '\\' && input[i + 1] === '\\') {
          str += '\\';
          i += 2;
        } else {
          str += input[i];
          i++;
        }
      }
      tokens.push(`"${str}"`);
      if (i < len) i++; // skip closing quote
      continue;
    }
    // Unquoted words
    let word = "";
    while (i < len && input[i] !== ' ' && input[i] !== '\t' && input[i] !== '\n' && input[i] !== '\r' && input[i] !== '(' && input[i] !== ')' && input[i] !== '"') {
      word += input[i];
      i++;
    }
    if (word.length > 0) {
      tokens.push(word);
    }
  }

  return tokens;
}

/**
 * Parses tokens into a nested S-Expression array tree.
 */
export function parseSExpr(tokens: string[]): SExpr[] {
  let index = 0;

  function parseNode(): SExpr {
    if (index >= tokens.length) {
      throw new Error("Unexpected end of input");
    }

    const token = tokens[index];

    if (token === '(') {
      index++; // consume '('
      const list: SExpr[] = [];
      while (index < tokens.length && tokens[index] !== ')') {
        list.push(parseNode());
      }
      if (index >= tokens.length) {
        throw new Error("Unclosed parenthesis in S-Expression");
      }
      index++; // consume ')'
      return list;
    } else if (token === ')') {
      throw new Error("Unexpected close parenthesis ')'");
    } else {
      index++;
      // Clean up string quotes
      if (token.startsWith('"') && token.endsWith('"')) {
        return token.slice(1, -1);
      }
      return token;
    }
  }

  const result: SExpr[] = [];
  while (index < tokens.length) {
    result.push(parseNode());
  }

  return result;
}

/**
 * Helper to find a specific node by its key (first element).
 */
export function findNode(exprs: SExpr[], key: string): SExpr[] | null {
  for (const node of exprs) {
    if (Array.isArray(node) && node[0] === key) {
      return node;
    }
  }
  return null;
}

/**
 * Helper to find all nodes with a specific key.
 */
export function findNodes(exprs: SExpr[], key: string): SExpr[][] {
  const result: SExpr[][] = [];
  for (const node of exprs) {
    if (Array.isArray(node) && node[0] === key) {
      result.push(node);
    }
  }
  return result;
}
