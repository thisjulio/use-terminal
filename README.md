# use-terminal

> A complete, observable, and programmable terminal for LLM agents.

**use-terminal** gives an agent a real, programmable terminal session—not just an isolated `bash` call. The goal is to reproduce, over a real PTY, the capabilities relevant to a human terminal: low-level input, VT/ANSI emulation, scrollback, viewport, selection, clipboard, mouse, TUIs, and observable snapshots. The same core should provide a low-level API for precise control and a high-level API for automation, exposed consistently through the package, REST, and MCP.

> **Current status:** the executable core already has persistent sessions over a real PTY, a basic ANSI emulator, snapshots, and REST/MCP adapters. Full compatibility with real terminals, including scrollback, viewport, selection, and all VT/ANSI modes, remains an evolving goal and must not be assumed to be implemented.

## Why not just a bash tool?

A shell call is usually enough for short commands, but it loses context when an agent needs to:

- keep a shell and processes persistent;
- answer `y/n` prompts, menus, or interactive input;
- handle PTY, ANSI/VT, cursor, colors, and resize;
- control long-running jobs;
- operate TUIs such as editors, monitors, and installers;
- observe the current screen instead of inferring everything from stdout.

use-terminal treats the terminal as a live session with state and events.

## Positioning

Other tools already explore providing PTYs, persistent sessions, and TUI automation for agents. use-terminal aims to differentiate itself through the combination of a real PTY, observable screen state, snapshots at different representation levels, and a shared contract across the package, REST, and MCP. The future semantic layer will be heuristic and must preserve the raw snapshot as the source of truth.

## Product direction

- **Initial audience:** LLM agent developers, coding tools, and contributors.
- **Initial platform:** Linux; the core is abstracted for future portability.
- **Runtime:** Bun + TypeScript.
- **Distribution:** a programmatic npm package with a localhost REST server and MCP stdio.
- **Planned license:** MIT.

## Target capabilities

- A real PTY and a persistent shell detected from `$SHELL`;
- a low-level PTY API and a high-level `TerminalSession` API;
- byte-by-byte stdin/output, special keys, signals, and resize;
- multiple sessions, jobs, attach/detach, and exit codes;
- a compatible VT/ANSI emulator with buffer, cursor, colors, attributes, private modes, alternate screen, and scrollback;
- cell-based viewport and selection with auto-scroll, clipboard, and a distinction between local scrolling and TUI mouse reporting;
- progressive support for OSC/DCS, hyperlinks, bracketed paste, focus events, mouse tracking, and other terminal-negotiated features;
- a raw JSON snapshot of cells and a tree-based semantic snapshot;
- incremental streaming through `AsyncIterator`;
- an SSE stream of textual, raw, or semantic snapshots for live viewing;
- waiting for text or screen changes;
- mouse and clipboard;
- a low-level API for bytes, sequences, events, snapshots, and PTY control;
- a high-level API for `type`, keys, clicks, scrolling, selection, clipboard, waiting for text/changes, and semantic actions;
- local REST with SSE and MCP stdio, using shared TypeScript schemas and parity between both APIs;
- structured logs with redaction of known secret patterns.

Semantic snapshots will be heuristic. The raw snapshot remains the source of truth.

## Intended API example

The API below is illustrative and is not yet available:

```ts
import { TerminalSession } from "use-terminal";

const terminal = await TerminalSession.create({
  cwd: process.cwd(),
  shell: process.env.SHELL,
  cols: 120,
  rows: 36,
});

await terminal.write("printf 'ready\\n'");
await terminal.waitForText("ready");

console.log(terminal.snapshot({ mode: "text" }));
console.log(terminal.snapshot({ mode: "raw" }));

for await (const event of terminal.events()) {
  // bytes, screen changes, or semantic events
  console.log(event);
}
```

See [`PRODUCT.md`](./PRODUCT.md) for the conceptual contract and [`ROADMAP.md`](./ROADMAP.md) for the implementation order.

## Interfaces

### npm package

The package is the primary interface for programmatic integration. The low-level layer preserves raw bytes and events; the high-level layer provides automation operations without hiding the raw snapshot or compatibility limitations.

### Localhost REST

A server started by the CLI exposes package operations on `127.0.0.1`, with a configurable port, request/response endpoints, SSE, and health/version endpoints. CORS is disabled by default.

### MCP stdio

The MCP server exposes the same session operations and shared schemas as the package/REST layer over the MCP JSON-RPC stdio transport. It is intended for MCP clients such as Claude Code, Claude Desktop, Cursor, VS Code, Windsurf, Cline, and other compatible hosts.

