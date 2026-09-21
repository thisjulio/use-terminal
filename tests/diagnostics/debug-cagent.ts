// Debug: ver o que cagent realmente produz
import { TerminalSession } from "../../index";

const session = await TerminalSession.create({ shell: "/bin/bash", cols: 100, rows: 30 });
await new Promise((r) => setTimeout(r, 500));

// Rodar cagent com timeout para não ficar travado
console.log("Rodando: timeout 5 cagent\n");
await session.write("timeout 5 cagent\n");

// Esperar
await new Promise((r) => setTimeout(r, 7000));

let snap = session.snapshot("text");
console.log("Snapshot completo:");
console.log("===");
console.log(snap.text);
console.log("===");

console.log("\nLinhas não-vazias:");
snap.text.split("\n").forEach((l, i) => {
  if (l.trim()) console.log(i + ": " + l);
});

session.close();
