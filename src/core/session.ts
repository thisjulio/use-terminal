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
import { renderScreenshot, type ScreenshotFormat, type ScreenshotOptions } from "./screenshot";

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
  private screenWaiters: Array<{
    text: string;
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];
  private proc?: ReturnType<typeof spawnPty>;
  private readonly cwd: string;
  private readonly shell: string;
  private readonly command?: string;
  private readonly args: string[];
  private readonly headed: boolean;
  private inputTail: Promise<void> = Promise.resolve();
  private terminalQueryBuffer = "";
  private mouseSgrEnabled = false;
  private mouseModeBuffer = "";

  private constructor(options: SessionOptions) {
    this.cwd = options.cwd ?? process.cwd();
    this.shell = options.shell ?? process.env.SHELL ?? "/bin/sh";
    this.command = options.command;
    this.args = options.args ?? [];
    this.headed = options.headed ?? false;
    this.emulator = new TerminalEmulator(options.cols, options.rows);
  }

  static async create(options: SessionOptions = {}): Promise<TerminalSession> {
    const session = new TerminalSession(options);
    session.start();
    return session;
  }

  private start(): void {
    this.proc = spawnPty(this.command ?? this.shell, this.command ? this.args : [], {
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
    this.emulator.onChange(() => {
      const snapshot = this.snapshot("text");
      this.emit({ type: "screen", snapshot });
      for (const waiter of [...this.screenWaiters]) {
        if (!snapshot.text?.includes(waiter.text)) continue;
        clearTimeout(waiter.timer);
        this.screenWaiters.splice(this.screenWaiters.indexOf(waiter), 1);
        waiter.resolve();
      }
    });
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
      headed: this.headed,
      pid: this.proc?.pid,
      cwd: this.cwd,
      shell: this.command ? `${this.command} ${this.args.join(" ")}` : this.shell,
      cols: this.emulator.cols,
      rows: this.emulator.rows,
      exitCode: this.exitCode,
      createdAt: this.createdAt,
    };
  }
  async write(data: string | Uint8Array): Promise<void> {
    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    const write = this.inputTail.then(() => {
      if (!this.proc) throw new Error("session not started");
      this.proc.write(text);
    });
    this.inputTail = write.then(
      () => undefined,
      () => undefined,
    );
    await write;
  }
  async type(text: string, submit = false): Promise<void> {
    await this.write(`${text}${submit ? "\r" : ""}`);
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
  setViewport(offset: number): Snapshot {
    this.emulator.setViewport(offset);
    return this.snapshot("raw");
  }
  scrollViewport(delta: number): Snapshot {
    this.emulator.scrollViewport(delta);
    return this.snapshot("raw");
  }
  isMouseReportingEnabled(): boolean {
    return this.mouseSgrEnabled;
  }
  screenshot(options: ScreenshotOptions = {}): string {
    return renderScreenshot(this.snapshot("raw"), "svg", options) as string;
  }
  screenshotBytes(format: Exclude<ScreenshotFormat, "svg">, options: ScreenshotOptions = {}): Uint8Array {
    return renderScreenshot(this.snapshot("raw"), format, options) as Uint8Array;
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

  encodeMouseEvent(event: TerminalMouseEvent): string {
    let code = event.button === "right" ? 2 : event.button === "middle" ? 1 : 0;
    if (event.shift) code |= 4;
    if (event.meta) code |= 8;
    if (event.ctrl) code |= 16;
    if (event.type === "move") code = 35;
    if (event.type === "wheel") code = event.delta && event.delta < 0 ? 65 : 64;
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

  async mouseWheel(x: number, y: number, delta: number): Promise<void> {
    await this.write(this.encodeMouseEvent({ type: "wheel", button: "left", x, y: y - 1, delta }));
  }

  async mousePress(event: Omit<TerminalMouseEvent, "type">): Promise<void> {
    await this.write(this.encodeMouseEvent({ ...event, type: "press" }));
  }

  async mouseRelease(event: Omit<TerminalMouseEvent, "type">): Promise<void> {
    await this.write(this.encodeMouseEvent({ ...event, type: "release" }));
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
    await new Promise<void>((resolve, reject) => {
      const waiter = {
        text,
        resolve: () => {
          this.screenWaiters.splice(this.screenWaiters.indexOf(waiter), 1);
          resolve();
        },
        reject: (error: Error) => {
          this.screenWaiters.splice(this.screenWaiters.indexOf(waiter), 1);
          reject(error);
        },
        timer: undefined as unknown as ReturnType<typeof setTimeout>,
      };
      waiter.timer = setTimeout(
        () => {
          waiter.reject(new Error(`Timed out waiting for text: ${text}`));
        },
        Math.max(0, timeout),
      );
      this.screenWaiters.push(waiter);
    });
  }

  private nextEvent(timeout: number): Promise<TerminalEvent> {
    if (this.eventsQueue.length) return Promise.resolve(this.eventsQueue.shift()!);
    return new Promise((resolve, reject) => {
      let waiter: (event: TerminalEvent) => void;
      const timer = Number.isFinite(timeout)
        ? setTimeout(() => {
            const index = this.waiters.indexOf(waiter);
            if (index >= 0) this.waiters.splice(index, 1);
            reject(new Error("event timeout"));
          }, timeout)
        : undefined;
      waiter = (event) => {
        if (timer) clearTimeout(timer);
        resolve(event);
      };
      this.waiters.push(waiter);
    });
  }

  async collectEvents(maxEvents = 50, timeoutMs = 2000): Promise<TerminalEvent[]> {
    const collected: TerminalEvent[] = this.eventsQueue.splice(0, maxEvents);
    const end = Date.now() + timeoutMs;
    while (collected.length < maxEvents && this.status === "running") {
      const remaining = end - Date.now();
      if (remaining <= 0) break;
      try {
        collected.push(await this.nextEvent(remaining));
      } catch {
        break;
      }
    }
    return collected;
  }

  async *events(snapshotMode: Snapshot["mode"] = "text"): AsyncGenerator<TerminalEvent> {
    while (this.status !== "closed" && this.status !== "exited") {
      const event = await this.nextEvent(Infinity);
      if (event.type === "screen" && event.snapshot) {
        yield { ...event, snapshot: this.snapshot(snapshotMode) };
      } else {
        yield event;
      }
    }
  }
  close(): void {
    if (this.status !== "closed" && this.status !== "exited") {
      this.proc?.kill("SIGTERM");
      this.status = "closed";
    }
  }
}
