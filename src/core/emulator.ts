import type { Cell, Selection, SelectionPoint, Snapshot, TerminalColor } from "../types";
import { parseSemantic, suggestActions } from "./semantic";

const defaultColor: TerminalColor = { type: "default" };
const blank = (): Cell => ({
  char: " ",
  fg: "default",
  bg: "default",
  foreground: defaultColor,
  background: defaultColor,
  bold: false,
  inverse: false,
  underline: false,
  dim: false,
  italic: false,
  strike: false,
});

export class TerminalEmulator {
  private cells: Cell[][];
  private history: Cell[][] = [];
  private alternateScreen = false;
  private normalScreen?: { cells: Cell[][]; history: Cell[][]; x: number; y: number };
  private viewportOffset = 0;
  private readonly listeners = new Set<(snapshot: Snapshot) => void>();
  private x = 0;
  private y = 0;
  private fg = "default";
  private bg = "default";
  private bold = false;
  private inverse = false;
  private underline = false;
  private dim = false;
  private italic = false;
  private strike = false;
  private foreground: TerminalColor = defaultColor;
  private background: TerminalColor = defaultColor;
  private cursorVisible = true;
  private escapeBuffer = "";
  private savedX?: number;
  private savedY?: number;
  private selection?: Selection;
  private activeHyperlink?: string;
  private readonly modes = new Map<string, boolean>();

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
    const removed = this.cells.shift()!;
    if (!this.alternateScreen) this.history.push(removed);
    if (this.history.length > this.scrollback) this.history.shift();
    this.cells.push(Array.from({ length: this.cols }, blank));
    this.y = this.rows - 1;
    this.viewportOffset = 0;
  }

  private put(char: string): void {
    if (this.x >= this.cols) {
      this.x = 0;
      this.y++;
    }
    if (this.y >= this.rows) this.scroll();
    this.cells[this.y]![this.x] = {
      char,
      fg: this.fg,
      bg: this.bg,
      foreground: this.foreground,
      background: this.background,
      bold: this.bold,
      inverse: this.inverse,
      underline: this.underline,
      dim: this.dim,
      italic: this.italic,
      strike: this.strike,
      hyperlink: this.activeHyperlink,
    };
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
        // OSC 8 hyperlinks, handled as two tokens so the linked text can flow
        // through normal writes (it may arrive in separate chunks):
        //   open:  \x1b]8;{url}\x1b\\   -> set activeHyperlink
        //   close: \x1b]8;\x1b\\          -> clear activeHyperlink
        const hyperlinkToken = remainder.match(/^\x1b\]8;([^\x1b]*)(\x1b\\|\x07)/);
        if (hyperlinkToken) {
          const url = hyperlinkToken[1]!;
          this.activeHyperlink = url || undefined;
          index += hyperlinkToken[0].length;
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
    if (params.startsWith("?")) {
      const requested = params.slice(1).split(";").map(Number);
      if (requested.includes(1049) || requested.includes(1047) || requested.includes(47)) {
        if (code === "h" && !this.alternateScreen) {
          this.normalScreen = { cells: this.cells, history: this.history, x: this.x, y: this.y };
          this.cells = this.makeBuffer();
          this.history = [];
          this.x = 0;
          this.y = 0;
          this.alternateScreen = true;
          this.viewportOffset = 0;
        } else if (code === "l" && this.alternateScreen && this.normalScreen) {
          const normal = this.normalScreen;
          this.cells = normal.cells;
          this.history = normal.history;
          this.x = normal.x;
          this.y = normal.y;
          this.normalScreen = undefined;
          this.alternateScreen = false;
          this.viewportOffset = 0;
        }
      }
      if (requested.includes(25)) {
        // Show/hide cursor
        this.cursorVisible = code === "h";
      }
      // Record private modes (bracketed paste, focus, mouse, alternate, etc.)
      // so the snapshot can expose what was negotiated with the application.
      for (const mode of requested) this.modes.set(String(mode), code === "h");
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
    for (let index = 0; index < values.length; index++) {
      const value = values[index]!;
      if (value === 0) {
        this.fg = "default";
        this.bg = "default";
        this.foreground = defaultColor;
        this.background = defaultColor;
        this.bold = false;
        this.inverse = false;
        this.underline = false;
        this.dim = false;
        this.italic = false;
        this.strike = false;
      } else if (value === 1) this.bold = true;
      else if (value === 2) this.dim = true;
      else if (value === 3) this.italic = true;
      else if (value === 4) this.underline = true;
      else if (value === 7) this.inverse = true;
      else if (value === 9) this.strike = true;
      else if (value === 22) {
        this.bold = false;
        this.dim = false;
      } else if (value === 23) this.italic = false;
      else if (value === 24) this.underline = false;
      else if (value === 27) this.inverse = false;
      else if (value === 29) this.strike = false;
      else if (value === 39) {
        this.fg = "default";
        this.foreground = defaultColor;
      } else if (value === 49) {
        this.bg = "default";
        this.background = defaultColor;
      } else if (value >= 30 && value <= 37) {
        this.fg = String(value - 30);
        this.foreground = { type: "ansi", index: value - 30 };
      } else if (value >= 40 && value <= 47) {
        this.bg = String(value - 40);
        this.background = { type: "ansi", index: value - 40 };
      } else if (value >= 90 && value <= 97) {
        this.fg = String(value - 90 + 8);
        this.foreground = { type: "ansi", index: value - 90 + 8 };
      } else if (value >= 100 && value <= 107) {
        this.bg = String(value - 100 + 8);
        this.background = { type: "ansi", index: value - 100 + 8 };
      } else if (value === 38 || value === 48) {
        const color = this.parseExtendedColor(values, index);
        if (color) {
          if (value === 38) this.foreground = color;
          else this.background = color;
          index += color.type === "rgb" ? 4 : 2;
        }
      }
    }
  }

  private parseExtendedColor(values: number[], index: number): TerminalColor | undefined {
    const mode = values[index + 1];
    if (mode === 5) {
      const colorIndex = values[index + 2];
      return colorIndex === undefined ? undefined : { type: "ansi", index: colorIndex };
    }
    if (mode === 2) {
      const r = values[index + 2];
      const g = values[index + 3];
      const b = values[index + 4];
      return r === undefined || g === undefined || b === undefined ? undefined : { type: "rgb", r, g, b };
    }
    return undefined;
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
    this.history = this.history
      .map((row) => {
        const resized = Array.from({ length: this.cols }, blank);
        for (let column = 0; column < Math.min(this.cols, row.length); column++) resized[column] = row[column]!;
        return resized;
      })
      .slice(-this.scrollback);
    this.viewportOffset = 0;
  }

  setViewport(offset: number): void {
    const maxOffset = Math.max(0, this.history.length);
    this.viewportOffset = Math.max(0, Math.min(maxOffset, Math.floor(offset)));
  }

  scrollViewport(delta: number): void {
    this.setViewport(this.viewportOffset + Math.trunc(delta));
  }

  get viewport(): { offset: number; height: number; totalRows: number } {
    return { offset: this.viewportOffset, height: this.rows, totalRows: this.history.length + this.rows };
  }

  /**
   * Selection uses absolute row coordinates (0 = top of scrollback), matching
   * the viewer's pointer math. Visible cells are the last `rows` of the buffer,
   * so absolute row `r` maps to visible row `r - (totalRows - rows)`.
   */
  select(from: SelectionPoint, to: SelectionPoint): Selection {
    const totalRows = this.history.length + this.rows;
    const clamp = (point: SelectionPoint) => ({
      x: Math.max(0, Math.min(this.cols - 1, point.x)),
      y: Math.max(0, Math.min(totalRows - 1, point.y)),
    });
    const start = clamp(from);
    const end = clamp(to);
    this.selection = { start, end };
    return this.selection;
  }

  clearSelection(): void {
    this.selection = undefined;
  }

  getSelection(): Selection | undefined {
    return this.selection;
  }

  /**
   * Returns whether a private mode was negotiated with the application.
   * Examples: "2026" (bracketed paste), "1004" (focus reporting), "1006" (SGR mouse),
   * "2004" (bracketed paste, alternate), "1049" (alternate screen).
   */
  isModeEnabled(mode: string): boolean {
    return this.modes.get(mode) === true;
  }

  /**
   * Returns the text spanning the current selection across the full buffer
   * (scrollback + visible rows). The selection is clamped to the buffer.
   */
  selectedText(): string {
    if (!this.selection) return "";
    const rows = [...this.history, ...this.cells];
    const { start, end } = this.selection;
    const first = start.y < end.y || (start.y === end.y && start.x <= end.x) ? start : end;
    const last = first === start ? end : start;
    const lines: string[] = [];
    for (let y = first.y; y <= last.y; y++) {
      const row = rows[y]!;
      const left = Math.max(0, Math.min(row.length, y === first.y ? first.x : 0));
      const right = Math.max(left, Math.min(row.length, y === last.y ? last.x + 1 : row.length));
      lines.push(
        row
          .slice(left, right)
          .map((cell) => cell.char)
          .join("")
          .replace(/\s+$/, ""),
      );
    }
    return lines.join("\n");
  }

  snapshot(mode: Snapshot["mode"] = "text"): Snapshot {
    const allRows = [...this.history, ...this.cells];
    const end = allRows.length - this.viewportOffset;
    const visibleRows = allRows.slice(Math.max(0, end - this.rows), end);
    const text = visibleRows
      .map((row) =>
        row
          .map((cell) => cell.char)
          .join("")
          .replace(/\s+$/, ""),
      )
      .join("\n");
    const colorUsage = this.collectColorUsage();
    const base = {
      cols: this.cols,
      rows: this.rows,
      cursor: {
        x: this.x,
        y: this.y - this.viewportOffset,
        visible: this.cursorVisible && this.viewportOffset === 0,
      },
      viewport: this.viewport,
      colorUsage,
      selection: this.selection,
      modes: Object.fromEntries(this.modes),
    };
    if (mode === "text") return { mode, ...base, text };
    if (mode === "raw")
      return {
        mode,
        ...base,
        text,
        cells: visibleRows.map((row) => row.map((cell) => ({ ...cell }))),
        scrollback: this.history.map((row) => row.map((cell) => ({ ...cell }))),
      };
    const tree = parseSemantic(visibleRows, this.cols, this.rows);
    const actions = suggestActions(tree);
    return { mode, ...base, text, tree: { ...tree, colorUsage }, actions };
  }

  private collectColorUsage(): Snapshot["colorUsage"] {
    const entries = new Map<string, { color: TerminalColor; cells: Array<{ x: number; y: number }> }>();
    for (let y = 0; y < this.cells.length; y++) {
      for (let x = 0; x < this.cells[y]!.length; x++) {
        const cell = this.cells[y]![x]!;
        for (const color of [cell.foreground ?? defaultColor, cell.background ?? defaultColor]) {
          const key = JSON.stringify(color);
          const entry = entries.get(key) ?? { color, cells: [] };
          if (cell.char !== " " || color.type !== "default") entry.cells.push({ x, y });
          entries.set(key, entry);
        }
      }
    }
    return [...entries.values()].map(({ color, cells }) => ({
      color,
      count: cells.length,
      regions: cells.length
        ? [
            {
              x: Math.min(...cells.map((cell) => cell.x)),
              y: Math.min(...cells.map((cell) => cell.y)),
              width: Math.max(...cells.map((cell) => cell.x)) - Math.min(...cells.map((cell) => cell.x)) + 1,
              height: Math.max(...cells.map((cell) => cell.y)) - Math.min(...cells.map((cell) => cell.y)) + 1,
            },
          ]
        : [],
    }));
  }
}

/**
 * Wraps `text` in bracketed-paste guard sequences when the application
 * negotiated mode 2004. Pure function so the behavior is unit-testable
 * without a PTY; the session delegates to it.
 */
export function wrapBracketedPaste(text: string, bracketed: boolean): string {
  return bracketed ? `\x1b[200~${text}\x1b[201~` : text;
}
