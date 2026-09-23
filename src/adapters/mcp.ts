import { Buffer } from "node:buffer";
import { COMPONENT_SCHEMAS, MCP_TOOL_NAMES, ROUTES } from "../contracts";
import { TerminalManager } from "../core/manager";
import type { TerminalSession } from "../core/session";
import type { SessionOptions, SignalName, Snapshot, MouseEvent as TerminalMouseEvent } from "../types";
import { DEFAULT_VERSION } from "./rest";

export type McpTool = { name: string; description: string; inputSchema: Record<string, unknown> };

export type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

const PROTOCOL_VERSION = "2025-06-18";

function inlineComponentRefs(value: unknown, resolving = new Set<string>()): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => inlineComponentRefs(item, resolving));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const object = value as Record<string, unknown>;
  const reference = object.$ref;

  if (typeof reference === "string" && reference.startsWith("#/components/schemas/")) {
    const name = reference.slice("#/components/schemas/".length);
    const schema = COMPONENT_SCHEMAS[name];

    if (!schema) {
      throw new Error(`Unknown component schema: ${name}`);
    }

    if (resolving.has(name)) {
      throw new Error(`Recursive component schema: ${name}`);
    }

    const nextResolving = new Set(resolving);
    nextResolving.add(name);
    const { $ref: _ignored, ...siblings } = object;

    return inlineComponentRefs({ ...schema, ...siblings }, nextResolving);
  }

  return Object.fromEntries(
    Object.entries(object).map(([key, child]) => [key, inlineComponentRefs(child, resolving)]),
  );
}

function toolResult(value: unknown): { content: { type: "text"; text: string }[]; isError?: boolean } {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }] };
}

function toolError(message: string): { content: { type: "text"; text: string }[]; isError: boolean } {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function mcpTools(): McpTool[] {
  return ROUTES.filter((route) => route.mcpTool).map((route) => {
    const tool = route.mcpTool!;
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: inlineComponentRefs(tool.inputSchema) as Record<string, unknown>,
    };
  });
}

