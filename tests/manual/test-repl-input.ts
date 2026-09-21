// Teste: enviar comandos para REPL já aberto
import { TerminalSession } from "../../index";

const session = await TerminalSession.create({ shell: "/bin/bash", cols: 100, rows: 30 });
await new Promise((r) => setTimeout(r, 500));

// Abrir Python REPL
await session.write("python3\n");
await new Promise((r) => setTimeout(r, 3000));

console.log("Python REPL aberto. Enviando comandos...");

// Enviar comando mesmo sem ver o prompt
await session.write("print('FUNCIONA!')\n");
await new Promise((r) => setTimeout(r, 2000));

let snap = session.snapshot("text");
console.log("\nApós print('FUNCIONA!'):");
console.log(snap.text);

// Verificar se apareceu
if (snap.text.includes("FUNCIONA!")) {
  console.log("\n✓✓✓ O REPL processou o comando! ✓✓✓");
}

// Tentar outra coisa
await session.write("x = 10\n");
await session.write("y = 20\n");
await session.write("print(x + y)\n");
await new Promise((r) => setTimeout(r, 2000));

snap = session.snapshot("text");
console.log("\nApós cálculos:");
console.log(snap.text);

if (snap.text.includes("30")) {
  console.log("\n✓✓✓ Cálculo correto (10+20=30)! ✓✓✓");
}

// Sair
await session.write("exit()\n");
await new Promise((r) => setTimeout(r, 1000));
session.close();
