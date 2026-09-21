// Test @xterm/headless with async write (xterm.js 5.x+)
import { Terminal } from "@xterm/headless/lib-headless/xterm-headless.mjs";

const term = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });

async function main() {
  // In xterm.js 5.x+, write() is async
  await term.write("Python 3.14.7 (main, Aug 10 2026) on linux\r\n");
  await term.write('Type "help", "copyright", "credits" or "license" for more information.\r\n');

  // Python prompt with all the ANSI codes
  const prompt = "\x1b[?2004h\x1b[?1h\x1b=\x1b[?25l\x1b[1;35m>>> \x1b[0m\x1b[4D\x1b[?12l\x1b[?25h\x1b[4C";
  await term.write(prompt);

  // Check buffer
  console.log("=== After prompt ===");
  const buffer = term.buffer.active;
  for (let y = 0; y < 8; y++) {
    const line = buffer.getLine(y);
    if (line) {
      const text = line.translateToString().trimEnd();
      if (text) console.log(`  ${y}: |${text}|`);
    }
  }

  // Simulate user typing
  await term.write("print(123)\r");

  console.log("\n=== After typing 'print(123)' ===");
  for (let y = 0; y < 10; y++) {
    const line = buffer.getLine(y);
    if (line) {
      const text = line.translateToString().trimEnd();
      if (text) console.log(`  ${y}: |${text}|`);
    }
  }

  console.log("\nSUCCESS: @xterm/headless works with Bun!");
}

main();
