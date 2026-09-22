import { describe, expect, test } from "bun:test";
import { createRestServer, handleMcp, redact, TerminalEmulator, TerminalManager, TerminalSession } from "./index";

describe("TerminalEmulator", () => {
  test("renders text and ANSI in a snapshot", () => {
    const e = new TerminalEmulator(10, 3);
    e.feed("\x1b[31mhello\x1b[0m\nworld");
    const raw = e.snapshot("raw");
    expect(e.snapshot("text").text).toContain("hello\nworld");
    expect(raw.cells?.[0]?.[0]?.fg).toBe("1");
  });
  test("preserves ANSI/RGB colors, attributes, and regional usage", () => {
    const e = new TerminalEmulator(20, 2);
    e.feed("\x1b[1;4;38;2;10;20;30;48;5;123mRGB\x1b[0m plain");
    const raw = e.snapshot("raw");
    expect(raw.cells?.[0]?.[0]?.foreground).toEqual({ type: "rgb", r: 10, g: 20, b: 30 });
    expect(raw.cells?.[0]?.[0]?.background).toEqual({ type: "ansi", index: 123 });
    expect(raw.cells?.[0]?.[0]?.bold).toBe(true);
    expect(raw.cells?.[0]?.[0]?.underline).toBe(true);
    expect(raw.colorUsage?.some((entry) => entry.color.type === "rgb" && entry.count >= 3)).toBe(true);
    expect(e.snapshot("semantic").tree?.colorUsage).toBeDefined();
  });
  test("moves the cursor, clears, and resizes", () => {
    const e = new TerminalEmulator(5, 2);
    e.feed("abc\x1b[2J");
    e.resize(8, 4);
    expect(e.snapshot("raw").cols).toBe(8);
  });
});

test("real PTY preserves output, dimensions, and interactive session", async () => {
  const s = await TerminalSession.create({ shell: "/bin/sh", cols: 40, rows: 5 });
  await s.write("printf 'pty-ok\\n'");
  await s.waitForText("pty-ok");
  s.resize(60, 8);
  expect(s.info().cols).toBe(60);
  expect(s.info().rows).toBe(8);
  expect(s.info().status).toBe("running");
  s.close();
});

test("manager, redaction, and MCP share the contract", async () => {
  const m = new TerminalManager();
  const result = await handleMcp({ method: "health" }, m);
  expect(result).toEqual({ ok: true, version: "0.1.0" });
  expect(redact("token=abc123")).toContain("[REDACTED]");
  expect(m.list()).toEqual([]);
});

test("REST exposes health and local creation", async () => {
  const server = createRestServer(new TerminalManager(), 0);
  const health = await fetch(`http://${server.hostname}:${server.port}/health`);
  expect(await health.json()).toEqual({ ok: true, version: "0.1.0" });
  server.stop();
});

test("headed session exposes the viewer and accepts interactive input", async () => {
  const manager = new TerminalManager();
  const session = await manager.create({ shell: "/bin/sh", headed: true, cols: 20, rows: 3 });
  const server = createRestServer(manager, 0);
  expect(session.info().headed).toBe(true);

  const viewer = await fetch(`http://${server.hostname}:${server.port}/sessions/${session.id}`);
  expect(viewer.headers.get("content-type")).toContain("text/html");
  expect(await viewer.text()).toContain("new WebSocket");
  const explicitViewer = await fetch(`http://${server.hostname}:${server.port}/sessions/${session.id}/viewer`);
  expect(explicitViewer.status).toBe(200);
  expect(await explicitViewer.text()).toContain("new WebSocket");

  const input = await fetch(`http://${server.hostname}:${server.port}/sessions/${session.id}/input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify("printf 'headed-ok\\n'\r"),
  });
  expect(input.status).toBe(200);
  await session.waitForText("headed-ok");

  const mouse = await fetch(`http://${server.hostname}:${server.port}/sessions/${session.id}/mouse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "click", button: "left", x: 1, y: 1 }),
  });
  expect(mouse.status).toBe(200);
  session.close();
  server.stop();
});

test("headed viewer exposes WebSocket upgrade", async () => {
  const manager = new TerminalManager();
  const session = await manager.create({ shell: "/bin/sh", headed: true, cols: 20, rows: 3 });
  const server = createRestServer(manager, 0);
  const socket = new WebSocket(`ws://${server.hostname}:${server.port}/sessions/${session.id}/ws`);
  const message = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WebSocket snapshot timeout")), 2000);
    socket.addEventListener("message", (event) => {
      clearTimeout(timer);
      resolve(String(event.data));
    });
    socket.addEventListener("error", () => reject(new Error("WebSocket connection failed")));
  });
  expect(JSON.parse(message).type).toBe("snapshot");
  await new Promise<void>((resolve) => setTimeout(resolve, 25));
  socket.send(JSON.stringify({ type: "input", data: "printf 'ws-ok\\n'\r" }));
  for (let attempt = 0; attempt < 20 && !session.snapshot("text").text?.includes("ws-ok"); attempt++)
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  expect(session.snapshot("text").text).toContain("ws-ok");
  socket.close();
  session.close();
  server.stop();
});

test("viewer includes emoji fallback and combines surrogate pairs", async () => {
  const server = createRestServer(new TerminalManager(), 0);
  const response = await fetch(`http://${server.hostname}:${server.port}/viewer`);
  const html = await response.text();
  expect(html).toContain("Noto Color Emoji");
  expect(html).toContain("isHighSurrogate");
  expect(html).toContain("isLowSurrogate");
  server.stop();
});

test("REST stream can send raw frames for visual rendering", async () => {
  const manager = new TerminalManager();
  const session = await manager.create({ shell: "/bin/sh", cols: 20, rows: 3 });
  const server = createRestServer(manager, 0);
  const response = await fetch(`http://${server.hostname}:${server.port}/sessions/${session.id}/stream?mode=raw`);
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  await session.write("printf 'visual-ok\\n'");
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (let attempt = 0; attempt < 20 && !buffer.includes('"mode":"raw"'); attempt++) {
    const result = await reader.read();
    buffer += decoder.decode(result.value);
  }
  expect(buffer).toContain('"mode":"raw"');
  expect(buffer).toContain('"cells"');
  session.close();
  server.stop();
});
