import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { spawn as spawnPty } from "bun-pty";
import type {
  Selection,
  SelectionPoint,
  SessionInfo,
  SessionOptions,
  SignalName,
  Snapshot,
  TerminalEvent,
  MouseEvent as TerminalMouseEvent,
} from "../types";
import { TerminalEmulator, wrapBracketedPaste } from "./emulator";
import { namedKeySequence } from "./keys";
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
  private waiters: Array<{
    resolve: (event: TerminalEvent) => void;
    reject: (error: Error) => void;
  }> = [];
  private screenWaiters: Array<{
    text: string;
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];
  private screenChangeWaiters: Array<{
    version: number;
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];
  private screenVersion = 0;
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
      this.screenVersion++;
      const snapshot = this.snapshot("text");
      this.emit({ type: "screen", snapshot });
      for (const waiter of [...this.screenWaiters]) {
        if (!snapshot.text?.includes(waiter.text)) continue;
        clearTimeout(waiter.timer);
        waiter.resolve();
      }
      for (const waiter of [...this.screenChangeWaiters]) {
        if (this.screenVersion <= waiter.version) continue;
        waiter.resolve();
      }
    });
    this.proc.onExit(({ exitCode }) => {
      this.status = "exited";
      this.exitCode = exitCode;
      this.emit({ type: "exit", exitCode });
      this.rejectScreenWaiters("Session exited before text appeared");
      this.rejectScreenChangeWaiters("Session exited");
      this.rejectEventWaiters("Session exited");
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
    if (waiter) waiter.resolve(event);
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

  /**
   * Sends a mapped key by name, dispatching to the control-key map
   * (`sendKey`) or the named-key map (`pressKey`). Used by the REST and MCP
   * adapters so a single unified key name reaches the same bytes everywhere.
   */
  async sendMappedKey(name: string): Promise<void> {
    const control = keySequences[name as Key];
    if (control !== undefined) {
      await this.write(control);
      return;
    }
    await this.pressKey(name);
  }

  /**
   * Sends a named key (arrows, function keys, Home/End, PageUp/Down, ESC,
   * Insert/Delete) by writing its VT/ANSI escape sequence. Named keys are
   * distinct from `sendKey`'s control keys, which map to pure control bytes.
   * Throws when the key name is not recognized.
   */
  async pressKey(name: string): Promise<void> {
    const sequence = namedKeySequence(name);
    if (sequence === null) throw new Error(`unknown key: ${name}`);
    await this.write(sequence);
  }

  /**
   * Executes a high-level semantic action by id with explicit parameters.
   * Only the deterministic `press-key` and `type` actions are supported; they
   * map directly to bytes and require no snapshot resolution.
   */
  async performAction(id: string, params: { key?: string; text?: string; submit?: boolean } = {}): Promise<void> {
    switch (id) {
      case "press-key":
        if (typeof params.key !== "string") throw new Error("press-key requires `key`");
        return this.pressKey(params.key);
      case "type":
        if (typeof params.text !== "string") throw new Error("type requires `text`");
        return this.type(params.text, Boolean(params.submit));
      default:
        throw new Error(`unsupported action: ${id}`);
    }
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
        if (output) await this.paste(output);
      }
    } catch {
      // Clipboard not available
    }
  }

  /**
   * Writes text to the PTY. When the application negotiated bracketed paste
   * (private mode 2004), the text is wrapped in the \x1b[200~ ... \x1b[201~ guard
   * so multi-line content is pasted as data, not interpreted as commands.
   */
  async paste(text: string): Promise<void> {
    await this.write(wrapBracketedPaste(text, this.emulator.isModeEnabled("2004")));
  }

  /**
   * Selects the screen region from `from` to `to` using absolute row
   * coordinates (0 = top of scrollback). The selection is stored in the
   * emulator and surfaced in raw/semantic snapshots.
   */
  select(from: SelectionPoint, to: SelectionPoint): Selection {
    return this.emulator.select(from, to);
  }

  clearSelection(): void {
    this.emulator.clearSelection();
  }

  /** Returns the text spanning the current selection (may be empty). */
  selectedText(): string {
    return this.emulator.selectedText();
  }

  /**
   * Copies the current selection to the host clipboard. Returns false when no
   * clipboard tool is available or there is no selection.
   */
  async copySelectionToClipboard(): Promise<boolean> {
    const text = this.selectedText();
    if (!text) return false;
    return this.copyToClipboard(text);
  }

  /** Pastes the current selection into the PTY (respecting bracketed paste). */
  async pasteSelection(): Promise<void> {
    const text = this.selectedText();
    if (!text) return;
    await this.paste(text);
  }

  async waitForText(text: string, timeout = 10000): Promise<void> {
    if (this.snapshot("text").text?.includes(text)) return;
    if (this.status !== "running") throw new Error(`Session exited before text appeared: ${text}`);
    await new Promise<void>((resolve, reject) => {
      if (this.status !== "running") {
        reject(new Error(`Session exited before text appeared: ${text}`));
        return;
      }
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

  /**
   * Resolves as soon as the visible screen changes (any emulator change after
   * this call). Useful for waiting on TUIs and prompts that do not produce a
   * known text string. Rejects on timeout or when the session is no longer
   * running.
   */
  async waitForScreenChange(timeout = 10000): Promise<void> {
    if (this.status !== "running") throw new Error("Session is not running");
    const initialVersion = this.screenVersion;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const waiter = {
        version: initialVersion,
        resolve: () => {
          if (settled) return;
          settled = true;
          clearTimeout(waiter.timer);
          const index = this.screenChangeWaiters.indexOf(waiter);
          if (index >= 0) this.screenChangeWaiters.splice(index, 1);
          resolve();
        },
        reject: (error: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(waiter.timer);
          const index = this.screenChangeWaiters.indexOf(waiter);
          if (index >= 0) this.screenChangeWaiters.splice(index, 1);
          reject(error);
        },
        timer: undefined as unknown as ReturnType<typeof setTimeout>,
      };
      waiter.timer = setTimeout(
        () => {
          waiter.reject(new Error(`Timed out waiting for screen change`));
        },
        Math.max(0, timeout),
      );
      this.screenChangeWaiters.push(waiter);
      if (this.screenVersion > initialVersion) waiter.resolve();
    });
  }

  private nextEvent(timeout: number): Promise<TerminalEvent> {
    if (this.eventsQueue.length) return Promise.resolve(this.eventsQueue.shift()!);
    if (this.status === "closed" || this.status === "exited") {
      return Promise.resolve({} as TerminalEvent);
    }
    return new Promise((resolve, reject) => {
      let waiter: { resolve: (event: TerminalEvent) => void; reject: (error: Error) => void };
      const timer = Number.isFinite(timeout)
        ? setTimeout(() => {
            const index = this.waiters.indexOf(waiter);
            if (index >= 0) this.waiters.splice(index, 1);
            reject(new Error("event timeout"));
          }, timeout)
        : undefined;
      waiter = {
        resolve: (event) => {
          if (timer) clearTimeout(timer);
          resolve(event);
        },
        reject: (error) => {
          if (timer) clearTimeout(timer);
          reject(error);
        },
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
  private rejectScreenWaiters(message: string): void {
    for (const waiter of [...this.screenWaiters]) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(`${message}: ${waiter.text}`));
    }
  }
  private rejectScreenChangeWaiters(message: string): void {
    for (const waiter of this.screenChangeWaiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(message));
    }
  }
  private rejectEventWaiters(message: string): void {
    for (const waiter of this.waiters.splice(0)) waiter.reject(new Error(message));
  }
  close(): void {
    if (this.status !== "closed" && this.status !== "exited") {
      this.proc?.kill("SIGTERM");
      this.status = "closed";
      this.rejectScreenWaiters("Session closed before text appeared");
      this.rejectScreenChangeWaiters("Session closed");
      this.rejectEventWaiters("Session closed");
    }
  }
}
