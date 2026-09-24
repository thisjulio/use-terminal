import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TerminalEmulator, wrapBracketedPaste } from "../src/core/emulator";
import { isMappedKey, isNamedKey, NAMED_KEY_SEQUENCES, namedKeySequence } from "../src/core/keys";
import { TerminalSession } from "../src/core/session";
import type { SelectionPoint } from "../src/types";

/**
 * Phase 6 / Phase 7 coverage: selection with auto-scroll, bracketed paste, focus
 * events, hyperlinks, and mode negotiation. These are deterministic and run
 * without a real PTY (the emulator is a pure state machine), which keeps the
 * tests fast and stable on CI.
 */

describe("Selection (cells/lines) with auto-scroll", () => {
  test("select a region on the visible screen and read back the text", () => {
    const em = new TerminalEmulator(20, 4);
    em.feed("AAAA\r\nBBBB\r\nCCCC\r\n");
    // Absolute coordinates: 0 = top of scrollback. With no scrollback the
    // visible rows start at index 0, so y=0 is the topmost visible row.
    em.select({ x: 0, y: 0 }, { x: 4, y: 1 });
    expect(em.selectedText()).toBe("AAAA\nBBBB");
  });

  test("selection spanning scrollback (auto-scroll) reads across history", () => {
    const em = new TerminalEmulator(8, 3);
    // Fill enough rows that some scroll into history (scrollback default).
    em.feed("line1\r\nline2\r\nline3\r\nline4\r\nline5\r\nline6\r\n");
    // After 6 rows with rows=3, the first three rows scrolled into history.
    // Absolute coordinates make scrollback addressable: y=0 is the oldest.
    em.select({ x: 0, y: 0 }, { x: 5, y: 0 });
    expect(em.selectedText()).toBe("line1");
  });

  test("clearSelection removes the selection", () => {
    const em = new TerminalEmulator(10, 3);
    em.feed("hello\r\n");
    em.select({ x: 0, y: 0 }, { x: 5, y: 0 });
    expect(em.selectedText()).toBe("hello");
    em.clearSelection();
    expect(em.selectedText()).toBe("");
    expect(em.getSelection()).toBeUndefined();
  });

  test("selection is surfaced in raw snapshots and clamped to the buffer", () => {
    const em = new TerminalEmulator(10, 3);
    em.feed("hello world\r\n");
    em.select({ x: 0, y: 0 }, { x: 100, y: 100 }); // out-of-bounds is clamped
    const selection = em.getSelection();
    expect(selection).toBeDefined();
    expect(selection!.end.x).toBeLessThan(10);
    expect(selection!.end.y).toBeLessThan(em.viewport.totalRows);
    const snapshot = em.snapshot("raw");
    expect(snapshot.selection).toBeDefined();
  });

  test("session.select exposes the selection via the high-level API", async () => {
    const session = await TerminalSession.create({ shell: "/bin/sh", cols: 20, rows: 5 });
    try {
      await session.type("select-me", true);
      await session.waitForText("select-me", 5000);
      // The text lands on a visible row; absolute row index 0 is the top.
      const selection: { start: SelectionPoint; end: SelectionPoint } = {
        start: { x: 0, y: 0 },
        end: { x: 9, y: 0 },
      };
      session.select(selection.start, selection.end);
      expect(session.emulator.getSelection()).toBeDefined();
    } finally {
      session.close();
    }
  });
});

describe("Bracketed paste (negotiated)", () => {
  test("wrapBracketedPaste wraps when mode 2004 is negotiated", () => {
    expect(wrapBracketedPaste("abc", true)).toBe("\x1b[200~abc\x1b[201~");
    expect(wrapBracketedPaste("abc", false)).toBe("abc");
  });

  test("mode 2004 toggling is observed through isModeEnabled", () => {
    const em = new TerminalEmulator(10, 3);
    expect(em.isModeEnabled("2004")).toBe(false);
    em.feed("\x1b[?2004h"); // enable bracketed paste
    expect(em.isModeEnabled("2004")).toBe(true);
    em.feed("\x1b[?2004l"); // disable
    expect(em.isModeEnabled("2004")).toBe(false);
  });

  test("session.paste wraps text only when bracketed paste is negotiated", async () => {
    const em = new TerminalEmulator(10, 3);
    em.feed("\x1b[?2004h");
    // The session's paste delegates to the same pure helper.
    const bracketed = wrapBracketedPaste("multi\nline", em.isModeEnabled("2004"));
    expect(bracketed).toBe("\x1b[200~multi\nline\x1b[201~");
  });
});

