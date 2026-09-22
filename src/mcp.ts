import { runMcpStdio } from "./adapters/mcp";
import { TerminalManager } from "./core/manager";

// Entrypoint do servidor MCP: lê JSON-RPC de stdin e escreve em stdout.
// Uso: bun run src/mcp.ts  (ou: echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | bun run src/mcp.ts)
runMcpStdio(new TerminalManager());
