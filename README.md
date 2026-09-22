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

## Planned interfaces

### npm package

The package is the primary interface for programmatic integration. The low-level layer preserves raw bytes and events; the high-level layer provides automation operations without hiding the raw snapshot or compatibility limitations.

### Localhost REST

A server started by the CLI should expose the package operations on `127.0.0.1`, with a configurable port, request/response endpoints, SSE, and health/version endpoints. CORS will be disabled by default.

### MCP stdio

An MCP stdio server should expose the same capabilities and schemas as the package/REST layer, allowing compatible clients to use the terminal without a parallel implementation.

## Security and limitations

The MVP assumes a **trusted environment**:

- it is not a sandbox;
- it does not impose mandatory CPU, memory, time, output, or concurrency limits;
- processes may have the privileges of the user running the service;
- do not expose the server to a network without an external authentication/isolation layer;
- localhost, disabled CORS, and the absence of authentication do not constitute strong security;
- sandboxing, limits, remote authentication, multi-tenancy, and distributed execution are deferred to later phases.

Logs will redact known patterns, but no secret detector is perfect.

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
| MCP stdio | 🧭 planned |
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

- [OpenAI CUA sample app](https://github.com/openai/openai-cua-sample-app)
- [Anthropic tool use cookbook](https://github.com/anthropics/claude-cookbooks/tree/main/tool_use)
- [xterm.js](https://github.com/xtermjs/xterm.js)
- [Pexpect](https://github.com/pexpect/pexpect)
- [termd](https://github.com/termd/termd)
- [`pty(7)`](https://man7.org/linux/man-pages/man7/pty.7.html)
- [`tmux(1)`](https://man7.org/linux/man-pages/man1/tmux.1.html)

## Contributing

Before implementing changes, read [`AGENTS.md`](./AGENTS.md). Behavior changes should update tests, documentation, and the shared contract when applicable.