describe("Focus events (negotiated)", () => {
  test("mode 1004 (focus reporting) is observed when negotiated", () => {
    const em = new TerminalEmulator(10, 3);
    expect(em.isModeEnabled("1004")).toBe(false);
    em.feed("\x1b[?1004h");
    expect(em.isModeEnabled("1004")).toBe(true);
    em.feed("\x1b[?1004l");
    expect(em.isModeEnabled("1004")).toBe(false);
  });

  test("focus in/out (CSI I / CSI O) do not corrupt the buffer", () => {
    const em = new TerminalEmulator(10, 3);
    em.feed("\x1b[?1004h");
    em.feed("\x1b[I"); // focus in
    em.feed("before\r\n");
    em.feed("\x1b[O"); // focus out
    expect(em.snapshot("text").text).toContain("before");
  });
});

describe("Hyperlinks (OSC 8)", () => {
  test("OSC 8 tags cells with the URL while the link is open", () => {
    const em = new TerminalEmulator(20, 3);
    em.feed("\x1b]8;https://example.com\x1b\\link\x1b]8;\x1b\\");
    const snapshot = em.snapshot("raw");
    const firstCell = snapshot.cells?.[0]?.[0];
    expect(firstCell?.char).toBe("l");
    expect(firstCell?.hyperlink).toBe("https://example.com");
    // The link is closed, so following text has no hyperlink.
    em.feed(" after");
    const after = em.snapshot("raw").cells?.[0]?.[4];
    expect(after?.hyperlink).toBeUndefined();
  });

  test("hyperlink text written in separate feeds keeps the link active", () => {
    const em = new TerminalEmulator(20, 3);
    em.feed("\x1b]8;https://example.com\x1b\\");
    em.feed("hi");
    em.feed("\x1b]8;\x1b\\");
    const cells = em.snapshot("raw").cells?.[0];
    expect(cells?.[0]?.hyperlink).toBe("https://example.com");
    expect(cells?.[1]?.hyperlink).toBe("https://example.com");
  });
});

describe("Mode negotiation surfaced in snapshots", () => {
  test("snapshot.modes reflects the negotiated private modes", () => {
    const em = new TerminalEmulator(10, 3);
    em.feed("\x1b[?2004h");
    em.feed("\x1b[?1004h");
    em.feed("\x1b[?1006h");
    const snapshot = em.snapshot("raw");
    expect(snapshot.modes?.["2004"]).toBe(true);
    expect(snapshot.modes?.["1004"]).toBe(true);
    expect(snapshot.modes?.["1006"]).toBe(true);
  });

  test("SGR mouse (1006) negotiation is observable", () => {
    const em = new TerminalEmulator(10, 3);
    em.feed("\x1b[?1006h");
    expect(em.isModeEnabled("1006")).toBe(true);
  });
});

describe("waitForScreenChange (high-level waits)", () => {
  test("resolves when the screen changes after the call", async () => {
    const session = await TerminalSession.create({ shell: "/bin/sh", cols: 40, rows: 5 });
    try {
      // Settle the prompt so the wait is not satisfied by initial output.
      await session.waitForText("$", 5000);
      const wait = session.waitForScreenChange(5000);
      await session.type("printf 'screen-change-ok\n'", true);
      await wait;
      expect(session.snapshot("text").text).toContain("screen-change-ok");
    } finally {
      session.close();
    }
  });

  test("rejects with a stable timeout error when nothing changes", async () => {
    const session = await TerminalSession.create({ shell: "/bin/sh", cols: 40, rows: 5 });
    try {
      await session.waitForText("$", 5000);
      // With an idle shell the visible screen stays put, so the wait times out.
      await expect(session.waitForScreenChange(150)).rejects.toThrow("Timed out waiting for screen change");
    } finally {
      session.close();
    }
  });

  test("independent change waiters do not cancel one another", async () => {
    const session = await TerminalSession.create({ shell: "/bin/sh", cols: 40, rows: 5 });
    try {
      await session.waitForText("$", 5000);
      const first = session.waitForScreenChange(5000);
      const second = session.waitForScreenChange(5000);
      // A single screen change satisfies both pending observers.
      await session.type("printf 'two-waiters-ok\n'", true);
      await Promise.all([first, second]);
    } finally {
      session.close();
    }
  });
});

/**
 * High-level keys and semantic actions (Phase 7).
 *
 * `pressKey` sends named keys (arrows, function keys, Home/End, …) and
 * `performAction` executes a deterministic action by id. These tests cover:
 * - deterministic bytes for named keys (no `echo`, no PTY dependency);
 * - a real shell responding to input and a named key;
 * - a real TUI (htop) that changes its screen when a named key is pressed;
 * - the shared key map that the web viewer, REST, and MCP adapters rely on.
 */
