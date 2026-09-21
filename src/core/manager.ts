import type { SessionInfo, SessionOptions } from "../types";
import { TerminalSession } from "./session";

export class TerminalManager {
  private readonly sessions = new Map<string, TerminalSession>();

  async create(options: SessionOptions = {}): Promise<TerminalSession> {
    const session = await TerminalSession.create(options);
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): TerminalSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error("session not found");
    return session;
  }

  list(): SessionInfo[] {
    return [...this.sessions.values()].map((session) => session.info());
  }

  close(id: string): void {
    const session = this.get(id);
    session.close();
  }

  remove(id: string): void {
    const session = this.get(id);
    session.close();
    this.sessions.delete(id);
  }
}
