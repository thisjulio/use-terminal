import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

type JsonObject = { [key: string]: JsonValue };
type JsonValue = JsonObject | JsonValue[] | string | number | boolean | null;

const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8")) as JsonObject;

describe("MCP client configuration", () => {
  test("portable .mcp.json launches the published package entrypoint", async () => {
    const config = await readJson(".mcp.json");
    const servers = config.mcpServers as JsonObject;
    const server = servers["use-terminal"] as JsonObject;

    expect(server).toEqual({
      command: "npx",
      args: ["-y", "use-terminal@latest", "use-terminal-mcp"],
    });
  });

  test("VS Code configuration launches the published package entrypoint", async () => {
    const config = await readJson(".vscode/mcp.json");
    const servers = config.servers as JsonObject;
    const server = servers["use-terminal"] as JsonObject;

    expect(server).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "use-terminal@latest", "use-terminal-mcp"],
    });
  });

  test("the package declares a stable MCP executable", async () => {
    const packageJson = await readJson("package.json");
    const bin = packageJson.bin as JsonObject;

    expect(bin["use-terminal-mcp"]).toBe("bin/use-terminal-mcp.ts");
  });
});
