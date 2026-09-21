import { spawn } from "node:child_process";

const child = spawn("cagent", [], {
  cwd: process.cwd(),
  env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor", COLUMNS: "120", LINES: "36" },
  stdio: ["pipe", "pipe", "pipe"],
});

const started = Date.now();
const dump = (label: string, chunk: Buffer) => {
  const escaped = JSON.stringify(chunk.toString("utf8"));
  console.log(`${Date.now() - started}ms ${label} ${chunk.length} bytes ${escaped}`);
};
child.stdout.on("data", (chunk: Buffer) => dump("stdout", chunk));
child.stderr.on("data", (chunk: Buffer) => dump("stderr", chunk));
child.on("exit", (code, signal) => console.log(`${Date.now() - started}ms exit code=${code} signal=${signal}`));
setTimeout(() => {
  console.log(`${Date.now() - started}ms timeout killing child`);
  child.kill("SIGINT");
}, 10000);