The server reads one JSON-RPC message per line from stdin and writes one JSON-RPC response per line to stdout. Do not write logs, banners, or diagnostic output to stdout: it is the protocol channel. The server is local, starts child processes with the privileges of its host process, and is not a sandbox.

## MCP quickstart

### Requirements

- Linux for the current PTY backend;
- [Node.js](https://nodejs.org/) 18 or newer with `npx` available;
- an MCP-compatible client;
- a trusted workspace and shell environment.

### Run the published npm package

The recommended integration uses the package's executable entrypoint. The MCP client runs `npx`, which downloads the declared package version when necessary and forwards stdio to the server:

```bash
npx -y use-terminal@latest use-terminal-mcp
```

This command waits for MCP JSON-RPC messages on stdin. It is normally started by an MCP client rather than run interactively. To perform a basic protocol smoke test:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize"}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \\
  | npx -y use-terminal@latest use-terminal-mcp
```

Pin a release instead of `latest` when reproducibility matters:

```bash
npx -y use-terminal@0.1.3 use-terminal-mcp
```

The published launcher requires Node.js for `npx`, while the package's PTY backend currently targets Linux. Repository contributors can still run the source entrypoint with `bun run mcp`.

### Project `.mcp.json`

The repository includes a ready-to-use project configuration at [`.mcp.json`](./.mcp.json):

```json
{
  "mcpServers": {
    "use-terminal": {
      "command": "npx",
      "args": ["-y", "use-terminal@latest", "use-terminal-mcp"]
    }
  }
}
```

This is the portable `mcpServers` shape used by Claude Code and several other MCP clients. The command uses the published npm package, so consumers do not need a checkout of this repository or Bun installed. Pin `use-terminal@<version>` for reproducible team setup.

VS Code uses a different workspace file shape, so the repository also includes [`.vscode/mcp.json`](./.vscode/mcp.json):

```json
{
  "servers": {
    "use-terminal": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "use-terminal@latest", "use-terminal-mcp"]
    }
  }
}
```

The `servers` object and `type: "stdio"` are VS Code-specific. The portable `.mcp.json` uses `mcpServers` and omits the `type` field for stdio.

### Claude Code

Use the project configuration from `.mcp.json`, or add the published package explicitly:

```bash
claude mcp add --scope project use-terminal -- \
  npx -y use-terminal@latest use-terminal-mcp
