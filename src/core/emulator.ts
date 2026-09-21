import type { Cell, Snapshot } from "../types";
import { parseSemantic, suggestActions } from "./semantic";

const blank = (): Cell => ({ char: " ", fg: "default", bg: "default", bold: false, inverse: false });

export class TerminalEmulator {
  private cells: Cell[][];
  private readonly listeners = new Set<(snapshot: Snapshot) => void>();
  private x = 0;
  private y = 0;
  private fg = "default";
  private bg = "default";
  private bold = false;
  private inverse = false;
  private cursorVisible = true;
  private escapeBuffer = "";
  private savedX?: number;
  private savedY?: number;

  constructor(
    public cols = 80,
    public rows = 24,
    public scrollback = 1000,
  ) {
    this.cells = this.makeBuffer();
  }

  private makeBuffer(): Cell[][] {
    return Array.from({ length: this.rows }, () => Array.from({ length: this.cols }, blank));
  }

  private scroll(): void {
    this.cells.shift();
    this.cells.push(Array.from({ length: this.cols }, blank));
    this.y = this.rows - 1;
  }

  private put(char: string): void {
    if (this.x >= this.cols) {
      this.x = 0;
      this.y++;
    }
    if (this.y >= this.rows) this.scroll();
    this.cells[this.y]![this.x] = { char, fg: this.fg, bg: this.bg, bold: this.bold, inverse: this.inverse };
    this.x++;
  }

  private newLine(): void {
    this.x = 0;
    this.y++;
    if (this.y >= this.rows) this.scroll();
  }

  feed(input: Uint8Array | string): void {
    const text = typeof input === "string" ? input : new TextDecoder().decode(input);
    const combined = this.escapeBuffer + text;
    let index = 0;
    let changed = false;

    while (index < combined.length) {
      const char = combined[index]!;
      if (char === "\x1b") {
        const remainder = combined.slice(index);
        const csiMatch = remainder.match(/^\x1b\[([0-?]*)([@-~])/);
        if (csiMatch) {
          index += csiMatch[0].length;
          this.handleCsi(csiMatch[1]!, csiMatch[2]!);
          changed = true;
          continue;
        }
        // Single-character escapes (e.g., \e= for app cursor keys, \e> for normal)
        const singleEscape = remainder.match(/^\x1b([=>78])/);
        if (singleEscape) {
          index += singleEscape[0].length;
          continue;
        }
        // OSC and DCS sequences must be consumed, otherwise an unsupported
        // query can poison escapeBuffer and hide every later screen update.
        const stringEscape =
          remainder.match(/^\x1b\][\s\S]*?(?:\x07|\x1b\\)/) ?? remainder.match(/^\x1bP[\s\S]*?\x1b\\/);
        if (stringEscape) {
          index += stringEscape[0].length;
          continue;
        }
        // Keep only genuinely incomplete short sequences. A malformed or
        // unsupported escape must not swallow subsequent screen output.
        if (remainder.length <= 128) {
          this.escapeBuffer = remainder;
          break;
        }
        index++;
        continue;
      }
      if (char === "\n") {
        this.newLine();
        changed = true;
      } else if (char === "\r") {
        this.x = 0;
      } else if (char === "\b") {
        this.x = Math.max(0, this.x - 1);
      } else if (char >= " ") {
        this.put(char);
        changed = true;
      }
      index++;
    }

    this.escapeBuffer = combined.slice(index);
    if (changed) {
      const snapshot = this.snapshot("raw");
      for (const listener of this.listeners) listener(snapshot);
    }
  }

