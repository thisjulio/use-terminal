// Teste: rodar cagent real via terminal automatizado
import { TerminalSession } from "../../index";

console.log("=== TESTE: RODANDO CAGENT REAL VIA TERMINAL AUTOMATIZADO ===\n");

const session = await TerminalSession.create({ shell: "/bin/bash", cols: 100, rows: 30 });
await new Promise((r) => setTimeout(r, 500));

// Rodar cagent com um prompt
console.log("[1] Enviando comando: cagent 'What is 2+2?'\n");
await session.write("cagent 'What is 2+2?'\n");

// Esperar o cagent processar (pode levar uns segundos)
console.log("    Aguardando resposta do cagent...");
await new Promise((r) => setTimeout(r, 15000));

const snap = session.snapshot("text");
console.log("\n    === SAÍDA DO TERMINAL ===");
const lines = snap.text.split("\n");
lines.forEach((l, _i) => {
  if (l.trim()) {
    console.log(`    ${l}`);
  }
});
console.log("    === FIM DA SAÍDA ===");

// Verificar se o cagent respondeu
const screenText = snap.text;
if (screenText.includes("4") && (screenText.includes("cagent") || screenText.includes("You"))) {
  console.log("\n    ✓✓✓ SUCESSO! O cagent rodou e respondeu via terminal automatizado! ✓✓✓");
} else {
  console.log("\n    ⚠ Não detectei a resposta esperada do cagent");
}

session.close();
console.log("\n=== FIM DO TESTE ===");
