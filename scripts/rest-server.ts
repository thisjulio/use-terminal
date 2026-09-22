import { createRestServer } from "../src/adapters/rest";
import { TerminalManager } from "../src/core/manager";

const port = Number(process.env.PORT ?? 0);
const server = createRestServer(new TerminalManager(), port);
console.log(`REST: http://${server.hostname}:${server.port}`);
console.log(
  `OpenAPI: http://${server.hostname}:${server.port}/docs (Swagger UI) — http://${server.hostname}:${server.port}/docs/openapi.json`,
);

const stop = () => {
  server.stop();
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
