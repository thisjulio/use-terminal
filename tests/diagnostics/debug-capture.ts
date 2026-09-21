// Debug: verificar se o emulador captura saída de programas interativos
import { TerminalSession } from "../../index";

const session = await TerminalSession.create({ shell: "/bin/bash", cols: 100, rows: 30 });
await new Promise((r) => setTimeout(r, 500));

// Teste simples primeiro
await session.write("echo 'TESTE SIMPLES'\n");
await new Promise((r) => setTimeout(r, 1000));

let snap = session.snapshot("text");
console.log("Após echo simples:");
console.log(JSON.stringify(snap.text.substring(0, 200)));
console.log("---");

// Agora Python
await session.write("python3 -c \"print('PY TESTE')\"\n");
await new Promise((r) => setTimeout(r, 2000));

snap = session.snapshot("text");
console.log("Após python -c:");
console.log(JSON.stringify(snap.text.substring(0, 400)));
console.log("---");

// Python REPL
await session.write("python3\n");
await new Promise((r) => setTimeout(r, 3000));

snap = session.snapshot("text");
console.log("Após abrir python REPL:");
console.log(JSON.stringify(snap.text.substring(0, 400)));

session.close();
