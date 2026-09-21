import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRestServer } from "../src/adapters/rest";
import { TerminalManager } from "../src/core/manager";

const execFileAsync = promisify(execFile);
const manager = new TerminalManager();
const session = await manager.create({ command: "cagent", args: [], cols: 100, rows: 30, headed: true });
const server = createRestServer(manager, Number(process.env.PORT ?? 0));
const url = `http://${server.hostname}:${server.port}/sessions/${session.id}/viewer`;
console.log(`Live viewer: ${url}`);
try {
  await execFileAsync("xdg-open", [url]);
} catch {
  console.log("Não foi possível abrir o navegador automaticamente; abra a URL acima.");
}
await new Promise<void>((resolve) => {
  const stop = () => {
    session.close();
    server.stop();
    resolve();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
});
