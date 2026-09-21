import { randomUUID } from "node:crypto";
import { type IPty, spawn as spawnPty } from "node-pty";
import type { SessionInfo, SessionOptions, SignalName, Snapshot, TerminalEvent } from "../types";
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
  private proc?: IPty;
  private readonly cwd: string;
  private readonly shell: string;

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
      env: process.env,
    });
    this.proc.onData((data) => {
      this.emulator.feed(data);
      this.emit({ type: "data", data });
      this.emit({ type: "screen", snapshot: this.snapshot("text") });
    });
    this.proc.onExit(({ exitCode }) => {
      this.status = "exited";
      this.exitCode = exitCode;
      this.emit({ type: "exit", exitCode });
    });
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
      const timer = setTimeout(() => reject(new Error("event timeout")), timeout);
      this.waiters.push((event) => {
        clearTimeout(timer);
        resolve(event);
      });
    });
  }

  async *events(): AsyncGenerator<TerminalEvent> {
    while (this.status !== "exited" || this.eventsQueue.length) yield await this.nextEvent(60000);
  }
  close(): void {
    if (this.status === "running") this.proc?.kill("SIGTERM");
    this.status = "closed";
  }
}
