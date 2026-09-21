import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { spawn as spawnPty } from "bun-pty";
import type {
  SessionInfo,
  SessionOptions,
  SignalName,
  Snapshot,
  TerminalEvent,
  MouseEvent as TerminalMouseEvent,
} from "../types";
import { TerminalEmulator } from "./emulator";

const keySequences = { CTRL_C: "\x03", CTRL_D: "\x04", CTRL_Z: "\x1a", ENTER: "\r", TAB: "\t" } as const;
type Key = keyof typeof keySequences;

export class TerminalSession {
  readonly id = randomUUID();
  readonly createdAt = Date.now();
  readonly emulator: TerminalEmulator;
  private status: SessionInfo["status"] = "running";
  private exitCode?: number;
  private eventsQueue: TerminalEvent[] = [];
  private waiters: ((event: TerminalEvent) => void)[] = [];
  private proc?: ReturnType<typeof spawnPty>;
  private readonly cwd: string;
  private readonly shell: string;
  private terminalQueryBuffer = "";
  private mouseSgrEnabled = false;
  private mouseModeBuffer = "";

  private constructor(options: SessionOptions) {
    this.cwd = options.cwd ?? process.cwd();
    this.shell = options.shell ?? process.env.SHELL ?? "/bin/sh";
    this.emulator = new TerminalEmulator(options.cols, options.rows);
  }

  static async create(options: SessionOptions = {}): Promise<TerminalSession> {
    const session = new TerminalSession(options);
    session.start();
    return session;
  }

  private start(): void {
    this.proc = spawnPty(this.shell, [], {
      cwd: this.cwd,
      name: "xterm-256color",
      cols: this.emulator.cols,
      rows: this.emulator.rows,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        COLUMNS: String(this.emulator.cols),
        LINES: String(this.emulator.rows),
      } as Record<string, string>,
    });
    this.proc.onData((data) => {
      this.mouseModeBuffer = (this.mouseModeBuffer + data).slice(-128);
      this.mouseSgrEnabled ||= /\x1b\[\?1006h/.test(this.mouseModeBuffer);
      this.emulator.feed(data);
      this.respondToTerminalQueries(data);
      this.emit({ type: "data", data });
    });
    this.emulator.onChange(() => this.emit({ type: "screen", snapshot: this.snapshot("text") }));
    this.proc.onExit(({ exitCode }) => {
      this.status = "exited";
      this.exitCode = exitCode;
      this.emit({ type: "exit", exitCode });
    });
  }

