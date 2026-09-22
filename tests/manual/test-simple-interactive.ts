// Test simple interactive programs
import { TerminalSession } from "../../index";

const session = await TerminalSession.create({ shell: "/bin/bash", cols: 100, rows: 30 });
await new Promise((r) => setTimeout(r, 500));

// Test 1: cat (echoes what it receives)
console.log("[1] Testing 'cat' (simple echo)...");
await session.write("cat\n");
await new Promise((r) => setTimeout(r, 1000));
await session.write("test line\n");
await new Promise((r) => setTimeout(r, 1000));

let snap = session.snapshot("text");
if (snap.text.includes("test line")) {
  console.log("    ✓ cat worked!");
} else {
  console.log("    ✗ cat did not work");
}

// Exit cat with Ctrl+D
await session.sendKey("CTRL_D");
await new Promise((r) => setTimeout(r, 500));

// Test 2: bash script with read
console.log("\n[2] Testing a bash script with read...");
await session.write('bash -c "read x; echo "response: $x""\n');
await new Promise((r) => setTimeout(r, 1000));
await session.write("hello\n");
await new Promise((r) => setTimeout(r, 1000));

snap = session.snapshot("text");
if (snap.text.includes("response: hello")) {
  console.log("    ✓ bash read worked!");
} else {
  console.log("    ✗ bash read did not work");
  console.log("    Screen:", snap.text.slice(-200));
}

session.close();
