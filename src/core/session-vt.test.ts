import { describe, expect, test } from "bun:test";
import { TerminalSession } from "./session";

describe("TerminalSession cagent compatibility", () => {
  test("answers terminal capability and cursor queries", async () => {
    const session = await TerminalSession.create({ shell: "/bin/sh", cols: 80, rows: 24 });
    await session.write("printf '\\033[6n\\033[c\\033[?2004\\$p'; sleep 0.2\n");
    await new Promise((resolve) => setTimeout(resolve, 500));
    const text = session.snapshot("text").text ?? "";
    expect(text).toContain("$");
    session.close();
  });
});
