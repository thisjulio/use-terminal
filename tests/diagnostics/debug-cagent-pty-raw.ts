import { spawn } from "bun-pty";

const proc = spawn("cagent", [], {
  cwd: process.cwd(),
  name: "xterm-256color",
  cols: 120,
  rows: 36,
  env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor", COLUMNS: "120", LINES: "36" },
});
const started = Date.now();
proc.onData((data) => console.log(`${Date.now() - started}ms ${JSON.stringify(data)}`));
proc.onExit((event) => console.log(`${Date.now() - started}ms exit ${JSON.stringify(event)}`));
setTimeout(() => proc.kill("SIGINT"), 10000);
