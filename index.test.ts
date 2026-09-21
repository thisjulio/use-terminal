import { describe, expect, test } from "bun:test";
import { createRestServer, handleMcp, redact, TerminalEmulator, TerminalManager, TerminalSession } from "./index";

describe("TerminalEmulator", () => {
  test("renderiza texto e ANSI em snapshot", () => {
    const e = new TerminalEmulator(10, 3);
    e.feed("\x1b[31mhello\x1b[0m\nworld");
    const raw = e.snapshot("raw");
    expect(e.snapshot("text").text).toContain("hello\nworld");
    expect(raw.cells?.[0]?.[0]?.fg).toBe("1");
  });
  test("preserva cores ANSI, RGB, atributos e uso por região", () => {
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
  test("move cursor, limpa e redimensiona", () => {
    const e = new TerminalEmulator(5, 2);
    e.feed("abc\x1b[2J");
    e.resize(8, 4);
    expect(e.snapshot("raw").cols).toBe(8);
  });
});

test("PTY real mantém saída, dimensões e sessão interativa", async () => {
  const s = await TerminalSession.create({ shell: "/bin/sh", cols: 40, rows: 5 });
  await s.write("printf 'pty-ok\\n'");
  await s.waitForText("pty-ok");
  s.resize(60, 8);
  expect(s.info().cols).toBe(60);
  expect(s.info().rows).toBe(8);
  expect(s.info().status).toBe("running");
  s.close();
});

test("manager, redaction e MCP compartilham contrato", async () => {
  const m = new TerminalManager();
  const result = await handleMcp({ method: "health" }, m);
  expect(result).toEqual({ ok: true, version: "0.1.0" });
  expect(redact("token=abc123")).toContain("[REDACTED]");
  expect(m.list()).toEqual([]);
});

test("REST expõe health e criação local", async () => {
  const server = createRestServer(new TerminalManager(), 0);
  const health = await fetch(`http://${server.hostname}:${server.port}/health`);
  expect(await health.json()).toEqual({ ok: true, version: "0.1.0" });
  server.stop();
});
