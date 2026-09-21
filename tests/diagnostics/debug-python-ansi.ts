// Capturar bytes RAW do Python REPL para verificar ANSI colors
import { spawn } from "bun-pty";

console.log("Abrindo Python via PTY...");
const proc = spawn("python3", [], {
  cols: 80,
  rows: 24,
  cwd: process.cwd(),
});

let rawOutput = "";
proc.onData((data) => {
  // data pode ser string ou Uint8Array
  let text: string;
  if (typeof data === "string") {
    text = data;
  } else {
    text = Buffer.from(data).toString("utf-8");
  }
  rawOutput += text;
  console.log("RAW RECEBIDO:", JSON.stringify(text));
});

proc.onExit((info) => {
  console.log("Process exited:", info);
});

// Esperar prompt aparecer
setTimeout(() => {
  console.log("\n=== SAÍDA RAW COMPLETA ===");
  console.log(JSON.stringify(rawOutput));
  console.log("\n=== COM HEX ===");
  const bytes = Buffer.from(rawOutput);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 27) {
      // ESC - print as \e
      console.log("\\e");
    } else if (b >= 32 && b < 127) {
      process.stdout.write(String.fromCharCode(b));
    } else {
      console.log(`[${b}]`);
    }
  }
  console.log("\n=== FIM ===");
  proc.kill();
}, 3000);
