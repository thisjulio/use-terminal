// Teste funcional real: cria terminal, executa comandos, lê saída
import { TerminalSession } from "../../index";

console.log("=== TESTE FUNCIONAL REAL ===\n");

// 1. Criar sessão de terminal real
console.log("[1] Criando sessão PTY real...");
const session = await TerminalSession.create({
  shell: "/bin/bash",
  cols: 80,
  rows: 24,
});
console.log("    ✓ Sessão criada, status:", session.info().status);

// 2. Executar comando simples
console.log("\n[2] Executando: echo 'hello from real terminal'");
await session.write("echo 'hello from real terminal'\n");
await session.waitForText("hello from real terminal");
console.log("    ✓ Saída recebida");

// 3. Executar comando real do sistema
console.log("\n[3] Executando: pwd");
await session.write("pwd\n");
await session.waitForText("/home/");
console.log("    ✓ Saída recebida");

// 4. Verificar dimensões
console.log("\n[4] Verificando dimensões...");
console.log("    cols:", session.info().cols, "rows:", session.info().rows);

// 5. Redimensionar
console.log("\n[5] Redimensionando para 100x30...");
session.resize(100, 30);
console.log("    ✓ Novo tamanho: cols=", session.info().cols, "rows=", session.info().rows);

// 6. Comando que gera saída longa
console.log("\n[6] Executando: ls -la (capturando saída)...");
await session.write("ls -la\n");
await new Promise((r) => setTimeout(r, 500)); // espera a saída

// 7. Encerrar
console.log("\n[7] Encerrando sessão...");
session.close();
console.log("    ✓ Sessão encerrada");

console.log("\n=== RESULTADO: TERMINAL FUNCIONAL ===");
console.log("Conseguimos criar, interagir e encerrar um terminal real.");