  onChange(listener: (snapshot: Snapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private handleCsi(params: string, code: string): void {
    // Handle private modes (? prefix) - mostly ignore but track cursor visibility
    if (params.startsWith("?")) {
      const modeNum = parseInt(params.slice(1), 10);
      if (modeNum === 25) {
        // Show/hide cursor
        this.cursorVisible = code === "h";
      }
      // Other private modes (bracketed paste ?2004, app cursor keys ?1, cursor blink ?12, etc.) are ignored
      return;
    }

    const values = params ? params.split(";").map(Number) : [0];

    if (code === "H" || code === "f") {
      // Cursor position (row, col)
      this.y = Math.max(0, (values[0] || 1) - 1);
      this.x = Math.max(0, (values[1] || 1) - 1);
    } else if (code === "A") {
      // Cursor up
      this.y = Math.max(0, this.y - (values[0] || 1));
    } else if (code === "B") {
      // Cursor down
      this.y = Math.min(this.rows - 1, this.y + (values[0] || 1));
    } else if (code === "C") {
      // Cursor forward (right)
      this.x = Math.min(this.cols - 1, this.x + (values[0] || 1));
    } else if (code === "D") {
      // Cursor back (left)
      this.x = Math.max(0, this.x - (values[0] || 1));
    } else if (code === "E") {
      // Cursor next line
      this.x = 0;
      this.y = Math.min(this.rows - 1, this.y + (values[0] || 1));
    } else if (code === "F") {
      // Cursor previous line
      this.x = 0;
      this.y = Math.max(0, this.y - (values[0] || 1));
    } else if (code === "G" || code === "`") {
      // Cursor character absolute
      this.x = Math.max(0, (values[0] || 1) - 1);
    } else if (code === "H") {
      // Already handled above
    } else if (code === "J") {
      // Erase in display
      if (values[0] === 0) {
        // From cursor to end of screen
        for (let col = this.x; col < this.cols; col++) this.cells[this.y]![col] = blank();
        for (let row = this.y + 1; row < this.rows; row++)
          for (let col = 0; col < this.cols; col++) this.cells[row]![col] = blank();
      } else if (values[0] === 1) {
        // From start of screen to cursor
        for (let row = 0; row < this.y; row++)
          for (let col = 0; col < this.cols; col++) this.cells[row]![col] = blank();
        for (let col = 0; col <= this.x; col++) this.cells[this.y]![col] = blank();
      } else if (values[0] === 2 || values[0] === 3) {
        // Entire display
        this.cells = this.makeBuffer();
      }
    } else if (code === "K") {
      // Erase in line
      if (values[0] === 0) {
        // From cursor to end of line
        for (let col = this.x; col < this.cols; col++) this.cells[this.y]![col] = blank();
      } else if (values[0] === 1) {
        // From start of line to cursor
        for (let col = 0; col <= this.x; col++) this.cells[this.y]![col] = blank();
      } else if (values[0] === 2) {
        // Entire line
        for (let col = 0; col < this.cols; col++) this.cells[this.y]![col] = blank();
      }
    } else if (code === "S") {
      // Scroll up
      const n = values[0] || 1;
      for (let i = 0; i < n; i++) {
        this.cells.shift();
        this.cells.push(Array.from({ length: this.cols }, blank));
      }
    } else if (code === "T") {
      // Scroll down
      const n = values[0] || 1;
      for (let i = 0; i < n; i++) {
        this.cells.pop();
        this.cells.unshift(Array.from({ length: this.cols }, blank));
      }
    } else if (code === "7") {
      // Save cursor position (simplified - just remember)
      this.savedX = this.x;
      this.savedY = this.y;
    } else if (code === "8") {
      // Restore cursor position
      if (this.savedX !== undefined) this.x = this.savedX;
      if (this.savedY !== undefined) this.y = this.savedY;
    } else if (code === "m") {
      // SGR - text attributes
      this.applyStyles(values);
    }
    // Other sequences are ignored (no crash)
  }

  private applyStyles(values: number[]): void {
    for (const value of values) {
      if (value === 0) {
        this.fg = "default";
        this.bg = "default";
        this.bold = false;
        this.inverse = false;
      } else if (value === 1) this.bold = true;
      else if (value === 7) this.inverse = true;
      else if (value >= 30 && value <= 37) this.fg = String(value - 30);
      else if (value >= 40 && value <= 47) this.bg = String(value - 40);
    }
  }

  resize(cols: number, rows: number): void {
    const old = this.cells;
    this.cols = Math.max(1, cols);
    this.rows = Math.max(1, rows);
    this.cells = this.makeBuffer();
    for (let row = 0; row < Math.min(this.rows, old.length); row++)
      for (let column = 0; column < Math.min(this.cols, old[row]!.length); column++)
        this.cells[row]![column] = old[row]![column]!;
    this.x = Math.min(this.x, this.cols - 1);
    this.y = Math.min(this.y, this.rows - 1);
  }

  snapshot(mode: Snapshot["mode"] = "text"): Snapshot {
    const text = this.cells
      .map((row) =>
        row
          .map((cell) => cell.char)
          .join("")
          .replace(/\s+$/, ""),
      )
      .join("\n");
    const base = { cols: this.cols, rows: this.rows, cursor: { x: this.x, y: this.y, visible: this.cursorVisible } };
    if (mode === "text") return { mode, ...base, text };
    if (mode === "raw")
      return { mode, ...base, text, cells: this.cells.map((row) => row.map((cell) => ({ ...cell }))) };
    const tree = parseSemantic(this.cells, this.cols, this.rows);
    const actions = suggestActions(tree);
    return { mode, ...base, text, tree, actions };
  }
}
