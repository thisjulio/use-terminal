# AGENTS.md

Instructions for coding agents working in the `use-terminal` repository.

## Project context

use-terminal is interactive terminal infrastructure for LLM agents. The product should provide a real PTY, persistent sessions, VT/ANSI emulation, screen snapshots, and adapters for an npm package, localhost REST, and MCP stdio. Read these documents first:

1. [`README.md`](./README.md) — public overview and current status;
2. [`PRODUCT.md`](./PRODUCT.md) — product decisions and boundaries;
3. [`ROADMAP.md`](./ROADMAP.md) — delivery sequence.

Documentation may describe future targets. Do not present a capability as implemented without code and tests that prove it.

## Implementation principles

- Preserve the separation between the PTY backend, session, emulator, snapshots, events, and adapters.
- Make the programmatic package the core; REST and MCP should remain thin adapters.
- Use shared TypeScript schemas for inputs, outputs, events, and errors.
- Preserve raw bytes and enough metadata for diagnosis; semantic representations are derived.
- Do not hide uncertainty in semantic-tree heuristics: keep the raw snapshot available.
- Prefer asynchronous, cancellable APIs for long-running processes.
- Generate stable session IDs and keep state transitions explicit.
- Keep the domain independent of HTTP, MCP, and agent frameworks.
- The initial target is Linux, but abstract boundaries that may change on macOS/Windows.

## Security

The MVP targets a trusted environment, is not a sandbox, and can execute commands with the user's privileges. Therefore:

- do not introduce isolation claims without implementing and testing a real boundary;
- do not enable remote binding by default;
- explicitly document `127.0.0.1`, disabled CORS, and the absence of authentication;
- treat stdin, stdout, logs, snapshots, and events as possible sources of secrets;
- apply redaction before persisting or emitting logs when appropriate;
- never add telemetry, uploads, or remote execution silently;
- any future change involving networking, multi-tenancy, or untrusted code requires a security review.

## Required workflow

1. Read the context documents and locate the corresponding roadmap item.
2. Inspect the existing code and tests before editing.
3. Make a small change with explicit types and observable errors.
4. Add or update tests with the change.
5. Update documentation/contracts if public behavior changes.
6. Run the relevant tests and then the complete available test suite.
7. Describe in the PR/commit what changed, how it was verified, and which limitations remain.

## Contracts and compatibility

Changes to public operations must update, in the same change:

- TypeScript types and schemas;
- package implementation;
- REST adapter;
- MCP adapter;
- contract/parity tests;
- examples and documentation.

Do not create an operation in only one adapter without explicitly recording the exception in the roadmap. Errors must have a stable shape, a useful message, and safe context for logs.

## PTY and emulator

- Test with real processes and deterministic byte fixtures.
- Distinguish bytes received from the PTY from changes derived in the screen state.
- Cover dimensions, cursor, scrollback, colors/attributes, signals, and shutdown.
- Do not rely only on `echo` tests; include prompts, input without a newline, long-running processes, and at least one real TUI.
- Make resize and shutdown idempotent whenever practical.
- Avoid blocking Bun's event loop during reads/writes.

## Minimum tests for every change

- Parser/emulator: unit tests and deterministic snapshots.
- PTY/session: Linux integration test with a real shell.
- REST/MCP: contract and parity tests against the package API.
- Streaming: ordering, backpressure, cancellation, and shutdown.
- Security/logging: redaction and secret-free test cases.
- Quickstart: documented commands must work in a clean installation.

If a feature cannot be tested reliably, reduce its scope or record the limitation; do not replace verification with a promise.

## Style

- Strict TypeScript and names that describe terminal semantics.
- Small functions, justified dependencies, and focused interfaces.
- Apply Clean Code pragmatically: use intention-revealing names, give each function one primary responsibility, avoid duplication, and keep conditionals simple.
- Use SOLID as a heuristic, not a ritual: preserve SRP between the domain and adapters, depend on interfaces at boundaries, and prefer composition; do not create speculative abstractions.
- Refactor in small, behavior-preserving steps while keeping tests that make behavior observable.
- Comments should explain decisions and limitations, not repeat the code.
- Keep commits small and focused.
- Do not reformat unrelated files.
- Do not add dependencies without checking their license, maintenance, Bun/Linux compatibility, and bundle impact.

### Decision reference

These practices were aligned after research on Clean Code, SOLID, and refactoring with SearXNG in September 2026. The consulted references include [Refactoring.Guru](https://refactoring.guru/) and the [DigitalOcean article on SOLID](https://www.digitalocean.com/community/conceptual-articles/s-o-l-i-d-the-first-five-principles-of-object-oriented-design).

In this project, that means prioritizing cohesion, low coupling, and testable code without introducing layers that do not address a concrete need.

## Review criteria

A change is ready when:

- behavior aligns with `PRODUCT.md` and the relevant `ROADMAP.md` phase;
- the public API and its adapters remain coherent;
- tests reproduce the main case and important failures;
- logs/snapshots do not unnecessarily leak secrets;
- documentation distinguishes implemented from planned behavior;
- validation commands pass in Linux CI.
