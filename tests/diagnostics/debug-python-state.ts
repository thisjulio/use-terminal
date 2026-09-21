// Debug: verificar se Python está realmente rodando
import { TerminalSession } from "../../index";

const session = await TerminalSession.create({ shell: "/bin/bash", cols: 100, rows: 30 });
await new Promise((r) => setTimeout(r, 500));

console.log("[1] Abrindo Python REPL...");
await session.write("python3\n");
await new Promise((r) => setTimeout(r, 3000));

// Verificar se python está rodando
console.log("\n[2] Verificando se python está rodando...");
await session.write("ps aux | grep python\n");
await new Promise((r) => setTimeout(r, 2000));

const snap = session.snapshot("text");
console.log(`\nProcessos:\n${snap.text}`);

session.close();
