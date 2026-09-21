import { Terminal } from "@xterm/headless/lib-headless/xterm-headless.mjs";
import type { Cell, Snapshot } from "../types";
import { parseSemantic, suggestActions } from "./semantic";

/**
 * Terminal emulator backed by @xterm/headless (full VT100/ANSI support).
 * This provides complete compatibility with all terminal applications
 * including cagent, vim, htop, etc.
 */
export class TerminalEmulator {
  private term: Terminal;
  private readonly listeners = new Set<(snapshot: Snapshot) => void>();

  constructor(
    public cols = 80,
    public rows = 24,
    public scrollback = 1000,
  ) {
    this.term = new Terminal({
      cols,
      rows,
      scrollback,
      allowProposedApi: true,
    });
  }

  feed(input: Uint8Array | string): void {
    this.term.write(input);
    // Process synchronously - xterm.js processes writes immediately
    const snapshot = this.snapshot("raw");
    for (const listener of this.listeners) listener(snapshot);
  }

  onChange(listener: (snapshot: Snapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    this.term.resize(cols, rows);
  }

  snapshot(mode: Snapshot["mode"] = "text"): Snapshot {
    const buffer = this.term.buffer.active;
    const cells: Cell[][] = [];

    for (let y = 0; y < this.rows; y++) {
      const line = buffer.getLine(y);
      const row: Cell[] = [];
      for (let x = 0; x < this.cols; x++) {
        const cell = line?.getCell(x);
        if (cell) {
          row.push({
            char: cell.getChars() || " ",
            fg: "default",
            bg: "default",
            bold: false,
            inverse: false,
          });
        } else {
          row.push({ char: " ", fg: "default", bg: "default", bold: false, inverse: false });
        }
      }
      cells.push(row);
    }

    const text = cells
      .map((row) =>
        row
          .map((cell) => cell.char)
          .join("")
          .replace(/\s+$/, ""),
      )
      .join("\n");

    const base = {
      cols: this.cols,
      rows: this.rows,
      cursor: { x: buffer.cursorX, y: buffer.cursorY, visible: true },
    };

    if (mode === "text") return { mode, ...base, text };
    if (mode === "raw") return { mode, ...base, text, cells };

    const tree = parseSemantic(cells, this.cols, this.rows);
    const actions = suggestActions(tree);
    return { mode, ...base, text, tree, actions };
  }

  dispose(): void {
    this.term.dispose();
  }
}
