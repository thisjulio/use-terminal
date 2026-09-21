// Capturar dados RAW do PTY para Python REPL
import { spawn } from "bun-pty";

console.log("Abrindo Python via PTY...");
const proc = spawn("python3", [], {
  cols: 80,
  rows: 24,
  cwd: process.cwd(),
});

let output = "";
proc.onData((data) => {
  const text = new TextDecoder().decode(data);
  output += text;
  console.log("RAW DATA RECEBIDO:", JSON.stringify(text));
});

proc.onExit((info) => {
  console.log("Process exited:", info);
});

// Esperar prompt
setTimeout(() => {
  console.log("\nEnviando 'print(123)'...");
  proc.write("print(123)\n");
}, 2000);

// Ver saída
setTimeout(() => {
  console.log("\n=== SAÍDA COMPLETA ===");
  console.log(JSON.stringify(output));
  proc.kill();
}, 5000);
