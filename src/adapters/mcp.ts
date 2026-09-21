import { TerminalManager } from "../core/manager";
import type { McpMessage } from "../types";
import { DEFAULT_VERSION } from "./rest";

export async function handleMcp(message: McpMessage, manager = new TerminalManager()) {
  if (message.method === "health") return { ok: true, version: DEFAULT_VERSION };
  if (message.method === "sessions/create") return (await manager.create(message.params)).info();
  if (message.method === "sessions/list") return manager.list();
  throw new Error(`unknown method: ${message.method}`);
}
