import { runMcpStdio } from "./adapters/mcp";
import { TerminalManager } from "./core/manager";

// MCP server entrypoint: reads JSON-RPC from stdin and writes to stdout.
// Uso: bun run src/mcp.ts  (ou: echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | bun run src/mcp.ts)
runMcpStdio(new TerminalManager());
