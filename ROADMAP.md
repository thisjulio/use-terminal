# use-terminal — Roadmap

This roadmap turns the vision in `PRODUCT.md` into verifiable increments. The long-term goal is a complete terminal over a real PTY, with equivalent low-level and high-level APIs through the package, REST, and MCP. “Complete” will be measured by a VT/ANSI compatibility matrix and real tests, not by an unlimited claim.

## Phase 0 — Foundation and contract

**Goal:** make the project executable and establish reversible decisions.

- [x] Initialize a Bun/TypeScript package with development and test commands.
- [x] Define shared types for sessions, events, snapshots, and errors.
- [x] Define PTY backend and `TerminalSession` interfaces.
- [x] Record the Linux compatibility contract and trusted-environment security policy.
- [x] Configure Linux CI, linting, formatting, and tests.
- [x] Decide, after a spike, which PTY library and VT/ANSI parser best fit Bun.

**Outcome:** a minimal compilable package, documented interfaces, and a comparable PTY/parser spike.

## Phase 1 — npm core: PTY and persistent session

**Goal:** create the basic programmable terminal.

- [x] Implement PTY creation and a shell detected from `$SHELL`.
- [x] Implement `TerminalSession` with `cwd`, dimensions, and metadata.
- [x] Send text/bytes, special keys, and POSIX signals.
- [x] Implement Ctrl-C/Ctrl-D/Ctrl-Z, resize, shutdown, and exit codes.
- [x] Implement IDs, status, listing, attach/detach, and persistent jobs.
- [x] Expose incremental reading through `AsyncIterator`.
- [x] Add integration with a real shell and interactive commands.

**Outcome:** an agent can start, operate, and follow a persistent shell using only the npm package.

## Phase 2 — VT/ANSI emulator and snapshots

**Goal:** represent the screen, not only bytes.

- [x] Integrate or implement a VT/ANSI parser with documented coverage.
- [x] Model buffer, cursor, dimensions, attributes, colors, and scrollback.
- [x] Implement deterministic textual snapshots.
- [x] Implement raw cell snapshots in JSON.
- [x] Emit screen/cell change events.
- [x] Test ANSI sequences and real TUIs.

**Outcome:** an agent can observe the current screen with enough fidelity to act.

## Phase 3 — REST and MCP adapters

**Goal:** make the same core available through the selected integration interfaces.

- [x] Implement shared TypeScript schemas and input/output validation.
- [x] Implement localhost REST with a configurable port.
- [x] Implement session, input, signal, resize, snapshot, and SSE stream endpoints.
- [x] Implement health/version.
- [x] Implement an MCP stdio server with equivalent operations.
- [x] Create parity tests between the package, REST, and MCP.
- [x] Document the `127.0.0.1` bind, disabled CORS, and absence of authentication.
- [x] Document MCP client prerequisites, stdio startup, JSON-RPC framing, tool discovery, and first-call workflow.
- [x] Add a portable project `.mcp.json` configuration for clients using `mcpServers`.
- [x] Add a VS Code-compatible `.vscode/mcp.json` configuration using `servers` and `type: "stdio"`.
- [x] Document Claude Code, VS Code, Cursor, and generic MCP client setup.
- [x] Reserve stdout for MCP protocol messages and document the stderr rule for diagnostics.

**Outcome:** an agent can choose the package, REST, or MCP without changing the capability model, and a standard MCP client can discover and invoke the server.

## Phase 4 — Semantic snapshot

**Goal:** reduce the agent's interpretation work.

- [x] Define the semantic tree schema.
- [x] Represent lines/cells, regions, and focus/cursor.
- [x] Infer interactive elements using explicit heuristics.
- [x] Represent suggested actions and confidence levels.
- [x] Always preserve the raw snapshot as the source of truth.
- [x] Create fixtures for prompts, menus, tables, installers, and TUIs.

**Outcome:** an agent can choose high-level actions without losing access to the raw screen.

## Phase 5 — Mouse, clipboard, and ergonomics

**Goal:** cover interactions beyond the keyboard.

- [x] Support mouse events and sequences.
- [x] Define clipboard read/write behavior and environment limits.
- [x] Add click, movement, and selection actions to the schemas.
- [x] Test TUIs that use mouse and clipboard.

