import { runMcpStdio } from "./adapters/mcp";
import { TerminalManager } from "./core/manager";

// MCP server entrypoint: reads JSON-RPC from stdin and writes to stdout.
// Usage: bun run src/mcp.ts (or pipe a JSON-RPC request into the command).
runMcpStdio(new TerminalManager());
