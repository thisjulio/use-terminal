// Teste com programas interativos simples
import { TerminalSession } from "../../index";

const session = await TerminalSession.create({ shell: "/bin/bash", cols: 100, rows: 30 });
await new Promise((r) => setTimeout(r, 500));

// Teste 1: cat (ecoa o que digita)
console.log("[1] Testando 'cat' (eco simples)...");
await session.write("cat\n");
await new Promise((r) => setTimeout(r, 1000));
await session.write("linha teste\n");
await new Promise((r) => setTimeout(r, 1000));

let snap = session.snapshot("text");
if (snap.text.includes("linha teste")) {
  console.log("    ✓ cat funcionou!");
} else {
  console.log("    ✗ cat não funcionou");
}

// Sair do cat com Ctrl+D
await session.sendKey("CTRL_D");
await new Promise((r) => setTimeout(r, 500));

// Teste 2: script bash com read
console.log("\n[2] Testando script bash com read...");
await session.write('bash -c "read x; echo "resposta: $x""\n');
await new Promise((r) => setTimeout(r, 1000));
await session.write("oi\n");
await new Promise((r) => setTimeout(r, 1000));

snap = session.snapshot("text");
if (snap.text.includes("resposta: oi")) {
  console.log("    ✓ bash read funcionou!");
} else {
  console.log("    ✗ bash read não funcionou");
  console.log("    Tela:", snap.text.slice(-200));
}

session.close();
