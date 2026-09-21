import { TerminalManager } from "../core/manager";
import type { SessionOptions, Snapshot, MouseEvent as TerminalMouseEvent } from "../types";

export const DEFAULT_VERSION = "0.1.0";
const DEFAULT_HOST = "127.0.0.1";

function viewerHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>use-terminal viewer</title>
<style>html,body{margin:0;background:#111;color:#ddd;font:14px system-ui,sans-serif;height:100%}
body{display:flex;flex-direction:column}header{padding:10px 14px;background:#1d2229;display:flex;gap:16px}
canvas{margin:20px;image-rendering:auto;align-self:flex-start;box-shadow:0 8px 30px #000;background:#1e2229}
#status{color:#75d89b}</style></head>
<body><header><strong>use-terminal live viewer</strong><span id="status">connecting…</span></header>
<canvas id="screen"></canvas>
<script>
const params = new URLSearchParams(location.search);
const id = params.get("session");
const canvas = document.querySelector("#screen");
const ctx = canvas.getContext("2d");
const status = document.querySelector("#status");
const cellWidth = Number(params.get("cellWidth") || 8);
const cellHeight = Number(params.get("cellHeight") || 16);
const font = "13px 'DejaVu Sans Mono','Liberation Mono','Noto Color Emoji','Apple Color Emoji',sans-serif";
const ansi = ["#000","#800000","#008000","#808000","#000080","#800080","#008080","#c0c0c0","#808080","#f00","#0f0","#ff0","#00f","#f0f","#0ff","#fff"];
function color(value, fallback) {
  if (!value || value.type === "default") return fallback;
  if (value.type === "rgb") return "rgb(" + value.r + "," + value.g + "," + value.b + ")";
  return ansi[value.index % ansi.length] || fallback;
}
function draw(snapshot) {
  if (!snapshot || !snapshot.cells) return;
  canvas.width = snapshot.cols * cellWidth; canvas.height = snapshot.rows * cellHeight;
  ctx.fillStyle = "#1e2229"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = font; ctx.textBaseline = "alphabetic";
  for (let y = 0; y < snapshot.cells.length; y++) for (let x = 0; x < snapshot.cells[y].length; x++) {
    const cell = snapshot.cells[y][x];
    if (cell.background && cell.background.type !== "default") {
      ctx.fillStyle = color(cell.background, "#1e2229");
      ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
    }
    const next = snapshot.cells[y][x + 1];
    const code = cell.char.charCodeAt(0);
    const isHighSurrogate = cell.char.length === 1 && code >= 0xd800 && code <= 0xdbff;
    const isLowSurrogate = cell.char.length === 1 && code >= 0xdc00 && code <= 0xdfff;
    if (isLowSurrogate) continue;
    const glyph = isHighSurrogate && next ? cell.char + next.char : cell.char;
    if (glyph && glyph !== " ") {
      ctx.fillStyle = color(cell.foreground, "#d0d0d0");
      ctx.fillText(glyph, x * cellWidth, (y + 1) * cellHeight - 3);
    }
  }
  if (snapshot.cursor && snapshot.cursor.visible) {
    ctx.fillStyle = "#d0d0d0"; ctx.globalAlpha = .7;
    ctx.fillRect(snapshot.cursor.x * cellWidth, snapshot.cursor.y * cellHeight, cellWidth, cellHeight);
    ctx.globalAlpha = 1;
  }
}
async function send(path, body) {
  await fetch("/sessions/" + encodeURIComponent(id) + path, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body)
  });
}
canvas.tabIndex = 0;
canvas.addEventListener("keydown", event => {
  if (event.key === "Enter") { event.preventDefault(); send("/input", "\\r"); return; }
  if (event.key === "Backspace") { event.preventDefault(); send("/input", "\\x7f"); return; }
  if (event.key === "Tab") { event.preventDefault(); send("/input", "\\t"); return; }
  if (event.key.length === 1) {
    event.preventDefault();
    send("/input", event.key);
  }
});
canvas.addEventListener("click", event => {
  const rect = canvas.getBoundingClientRect();
  send("/mouse", {
    type: "click",
    button: "left",
    x: Math.floor((event.clientX - rect.left) / cellWidth) + 1,
    y: Math.floor((event.clientY - rect.top) / cellHeight) + 1
  });
});
if (!id) { status.textContent = "missing session parameter"; }
else {
  const source = new EventSource("/sessions/" + encodeURIComponent(id) + "/stream?mode=raw");
  source.onopen = () => status.textContent = "live";
  source.onerror = () => status.textContent = "disconnected";
  source.onmessage = event => { const value = JSON.parse(event.data); if (value.type === "screen") draw(value.snapshot); };
}
</script></body></html>`;
}

async function handleRequest(request: Request, manager: TerminalManager): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/health") return Response.json({ ok: true, version: DEFAULT_VERSION });
  if (url.pathname === "/viewer")
    return new Response(viewerHtml(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (url.pathname === "/sessions" && request.method === "POST")
    return Response.json((await manager.create((await request.json()) as SessionOptions)).info(), { status: 201 });
  if (url.pathname === "/sessions" && request.method === "GET") return Response.json(manager.list());
  const match = url.pathname.match(
    /^\/sessions\/([^/]+)(?:\/(snapshot|screenshot|input|mouse|signal|resize|stream|close|viewer))?$/,
  );
  if (!match) return new Response("Not found", { status: 404 });
  const session = manager.get(match[1]!);
  if ((match[2] === undefined || match[2] === "viewer") && request.method === "GET")
    return new Response(viewerHtml().replace('const id = params.get("session");', `const id = "${session.id}";`), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  if (match[2] === "snapshot")
    return Response.json(session.snapshot((url.searchParams.get("mode") as Snapshot["mode"]) || "text"));
  if (match[2] === "screenshot") {
    const format = url.searchParams.get("format") ?? "svg";
    const options = {
      cellWidth: Number(url.searchParams.get("cellWidth") ?? 8),
      cellHeight: Number(url.searchParams.get("cellHeight") ?? 16),
    };
    if (format === "svg")
      return new Response(session.screenshot(options), { headers: { "Content-Type": "image/svg+xml; charset=utf-8" } });
    if (format === "png")
      return new Response(session.screenshotBytes("png", options), { headers: { "Content-Type": "image/png" } });
    return Response.json({ error: "format must be svg or png" }, { status: 400 });
  }
  if (match[2] === "input" && request.method === "POST") {
    const contentType = request.headers.get("content-type") ?? "";
    const input = contentType.includes("application/json") ? ((await request.json()) as string) : await request.text();
    if (typeof input !== "string") return Response.json({ error: "input must be a string" }, { status: 400 });
    await session.write(input);
    return Response.json({ ok: true });
  }
  if (match[2] === "mouse" && request.method === "POST") {
    const event = (await request.json()) as TerminalMouseEvent;
    if (event.type === "click") await session.click(event.x, event.y, event.button ?? "left");
    else if (event.type === "move") await session.mouseMove(event.x, event.y);
    else return Response.json({ error: "mouse supports click and move" }, { status: 400 });
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
    const mode = (url.searchParams.get("mode") as Snapshot["mode"]) || "text";
    if (!["text", "raw", "semantic"].includes(mode))
      return Response.json({ error: "mode must be text, raw or semantic" }, { status: 400 });
    const stream = new ReadableStream({
      async start(controller) {
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            clearInterval(heartbeat);
          }
        }, 15_000);
        controller.enqueue(encoder.encode(": connected\n\n"));
        try {
          for await (const event of session.events(mode))
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // The browser may close an SSE connection while the session remains alive.
        } finally {
          clearInterval(heartbeat);
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
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
