import type { Cell, SemanticNode, Snapshot } from "../types";

const blank = (): Cell => ({ char: " ", fg: "default", bg: "default", bold: false, inverse: false });

export class TerminalEmulator {
  private cells: Cell[][];
  private x = 0;
  private y = 0;
  private fg = "default";
  private bg = "default";
  private bold = false;
  private inverse = false;

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
    for (let index = 0; index < text.length; index++) {
      const char = text[index]!;
      if (char === "\x1b") {
        const match = text.slice(index).match(/^\x1b\[([0-9;]*)([A-Za-z])/);
        if (match) {
          index += match[0].length - 1;
          this.handleCsi(match[1]!, match[2]!);
        }
        continue;
      }
      if (char === "\n") this.newLine();
      else if (char === "\r") this.x = 0;
      else if (char === "\b") this.x = Math.max(0, this.x - 1);
      else if (char >= " ") this.put(char);
    }
  }

  private handleCsi(params: string, code: string): void {
    const values = params ? params.split(";").map(Number) : [0];
    if (code === "H" || code === "f") {
      this.y = Math.max(0, (values[0] || 1) - 1);
      this.x = Math.max(0, (values[1] || 1) - 1);
    } else if (code === "J" && (values[0] === 2 || values[0] === 3)) this.cells = this.makeBuffer();
    else if (code === "K")
      for (let column = this.x; column < this.cols; column++) this.cells[this.y]![column] = blank();
    else if (code === "m") this.applyStyles(values);
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
    const base = { cols: this.cols, rows: this.rows, cursor: { x: this.x, y: this.y, visible: true } };
    if (mode === "text") return { mode, ...base, text };
    if (mode === "raw")
      return { mode, ...base, text, cells: this.cells.map((row) => row.map((cell) => ({ ...cell }))) };
    const children: SemanticNode[] = text
      .split("\n")
      .map((line) => ({ role: "line", confidence: 0.5, children: [{ role: "text", text: line, confidence: 1 }] }));
    return { mode, ...base, text, tree: { role: "terminal", confidence: 0.5, children } };
  }
}
