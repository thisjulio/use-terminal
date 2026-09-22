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
      // REST aceita body string puro; o MCP usa a propriedade correspondente.
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

describe("Contratos MCP/REST/OpenAPI", () => {
  test("todas as tools MCP correspondem a uma rota REST documentada", () => {
    const routeByTool = new Map(ROUTES.map((route) => [route.mcpTool?.name, route]));
    for (const name of toolNames()) {
      const route = routeByTool.get(name);
      expect(route).toBeDefined();
      expect(route!.mcpTool?.name).toBe(name);
    }
  });

  test("MCP_TOOL_NAMES coincide com tools/list", () => {
    expect(toolNames().sort()).toEqual([...MCP_TOOL_NAMES].sort());
  });

  test("todas as tools MCP declaram inputSchema object", () => {
    for (const tool of mcpTools()) expect(tool.inputSchema.type).toBe("object");
  });

  test("schemas MCP são equivalentes aos parâmetros REST (body/query)", () => {
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

  test("OpenAPI contém todas as rotas e schemas compartilhados", () => {
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

  test("handleMcpMessage responde initialize, tools/list e tools/call", async () => {
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

  test("MCP stdio executa ciclo completo (create → type → wait → snapshot → close)", async () => {
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
      if (Date.now() > deadline) throw new Error("timeout lendo MCP stdio");
      const { done, value } = await reader.read();
      if (done) throw new Error("stdout do MCP fechou antes de responder");
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
      if (Date.now() > nextDeadline) throw new Error("timeout em sessions_type");
      const { done, value } = await reader.read();
      if (done) throw new Error("stdout fechado");
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
      if (Date.now() > waitDeadline) throw new Error("timeout em sessions_wait");
      const { done, value } = await reader.read();
      if (done) throw new Error("stdout fechado");
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
      if (Date.now() > closeDeadline) throw new Error("timeout em sessions_close");
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

  test("REST expõe /docs (Swagger UI) e /docs/openapi.json", async () => {
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

  test("REST high-level: type+Enter, key, wait, events e clipboard", async () => {
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

  test("OpenAPI doc coincide com as rotas da tabela", () => {
    const doc = buildOpenApiDocument("/") as { paths: Record<string, Record<string, unknown>> };
    for (const route of ROUTES) {
      const openApiPath = route.path.replaceAll("{id}", "{sessionId}");
      expect(doc.paths[openApiPath]![route.method.toLowerCase()]).toBeDefined();
    }
  });
});
