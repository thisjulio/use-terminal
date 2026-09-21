// Debug: capturar saída RAW do cagent TUI
import { TerminalSession } from "../../index";

const session = await TerminalSession.create({ shell: "/bin/bash", cols: 100, rows: 30 });
await new Promise((r) => setTimeout(r, 500));

console.log("Iniciando cagent TUI...");
await session.write("timeout 5 cagent\n");

// Esperar
await new Promise((r) => setTimeout(r, 7000));

// Ver snapshot raw
const snap = session.snapshot("raw");
console.log("\nSnapshot raw - cols:", snap.cols, "rows:", snap.rows);
console.log("Texto:", JSON.stringify(snap.text.substring(0, 500)));

// Verificar células
if (snap.cells) {
  console.log("\nCélulas preenchidas:");
  let count = 0;
  for (let y = 0; y < snap.rows; y++) {
    for (let x = 0; x < snap.cols; x++) {
      if (snap.cells[y][x].char !== " ") {
        count++;
      }
    }
  }
  console.log("Total de células não-vazias:", count);
}

session.close();