```

Pin a version in the command when the project requires deterministic tool versions. Verify the connection with:

```text
/mcp
```

Claude Code passes everything after `--` to the stdio server launcher. Do not omit the separator, because `npx` arguments must not be parsed as Claude Code options.

### VS Code, Cursor, and other clients

- **VS Code:** open the workspace in VS Code; it reads `.vscode/mcp.json`. The `servers` object requires `type: "stdio"`.
- **Cursor:** add the `mcpServers` entry from `.mcp.json` in Cursor Settings → MCP, or use the client's project MCP configuration.
- **Claude Desktop and compatible clients:** copy the `use-terminal` entry under the client's `mcpServers` object. Keep `command`, `args`, and `cwd` together.
- **Other clients:** use the standard stdio fields `command`, `args`, `cwd`, and optional `env`. Consult the host's documentation for the location of its configuration file.

### Tool discovery and first call

After the client connects, it should call `initialize` and `tools/list`. The server advertises these tools:

- `sessions_list`, `sessions_create`, `sessions_info`, `sessions_snapshot`;
- `sessions_input`, `sessions_type`, `sessions_key`, `sessions_wait`, `sessions_events`;
- `sessions_mouse`, `sessions_drag`, `sessions_viewport`, `sessions_resize`;
- `sessions_screenshot`, `sessions_signal`, `sessions_close`;
- `sessions_clipboard_copy`, `sessions_clipboard_paste`.

A typical first request is:

```text
Create a shell session, run `printf 'hello\\n'`, wait for `hello`, inspect the text snapshot, and close the session.
```

The client should create a session first, retain its returned `sessionId`, and pass that ID to subsequent tools. Prefer `sessions_type` with `submit: true` for normal interactive commands. Use `sessions_input` for raw bytes, control characters, and VT sequences. Use `sessions_snapshot` to inspect state without interrupting the process.

## Security and limitations

The MVP assumes a **trusted environment**:

- it is not a sandbox;
- it does not impose mandatory CPU, memory, time, output, or concurrency limits;
- processes may have the privileges of the user running the service;
- do not expose the server to a network without an external authentication/isolation layer;
- localhost, disabled CORS, and the absence of authentication do not constitute strong security;
- sandboxing, limits, remote authentication, multi-tenancy, and distributed execution are deferred to later phases.

An MCP client can invoke tools that start shells, execute commands, send signals, read output, and access the host clipboard. Review and trust the `.mcp.json` before enabling it, especially in repositories obtained from third parties. Do not configure this server in an untrusted workspace or expose it to a remote MCP client without an external security boundary.

Logs will redact known patterns, but no secret detector is perfect. Keep protocol output on stdout and send any future diagnostics to stderr.

### Operator warning

use-terminal is a privileged tool, not a sandbox. A session can start a configurable shell, write bytes directly to the PTY, send signals, read process output, and interact with the clipboard. Therefore, any caller that can reach the package, REST server, or MCP can potentially execute commands with the privileges of the process user. Run it only in trusted environments, keep REST/MCP on localhost, and implement authentication, per-session authorization, limits, and isolation before exposing these interfaces to third parties or a network.

## Status and roadmap

| Area | Status |
| --- | --- |
| Discovery and product vision | ✅ complete |
| Specification and roadmap | ✅ complete |
| PTY/session package | 🧭 planned |
| VT/ANSI emulator and snapshots | 🧭 planned |
| Localhost REST | 🧭 planned |
| MCP stdio | ✅ implemented |
| Semantic tree, mouse, and clipboard | 🧭 planned |

See the [complete roadmap](./ROADMAP.md).

## Development

The core has an executable implementation. The development workflow is:

```bash
bun install
bun test
bun run typecheck
```

The Linux backend uses a real PTY with unified stdin/stdout, echo, signals, and resize. The project is not yet a sandbox. Emulator compatibility is built through an explicit feature matrix, byte fixtures, real processes, and real TUIs; no universal equivalence is promised without corresponding tests.

### Live viewing

The stream endpoint can deliver raw frames while preserving the cells, colors, and cursor required by a Canvas or SVG frontend:

```text
GET /sessions/:id/stream?mode=raw
```

Each `screen` SSE event contains a snapshot with `mode: "raw"` and can be rendered as a new frame. For a simple prototype, the client can connect with `EventSource`; for visual rendering, prefer the raw snapshot instead of polling `/screenshot`. The stream does not record video or throttle output: the client must limit the paint rate if necessary.

### Headed mode

The default mode remains headless. To follow a session in the browser, create it with `headed: true` and open:

```text
GET /sessions/:id
```

The viewer connects to the raw stream, displays the screen in real time, and accepts keyboard focus, text input, Enter, Tab, Backspace, and terminal clicks. For a demonstration with `cagent`:

```bash
bun run demo:viewer
```

The command starts a headed session on `127.0.0.1`, opens the browser, and keeps the session alive until Ctrl-C. Headed mode is a local view/control surface for the same PTY; it does not create a sandbox or a separate graphical process window.

The headed viewer uses a bidirectional WebSocket at `/sessions/:id/ws`: the server sends an initial snapshot and screen events, while the browser sends input, mouse events, wheel events, and resize messages over the same channel. The viewer forwards control keys, arrows, navigation keys, function keys, modifiers, and dragging. Selection is made directly by cell on the canvas, with visual highlighting and copying through Ctrl/Cmd+C. The SSE endpoint remains available for read-only integrations.

## References

- [Playwright MCP](https://playwright.dev/docs/getting-started-mcp) — reference for MCP installation, stdio configuration, tool discovery, and client setup.
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) — reference for a local developer-tool MCP server.
- [MCP specification](https://modelcontextprotocol.io/specification/latest) — protocol and transport details.
- [VS Code MCP configuration](https://code.visualstudio.com/docs/agents/reference/mcp-configuration) — `mcp.json` fields and workspace configuration.
- [Claude Code MCP reference](https://code.claude.com/docs/en/mcp) — project-scoped `.mcp.json`, stdio commands, and server management.
- [OpenAI CUA sample app](https://github.com/openai/openai-cua-sample-app)
- [Anthropic tool use cookbook](https://github.com/anthropics/claude-cookbooks/tree/main/tool_use)
- [xterm.js](https://github.com/xtermjs/xterm.js)
- [Pexpect](https://github.com/pexpect/pexpect)
- [termd](https://github.com/termd/termd)
- [`pty(7)`](https://man7.org/linux/man-pages/man7/pty.7.html)
- [`tmux(1)`](https://man7.org/linux/man-pages/man1/tmux.1.html)

## Contributing

Before implementing changes, read [`AGENTS.md`](./AGENTS.md). Behavior changes should update tests, documentation, and the shared contract when applicable.
