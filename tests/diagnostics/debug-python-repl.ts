// Debug detalhado da interação com Python REPL
import { TerminalSession } from "../../index";

const session = await TerminalSession.create({ shell: "/bin/bash", cols: 100, rows: 30 });
await new Promise((r) => setTimeout(r, 500));

console.log("[1] Abrindo Python REPL...");
await session.write("python3\n");
await new Promise((r) => setTimeout(r, 3000));

let snap = session.snapshot("text");
console.log("\nTela após abrir Python:");
snap.text.split("\n").forEach((l, i) => {
  if (l.trim()) console.log(`  ${i}: |${l}|`);
});

console.log("\n[2] Enviando 'print(123)'...");
await session.write("print(123)\n");
await new Promise((r) => setTimeout(r, 2000));

snap = session.snapshot("text");
console.log("\nTela após comando:");
snap.text.split("\n").forEach((l, i) => {
  if (l.trim()) console.log(`  ${i}: |${l}|`);
});

session.close();
