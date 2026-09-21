// Debug: alimentar emulador diretamente com bytes do Python prompt
import { TerminalEmulator } from "../../src/core/emulator";

const em = new TerminalEmulator(80, 24);

// Simular saída do Python REPL
em.feed("Python 3.14.7 on linux\r\n");
em.feed('Type "help" for more info.\r\n');

// Prompt do Python com ANSI
em.feed("\x1b[?2004h\x1b[?1h\x1b=\x1b[?25l\x1b[1;35m>>> \x1b[0m\x1b[4D\x1b[?12l\x1b[?25h\x1b[4C");

let snap = em.snapshot("text");
console.log("Snapshot após prompt:");
snap.text.split("\n").forEach((l, i) => {
  if (l.trim()) console.log(`  ${i}: |${l}|`);
});

console.log("\nCursor:", em["x"], em["y"]);

// Agora simular entrada do usuário
em.feed("print(123)\r");

snap = em.snapshot("text");
console.log("\nSnapshot após digitar:");
snap.text.split("\n").forEach((l, i) => {
  if (l.trim()) console.log(`  ${i}: |${l}|`);
});
