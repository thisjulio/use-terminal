import type { Cell, SemanticAction, SemanticNode } from "../types";

/**
 * Analyzes a raw terminal cell buffer and produces a semantic tree
 * with inferred roles, positions, and suggested actions.
 */
export function parseSemantic(cells: Cell[][], _cols: number, _rows: number): SemanticNode {
  const lines = extractLines(cells);
  const children: SemanticNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const node = analyzeLine(line, i);
    if (node) children.push(node);
  }

  // Detect multi-line structures (tables, menus)
  const structured = detectStructures(children, cells);

  return {
    role: "terminal",
    confidence: 1,
    children: structured,
  };
}

function extractLines(cells: Cell[][]): Cell[][] {
  return cells.map((row) => [...row]);
}

function analyzeLine(line: Cell[], y: number): SemanticNode | null {
  const raw = line.map((c) => c.char).join("");
  // Filter out common escape sequences and control characters
  const text = raw
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\x1b\][0-9;]*[^\x07]*\x07/g, "")
    .replace(/\x1b\]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f]/g, "")
    .trim();
  if (!text) return null;

  // Check for error patterns
  if (/error|fail|exception|fatal|cannot access|no such file|permission denied|not found/i.test(text)) {
    return {
      role: "error",
      text,
      confidence: 0.9,
      y,
      height: 1,
      width: text.length,
    };
  }

  // Check for prompt patterns (shell prompts)
  if (/[$#%>]\s*$/.test(text)) {
    return {
      role: "prompt",
      text,
      confidence: 0.85,
      y,
      height: 1,
      width: text.length,
    };
  }

  // Check for input patterns (user typed something after prompt)
  if (/^\s*\w+\s+.*$/.test(text) && !/[$#%>]\s*$/.test(text)) {
    return {
      role: "input",
      text,
      confidence: 0.6,
      y,
      height: 1,
      width: text.length,
    };
  }

  // Default: output/text
  return {
    role: "output",
    text,
    confidence: 0.7,
    y,
    height: 1,
    width: text.length,
  };
}

function detectStructures(children: SemanticNode[], _cells: Cell[][]): SemanticNode[] {
  // Look for table patterns (multiple lines with aligned columns)
  const result: SemanticNode[] = [];
  let i = 0;

  while (i < children.length) {
    const node = children[i]!;

    // Check if this starts a table (lines with similar column structure)
    if (node.role === "output" && node.text && looksLikeTableRow(node.text)) {
      const tableNodes: SemanticNode[] = [node];
      let j = i + 1;
      while (j < children.length) {
        const next = children[j]!;
        if (!next.text || !looksLikeTableRow(next.text)) break;
        tableNodes.push(next);
        j++;
      }
      if (tableNodes.length >= 2) {
        result.push({
          role: "table",
          confidence: 0.7,
          children: tableNodes,
          y: node.y,
          height: tableNodes.length,
        });
        i = j;
        continue;
      }
    }

    result.push(node);
    i++;
  }

  return result;
}

function looksLikeTableRow(text: string): boolean {
  // Simple heuristic: multiple whitespace-separated columns
  const parts = text.trim().split(/\s{2,}|\t/);
  return parts.length >= 2;
}

/**
 * Suggests possible actions based on the current semantic state.
 */
export function suggestActions(tree: SemanticNode): SemanticAction[] {
  const actions: SemanticAction[] = [];

  function walk(node: SemanticNode) {
    if (node.role === "prompt" && node.text) {
      actions.push({
        id: "continue-at-prompt",
        label: "Type at prompt",
        description: "Enter a command at the shell prompt",
        confidence: 0.9,
      });
    }
    if (node.role === "error") {
      actions.push({
        id: "investigate-error",
        label: "Investigate error",
        description: "Review the error message and take corrective action",
        confidence: 0.8,
      });
    }
    if (node.children) {
      for (const child of node.children) walk(child);
    }
  }

  walk(tree);
  return actions;
}
