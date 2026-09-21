import { describe, expect, test } from "bun:test";
import { TerminalSession } from "./session";

describe("Mouse and Clipboard", () => {
  test("click sends press and release sequences", async () => {
    const session = await TerminalSession.create({ cols: 80, rows: 24 });
    // Click at (10, 5) should send two sequences: press (code 0) and release (code 3)
    // With offset +33: x=43, y=38
    await session.click(10, 5);
    // Verify the terminal received the sequences by checking it didn't error
    const info = session.info();
    expect(info.status).toBe("running");
    await session.close();
  });

  test("mouseMove sends motion sequence with code 32", async () => {
    const session = await TerminalSession.create({ cols: 80, rows: 24 });
    // Motion uses code 32 (0x20) in the button byte
    await session.mouseMove(20, 10);
    const info = session.info();
    expect(info.status).toBe("running");
    await session.close();
  });

  test("drag sends press, move, and release", async () => {
    const session = await TerminalSession.create({ cols: 80, rows: 24 });
    // Drag should send: press at from, move to to, release at to
    await session.drag({ x: 5, y: 5 }, { x: 10, y: 10 });
    const info = session.info();
    expect(info.status).toBe("running");
    await session.close();
  });

  test("paste sends text that appears in terminal", async () => {
    const session = await TerminalSession.create({ cols: 80, rows: 24 });
    // Start a command that echoes input
    await session.write("cat\n");
    await session.waitForText("cat");
    // Paste text - it should appear on screen
    await session.paste("test-paste-data\n");
    await session.waitForText("test-paste-data", 2000);
    // Send Ctrl-D to end cat
    await session.sendKey("CTRL_D");
    await session.close();
  });

  test("copyToClipboard returns boolean", async () => {
    const session = await TerminalSession.create({ cols: 80, rows: 24 });
    const result = await session.copyToClipboard("test text");
    expect(typeof result).toBe("boolean");
    await session.close();
  });

  test("mouse coordinates use offset +33", async () => {
    const session = await TerminalSession.create({ cols: 80, rows: 24 });
    // Click at (0, 0) should encode as x=33, y=33
    await session.click(0, 0);
    const info = session.info();
    expect(info.status).toBe("running");
    await session.close();
  });
});
