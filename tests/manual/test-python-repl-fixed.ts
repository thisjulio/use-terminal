// Teste Python REPL com debug detalhado
import { TerminalSession } from "../../index";

const session = await TerminalSession.create({ shell: "/bin/bash", cols: 100, rows: 30 });
await new Promise((r) => setTimeout(r, 500));

console.log("[1] Abrindo Python REPL...");
await session.write("python3\n");

// Esperar mais tempo
await new Promise((r) => setTimeout(r, 5000));

let snap = session.snapshot("text");
console.log(`\nTela após abrir Python (5s):\n${snap.text}`);

// Verificar se tem prompt
if (snap.text.includes(">>>")) {
  console.log("\n✓ Prompt >>> detectado!");
} else {
  console.log("\n✗ Prompt >>> NÃO detectado");
}

console.log("\n[2] Enviando 'print(123)'...");
await session.write("print(123)\n");
await new Promise((r) => setTimeout(r, 3000));

snap = session.snapshot("text");
console.log(`\nTela após comando:\n${snap.text}`);

if (snap.text.includes("123")) {
  console.log("\n✓✓✓ Python processou o comando! ✓✓✓");
} else {
  console.log("\n✗ Python não processou");
}

session.close();
