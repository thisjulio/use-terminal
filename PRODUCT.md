# use-terminal — Product Specification

## Vision

**use-terminal** is a complete, observable, and programmable terminal for LLM agents: not just a `bash` function, but a real interactive PTY session that preserves state, emulates terminal behavior, and allows programs to be operated like a user would operate them.

The product is designed for coding agents working in local repositories. The core is a Bun/TypeScript package with equivalent adapters for local REST and MCP stdio. Its intended differentiation is bringing together a real PTY, VT/ANSI emulation, viewport, scrollback, selection, clipboard, mouse, and TUI automation under one contract. Every capability should exist through a low-level API faithful to bytes and events and through a high-level API oriented toward automation actions.

> Status: initial post-discovery specification. Capabilities marked as MVP are product targets, not claims that they are already implemented.

## Problem

A traditional shell tool is inadequate when an agent needs to:

- keep a shell and its processes persistent;
- answer prompts, menus, and interactive confirmations;
- operate TUIs and programs that depend on PTY, ANSI/VT, cursor, and dimensions;
- observe the current screen instead of merely accumulating stdout;
- follow long-running processes without blocking the call;
- share the same contract across TypeScript code, REST, and MCP.

## Users and use cases

### Initial users

- LLM agent developers;
- coding tool developers;
- project contributors.

### Priority use cases

1. Execute commands in a persistent shell.
2. Answer `y/n` prompts, menus, and interactive input.
3. Operate TUI programs, including installers, editors, and monitors.
4. Follow long-running processes and their incremental output.
5. Automate development and testing workflows.
6. Inspect the terminal screen in textual and structured formats.

## Value proposition

For agents that need to act like computer users, use-terminal provides a faithful, observable, and programmable terminal session. Unlike a `bash tool`, it preserves execution state, models the screen, and makes the same operations available through the package, REST, and MCP. The proposal does not claim absolute novelty; it aims to reduce fragmentation among these capabilities and provide agents with a coherent foundation.

## Principles

- **Real terminal first:** the PTY and session semantics are the source of truth.
- **Observable by default:** every important operation should be inspectable through events and snapshots.
- **One contract:** adapters must not create divergent capabilities.
- **Bytes when necessary, structure when useful:** the agent can operate at a low level or consume rich snapshots.
- **Composition:** the package should be useful without a server, and the server should be a thin adapter.
- **Security honesty:** the MVP targets trusted environments and is not a sandbox.
- **Explicit compatibility:** “full support” means a verifiable VT/ANSI feature matrix, not an unqualified promise without fixtures and tests.

## Broad MVP functional scope

### Sessions and PTY

- Create a session with a shell detected from `$SHELL` and a configurable `cwd`.
- Expose a low-level PTY API and a high-level `TerminalSession` API.
- Keep the shell, subprocesses, and jobs in the same session.
- Send bytes, text, special keys, and POSIX signals.
- Support Ctrl-C, Ctrl-D, Ctrl-Z, resize, shutdown, and exit codes.
- List, attach to, and detach from sessions.
- Expose a stable ID, status, PID/PGID, cwd, executable, dimensions, timestamps, exit code, latest snapshot, and metadata.

### Emulation, viewport, and snapshots

- Interpret VT/ANSI with a screen buffer, cursor, colors, attributes, dimensions, private modes, alternate screen, and scrollback.
- Model the viewport, scrollback offset, cell selection, multiline selection, and auto-scroll while dragging.
- Distinguish emulator-local scrolling from mouse events forwarded to applications that enable mouse tracking.
- Preserve the state required for bracketed paste, focus events, hyperlinks, clipboard, and feature negotiation.
- Provide selectable textual snapshot modes: visible lines, cursor/dimensions, styles/cells, and tree.
- Raw snapshot: JSON with dimensions, cells, text, cursor, and attributes.
- Semantic snapshot: a JSON tree with lines, regions, and interactive elements inferred when possible.
- The semantic model is heuristic and must indicate uncertainty; it does not replace the raw state.
- Mouse and clipboard are low-level and high-level operations; sequences, negotiations, and limitations remain observable.

### Low-level and high-level APIs

- Low-level: write/read bytes, send VT sequences, encoded keys, mouse events, signals, resize, raw snapshots, PTY events, and emulator state.
- High-level: `type`, `pressKey`, `click`, `drag`, `scroll`, `select`, `copy`, `paste`, `waitForText`, `waitForScreenChange`, and semantic actions.
- REST and MCP must expose the same operations, schemas, errors, and distinction between low-level and high-level APIs.

### Asynchronous operations

- Return a `session_id` quickly for long-running operations.
- Provide an `AsyncIterator` in the package.
- Emit raw PTY bytes and screen/cell changes; semantic events may be derived.
- Wait for text or screen changes as explicit operations.
- Obtain an on-demand snapshot without interrupting the process.

### Interfaces

- npm/Bun package as the programmatic core.
- REST API on `127.0.0.1`, with a configurable port, request/response endpoints, SSE, health/version, and CORS disabled by default.
- MCP stdio server in the first prototype.
- REST and MCP must expose the same operations and validations, generated or validated by shared TypeScript schemas.

### Observability

- Complete structured logs with redaction of known token, key, and password patterns.
- Events must include a timestamp, session ID, type, and appropriate payload.
- Recording must not accidentally turn a secret into persisted text; redaction is a safeguard, not a perfect guarantee.

## Initially out of scope, but part of the long-term goal

- sandbox, container, or VM;
- mandatory CPU, memory, time, and output limits;
- strong authentication and remote multi-tenancy;
- session persistence across restarts;
- a human web interface;
- distributed execution;
- Windows/macOS CI (the core should be abstracted for future portability).

Universal compatibility with every terminal and TUI is not assumed: each feature must be classified as supported, partially supported, or unsupported and covered by tests.

## Security and known limits

The MVP assumes a **trusted environment**. The use-terminal process can execute commands with the user's privileges and must not be exposed to a network without an external security layer. The default HTTP behavior binds to localhost, uses no authentication, and disables CORS; this reduces accidental exposure but does not constitute a security boundary.

Do not run untrusted code or commands with this MVP. Sandboxing and limits must be treated as requirements for a future version before remote or multi-tenant use.

## Success criteria

- Create and maintain a persistent bash/shell session through the package.
- Execute common commands through the API.
- Answer an interactive confirmation and operate a real TUI.
- Capture textual, raw structured, and semantic snapshots.
- Receive incremental output without mandatory polling.
- Execute the same operation through the package, REST, and MCP.
- Use a low-level API to reproduce bytes and a high-level API to automate semantic actions.
- Select and copy text in the viewport, navigate scrollback, and forward mouse events correctly when a TUI enables tracking.
- Have emulator unit tests, PTY integration tests, REST/MCP contract tests, deterministic snapshots, a real TUI test, Linux CI, and an executable quickstart.

## References and context

- [OpenAI CUA sample app](https://github.com/openai/openai-cua-sample-app) — agent use for operating computing environments.
- [Anthropic tool use cookbook](https://github.com/anthropics/claude-cookbooks/tree/main/tool_use) — tool-use patterns.
- [xterm.js](https://github.com/xtermjs/xterm.js) — web terminal emulator and compatibility reference.
- [Pexpect](https://github.com/pexpect/pexpect) — control of interactive programs in a pseudo-terminal.
- [termd](https://github.com/termd/termd) — terminal handling library/daemon.
- [`pty(7)`](https://man7.org/linux/man-pages/man7/pty.7.html) and [`tmux(1)`](https://man7.org/linux/man-pages/man1/tmux.1.html) — operational foundations for PTYs and persistent sessions.
