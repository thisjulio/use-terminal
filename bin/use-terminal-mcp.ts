#!/usr/bin/env -S bun run

import { runMcpStdio } from "../src/adapters/mcp";
import { TerminalManager } from "../src/core/manager";

runMcpStdio(new TerminalManager());
