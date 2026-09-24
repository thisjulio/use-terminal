import { describe, expect, test } from "bun:test";
import { TerminalEmulator } from "./emulator";
import { suggestActions } from "./semantic";

describe("Semantic Parser", () => {
  test("detects shell prompt", () => {
    const emu = new TerminalEmulator(80, 24);
    emu.feed("user@host:~$ ");
    const snap = emu.snapshot("semantic");
    const promptNodes = snap.tree!.children!.filter((c) => c.role === "prompt");
    expect(promptNodes.length).toBeGreaterThan(0);
  });

  test("detects error messages", () => {
    const emu = new TerminalEmulator(80, 24);
    emu.feed("ls: cannot access /nonexistent: No such file or directory\n");
    const snap = emu.snapshot("semantic");
    const errorNodes = snap.tree!.children!.filter((c) => c.role === "error");
    expect(errorNodes.length).toBeGreaterThan(0);
  });

  test("suggests an executable action for prompts", () => {
    const emu = new TerminalEmulator(80, 24);
    emu.feed("user@host:~$ ");
    const snap = emu.snapshot("semantic");
    const actions = suggestActions(snap.tree!);
    // A prompt suggests the executable `type` action from the
    // performAction vocabulary, with an `input` field carrying the
    // suggested text (empty when there is none).
    const promptActions = actions.filter((a) => a.id === "type");
    expect(promptActions.length).toBeGreaterThan(0);
    expect(promptActions[0]!.input).toBeDefined();
  });

  test("suggests actions for errors", () => {
    const emu = new TerminalEmulator(80, 24);
    emu.feed("Error: something failed\n");
    const snap = emu.snapshot("semantic");
    const actions = suggestActions(snap.tree!);
    const errorActions = actions.filter((a) => a.id === "investigate-error");
    expect(errorActions.length).toBeGreaterThan(0);
  });

  test("preserves raw snapshot as source of truth", () => {
    const emu = new TerminalEmulator(80, 24);
    emu.feed("test output\n");
    const raw = emu.snapshot("raw");
    const semantic = emu.snapshot("semantic");
    expect(raw.cells).toBeDefined();
    expect(semantic.tree).toBeDefined();
    expect(raw.text).toContain("test output");
  });

  test("handles multi-line output", () => {
    const emu = new TerminalEmulator(80, 24);
    emu.feed("line1\nline2\nline3\n");
    const snap = emu.snapshot("semantic");
    expect(snap.tree!.children!.length).toBeGreaterThan(0);
  });
});
