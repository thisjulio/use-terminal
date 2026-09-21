// Debug: ver se PTY está produzindo saída
import { TerminalSession } from "../../index";

const session = await TerminalSession.create({ shell: "/bin/bash", cols: 80, rows: 24 });

// Espera shell
await new Promise((r) => setTimeout(r, 1000));

// Comando simples
await session.write("echo TESTE123\n");
await new Promise((r) => setTimeout(r, 2000));

const snap = session.snapshot("text");
console.log("Snapshot text:");
console.log(JSON.stringify(snap.text));
console.log("\nLinhas:");
snap.text.split("\n").forEach((l, i) => console.log(i + " |" + l + "|"));

session.close();
