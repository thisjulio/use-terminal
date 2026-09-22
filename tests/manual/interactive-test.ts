// Interactive test: a script that reads user input
import { TerminalSession } from "../../index";

console.log("=== AUTOMATED INTERACTIVE TEST ===\n");

const session = await TerminalSession.create({ shell: "/bin/bash", cols: 80, rows: 24 });
await new Promise((r) => setTimeout(r, 500));

// Create an interactive script
await session.write(`cat > /tmp/ask.sh << 'SCRIPT'
#!/bin/bash
echo "What is your name?"
read name
echo "Hello, $name! Welcome."
SCRIPT
chmod +x /tmp/ask.sh\n`);
await new Promise((r) => setTimeout(r, 1000));

// Run the interactive script
console.log("[1] Running the script that asks for your name...");
await session.write("/tmp/ask.sh\n");
await new Promise((r) => setTimeout(r, 2000));

// Inspect the screen state
let snap = session.snapshot("text");
let lines = snap.text.split("\n");
console.log("    Screen (waiting for input):");
for (const line of lines.slice(-3)) console.log(`    |${line}|`);

// Respond automatically
console.log("    -> Replying with 'World'...");
await session.write("World\n");
await new Promise((r) => setTimeout(r, 2000));

snap = session.snapshot("text");
lines = snap.text.split("\n");
console.log("    Screen after the reply:");
for (const line of lines.slice(-4)) console.log(`    |${line}|`);

const screenText = snap.text;
if (screenText.includes("Hello, World!")) {
  console.log("\n    ✓✓✓ INTERACTION WORKED! ✓✓✓");
  console.log("    The automated terminal answered an interactive question.");
} else {
  console.log("\n    ✗ Did not detect the expected response");
}

// Clean up
await session.write("rm -f /tmp/ask.sh\n");
await new Promise((r) => setTimeout(r, 500));
session.close();
console.log("\n=== END ===");
