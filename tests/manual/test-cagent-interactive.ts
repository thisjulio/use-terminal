// Teste: abrir cagent em modo interativo e enviar um prompt
import { TerminalSession } from "../../index";

console.log("=== TESTE: RODANDO CAGENT INTERATIVAMENTE ===\n");

const session = await TerminalSession.create({ shell: "/bin/bash", cols: 100, rows: 30 });
await new Promise((r) => setTimeout(r, 500));

// Abrir cagent em modo interativo (sem argumento = REPL)
console.log("[1] Abrindo cagent em modo interativo...");
await session.write("cagent\n");

// Esperar o cagent carregar e mostrar prompt
await new Promise((r) => setTimeout(r, 8000));

let snap = session.snapshot("text");
let lines = snap.text.split("\n");
console.log("\n    Cagent abriu. Tela atual:");
lines.forEach((l) => {
  if (l.trim()) console.log("    " + l);
});

// Agora enviar um prompt para o cagent
console.log("\n[2] Enviando prompt: 'What is the capital of France?'...");
await session.write("What is the capital of France?\n");

// Esperar resposta do cagent
await new Promise((r) => setTimeout(r, 10000));

snap = session.snapshot("text");
lines = snap.text.split("\n");
console.log("\n    Resposta do cagent:");
lines.forEach((l) => {
  if (l.trim()) console.log("    " + l);
});

// Verificar se respondeu
const screenText = snap.text;
if (screenText.includes("Paris") || screenText.toLowerCase().includes("france")) {
  console.log("\n    ✓✓✓ CAGENT RESPONDEU CORRETAMENTE! ✓✓✓");
} else {
  console.log("\n    ⚠ Não detectei resposta clara do cagent");
}

// Sair do cagent
console.log("\n[3] Enviando /exit para sair do cagent...");
await session.write("/exit\n");
await new Promise((r) => setTimeout(r, 2000));

session.close();
console.log("\n=== FIM DO TESTE ===");
