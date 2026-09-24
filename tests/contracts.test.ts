import { describe, expect, test } from "bun:test";
import { createRestServer, handleMcpMessage, mcpTools, TerminalManager } from "../index";
import { buildOpenApiDocument } from "../src/adapters/openapi";
import type { JsonSchema, RestRoute } from "../src/contracts";
import { COMPONENT_SCHEMAS, MCP_TOOL_NAMES, ROUTES } from "../src/contracts";

function toolNames(): string[] {
  return mcpTools().map((tool) => tool.name);
}

function mcpExpectedProps(route: RestRoute): string[] {
  const input = route.mcpTool!.inputSchema;
  const props = Object.keys(input.properties ?? {});
  return props.filter((name) => name !== "sessionId");
}

function restExpectedProps(route: RestRoute): string[] {
  if (route.requestBody) {
    if (route.requestBody.type === "string") {
      // REST accepts a plain string body; MCP uses the corresponding property.
      if (route.id === "session_input") return ["data"];
      if (route.id === "session_signal") return ["signal"];
      return [];
    }
    if (route.requestBody.$ref === "#/components/schemas/SessionOptions")
      return schemaProperties(COMPONENT_SCHEMAS.SessionOptions);
    if (route.requestBody.$ref === "#/components/schemas/MouseEvent")
      return schemaProperties(COMPONENT_SCHEMAS.MouseEvent);
    return Object.keys(route.requestBody.properties ?? {});
  }
  return (route.queryParams ?? []).map((param) => param.name);
}

function schemaProperties(schema: JsonSchema | undefined): string[] {
  return Object.keys(schema?.properties ?? {});
}

