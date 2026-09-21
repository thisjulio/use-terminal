// Teste: abrir programa interativo e enviar comandos
import { TerminalSession } from "../../index";

console.log("=== TESTE: PROGRAMA INTERATIVO (Python REPL) ===\n");

const session = await TerminalSession.create({ shell: "/bin/bash", cols: 100, rows: 30 });
await new Promise((r) => setTimeout(r, 500));

// Abrir Python REPL
console.log("[1] Abrindo Python REPL...");
await session.write("python3\n");
await new Promise((r) => setTimeout(r, 3000));

let snap = session.snapshot("text");
let lines = snap.text.split("\n");
console.log("    REPL aberto. Tela:");
for (const l of lines.slice(-3)) console.log(`    ${l}`);

// Enviar comando
console.log("\n[2] Enviando: print('Hello from automated terminal!')");
await session.write("print('Hello from automated terminal!')\n");
await new Promise((r) => setTimeout(r, 2000));

snap = session.snapshot("text");
lines = snap.text.split("\n");
console.log("    Resposta:");
for (const l of lines.slice(-4)) console.log(`    ${l}`);

// Outro comando
console.log("\n[3] Enviando: 2 + 3");
await session.write("2 + 3\n");
await new Promise((r) => setTimeout(r, 2000));

snap = session.snapshot("text");
lines = snap.text.split("\n");
console.log("    Resposta:");
for (const l of lines.slice(-3)) console.log(`    ${l}`);

// Sair
console.log("\n[4] Saiendo do REPL...");
await session.write("exit()\n");
await new Promise((r) => setTimeout(r, 1000));

const screenText = snap.text;
if (screenText.includes("Hello from automated terminal!") && screenText.includes("5")) {
  console.log("\n    ✓✓✓ PROGRAMA INTERATIVO FUNCIONOU! ✓✓✓");
  console.log("    Abrimos o programa, enviamos comandos e recebemos respostas.");
}

session.close();
console.log("\n=== FIM ===");
