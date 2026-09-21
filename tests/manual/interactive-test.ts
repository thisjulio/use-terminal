// Teste interativo: script que lê input do usuário
import { TerminalSession } from "../../index";

console.log("=== TESTE INTERATIVO AUTOMATIZADO ===\n");

const session = await TerminalSession.create({ shell: "/bin/bash", cols: 80, rows: 24 });
await new Promise((r) => setTimeout(r, 500));

// Criar script interativo
await session.write(`cat > /tmp/ask.sh << 'SCRIPT'
#!/bin/bash
echo "Qual seu nome?"
read nome
echo "Olá, $nome! Bem-vindo."
SCRIPT
chmod +x /tmp/ask.sh\n`);
await new Promise((r) => setTimeout(r, 1000));

// Executar script interativo
console.log("[1] Executando script que pergunta seu nome...");
await session.write("/tmp/ask.sh\n");
await new Promise((r) => setTimeout(r, 2000));

// Verificar estado da tela
let snap = session.snapshot("text");
let lines = snap.text.split("\n");
console.log("    Tela (esperando input):");
for (const l of lines.slice(-3)) console.log(`    |${l}|`);

// Responder automaticamente
console.log("    -> Respondendo 'Mundo'...");
await session.write("Mundo\n");
await new Promise((r) => setTimeout(r, 2000));

snap = session.snapshot("text");
lines = snap.text.split("\n");
console.log("    Tela depois da resposta:");
for (const l of lines.slice(-4)) console.log(`    |${l}|`);

const screenText = snap.text;
if (screenText.includes("Olá, Mundo!")) {
  console.log("\n    ✓✓✓ INTERAÇÃO FUNCIONOU! ✓✓✓");
  console.log("    O terminal automatizado respondeu a uma pergunta interativa.");
} else {
  console.log("\n    ✗ Não detectei a resposta esperada");
}

// Limpar
session.write("rm -f /tmp/ask.sh\n");
await new Promise((r) => setTimeout(r, 500));
session.close();
console.log("\n=== FIM ===");
