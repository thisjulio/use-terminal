// Debug: check whether the PTY is producing output
import { TerminalSession } from "../../index";

const session = await TerminalSession.create({ shell: "/bin/bash", cols: 80, rows: 24 });

// Wait for the shell
await new Promise((r) => setTimeout(r, 1000));

// Simple command
await session.write("echo TEST123\n");
await new Promise((r) => setTimeout(r, 2000));

const snap = session.snapshot("text");
console.log("Text snapshot:");
console.log(JSON.stringify(snap.text));
console.log("\nLines:");
for (const [i, line] of snap.text.split("\n").entries()) {
  console.log(`${i} |${line}|`);
}

session.close();