describe("MCP/REST/OpenAPI contracts", () => {
  test("all MCP tools correspond to a documented REST route", () => {
    const routeByTool = new Map(ROUTES.map((route) => [route.mcpTool?.name, route]));
    for (const name of toolNames()) {
      const route = routeByTool.get(name);
      expect(route).toBeDefined();
      expect(route!.mcpTool?.name).toBe(name);
    }
  });

  test("MCP_TOOL_NAMES matches tools/list", () => {
    expect(toolNames().sort()).toEqual([...MCP_TOOL_NAMES].sort());
  });

  test("all MCP tools declare an object inputSchema", () => {
    for (const tool of mcpTools()) expect(tool.inputSchema.type).toBe("object");
  });

  test("MCP schemas match REST parameters (body/query)", () => {
    const mismatch: string[] = [];
    for (const route of ROUTES) {
      if (!route.mcpTool) continue;
      const mcpProps = mcpExpectedProps(route).sort();
      const restProps = restExpectedProps(route).sort();
      if (mcpProps.join(",") !== restProps.join(","))
        mismatch.push(`${route.id}: mcp=[${mcpProps}] rest=[${restProps}]`);
    }
    expect(mismatch).toEqual([]);
  });

  test("OpenAPI contains all routes and shared schemas", () => {
    const doc = buildOpenApiDocument("/") as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };
    const pathMethod = (path: string, method: string) => doc.paths[path]?.[method];
    expect(doc.paths["/health"]).toBeDefined();
    expect(doc.paths["/sessions"]).toBeDefined();
    expect(pathMethod("/sessions/{sessionId}", "get")).toBeDefined();
    expect(pathMethod("/sessions/{sessionId}/input", "post")).toBeDefined();
    expect(pathMethod("/sessions/{sessionId}/type", "post")).toBeDefined();
    expect(pathMethod("/sessions/{sessionId}/wait", "post")).toBeDefined();
    expect(pathMethod("/sessions/{sessionId}/events", "get")).toBeDefined();
    expect(pathMethod("/sessions/{sessionId}/stream", "get")).toBeDefined();
    expect(pathMethod("/sessions/{sessionId}/viewport", "post")).toBeDefined();
    expect(pathMethod("/sessions/{sessionId}/mouse", "post")).toBeDefined();
    expect(pathMethod("/sessions/{sessionId}/screenshot", "get")).toBeDefined();
    expect(pathMethod("/sessions/{sessionId}/clipboard/copy", "post")).toBeDefined();
    expect(pathMethod("/sessions/{sessionId}/close", "delete")).toBeDefined();
    expect(pathMethod("/docs/openapi.json", "get")).toBeDefined();
    expect(doc.components.schemas.SessionInfo).toBeDefined();
    expect(doc.components.schemas.MouseEvent).toBeDefined();
    expect(doc.components.schemas.Snapshot).toBeDefined();
  });

  test("handleMcpMessage responds to initialize, tools/list, and tools/call", async () => {
    const manager = new TerminalManager();
    const init = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "initialize" }, manager);
    const initResult = init?.result as { protocolVersion: string; serverInfo: { name: string } };
    expect(typeof initResult.protocolVersion).toBe("string");
    expect(initResult.serverInfo.name).toBe("use-terminal-mcp");
    const list = await handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, manager);
    const tools = (list!.result as { tools: { name: string }[] }).tools;
    expect(tools.map((tool) => tool.name).sort()).toEqual(toolNames().sort());
    const unknown = await handleMcpMessage({ jsonrpc: "2.0", id: 3, method: "nada/que/existe" }, manager);
    expect(unknown?.error?.code).toBe(-32601);
  });

  test("MCP stdio completes the full cycle (create → type → wait → snapshot → close)", async () => {
    const proc = Bun.spawn(["bun", "src/mcp.ts"], { stdio: ["pipe", "pipe", "inherit"] });
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = proc.stdout.getReader();
    let buffer = "";
    let sessionId = "";

    const lines = [
      { jsonrpc: "2.0", id: 1, method: "initialize" },
      { jsonrpc: "2.0", id: 2, method: "notifications/initialized" },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "sessions_create", arguments: { shell: "/bin/sh", cols: 40, rows: 10 } },
      },
    ];
    for (const line of lines) proc.stdin.write(encoder.encode(`${JSON.stringify(line)}\n`));

    const responses = new Map<number, unknown>();
    const deadline = Date.now() + 20000;
    for (;;) {
      if (Date.now() > deadline) throw new Error("timeout reading MCP stdio");
      const { done, value } = await reader.read();
      if (done) throw new Error("MCP stdout closed before responding");
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        const index = buffer.indexOf("\n");
        if (index === -1) break;
        const message = JSON.parse(buffer.slice(0, index)) as {
          id?: number;
          result?: { content: { text: string }[] };
          error?: { message: string };
        };
        buffer = buffer.slice(index + 1);
        if (typeof message.id !== "number") continue;
        responses.set(message.id, message.result ?? message.error);
      }
      if (responses.has(1) && responses.has(3)) break;
      if (responses.size >= 3) break;
    }
    expect(responses.get(1)).toBeInstanceOf(Object);
    const created = JSON.parse((responses.get(3) as { content: { text: string }[] }).content[0]!.text) as {
      id: string;
    };
    sessionId = created.id;

    const action = {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "sessions_type", arguments: { sessionId, text: "printf 'mcp-stdio-ok\\n'" } },
    };
    proc.stdin.write(encoder.encode(`${JSON.stringify(action)}\n`));
    const nextDeadline = Date.now() + 20000;
    for (;;) {
      if (Date.now() > nextDeadline) throw new Error("timeout in sessions_type");
      const { done, value } = await reader.read();
      if (done) throw new Error("stdout closed");
      buffer += decoder.decode(value, { stream: true });
      const index = buffer.indexOf("\n");
      if (index === -1) continue;
      const message = JSON.parse(buffer.slice(0, index)) as { id?: number; result?: { content: { text: string }[] } };
      buffer = buffer.slice(index + 1);
      if (message.id === 4) {
        expect(JSON.parse(message.result!.content[0]!.text)).toEqual({ ok: true });
        break;
      }
    }

    const wait = {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "sessions_wait", arguments: { sessionId, text: "mcp-stdio-ok" } },
    };
    proc.stdin.write(encoder.encode(`${JSON.stringify(wait)}\n`));
    const waitDeadline = Date.now() + 30000;
    for (;;) {
      if (Date.now() > waitDeadline) throw new Error("timeout in sessions_wait");
      const { done, value } = await reader.read();
      if (done) throw new Error("stdout closed");
      buffer += decoder.decode(value, { stream: true });
      const index = buffer.indexOf("\n");
      if (index === -1) continue;
      const message = JSON.parse(buffer.slice(0, index)) as { id?: number; result?: { content: { text: string }[] } };
      buffer = buffer.slice(index + 1);
      if (message.id === 5) {
        const result = JSON.parse(message.result!.content[0]!.text) as { ok: boolean; text: string };
        expect(result.ok).toBe(true);
        expect(result.text).toBe("mcp-stdio-ok");
        break;
      }
    }

    const close = {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "sessions_close", arguments: { sessionId } },
    };
    proc.stdin.write(encoder.encode(`${JSON.stringify(close)}\n`));
    const closeDeadline = Date.now() + 20000;
    for (;;) {
      if (Date.now() > closeDeadline) throw new Error("timeout in sessions_close");
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const index = buffer.indexOf("\n");
      if (index === -1) continue;
      const message = JSON.parse(buffer.slice(0, index)) as { id?: number; result?: { content: { text: string }[] } };
      buffer = buffer.slice(index + 1);
      if (message.id === 6) {
        expect(JSON.parse(message.result!.content[0]!.text)).toEqual({ ok: true });
        break;
      }
    }
    proc.kill();
  }, 60000);

  test("REST exposes /docs (Swagger UI) and /docs/openapi.json", async () => {
    const server = createRestServer(new TerminalManager(), 0);
    const base = `http://${server.hostname}:${server.port}`;
    const doc = await fetch(`${base}/docs/openapi.json`);
    expect(doc.status).toBe(200);
    const json = (await doc.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(json.openapi).toBe("3.1.0");
    expect(json.paths["/sessions/{sessionId}/wait"]).toBeDefined();
    const html = await fetch(`${base}/docs`);
    expect(html.status).toBe(200);
    const text = await html.text();
    expect(text).toContain("swagger-ui");
    expect(text).toContain("/docs/openapi.json");
    server.stop();
  });

  test("REST high-level: type+Enter, key, wait, events, and clipboard", async () => {
    const manager = new TerminalManager();
    const session = await manager.create({ shell: "/bin/sh", cols: 40, rows: 10 });
    const server = createRestServer(manager, 0);
    const base = `http://${server.hostname}:${server.port}`;
    const id = session.id;

    const type = await fetch(`${base}/sessions/${id}/type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "printf 'rest-ok\\n'", submit: true }),
    });
    expect(type.status).toBe(200);
    await session.waitForText("rest-ok");

    const key = await fetch(`${base}/sessions/${id}/key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "ENTER" }),
    });
    expect(key.status).toBe(200);
    const badKey = await fetch(`${base}/sessions/${id}/key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "F42" }),
    });
    expect(badKey.status).toBe(400);

    const wait = await fetch(`${base}/sessions/${id}/wait`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "rest-ok" }),
    });
    expect(wait.status).toBe(200);
    expect(await wait.json()).toMatchObject({ ok: true, text: "rest-ok" });

    const timeout = await fetch(`${base}/sessions/${id}/wait`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "isso-nao-vai-aparecer", timeoutMs: 500 }),
    });
    expect(timeout.status).toBe(504);

    const events = await fetch(`${base}/sessions/${id}/events?maxEvents=5&timeoutMs=500`);
    expect(events.status).toBe(200);
    const eventsBody = (await events.json()) as { events: { type: string }[] };
    expect(Array.isArray(eventsBody.events)).toBe(true);

    const copy = await fetch(`${base}/sessions/${id}/clipboard/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "clip" }),
    });
    expect(copy.status).toBe(200);
    const copyBody = (await copy.json()) as { ok: boolean; copied: boolean };
    expect(copyBody.ok).toBe(true);
    expect(typeof copyBody.copied).toBe("boolean");

    session.close();
    server.stop();
  }, 30000);

  test("REST/MCP parity: wait/change resolves on change and times out idle", async () => {
    const manager = new TerminalManager();
    const session = await manager.create({ shell: "/bin/sh", cols: 40, rows: 10 });
    const server = createRestServer(manager, 0);
    const base = `http://${server.hostname}:${server.port}`;
    const id = session.id;

    await session.waitForText("$", 5000);

    // A real change: type a command, then the REST wait/change must resolve.
    await session.type("printf 'wait-change-ok\\n'", true);
    const changed = await fetch(`${base}/sessions/${id}/wait/change`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeoutMs: 5000 }),
    });
    expect(changed.status).toBe(200);
    expect(await changed.json()).toEqual({ ok: true });

    // Idle: nothing changes, so the REST wait/change must time out with 504.
    const idle = await fetch(`${base}/sessions/${id}/wait/change`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeoutMs: 100 }),
    });
    expect(idle.status).toBe(504);
    expect(((await idle.json()) as { error: string }).error).toContain("Timed out");

    // MCP parity: the same operation is callable through the MCP adapter and
    // surfaces the idle timeout as a tool error (isError).
    const mcp = await handleMcpMessage(
      {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "sessions_wait_change", arguments: { sessionId: id, timeoutMs: 100 } },
      },
      manager,
    );
    expect(mcp).not.toBeNull();
    const mcpResult = mcp as { result?: { content: { text: string }[]; isError?: boolean } };
    expect(mcpResult.result!.isError).toBe(true);
    expect(mcpResult.result!.content[0]!.text).toContain("Timed out");
    session.close();
    server.stop();
  }, 30000);

  test("REST/MCP parity: /key named keys and /action", async () => {
    const manager = new TerminalManager();
    const session = await manager.create({ shell: "/bin/sh", cols: 40, rows: 10 });
    const server = createRestServer(manager, 0);
    const base = `http://${server.hostname}:${server.port}`;
    const id = session.id;
    await session.waitForText("$", 5000);

    // REST: named key via the unified /key route is accepted.
    const namedKey = await fetch(`${base}/sessions/${id}/key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "ARROW_UP" }),
    });
    expect(namedKey.status).toBe(200);
    expect(await namedKey.json()).toEqual({ ok: true });

    // REST: /action executes the `type` action.
    const action = await fetch(`${base}/sessions/${id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "type", text: "printf 'action-parity\\n'" }),
    });
    expect(action.status).toBe(200);
    expect(await action.json()).toEqual({ ok: true });

    // REST: /action rejects an unknown id with a stable 400.
    const badAction = await fetch(`${base}/sessions/${id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "nada" }),
    });
    expect(badAction.status).toBe(400);
    const badBody = (await badAction.json()) as { error: string };
    expect(badBody.error).toContain("unsupported action");

    // MCP: sessions_key accepts a named key (same bytes as REST).
    const mcpKey = await handleMcpMessage(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "sessions_key", arguments: { sessionId: id, key: "ARROW_UP" } },
      },
      manager,
    );
    const mcpKeyResult = mcpKey as { result?: { content: { text: string }[]; isError?: boolean } };
    expect(mcpKeyResult.result!.isError).toBeFalsy();
    expect(JSON.parse(mcpKeyResult.result!.content[0]!.text)).toEqual({ ok: true });

    // MCP: sessions_action executes the `type` action (same as REST).
    const mcpAction = await handleMcpMessage(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "sessions_action",
          arguments: { sessionId: id, id: "type", text: "printf 'mcp-action-parity\\n'" },
        },
      },
      manager,
    );
    const mcpActionResult = mcpAction as { result?: { content: { text: string }[]; isError?: boolean } };
    expect(mcpActionResult.result!.isError).toBeFalsy();
    expect(JSON.parse(mcpActionResult.result!.content[0]!.text)).toEqual({ ok: true });

    session.close();
    server.stop();
  }, 30000);

  test("REST selection parity: select, text, clear", async () => {
    const manager = new TerminalManager();
    const session = await manager.create({ shell: "/bin/sh", cols: 40, rows: 10 });
    const server = createRestServer(manager, 0);
    const base = `http://${server.hostname}:${server.port}`;
    const id = session.id;

    // Wait for the shell prompt before typing; without this the bytes can be
    // written before the shell is ready to read, which is racy on slower CI.
    await session.waitForText("$", 5000);

    // Use echo with a unique token: the output line is a standalone exact
    // match that cannot collide with the command echo. Poll the raw snapshot
    // until that exact line renders.
    const token = "select-parity-xyz";
    await session.type(`echo '${token}'`, true);
    const deadline = Date.now() + 5000;
    let visibleRow = -1;
    let raw = session.snapshot("raw");
    while (Date.now() < deadline) {
      visibleRow = (raw.cells ?? []).findIndex(
        (line) =>
          line
            .map((cell) => cell.char)
            .join("")
            .trim() === token,
      );
      if (visibleRow >= 0) break;
      await new Promise((r) => setTimeout(r, 25));
      raw = session.snapshot("raw");
    }
    expect(visibleRow).toBeGreaterThanOrEqual(0);
    // Absolute row 0 is the oldest (top of scrollback); the visible rows are
    // the last `rows` rows.
    const visibleOffset = (raw.viewport?.totalRows ?? 0) - raw.rows;
    const absRow = visibleOffset + visibleRow;

    const select = await fetch(`${base}/sessions/${id}/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: { x: 0, y: absRow }, to: { x: token.length, y: absRow } }),
    });
    expect(select.status).toBe(200);
    const selection = (await select.json()) as { start: { x: number; y: number }; end: { x: number; y: number } };
    expect(selection.start).toMatchObject({ x: 0, y: absRow });
    expect(selection.end).toMatchObject({ x: token.length, y: absRow });

    const text = await fetch(`${base}/sessions/${id}/selection`);
    expect(text.status).toBe(200);
    const textBody = (await text.json()) as { text: string };
    expect(textBody.text).toContain(token);

    const clear = await fetch(`${base}/sessions/${id}/selection/clear`, { method: "POST" });
    expect(clear.status).toBe(200);
    expect(await clear.json()).toEqual({ ok: true });

    const textAfter = await fetch(`${base}/sessions/${id}/selection`);
    const textAfterBody = (await textAfter.json()) as { text: string };
    expect(textAfterBody.text).toBe("");

    session.close();
    server.stop();
  }, 30000);

  test("OpenAPI document matches the route table", () => {
    const doc = buildOpenApiDocument("/") as { paths: Record<string, Record<string, unknown>> };
    for (const route of ROUTES) {
      const openApiPath = route.path.replaceAll("{id}", "{sessionId}");
      expect(doc.paths[openApiPath]![route.method.toLowerCase()]).toBeDefined();
    }
  });
});
