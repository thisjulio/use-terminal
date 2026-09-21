import { TerminalManager } from "../core/manager";
import type { McpMessage } from "../types";
import { DEFAULT_VERSION } from "./rest";

export async function handleMcp(message: McpMessage, manager = new TerminalManager()) {
  if (message.method === "health") return { ok: true, version: DEFAULT_VERSION };
  if (message.method === "sessions/create") return (await manager.create(message.params)).info();
  if (message.method === "sessions/list") return manager.list();
  const match = message.method.match(/^sessions\/([^/]+)\/(snapshot|close|input|signal|resize)$/);
  if (match) {
    const session = manager.get(match[1]!);
    if (match[2] === "close") {
      session.close();
      return { ok: true };
    }
    if (match[2] === "input") {
      await session.write(String(message.params?.input ?? ""));
      return { ok: true };
    }
    if (match[2] === "signal") {
      session.signal(message.params?.signal as Parameters<typeof session.signal>[0]);
      return { ok: true };
    }
    if (match[2] === "resize") {
      session.resize(message.params?.cols ?? session.info().cols, message.params?.rows ?? session.info().rows);
      return session.info();
    }
    return session.snapshot((message.params as { mode?: "text" | "raw" | "semantic" } | undefined)?.mode);
  }
  throw new Error(`unknown method: ${message.method}`);
}