async function callTool(name: string, args: Record<string, unknown>, manager: TerminalManager): Promise<unknown> {
  const sessionId = args.sessionId as string | undefined;
  const sessionOf = (fn: (session: TerminalSession) => unknown): unknown => {
    if (!sessionId) throw new Error("sessionId is required");
    return fn(manager.get(sessionId));
  };

  switch (name) {
    case "sessions_list":
      return manager.list();
    case "sessions_create":
      return (await manager.create((args ?? {}) as SessionOptions)).info();
    case "sessions_info":
      return sessionOf((session) => session.info());
    case "sessions_snapshot":
      return sessionOf((session) => session.snapshot((args.mode as Snapshot["mode"]) ?? "text"));
    case "sessions_screenshot": {
      const format = (args.format as "svg" | "png") ?? "svg";
      const options = { cellWidth: Number(args.cellWidth ?? 8), cellHeight: Number(args.cellHeight ?? 16) };
      return sessionOf((session) => {
        if (format === "png") {
          const bytes = session.screenshotBytes("png", options);
          return { format, dataBase64: Buffer.from(bytes).toString("base64") };
        }
        return {
          format,
          dataBase64: Buffer.from(new TextEncoder().encode(session.screenshot(options))).toString("base64"),
        };
      });
    }
    case "sessions_input":
      return sessionOf(async (session) => {
        await session.write(String(args.data ?? ""));
        return { ok: true };
      });
    case "sessions_key":
      return sessionOf(async (session) => {
        const key = args.key as string;
        if (!["ENTER", "TAB", "CTRL_C", "CTRL_D", "CTRL_Z"].includes(key))
          throw new Error("key must be ENTER, TAB, CTRL_C, CTRL_D or CTRL_Z");
        await session.sendKey(key as Parameters<typeof session.sendKey>[0]);
        return { ok: true };
      });
    case "sessions_type":
      return sessionOf(async (session) => {
        const text = String(args.text ?? "");
        await session.type(text, Boolean(args.submit));
        return { ok: true };
      });
    case "sessions_mouse":
      return sessionOf(async (session) => {
        const event = args as unknown as TerminalMouseEvent;
        if (event.type === "click") await session.click(event.x, event.y, event.button ?? "left");
        else if (event.type === "move") await session.mouseMove(event.x, event.y);
        else if (event.type === "wheel") {
          if (!session.isMouseReportingEnabled()) session.scrollViewport(event.delta && event.delta > 0 ? 1 : -1);
          else await session.mouseWheel(event.x, event.y, event.delta ?? 0);
        } else if (event.type === "press") await session.mousePress(event);
        else if (event.type === "release") await session.mouseRelease(event);
        else throw new Error("unsupported mouse event");
        return { ok: true };
      });
    case "sessions_drag":
      return sessionOf(async (session) => {
        const { from, to } = args as { from: { x: number; y: number }; to: { x: number; y: number } };
        await session.drag(from, to);
        return { ok: true };
      });
    case "sessions_viewport":
      return sessionOf((session) => {
        if (args.delta !== undefined) return session.scrollViewport(Number(args.delta));
        return session.setViewport(Number(args.offset ?? 0));
      });
    case "sessions_wait":
      return sessionOf(async (session) => {
        const text = String(args.text ?? "");
        const timeoutMs = Number(args.timeoutMs ?? 10000);
        await session.waitForText(text, timeoutMs);
        return { ok: true, text };
      });
    case "sessions_events":
      return sessionOf((session) =>
        session.collectEvents(Number(args.maxEvents ?? 50), Number(args.timeoutMs ?? 2000)),
      );
    case "sessions_signal":
      return sessionOf((session) => {
        const signal = args.signal as SignalName;
        if (!["SIGINT", "SIGTERM", "SIGKILL", "SIGTSTP", "SIGHUP"].includes(signal)) throw new Error("invalid signal");
        session.signal(signal);
        return { ok: true };
      });
    case "sessions_resize":
      return sessionOf((session) => {
        session.resize(Number(args.cols), Number(args.rows));
        return session.info();
      });
    case "sessions_clipboard_copy":
      return sessionOf(async (session) => ({
        ok: true,
        copied: await session.copyToClipboard(String(args.text ?? "")),
      }));
    case "sessions_clipboard_paste":
      return sessionOf(async (session) => {
        await session.pasteFromClipboard();
        return { ok: true, pasted: true };
      });
    case "sessions_close":
      return sessionOf((session) => {
        session.close();
        return { ok: true };
      });
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

export async function handleMcpMessage(
  request: JsonRpcRequest,
  manager: TerminalManager,
): Promise<JsonRpcResponse | null> {
  const id = request.id ?? null;
  const method = request.method;
  try {
    if (method === "initialize")
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "use-terminal-mcp", version: DEFAULT_VERSION },
        },
      };
    if (method === "notifications/initialized" || method === "notifications/cancelled") return null;
    if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
    if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: mcpTools() } };
    if (method === "tools/call") {
      const params = request.params as { name: string; arguments?: Record<string, unknown> } | undefined;
      if (!params?.name)
        return { jsonrpc: "2.0", id, error: { code: -32602, message: "invalid params: name required" } };
      try {
        const result = await callTool(params.name, params.arguments ?? {}, manager);
        return { jsonrpc: "2.0", id, result: toolResult(result) };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { jsonrpc: "2.0", id, result: toolError(message), isError: true } as JsonRpcResponse & {
          isError?: boolean;
        };
      }
    }
    if (method.includes("/") && MCP_TOOL_NAMES.includes(method.replace(/\//g, "_"))) {
      // Compatibility with the legacy contract (method direto, ex.: "sessions/create").
      const result = await callTool(method.replace(/\//g, "_"), request.params ?? {}, manager);
      return { jsonrpc: "2.0", id, result: toolResult(result) };
    }
    return { jsonrpc: "2.0", id, error: { code: -32601, message: `unknown method: ${method}` } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { jsonrpc: "2.0", id, error: { code: -32603, message } };
  }
}

/**
 * Compatibility with the package's legacy contract: `handleMcp({ method, params })`.
 * Kept for existing tests and legacy integrations; the recommended path is
 * `runMcpStdio` (JSON-RPC stdio) or REST.
 */
export async function handleMcp(
  message: { method: string; params?: Record<string, unknown> },
  manager = new TerminalManager(),
): Promise<unknown> {
  const params = message.params ?? {};
  const legacy: Record<string, [string, Record<string, unknown>]> = {
    "sessions/create": ["sessions_create", params],
    "sessions/list": ["sessions_list", {}],
  };
  const legacyMatch = message.method.match(/^sessions\/([^/]+)\/(snapshot|close|input|signal|resize)$/);
  let tool: string | undefined;
  let args: Record<string, unknown> = {};
  if (message.method === "health") return { ok: true, version: DEFAULT_VERSION };
  if (legacy[message.method]) [tool, args] = legacy[message.method]!;
  else if (legacyMatch) {
    const id = legacyMatch[1]!;
    const op = legacyMatch[2]!;
    tool = `sessions_${op === "close" ? "close" : op}`;
    args =
      op === "snapshot"
        ? { sessionId: id, mode: (params as { mode?: Snapshot["mode"] }).mode }
        : { ...params, sessionId: id };
    if (op === "input") args = { sessionId: id, data: String(params.input ?? "") };
    if (op === "signal") args = { sessionId: id, signal: params.signal };
  }
  if (!tool) throw new Error(`unknown method: ${message.method}`);
  return callTool(tool, args, manager);
}

export function runMcpStdio(
  manager = new TerminalManager(),
  readable?: ReadableStream<Uint8Array>,
  writer?: (bytes: Uint8Array) => void,
): void {
  const input = readable ?? Bun.stdin.stream();
  const out = writer ?? ((bytes: Uint8Array) => Bun.stdout.write(bytes));
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  const send = (response: JsonRpcResponse | null) => {
    if (response) out(encoder.encode(`${JSON.stringify(response)}\n`));
  };

  const pump = async (chunk: Uint8Array) => {
    buffer += decoder.decode(chunk, { stream: true });
    for (;;) {
      const index = buffer.indexOf("\n");
      if (index === -1) return;
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      let request: JsonRpcRequest;
      try {
        request = JSON.parse(line) as JsonRpcRequest;
      } catch {
        send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
        continue;
      }
      void handleMcpMessage(request, manager).then(send);
    }
  };

  const reader = input.getReader();
  void (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await pump(value);
    }
  })();
}
