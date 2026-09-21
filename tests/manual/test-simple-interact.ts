// Teste com programa interativo simples (sem readline)
import { TerminalSession } from "../../index";

const session = await TerminalSession.create({ shell: "/bin/bash", cols: 100, rows: 30 });
await new Promise((r) => setTimeout(r, 500));

// Criar um programa C simples que lê input
await session.write(`cat > /tmp/simple.c << 'EOF'
#include <stdio.h>
int main() {
    char buf[100];
    printf("Digite algo: ");
    fflush(stdout);
    if (fgets(buf, 100, stdin) != NULL) {
        printf("Voce digitou: %s", buf);
    }
    return 0;
}
EOF
cc /tmp/simple.c -o /tmp/simple\n`);
await new Promise((r) => setTimeout(r, 2000));

console.log("[1] Rodando programa interativo simples...");
await session.write("/tmp/simple\n");
await new Promise((r) => setTimeout(r, 2000));

let snap = session.snapshot("text");
console.log("\nTela após rodar programa:");
snap.text.split("\n").forEach((l, i) => {
  if (l.trim()) console.log(`  ${i}: |${l}|`);
});

console.log("\n[2] Enviando 'teste123'...");
await session.write("teste123\n");
await new Promise((r) => setTimeout(r, 2000));

snap = session.snapshot("text");
console.log("\nTela após enviar input:");
snap.text.split("\n").forEach((l, i) => {
  if (l.trim()) console.log(`  ${i}: |${l}|`);
});

if (snap.text.includes("teste123")) {
  console.log("\n✓✓✓ INTERAÇÃO FUNCIONOU! ✓✓✓");
} else {
  console.log("\n✗ Não funcionou");
}

session.close();