  private respondToTerminalQueries(data: string): void {
    if (!this.proc) return;
    this.terminalQueryBuffer += data;
    const responses: string[] = [];
    const snapshot = this.snapshot("text");
    const cursor = `\x1b[${snapshot.cursor.y + 1};${snapshot.cursor.x + 1}R`;
    if (this.terminalQueryBuffer.includes("\x1b[6n")) responses.push(cursor);
    if (this.terminalQueryBuffer.includes("\x1b[5n")) responses.push("\x1b[0n");
    if (this.terminalQueryBuffer.includes("\x1b[c") || this.terminalQueryBuffer.includes("\x1b[0c"))
      responses.push("\x1b[?1;2c");
    if (this.terminalQueryBuffer.includes("\x1b[>c")) responses.push("\x1b[>0;276;0c");
    if (this.terminalQueryBuffer.includes("\x1b[14t"))
      responses.push(`\x1b[4;${this.emulator.rows * 16};${this.emulator.cols * 8}t`);
    for (const mode of this.terminalQueryBuffer.matchAll(/\x1b\[\?(\d+)\$p/g)) responses.push(`\x1b[?${mode[1]};1$y`);
    for (const query of this.terminalQueryBuffer.matchAll(/\x1bP\+q([0-9a-f]+)\x1b\\/g))
      responses.push(`\x1bP1+r${query[1]}=1b\x1b\\`);
    this.terminalQueryBuffer = this.terminalQueryBuffer.slice(-128);
    if (responses.length) this.proc.write(responses.join(""));
  }

  private emit(partial: Omit<TerminalEvent, "id" | "sessionId" | "timestamp">): void {
    const event = { ...partial, id: randomUUID(), sessionId: this.id, timestamp: Date.now() };
    const waiter = this.waiters.shift();
    if (waiter) waiter(event);
    else this.eventsQueue.push(event);
  }

  info(): SessionInfo {
    return {
      id: this.id,
      status: this.status,
      pid: this.proc?.pid,
      cwd: this.cwd,
      shell: this.shell,
      cols: this.emulator.cols,
      rows: this.emulator.rows,
      exitCode: this.exitCode,
      createdAt: this.createdAt,
    };
  }
  async write(data: string | Uint8Array): Promise<void> {
    if (!this.proc) throw new Error("session not started");
    this.proc.write(typeof data === "string" ? data : new TextDecoder().decode(data));
  }
  async sendKey(key: Key): Promise<void> {
    await this.write(keySequences[key]);
  }
  signal(signal: SignalName): void {
    this.proc?.kill(signal);
  }
  resize(cols: number, rows: number): void {
    this.emulator.resize(cols, rows);
    this.proc?.resize(this.emulator.cols, this.emulator.rows);
  }
  snapshot(mode: Snapshot["mode"] = "text"): Snapshot {
    return this.emulator.snapshot(mode);
  }

  private detectClipboardTool(): string | null {
    const tools = [
      { name: "xclip", check: "xclip -version" },
      { name: "xsel", check: "xsel --version" },
      { name: "wl-copy", check: "wl-copy --version" },
    ];
    for (const tool of tools) {
      try {
        execSync(tool.check, { stdio: "ignore" });
        return tool.name;
      } catch {}
    }
    return null;
  }

  private encodeMouseEvent(event: TerminalMouseEvent): string {
    let code = event.button === "right" ? 2 : event.button === "middle" ? 1 : 0;
    if (event.shift) code |= 4;
    if (event.meta) code |= 8;
    if (event.ctrl) code |= 16;
    if (event.type === "move") code = 35;
    // OpenTUI enables all-motion tracking and expects the SGR motion code
    // used by xterm-compatible terminals for an unpressed pointer.
    const x = Math.max(1, Math.min(this.emulator.cols, event.x + 1));
    const y = Math.max(1, Math.min(this.emulator.rows, event.y + 1));
    return `\x1b[<${code};${x};${y}${event.type === "release" ? "m" : "M"}`;
  }

  async click(x: number, y: number, button: "left" | "middle" | "right" = "left"): Promise<void> {
    await this.write(this.encodeMouseEvent({ type: "press", button, x, y: y - 1 }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    await this.write(this.encodeMouseEvent({ type: "release", button, x, y: y - 1 }));
  }

  async mouseMove(x: number, y: number): Promise<void> {
    await this.write(this.encodeMouseEvent({ type: "move", button: "left", x, y: y - 1 }));
  }

  async drag(from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
    // Real drag: press at from, move to to, release at to
    await this.write(this.encodeMouseEvent({ type: "press", button: "left", x: from.x, y: from.y }));
    await this.write(this.encodeMouseEvent({ type: "move", button: "left", x: to.x, y: to.y }));
    await this.write(this.encodeMouseEvent({ type: "release", button: "left", x: to.x, y: to.y }));
  }

  async copyToClipboard(text: string): Promise<boolean> {
    const tool = this.detectClipboardTool();
    if (!tool) return false;
    try {
      const proc = Bun.spawn([tool, "-selection", "clipboard"], { stdio: ["pipe", "inherit", "inherit"] });
      proc.stdin.write(text);
      proc.stdin.end();
      await proc.exited;
      return true;
    } catch {
      return false;
    }
  }

  async pasteFromClipboard(): Promise<void> {
    const tool = this.detectClipboardTool();
    if (!tool) return;
    try {
      const proc = Bun.spawn([tool, "-selection", "clipboard", "-o"], {
        stdio: ["inherit", "pipe", "inherit"],
      });
      const result = await proc.exited;
      if (result === 0) {
        const output = await new Response(proc.stdout).text();
        if (output) await this.write(output);
      }
    } catch {
      // Clipboard not available
    }
  }

  async paste(text: string): Promise<void> {
    await this.write(text);
  }

  async waitForText(text: string, timeout = 10000): Promise<void> {
    if (this.snapshot("text").text?.includes(text)) return;
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const event = await this.nextEvent(Math.max(1, end - Date.now()));
      if (event.type === "screen" && event.snapshot?.text?.includes(text)) return;
    }
    throw new Error(`Timed out waiting for text: ${text}`);
  }

  private nextEvent(timeout: number): Promise<TerminalEvent> {
    if (this.eventsQueue.length) return Promise.resolve(this.eventsQueue.shift()!);
    return new Promise((resolve, reject) => {
      const timer = Number.isFinite(timeout)
        ? setTimeout(() => reject(new Error("event timeout")), timeout)
        : undefined;
      this.waiters.push((event) => {
        if (timer) clearTimeout(timer);
        resolve(event);
      });
    });
  }

  async *events(): AsyncGenerator<TerminalEvent> {
    while (this.status !== "closed" && this.status !== "exited") {
      yield await this.nextEvent(Infinity);
    }
  }
  close(): void {
    if (this.status !== "closed" && this.status !== "exited") {
      this.proc?.kill("SIGTERM");
      this.status = "closed";
    }
  }
}
