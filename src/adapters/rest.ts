import { TerminalManager } from "../core/manager";
import type { SessionOptions, Snapshot, TerminalEvent, MouseEvent as TerminalMouseEvent } from "../types";

export const DEFAULT_VERSION = "0.1.0";
const DEFAULT_HOST = "127.0.0.1";
type ViewerSocketData = { sessionId: string; iterator?: AsyncGenerator<TerminalEvent>; closed: boolean };

async function pumpViewer(socket: Bun.ServerWebSocket<ViewerSocketData>, manager: TerminalManager): Promise<void> {
  const session = manager.get(socket.data.sessionId);
  socket.send(JSON.stringify({ type: "snapshot", snapshot: session.snapshot("raw") }));
  const iterator = session.events("raw");
  socket.data.iterator = iterator;
  try {
    for await (const event of iterator) {
      if (socket.data.closed) break;
      if (socket.send(JSON.stringify(event)) === 0) break;
    }
  } catch {
    if (!socket.data.closed) socket.close(1011, "viewer stream failed");
  }
}

function websocketMessage(
  socket: Bun.ServerWebSocket<ViewerSocketData>,
  session: ReturnType<TerminalManager["get"]>,
  message: string,
): Promise<void> {
  const payload = JSON.parse(message) as
    | { type: "input"; data: string }
    | { type: "mouse"; event: TerminalMouseEvent }
    | { type: "resize"; cols: number; rows: number }
    | { type: "viewport"; offset?: number; delta?: number };
  if (payload.type === "input") return session.write(payload.data);
  if (payload.type === "mouse") {
    if (payload.event.type === "click")
      return session.click(payload.event.x, payload.event.y, payload.event.button ?? "left");
    if (payload.event.type === "move") return session.mouseMove(payload.event.x, payload.event.y);
    if (payload.event.type === "wheel") {
      if (!session.isMouseReportingEnabled()) {
        session.scrollViewport(payload.event.delta && payload.event.delta > 0 ? 1 : -1);
        socket.send(JSON.stringify({ type: "snapshot", snapshot: session.snapshot("raw") }));
        return Promise.resolve();
      }
      return session.mouseWheel(payload.event.x, payload.event.y, payload.event.delta ?? 0);
    }
    if (payload.event.type === "press") return session.mousePress(payload.event);
    if (payload.event.type === "release") return session.mouseRelease(payload.event);
    return Promise.reject(new Error("unsupported mouse event"));
  }
  if (payload.type === "resize") {
    session.resize(payload.cols, payload.rows);
    return Promise.resolve();
  }
  if (payload.type === "viewport") {
    socket.send(
      JSON.stringify({
        type: "snapshot",
        snapshot: payload.delta ? session.scrollViewport(payload.delta) : session.setViewport(payload.offset ?? 0),
      }),
    );
    return Promise.resolve();
  }
  return Promise.reject(new Error("unsupported viewer message"));
}

function viewerHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>use-terminal viewer</title>
<style>html,body{margin:0;background:#111;color:#ddd;font:14px system-ui,sans-serif;height:100%;overflow:hidden}
body{display:flex;flex-direction:column}header{padding:10px 14px;background:#1d2229;display:flex;gap:16px}
canvas{margin:20px;image-rendering:auto;align-self:flex-start;box-shadow:0 8px 30px #000;background:#1e2229;user-select:none}
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
let latestSnapshot;
let selection = null;
const font = "13px 'DejaVu Sans Mono','Liberation Mono','Noto Color Emoji','Apple Color Emoji',sans-serif";
const ansi = ["#000","#800000","#008000","#808000","#000080","#800080","#008080","#c0c0c0","#808080","#f00","#0f0","#ff0","#00f","#f0f","#0ff","#fff"];
function color(value, fallback) {
  if (!value || value.type === "default") return fallback;
  if (value.type === "rgb") return "rgb(" + value.r + "," + value.g + "," + value.b + ")";
  return ansi[value.index % ansi.length] || fallback;
}
 function draw(snapshot) {
  if (!snapshot || !snapshot.cells) return;
  latestSnapshot = snapshot;
 canvas.width = snapshot.cols * cellWidth; canvas.height = snapshot.rows * cellHeight;
 canvas.style.width = canvas.width + "px"; canvas.style.height = canvas.height + "px";
  ctx.fillStyle = "#1e2229"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = font; ctx.textBaseline = "alphabetic";
  for (let y = 0; y < snapshot.cells.length; y++) for (let x = 0; x < snapshot.cells[y].length; x++) {
    const cell = snapshot.cells[y][x];
    if (cell.background && cell.background.type !== "default") {
      ctx.fillStyle = color(cell.background, "#1e2229");
      ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
    }
    const code = cell.char.charCodeAt(0);
    const isHighSurrogate = cell.char.length === 1 && code >= 0xd800 && code <= 0xdbff;
    const isLowSurrogate = cell.char.length === 1 && code >= 0xdc00 && code <= 0xdfff;
    if (isLowSurrogate) continue;
    const glyph = isHighSurrogate && snapshot.cells[y][x + 1]
      ? cell.char + snapshot.cells[y][x + 1].char
      : cell.char;
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
  if (selection) {
    ctx.fillStyle = "rgba(100, 160, 255, .35)";
    const start = {...selection.start, y: selection.start.y - (snapshot.viewport?.offset ?? 0)};
    const end = {...selection.end, y: selection.end.y - (snapshot.viewport?.offset ?? 0)};
    const first = start.y < end.y || (start.y === end.y && start.x <= end.x) ? start : end;
    const last = first === start ? end : start;
    for (let y = first.y; y <= last.y; y++) {
      const left = y === first.y ? first.x : 0;
      const right = y === last.y ? last.x + 1 : snapshot.cols;
      ctx.fillRect(left * cellWidth, y * cellHeight, Math.max(0, right - left) * cellWidth, cellHeight);
    }
  }
}
let socket;
function connect() {
  socket = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/sessions/" + encodeURIComponent(id) + "/ws");
  socket.onopen = () => status.textContent = "live";
  socket.onclose = () => { status.textContent = "reconnecting…"; setTimeout(connect, 500); };
  socket.onerror = () => { status.textContent = "disconnected"; };
  socket.onmessage = event => {
    const value = JSON.parse(event.data);
    if (value.type === "snapshot" || value.type === "screen") draw(value.snapshot);
  };
}
function send(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}
canvas.tabIndex = 0;
canvas.addEventListener("mousedown", () => canvas.focus());
function handleKey(event) {
  const named = {
    Enter: "\\r", Tab: "\\t", Backspace: "\\x7f", Escape: "\\x1b",
    ArrowUp: "\\x1b[A", ArrowDown: "\\x1b[B", ArrowRight: "\\x1b[C", ArrowLeft: "\\x1b[D",
    Home: "\\x1b[H", End: "\\x1b[F", Insert: "\\x1b[2~", Delete: "\\x1b[3~",
    PageUp: "\\x1b[5~", PageDown: "\\x1b[6~", F1: "\\x1bOP", F2: "\\x1bOQ",
    F3: "\\x1bOR", F4: "\\x1bOS", F5: "\\x1b[15~", F6: "\\x1b[17~",
    F7: "\\x1b[18~", F8: "\\x1b[19~", F9: "\\x1b[20~", F10: "\\x1b[21~",
    F11: "\\x1b[23~", F12: "\\x1b[24~"
  };
  let data = named[event.key];
  if (event.ctrlKey && event.key.length === 1 && /^[a-z]$/i.test(event.key))
    data = String.fromCharCode(event.key.toUpperCase().charCodeAt(0) - 64);
  if (!data && event.key.length === 1 && !event.metaKey) data = event.key;
  if (data) { event.preventDefault(); send({type: "input", data}); }
}
canvas.addEventListener("keydown", handleKey);
window.addEventListener("keydown", event => {
  if (document.activeElement === canvas) return;
  handleKey(event);
});
 function point(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.floor((event.clientX - rect.left) / cellWidth) + 1,
    y: Math.floor((event.clientY - rect.top) / cellHeight)
  };
 }
 function absolutePoint(event) {
   const current = point(event);
   return {...current, y: current.y + (latestSnapshot?.viewport?.offset ?? 0)};
 }
 function clampPoint(value) {
  return {
    x: Math.max(0, Math.min((latestSnapshot?.cols ?? 1) - 1, value.x - 1)),
    y: Math.max(0, Math.min((latestSnapshot?.viewport?.totalRows ?? latestSnapshot?.rows ?? 1) - 1, value.y))
  };
}
function selectedText() {
  if (!latestSnapshot || !selection) return "";
    const start = selection.start;
    const end = selection.end;
    const history = latestSnapshot.scrollback || [];
    const rows = [...history, ...latestSnapshot.cells];
  const first = start.y < end.y || (start.y === end.y && start.x <= end.x) ? start : end;
  const last = first === start ? end : start;
  const lines = [];
    for (let y = first.y; y <= last.y; y++) {
      const left = y === first.y ? first.x : 0;
      const right = y === last.y ? last.x + 1 : latestSnapshot.cols;
      lines.push(rows[y].slice(left, right).map(cell => cell.char).join("").replace(/\\s+$/u, ""));
  }
  return lines.join("\\n");
}
let dragging = false;
let selecting = false;
 let pointerStart;
 let autoScrollTimer;
 function updateAutoScroll(event) {
   if (!selecting || !latestSnapshot?.viewport) return;
   const rect = canvas.getBoundingClientRect();
   const edge = 24;
   const direction = event.clientY < rect.top + edge ? 1 : event.clientY > rect.bottom - edge ? -1 : 0;
   if (!direction) {
     if (autoScrollTimer) { clearInterval(autoScrollTimer); autoScrollTimer = undefined; }
     return;
   }
   if (!autoScrollTimer) autoScrollTimer = setInterval(() => send({type: "viewport", delta: direction}), 80);
 }
canvas.addEventListener("mousedown", event => {
  event.preventDefault(); canvas.focus();
    pointerStart = absolutePoint(event);
  if (!event.shiftKey && event.button === 0) {
    selection = null;
    selecting = false;
    draw(latestSnapshot);
  } else if (event.shiftKey && event.button === 0) {
    selection = {start: clampPoint(absolutePoint(event)), end: clampPoint(absolutePoint(event))};
    selecting = true;
    draw(latestSnapshot);
  }
  if (autoScrollTimer) { clearInterval(autoScrollTimer); autoScrollTimer = undefined; }
  send({type: "mouse", event: {...point(event), type: "press", button: event.button === 2 ? "right" : "left", shift: event.shiftKey, ctrl: event.ctrlKey, meta: event.metaKey}});
});
canvas.addEventListener("mousemove", event => {
  if (!selecting && pointerStart && event.buttons === 1 && event.button !== 2) {
    const current = point(event);
    if (Math.abs(current.x - pointerStart.x) > 2 || Math.abs(current.y - pointerStart.y) > 2) {
      selection = {start: clampPoint(pointerStart), end: clampPoint(absolutePoint(event))};
      selecting = true;
    }
  }
  if (selecting) {
    selection.end = clampPoint(absolutePoint(event));
    draw(latestSnapshot);
    updateAutoScroll(event);
  }
  if (dragging)
    send({type: "mouse", event: {...point(event), type: "move", button: "left", shift: event.shiftKey, ctrl: event.ctrlKey, meta: event.metaKey}});
});
window.addEventListener("mouseup", event => {
  if (selecting) {
    selecting = false;
    selection.end = clampPoint(absolutePoint(event));
    if (selection.start.x === selection.end.x && selection.start.y === selection.end.y) selection = null;
    draw(latestSnapshot);
  }
  if (dragging) {
    dragging = false;
    send({type: "mouse", event: {...point(event), type: "release", button: "left", shift: event.shiftKey, ctrl: event.ctrlKey, meta: event.metaKey}});
  } else if (pointerStart) {
    send({type: "mouse", event: {...pointerStart, type: "release", button: event.button === 2 ? "right" : "left", shift: event.shiftKey, ctrl: event.ctrlKey, meta: event.metaKey}});
  }
  pointerStart = undefined;
});
 canvas.addEventListener("wheel", event => {
  event.preventDefault();
  if (latestSnapshot?.viewport && latestSnapshot.viewport.totalRows > latestSnapshot.rows && !event.shiftKey) {
    send({type:"viewport", delta: event.deltaY > 0 ? 1 : -1});
  } else {
    send({type:"mouse", event:{...point(event), type:"wheel", delta:event.deltaY, button:"left"}});
  }
}, {passive: false});
canvas.addEventListener("copy", event => {
  const text = selectedText();
  if (text) {
    event.clipboardData?.setData("text/plain", text);
    event.preventDefault();
  }
});
window.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && selection) {
    const text = selectedText();
    if (text && navigator.clipboard?.writeText) void navigator.clipboard.writeText(text);
    event.preventDefault();
  }
});
canvas.addEventListener("contextmenu", event => event.preventDefault());
if (!id) { status.textContent = "missing session parameter"; }
else {
  connect();
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
    /^\/sessions\/([^/]+)(?:\/(snapshot|screenshot|input|mouse|signal|resize|viewport|stream|close|viewer|ws))?$/,
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
    else if (event.type === "wheel") {
      if (!session.isMouseReportingEnabled()) session.scrollViewport(event.delta && event.delta > 0 ? 1 : -1);
      else await session.mouseWheel(event.x, event.y, event.delta ?? 0);
    } else if (event.type === "press") await session.mousePress(event);
    else if (event.type === "release") await session.mouseRelease(event);
    else return Response.json({ error: "unsupported mouse event" }, { status: 400 });
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
  if (match[2] === "viewport" && request.method === "POST") {
    const body = (await request.json()) as { offset?: number; delta?: number };
    if (body.delta !== undefined) session.scrollViewport(body.delta);
    else session.setViewport(body.offset ?? 0);
    return Response.json(session.snapshot("raw"));
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
  let server: Bun.Server<ViewerSocketData>;
  server = Bun.serve({
    port,
    hostname: DEFAULT_HOST,
    idleTimeout: 0,
    websocket: {
      data: {} as ViewerSocketData,
      open(socket) {
        void pumpViewer(socket, manager);
      },
      async message(socket, message) {
        try {
          await websocketMessage(socket, manager.get(socket.data.sessionId), String(message));
        } catch {
          socket.send(JSON.stringify({ type: "error", error: "invalid viewer message" }));
        }
      },
      close(socket) {
        socket.data.closed = true;
        void socket.data.iterator?.return(undefined);
      },
    },
    fetch: async (request) => {
      const url = new URL(request.url);
      const wsMatch = url.pathname.match(/^\/sessions\/([^/]+)\/ws$/);
      if (wsMatch) {
        try {
          if (server.upgrade(request, { data: { sessionId: wsMatch[1]!, closed: false } })) return;
          return new Response("WebSocket upgrade failed", { status: 400 });
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 404 });
        }
      }
      try {
        return await handleRequest(request, manager);
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
      }
    },
  });
  return server;
}
