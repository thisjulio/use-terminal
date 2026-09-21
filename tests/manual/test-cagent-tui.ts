// Teste visual: abrir cagent TUI e descrever a tela, sem enviar prompt.
import { TerminalSession } from "../../index";

console.log("=== TESTE VISUAL: CAGENT TUI ===\n");

const session = await TerminalSession.create({ shell: "/bin/bash", cols: 120, rows: 36 });
await new Promise((resolve) => setTimeout(resolve, 500));

console.log("[1] Abrindo cagent em modo TUI...");
await session.write("cagent\n");
await new Promise((resolve) => setTimeout(resolve, 5000));

const snapshot = session.snapshot("text");
const text = snapshot.text ?? "";
console.log("\n[2] Descrição da tela capturada:");
console.log(`Dimensões: ${snapshot.cols}x${snapshot.rows}`);
console.log(`Cursor: (${snapshot.cursor.x}, ${snapshot.cursor.y}), visível=${snapshot.cursor.visible}`);
console.log("\nConteúdo não vazio:");
for (const [index, line] of text.split("\n").entries()) {
  if (line.trim()) console.log(`linha ${String(index + 1).padStart(2, "0")}: |${line}|`);
}

const expected = ["cagent", "ready", "Type an instruction", "Tip:", "type your next instruction"];
console.log("\nElementos esperados:");
for (const element of expected) console.log(`- ${element}: ${text.includes(element) ? "presente" : "AUSENTE"}`);

console.log("\n[3] Encerrando sem enviar entrada...");
session.sendKey("CTRL_C");
await new Promise((resolve) => setTimeout(resolve, 500));
session.close();