**Outcome:** the broad MVP covers the main interaction channels of a human terminal.

## Phase 6 — Complete terminal emulator

**Goal:** bring emulator behavior closer to a real terminal and make compatibility measurable.

- [x] Define a compatibility matrix for VT/ANSI, OSC, CSI, DCS, and private modes.
- [x] Implement persistent scrollback, viewport, offset, and alternate screen.
- [x] Implement cell/multiline selection and auto-scroll while dragging.
- [x] Separate emulator-local scrolling from mouse reporting forwarded to the TUI.
- [x] Progressively support bracketed paste, focus events, hyperlinks, clipboard, and feature negotiation.
- [x] Add deterministic fixtures for each sequence and tests with real shells and TUIs.
- [x] Publish viewport, selection, scrollback, and active-mode snapshots without losing raw bytes.

**Outcome:** the viewer and APIs can reproduce the main flows of a human terminal, with limitations documented per feature.

## Phase 7 — Low-level and high-level APIs

**Goal:** provide faithful control and ergonomic automation over the same core.

- [x] Define shared schemas for low-level and high-level operations.
- [x] Expose bytes, sequences, events, modes, viewport, and snapshots through the low-level API.
- [x] Expose `type`, keys, clicks, drag, scrolling, selection, clipboard, and waits through the high-level API.
- [x] Expose `pressKey` (named keys: arrows, function keys, Home/End, PageUp/Down, ESC, Backspace, Insert/Delete) and `performAction` (deterministic semantic actions `type` and `press-key`) through the high-level API, package, REST (`/key` and `/action`), and MCP (`sessions_key` and `sessions_action`), with a shared key map as the single source of truth.
- [x] Ensure parity of operations, errors, and validations between the package, REST, and MCP.
- [x] Create contract tests and automation examples for each adapter.
- [x] Keep access to the raw snapshot and raw events in every high-level operation.

**Outcome:** an agent can choose terminal fidelity or semantic automation without changing its capability model.

## Phase 8 — Robustness, security, and distribution

**Goal:** prepare for use beyond trusted environments.

- [ ] Evaluate sandboxing/containerization/VMs.
- [ ] Add CPU, memory, time, output, and concurrency limits.
- [ ] Design strong authentication and secure remote exposure.
- [ ] Evaluate persistence/reconnection after restart.
- [ ] Expand CI to macOS and Windows when the backend allows it.
- [x] Publish the npm package and provide `bunx`/diagnostic CLI support.
- [ ] Add latency and capacity benchmarks.

**Outcome:** a foundation for remote, multi-user, and production use without confusing it with the trusted-environment MVP.

## Definition of done for the complete-terminal goal

- Parser/emulator unit tests;
- PTY integration tests;
- REST/MCP contract tests;
- deterministic snapshots;
- a test with at least one real TUI;
- green Linux CI;
- an executable quickstart;
- documentation that separates implemented, planned, and limited behavior;
- an updated compatibility matrix associating every supported feature with tests;
- proven parity across low-level/high-level APIs, the package, REST, and MCP;
- selection, scrollback, viewport, mouse reporting, and clipboard tested in the viewer and core.

## Product risks

| Risk | Initial mitigation |
| --- | --- |
| PTY/parser library does not work well in Bun | Phase 0 spike and abstracted backend |
| The terminal “DOM” creates false confidence | Mandatory raw snapshot and confidence-aware heuristics |
| REST/MCP parity diverges | Shared schemas and contract tests |
| MCP clients use incompatible configuration shapes | Document both `mcpServers` and VS Code `servers` formats, with tested stdio examples |
| MCP protocol output is polluted by logs | Reserve stdout for JSON-RPC and route diagnostics to stderr |
| TUIs depend on unsupported details | Real fixtures and an explicit compatibility matrix |
| Selection and scrolling confuse the viewer with the TUI | Explicit viewport, alternate-screen, and mouse-tracking state |
| The high-level API hides terminal behavior | Preserve raw bytes, events, and the raw snapshot in every operation |
| The MVP is used as a sandbox | Prominent documentation and a ban on security claims |
| Broad scope delays validation | Release the npm core before semantic features |
