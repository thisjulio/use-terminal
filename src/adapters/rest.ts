import { TerminalManager } from "../core/manager";
import type { SessionOptions, Snapshot } from "../types";

export const DEFAULT_VERSION = "0.1.0";
const DEFAULT_HOST = "127.0.0.1";

async function handleRequest(request: Request, manager: TerminalManager): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/health") return Response.json({ ok: true, version: DEFAULT_VERSION });
  if (url.pathname === "/sessions" && request.method === "POST")
    return Response.json((await manager.create((await request.json()) as SessionOptions)).info(), { status: 201 });
  if (url.pathname === "/sessions" && request.method === "GET") return Response.json(manager.list());
  const match = url.pathname.match(/^\/sessions\/([^/]+)(?:\/(snapshot|input|signal|resize|stream|close))?$/);
  if (!match) return new Response("Not found", { status: 404 });
  const session = manager.get(match[1]!);
  if (match[2] === "snapshot")
    return Response.json(session.snapshot((url.searchParams.get("mode") as Snapshot["mode"]) || "text"));
  if (match[2] === "input" && request.method === "POST") {
    await session.write(await request.text());
    return Response.json({ ok: true });
  }
  if (match[2] === "close" && request.method === "DELETE") {
    session.close();
    return Response.json({ ok: true });
  }
  if (match[2] === "signal" && request.method === "POST") {
    const signal = (await request.text()) as Parameters<typeof session.signal>[0];
    session.signal(signal);
    return Response.json({ ok: true });
  }
  if (match[2] === "resize" && request.method === "POST") {
    const body = (await request.json()) as { cols: number; rows: number };
    session.resize(body.cols, body.rows);
    return Response.json(session.info());
  }
  if (match[2] === "stream" && request.method === "GET") {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of session.events()) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          }
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
  }
  return Response.json(session.info());
}

export function createRestServer(manager = new TerminalManager(), port = 0) {
  return Bun.serve({
    port,
    hostname: DEFAULT_HOST,
    fetch: async (request) => {
      try {
        return await handleRequest(request, manager);
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
      }
    },
  });
}