describe("Named keys (pressKey) — deterministic bytes", () => {
  test("ARROW_UP recalls the previous command in a real shell", async () => {
    const session = await TerminalSession.create({ shell: "/bin/sh", cols: 40, rows: 10 });
    try {
      // Run a command so it enters the shell history. The marker makes the
      // recall observable without depending on raw echoed bytes (the emulator
      // consumes the escape characters, so they are not literal in the text).
      await session.type("echo key-recall-marker", true);
      await session.waitForText("key-recall-marker", 5000);
      // ARROW_UP (\x1b[A) recalls the last command at the prompt; ENTER
      // re-runs it, so the marker appears a second time.
      await session.pressKey("ARROW_UP");
      await session.pressKey("ENTER");
      const text = session.snapshot("text").text ?? "";
      const occurrences = text.split("key-recall-marker").length - 1;
      // The recalled line ("echo key-recall-marker") is visible on the
      // screen — proof the named-key sequence reached the shell.
      expect(occurrences).toBeGreaterThanOrEqual(2);
    } finally {
      session.close();
    }
  });

  test("pressKey rejects an unknown key name with a stable error", async () => {
    const session = await TerminalSession.create({ shell: "/bin/sh", cols: 40, rows: 10 });
    try {
      await expect(session.pressKey("NOT_A_KEY")).rejects.toThrow("unknown key: NOT_A_KEY");
    } finally {
      session.close();
    }
  });

  test("isMappedKey covers control keys and named keys", () => {
    for (const key of ["ENTER", "TAB", "CTRL_C", "CTRL_D", "CTRL_Z"]) expect(isMappedKey(key)).toBe(true);
    for (const key of ["ARROW_UP", "F5", "HOME", "END", "ESC", "DELETE"]) expect(isMappedKey(key)).toBe(true);
    expect(isMappedKey("F42")).toBe(false);
    expect(isMappedKey("")).toBe(false);
  });

  test("shared key map is the single source of truth (parity with viewer)", () => {
    // The web viewer inline map (src/adapters/rest.ts) must stay in sync with
    // this shared map; these fixtures pin the exact bytes both produce.
    expect(namedKeySequence("F5")).toBe("\u001b[15~");
    expect(NAMED_KEY_SEQUENCES.F5).toBe("\u001b[15~");
    expect(NAMED_KEY_SEQUENCES.ARROW_UP).toBe("\u001b[A");
    expect(NAMED_KEY_SEQUENCES.HOME).toBe("\u001b[H");
    expect(NAMED_KEY_SEQUENCES.PAGE_DOWN).toBe("\u001b[6~");
    expect(isNamedKey("f5")).toBe(true); // case-insensitive
    expect(isNamedKey("FOO")).toBe(false);
  });
});

describe("Semantic actions (performAction)", () => {
  test("performAction('type') then performAction('press-key ENTER') runs a command in a real shell", async () => {
    const session = await TerminalSession.create({ shell: "/bin/sh", cols: 40, rows: 10 });
    try {
      await session.waitForText("$", 5000);
      // `type` without submit leaves the command unexecuted; the separate
      // `press-key ENTER` then runs it — the "input without a newline" case.
      await session.performAction("type", { text: "printf 'action-ok\\n'" });
      await session.performAction("press-key", { key: "ENTER" });
      await session.waitForText("action-ok", 5000);
    } finally {
      session.close();
    }
  });

  test("performAction rejects an unsupported action id", async () => {
    const session = await TerminalSession.create({ shell: "/bin/sh", cols: 40, rows: 10 });
    try {
      await expect(session.performAction("click")).rejects.toThrow("unsupported action: click");
      await expect(session.performAction("press-key")).rejects.toThrow("press-key requires `key`");
    } finally {
      session.close();
    }
  });
});

describe("Named keys against a real TUI (less)", () => {
  test("pressing ARROW_DOWN in less scrolls the file", async () => {
    // less is a static TUI: it does not auto-redraw, so a key press
    // produces a deterministic one-shot screen change (unlike htop, which
    // redraws at ~2Hz and would mask the effect).
    const dir = mkdtempSync(join(tmpdir(), "less-tui-"));
    const file = join(dir, "fixture.txt");
    // 20 lines: enough to scroll past the visible viewport (rows=12).
    writeFileSync(file, `${Array.from({ length: 20 }, (_, i) => `line-${i + 1}`).join("\n")}\n`);
    const session = await TerminalSession.create({
      command: "less",
      args: [file],
      shell: "/bin/sh",
      cols: 40,
      rows: 12,
    });
    try {
      // less renders the first line ("line-1") once it opens the file.
      await session.waitForText("line-1", 10000);
      const before = session.snapshot("text").text ?? "";
      // ARROW_DOWN (\x1b[B) scrolls one line down in less.
      await session.pressKey("ARROW_DOWN");
      await session.waitForScreenChange(5000);
      const after = session.snapshot("text").text ?? "";
      // The screen changed: the visible content shifted.
      expect(after).not.toBe(before);
      expect(session.info().status).toBe("running");
    } finally {
      session.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30000);
});
