import type {
  SessionInfo,
  SessionOptions,
  SignalName,
  Snapshot,
  TerminalEvent,
  MouseEvent as TerminalMouseEvent,
} from "./types";

/**
 * REST adapter route table with shared JSON schemas.
 *
 * This table is the single source of truth used to:
 * - document REST operations (generates OpenAPI in `src/adapters/openapi.ts`);
 * - define MCP tools (identical input schemas in `src/adapters/mcp.ts`);
 * - validate REST/MCP parity in tests (`tests/contracts.test.ts`).
 */

export type JsonSchema = {
  type?: string;
  description?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean;
  $ref?: string;
  const?: unknown;
  oneOf?: JsonSchema[];
  minimum?: number;
  maximum?: number;
};

export type RouteResponse = {
  status: number;
  description: string;
  schema?: JsonSchema;
  contentType?: string;
};

export type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
};

export type RestRoute = {
  id: string;
  path: string;
  method: "GET" | "POST" | "DELETE";
  summary: string;
  description: string;
  tags: string[];
  pathParams?: { name: string; description: string }[];
  queryParams?: { name: string; required?: boolean; description: string; schema: JsonSchema }[];
  requestBody?: JsonSchema;
  responses: RouteResponse[];
  mcpTool?: McpToolDefinition;
  streaming?: boolean;
};

const OK_SCHEMA: JsonSchema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] };
const ERROR_SCHEMA: JsonSchema = { type: "object", properties: { error: { type: "string" } }, required: ["error"] };

export const COMPONENT_SCHEMAS: Record<string, JsonSchema> = {
  SignalName: { type: "string", enum: ["SIGINT", "SIGTERM", "SIGKILL", "SIGTSTP", "SIGHUP"] },
  SessionStatus: { type: "string", enum: ["running", "exited", "closed"] },
  SnapshotMode: { type: "string", enum: ["text", "raw", "semantic"] },
  TerminalColor: {
    oneOf: [
      { type: "object", properties: { type: { const: "default" } } },
      {
        type: "object",
        properties: { type: { const: "ansi" }, index: { type: "integer" } },
        required: ["type", "index"],
      },
      {
        type: "object",
        properties: { type: { const: "rgb" }, r: { type: "integer" }, g: { type: "integer" }, b: { type: "integer" } },
        required: ["type", "r", "g", "b"],
      },
    ],
  },
  Cell: {
    type: "object",
    properties: {
      char: { type: "string" },
      fg: { type: "string" },
      bg: { type: "string" },
      foreground: { $ref: "#/components/schemas/TerminalColor" },
      background: { $ref: "#/components/schemas/TerminalColor" },
      bold: { type: "boolean" },
      inverse: { type: "boolean" },
      underline: { type: "boolean" },
      dim: { type: "boolean" },
      italic: { type: "boolean" },
      strike: { type: "boolean" },
    },
    required: ["char", "fg", "bg", "bold", "inverse"],
  },
  SessionOptions: {
    type: "object",
    properties: {
      headed: { type: "boolean", description: "Also opens the web viewer for this session" },
      cwd: { type: "string" },
      shell: { type: "string" },
      command: { type: "string", description: "Program to run (default: $SHELL)" },
      args: { type: "array", items: { type: "string" } },
      cols: { type: "integer", minimum: 1 },
      rows: { type: "integer", minimum: 1 },
    },
  },
  SessionInfo: {
    type: "object",
    properties: {
      id: { type: "string" },
      status: { $ref: "#/components/schemas/SessionStatus" },
      headed: { type: "boolean" },
      pid: { type: "integer" },
      cwd: { type: "string" },
      shell: { type: "string" },
      cols: { type: "integer" },
      rows: { type: "integer" },
      exitCode: { type: "integer" },
      createdAt: { type: "integer" },
    },
    required: ["id", "status", "headed", "cwd", "shell", "cols", "rows", "createdAt"],
  },
  MouseEvent: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["click", "move", "press", "release", "wheel"] },
      button: { type: "string", enum: ["left", "middle", "right"] },
      x: { type: "integer", minimum: 1 },
      y: { type: "integer", minimum: 1 },
      delta: { type: "number", description: "Only for wheel; positive means scroll down" },
      shift: { type: "boolean" },
      meta: { type: "boolean" },
      ctrl: { type: "boolean" },
    },
    required: ["type", "x", "y"],
  },
  Snapshot: {
    type: "object",
    properties: {
      mode: { $ref: "#/components/schemas/SnapshotMode" },
      cols: { type: "integer" },
      rows: { type: "integer" },
      viewport: {
        type: "object",
        properties: { offset: { type: "integer" }, height: { type: "integer" }, totalRows: { type: "integer" } },
        required: ["offset", "height", "totalRows"],
      },
      scrollback: { type: "array", items: { type: "array", items: { $ref: "#/components/schemas/Cell" } } },
      cursor: {
        type: "object",
        properties: { x: { type: "integer" }, y: { type: "integer" }, visible: { type: "boolean" } },
        required: ["x", "y", "visible"],
      },
      text: { type: "string" },
      cells: { type: "array", items: { type: "array", items: { $ref: "#/components/schemas/Cell" } } },
      tree: { type: "object", description: "Heuristic semantic tree (present in mode=semantic)" },
      actions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            description: { type: "string" },
            input: { type: "string" },
            confidence: { type: "number" },
          },
          required: ["id", "label", "confidence"],
        },
      },
      colorUsage: { type: "array", items: { type: "object" } },
    },
    required: ["mode", "cols", "rows", "cursor"],
  },
  TerminalEvent: {
    type: "object",
    properties: {
      id: { type: "string" },
      sessionId: { type: "string" },
      type: { type: "string", enum: ["data", "screen", "exit"] },
      timestamp: { type: "integer" },
      data: { type: "string" },
      snapshot: { $ref: "#/components/schemas/Snapshot" },
      exitCode: { type: "integer" },
    },
    required: ["id", "sessionId", "type", "timestamp"],
  },
  KeyName: {
    type: "string",
    enum: [
      "ENTER",
      "TAB",
      "CTRL_C",
      "CTRL_D",
      "CTRL_Z",
      "ESC",
      "BACKSPACE",
      "ARROW_UP",
      "ARROW_DOWN",
      "ARROW_RIGHT",
      "ARROW_LEFT",
      "HOME",
      "END",
      "INSERT",
      "DELETE",
      "PAGE_UP",
      "PAGE_DOWN",
      "F1",
      "F2",
      "F3",
      "F4",
      "F5",
      "F6",
      "F7",
      "F8",
      "F9",
      "F10",
      "F11",
      "F12",
    ],
    description:
      "Keys supported by the high-level API: control keys (ENTER, TAB, CTRL_C, CTRL_D, CTRL_Z) and named keys (arrows, function keys, Home/End, PageUp/Down, ESC, Backspace, Insert/Delete)",
  },
  SelectionPoint: {
    type: "object",
    description: "A point in absolute screen coordinates (0 = top of scrollback).",
    properties: { x: { type: "integer", minimum: 0 }, y: { type: "integer", minimum: 0 } },
    required: ["x", "y"],
  },
  Selection: {
    type: "object",
    properties: {
      start: { $ref: "#/components/schemas/SelectionPoint" },
      end: { $ref: "#/components/schemas/SelectionPoint" },
    },
    required: ["start", "end"],
  },
  Error: ERROR_SCHEMA,
};

export const ROUTES: RestRoute[] = [
  {
    id: "health",
    path: "/health",
    method: "GET",
    summary: "Server health",
    description: "Returns the use-terminal status and version.",
    tags: ["system"],
    responses: [
      {
        status: 200,
        description: "OK",
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" }, version: { type: "string" } },
          required: ["ok", "version"],
        },
      },
    ],
  },
  {
    id: "sessions_list",
    path: "/sessions",
    method: "GET",
    summary: "List sessions",
    description: "Returns metadata for all sessions open in the manager.",
    tags: ["sessions"],
    mcpTool: {
      name: "sessions_list",
      description: "Lists all active sessions with metadata (id, status, pid, cwd, dimensions).",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    responses: [
      {
        status: 200,
        description: "Session list",
        schema: { type: "array", items: { $ref: "#/components/schemas/SessionInfo" } },
      },
    ],
  },
  {
    id: "sessions_create",
    path: "/sessions",
    method: "POST",
    summary: "Create session",
    description: "Creates a PTY session (shell by default or an explicit command) and returns SessionInfo.",
    tags: ["sessions"],
    requestBody: { $ref: "#/components/schemas/SessionOptions" },
    mcpTool: {
      name: "sessions_create",
      description:
        "Creates a real terminal session (PTY). Uses $SHELL by default; accepts command/args for specific programs (TUIs, REPLs). headed=true also opens the viewer.",
      inputSchema: {
        type: "object",
        properties: COMPONENT_SCHEMAS.SessionOptions!.properties,
        additionalProperties: false,
      },
    },
    responses: [{ status: 201, description: "Session created", schema: { $ref: "#/components/schemas/SessionInfo" } }],
  },
  {
    id: "session_info",
    path: "/sessions/{id}",
    method: "GET",
    summary: "Session metadata",
    description: "Returns session SessionInfo (status, pid, cwd, dimensions, exitCode).",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID (UUID)" }],
    mcpTool: {
      name: "sessions_info",
      description: "Returns session metadata (status, pid, cwd, dimensions, exitCode).",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" } },
        required: ["sessionId"],
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "Session found", schema: { $ref: "#/components/schemas/SessionInfo" } },
      { status: 404, description: "Session not found", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_snapshot",
    path: "/sessions/{id}/snapshot",
    method: "GET",
    summary: "Screen snapshot",
    description: "Text (default), raw (cells), or semantic (heuristic tree) snapshot.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    queryParams: [
      { name: "mode", description: "Snapshot mode", schema: { $ref: "#/components/schemas/SnapshotMode" } },
    ],
    mcpTool: {
      name: "sessions_snapshot",
      description:
        "Returns the screen snapshot: text (default), raw (cells + scrollback + viewport), or semantic (heuristic tree with suggested actions).",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" }, mode: { $ref: "#/components/schemas/SnapshotMode" } },
        required: ["sessionId"],
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "Snapshot", schema: { $ref: "#/components/schemas/Snapshot" } },
      { status: 404, description: "Session not found", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_screenshot",
    path: "/sessions/{id}/screenshot",
    method: "GET",
    summary: "Screen screenshot",
    description: "Renders the screen as SVG (default) or PNG.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    queryParams: [
      { name: "format", description: "svg (default) or png", schema: { type: "string", enum: ["svg", "png"] } },
      { name: "cellWidth", description: "Cell width in px", schema: { type: "integer" } },
      { name: "cellHeight", description: "Cell height in px", schema: { type: "integer" } },
    ],
    mcpTool: {
      name: "sessions_screenshot",
      description: "Returns the rendered screen as an image (SVG or PNG, base64).",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          format: { type: "string", enum: ["svg", "png"] },
          cellWidth: { type: "integer" },
          cellHeight: { type: "integer" },
        },
        required: ["sessionId"],
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "Image", contentType: "image/svg+xml or image/png" },
      { status: 400, description: "Invalid format", schema: { $ref: "#/components/schemas/Error" } },
      { status: 404, description: "Session not found", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_input",
    path: "/sessions/{id}/input",
    method: "POST",
    summary: "Write bytes to the PTY (low-level)",
    description: 'Writes raw text/bytes to the PTY stdin. Body: JSON string (for example, "cmd\\r") or plain text.',
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    requestBody: { type: "string", description: "Text (JSON string or plain text) to write to the PTY" },
    mcpTool: {
      name: "sessions_input",
      description:
        "Writes raw bytes to the PTY (low-level). Use escape strings (\\r, \\x1b) for keys and VT sequences.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" }, data: { type: "string" } },
        required: ["sessionId", "data"],
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "OK", schema: OK_SCHEMA },
      { status: 400, description: "Body is not a string", schema: { $ref: "#/components/schemas/Error" } },
      { status: 404, description: "Session not found", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_key",
    path: "/sessions/{id}/key",
    method: "POST",
    summary: "Send a key (high-level)",
    description:
      "Sends a mapped key (control keys ENTER, TAB, CTRL_C, CTRL_D, CTRL_Z, and named keys: arrows, function keys, Home/End, PageUp/Down, ESC, Backspace, Insert/Delete).",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    requestBody: { type: "object", properties: { key: { $ref: "#/components/schemas/KeyName" } }, required: ["key"] },
    mcpTool: {
      name: "sessions_key",
      description:
        "Sends a mapped key (control keys ENTER, TAB, CTRL_C, CTRL_D, CTRL_Z, and named keys: arrows, function keys, Home/End, PageUp/Down, ESC, Backspace, Insert/Delete).",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" }, key: { $ref: "#/components/schemas/KeyName" } },
        required: ["sessionId", "key"],
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "OK", schema: OK_SCHEMA },
      { status: 400, description: "Invalid key", schema: { $ref: "#/components/schemas/Error" } },
      { status: 404, description: "Session not found", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_type",
    path: "/sessions/{id}/type",
    method: "POST",
    summary: "Type text with optional Enter (high-level)",
    description: "Types text and, if submit=true, sends Enter in the same call.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    requestBody: {
      type: "object",
      properties: {
        text: { type: "string" },
        submit: { type: "boolean", description: "Sends Enter after the text (default: false)" },
      },
      required: ["text"],
    },
    mcpTool: {
      name: "sessions_type",
      description:
        "Types text in the session (high-level). With submit=true, sends Enter in the same call — use it to execute commands.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" }, text: { type: "string" }, submit: { type: "boolean" } },
        required: ["sessionId", "text"],
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "OK", schema: OK_SCHEMA },
      { status: 400, description: "text is missing", schema: { $ref: "#/components/schemas/Error" } },
      { status: 404, description: "Session not found", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_action",
    path: "/sessions/{id}/action",
    method: "POST",
    summary: "Execute a semantic action (high-level)",
    description:
      "Executes a deterministic semantic action by id with explicit parameters. Supported ids: press-key (params: key) and type (params: text, submit).",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    requestBody: {
      type: "object",
      properties: {
        id: { type: "string", enum: ["press-key", "type"], description: "Action id" },
        key: { type: "string", description: "Required for press-key" },
        text: { type: "string", description: "Required for type" },
        submit: { type: "boolean", description: "For type: sends Enter after the text (default: false)" },
      },
      required: ["id"],
    },
    mcpTool: {
      name: "sessions_action",
      description:
        "Executes a deterministic semantic action by id with explicit parameters. Supported ids: press-key (params: key) and type (params: text, submit).",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          id: { type: "string", enum: ["press-key", "type"] },
          key: { type: "string" },
          text: { type: "string" },
          submit: { type: "boolean" },
        },
        required: ["sessionId", "id"],
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "OK", schema: OK_SCHEMA },
      {
        status: 400,
        description: "Unknown action id or missing parameters",
        schema: { $ref: "#/components/schemas/Error" },
      },
      { status: 404, description: "Session not found", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_mouse",
    path: "/sessions/{id}/mouse",
    method: "POST",
    summary: "Mouse event (low-level)",
    description:
      "click, move, press, release, or wheel. Without active mouse tracking, wheel scrolls the local viewport.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    requestBody: { $ref: "#/components/schemas/MouseEvent" },
    mcpTool: {
      name: "sessions_mouse",
      description:
        "Sends mouse events (click/move/press/release/wheel) in SGR. If the TUI enabled mouse tracking, events go to the process; without tracking, wheel scrolls the local viewport.",
      inputSchema: {
        type: "object",
        properties: COMPONENT_SCHEMAS.MouseEvent!.properties,
        required: COMPONENT_SCHEMAS.MouseEvent!.required,
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "OK", schema: OK_SCHEMA },
      { status: 400, description: "Invalid event", schema: { $ref: "#/components/schemas/Error" } },
      { status: 404, description: "Session not found", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_drag",
    path: "/sessions/{id}/drag",
    method: "POST",
    summary: "Mouse drag (high-level)",
    description: "Press at `from`, move to `to`, and release at `to`.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    requestBody: {
      type: "object",
      properties: {
        from: { type: "object", properties: { x: { type: "integer" }, y: { type: "integer" } }, required: ["x", "y"] },
        to: { type: "object", properties: { x: { type: "integer" }, y: { type: "integer" } }, required: ["x", "y"] },
      },
      required: ["from", "to"],
    },
    mcpTool: {
      name: "sessions_drag",
      description: "Performs a mouse drag (press → move → release) in the session.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          from: {
            type: "object",
            properties: { x: { type: "integer" }, y: { type: "integer" } },
            required: ["x", "y"],
          },
          to: { type: "object", properties: { x: { type: "integer" }, y: { type: "integer" } }, required: ["x", "y"] },
        },
        required: ["sessionId", "from", "to"],
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "OK", schema: OK_SCHEMA },
      { status: 400, description: "Invalid parameters", schema: { $ref: "#/components/schemas/Error" } },
      { status: 404, description: "Session not found", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_viewport",
    path: "/sessions/{id}/viewport",
    method: "POST",
    summary: "Controls viewport/scrollback",
    description:
      "Sets offset (absolute position in scrollback) or delta (relative scroll). Returns the updated raw snapshot.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    requestBody: {
      type: "object",
      properties: {
        offset: { type: "integer", description: "Absolute offset (line 0 = top of scrollback)" },
        delta: { type: "integer", description: "Relative scroll (positive means down)" },
      },
    },
    mcpTool: {
      name: "sessions_viewport",
      description:
        "Navigates the session scrollback: offset (absolute) or delta (relative). Returns the raw snapshot of the visible screen.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" }, offset: { type: "integer" }, delta: { type: "integer" } },
        required: ["sessionId"],
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "Updated raw snapshot", schema: { $ref: "#/components/schemas/Snapshot" } },
      {
        status: 400,
        description: "Neither offset nor delta was provided",
        schema: { $ref: "#/components/schemas/Error" },
      },
      { status: 404, description: "Session not found", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_wait",
    path: "/sessions/{id}/wait",
    method: "POST",
    summary: "Wait for text on screen (high-level)",
    description: "Waits until the text appears in the text snapshot or the timeout expires.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    requestBody: {
      type: "object",
      properties: { text: { type: "string" }, timeoutMs: { type: "integer", description: "Default: 10000" } },
      required: ["text"],
    },
    mcpTool: {
      name: "sessions_wait",
      description:
        "Waits, with a timeout, for text to appear on screen. Essential for automating interactive programs.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" }, text: { type: "string" }, timeoutMs: { type: "integer" } },
        required: ["sessionId", "text"],
        additionalProperties: false,
      },
    },
    responses: [
      {
        status: 200,
        description: "Text found",
        schema: { type: "object", properties: { ok: { type: "boolean" }, text: { type: "string" } }, required: ["ok"] },
      },
      { status: 504, description: "Timeout waiting for text", schema: { $ref: "#/components/schemas/Error" } },
      { status: 404, description: "Session not found", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_wait_change",
    path: "/sessions/{id}/wait/change",
    method: "POST",
    summary: "Wait for any screen change (high-level)",
    description: "Waits until the visible screen changes after the call or the timeout expires.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    requestBody: {
      type: "object",
      properties: { timeoutMs: { type: "integer", description: "Default: 10000" } },
    },
    mcpTool: {
      name: "sessions_wait_change",
      description:
        "Waits, with a timeout, for the screen to change. Useful for TUIs and prompts without a known text string.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" }, timeoutMs: { type: "integer" } },
        required: ["sessionId"],
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "Screen changed", schema: OK_SCHEMA },
      { status: 504, description: "Timeout waiting for screen change", schema: { $ref: "#/components/schemas/Error" } },
      { status: 404, description: "Session not found", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_events",
    path: "/sessions/{id}/events",
    method: "GET",
    summary: "Collect events in a polling window",
    description:
      "Returns up to maxEvents events (data/screen/exit) collected within timeoutMs. Continuous streaming is available through SSE at /stream.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    queryParams: [
      { name: "maxEvents", description: "Maximum events (default: 50)", schema: { type: "integer" } },
      { name: "timeoutMs", description: "Collection window in ms (default: 2000)", schema: { type: "integer" } },
    ],
    mcpTool: {
      name: "sessions_events",
      description:
        "Collects terminal events (data/screen/exit) within a limited window — an alternative to SSE over MCP stdio.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" }, maxEvents: { type: "integer" }, timeoutMs: { type: "integer" } },
        required: ["sessionId"],
        additionalProperties: false,
      },
    },
    responses: [
      {
        status: 200,
        description: "Event list",
        schema: {
          type: "object",
          properties: { events: { type: "array", items: { $ref: "#/components/schemas/TerminalEvent" } } },
          required: ["events"],
        },
      },
      { status: 404, description: "Session not found", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_signal",
    path: "/sessions/{id}/signal",
    method: "POST",
    summary: "Send a POSIX signal",
    description: "Body: plain text containing the signal name (SIGINT, SIGTERM, SIGKILL, SIGTSTP, SIGHUP).",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    requestBody: { type: "string", description: "Signal name (for example, SIGINT)" },
    mcpTool: {
      name: "sessions_signal",
      description: "Sends a POSIX signal to the session process.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" }, signal: { $ref: "#/components/schemas/SignalName" } },
        required: ["sessionId", "signal"],
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "OK", schema: OK_SCHEMA },
      { status: 400, description: "Invalid signal", schema: { $ref: "#/components/schemas/Error" } },
      { status: 404, description: "Session not found", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_resize",
    path: "/sessions/{id}/resize",
    method: "POST",
    summary: "Resize PTY",
    description: "Changes emulator and PTY cols/rows.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    requestBody: {
      type: "object",
      properties: { cols: { type: "integer", minimum: 1 }, rows: { type: "integer", minimum: 1 } },
      required: ["cols", "rows"],
    },
    mcpTool: {
      name: "sessions_resize",
      description: "Resizes session (cols/rows) for the emulator and PTY.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" }, cols: { type: "integer" }, rows: { type: "integer" } },
        required: ["sessionId", "cols", "rows"],
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "Updated SessionInfo", schema: { $ref: "#/components/schemas/SessionInfo" } },
      { status: 404, description: "Session not found", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_clipboard_copy",
    path: "/sessions/{id}/clipboard/copy",
    method: "POST",
    summary: "Copy text to the host clipboard",
    description: "Uses xclip/xsel/wl-copy if available on the host.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    requestBody: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    mcpTool: {
      name: "sessions_clipboard_copy",
      description:
        "Copies text to the host clipboard (requires xclip/xsel/wl-copy to be installed). Returns copied=false if no tool is available.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" }, text: { type: "string" } },
        required: ["sessionId", "text"],
        additionalProperties: false,
      },
    },
    responses: [
      {
        status: 200,
        description: "Result",
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" }, copied: { type: "boolean" } },
          required: ["ok", "copied"],
        },
      },
      { status: 404, description: "Session not found", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_clipboard_paste",
    path: "/sessions/{id}/clipboard/paste",
    method: "POST",
    summary: "Paste the host clipboard into the PTY",
    description: "Reads the host clipboard and writes it to the session PTY.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    mcpTool: {
      name: "sessions_clipboard_paste",
      description: "Reads the host clipboard and writes its contents to the session PTY.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" } },
        required: ["sessionId"],
        additionalProperties: false,
      },
    },
    responses: [
      {
        status: 200,
        description: "Result",
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" }, pasted: { type: "boolean" } },
          required: ["ok", "pasted"],
        },
      },
      { status: 404, description: "Session not found", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_select",
    path: "/sessions/{id}/select",
    method: "POST",
    summary: "Select a screen region (high-level)",
    description: "Selects a region using absolute row coordinates (0 = top of scrollback). Returns the Selection.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    requestBody: {
      type: "object",
      properties: {
        from: { $ref: "#/components/schemas/SelectionPoint" },
        to: { $ref: "#/components/schemas/SelectionPoint" },
      },
      required: ["from", "to"],
    },
    mcpTool: {
      name: "sessions_select",
      description:
        "Selects a screen region (high-level). from/to use absolute row coordinates (0 = top of scrollback). Returns the Selection.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          from: { $ref: "#/components/schemas/SelectionPoint" },
          to: { $ref: "#/components/schemas/SelectionPoint" },
        },
        required: ["sessionId", "from", "to"],
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "Selection", schema: { $ref: "#/components/schemas/Selection" } },
      { status: 400, description: "Invalid parameters", schema: { $ref: "#/components/schemas/Error" } },
      { status: 404, description: "Session not found", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_clear_selection",
    path: "/sessions/{id}/selection/clear",
    method: "POST",
    summary: "Clear the current selection",
    description: "Removes the current screen selection.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    mcpTool: {
      name: "sessions_clear_selection",
      description: "Clears the current screen selection.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" } },
        required: ["sessionId"],
        additionalProperties: false,
      },
    },
    responses: [{ status: 200, description: "OK", schema: OK_SCHEMA }],
  },
  {
    id: "session_selection_text",
    path: "/sessions/{id}/selection",
    method: "GET",
    summary: "Get the selected text (high-level)",
    description: "Returns the text spanning the current selection (empty when there is none).",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    mcpTool: {
      name: "sessions_selection_text",
      description: "Returns the text of the current selection (empty when there is none).",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" } },
        required: ["sessionId"],
        additionalProperties: false,
      },
    },
    responses: [
      {
        status: 200,
        description: "Selected text",
        schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
      },
      { status: 404, description: "Session not found", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_selection_copy",
    path: "/sessions/{id}/selection/copy",
    method: "POST",
    summary: "Copy the selection to the host clipboard",
    description:
      "Copies the current selection to the host clipboard (requires xclip/xsel/wl-copy). Returns copied=false when there is no selection or no tool is available.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    mcpTool: {
      name: "sessions_selection_copy",
      description:
        "Copies the current selection to the host clipboard (requires xclip/xsel/wl-copy). Returns copied=false when there is no selection or no tool.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" } },
        required: ["sessionId"],
        additionalProperties: false,
      },
    },
    responses: [
      {
        status: 200,
        description: "Result",
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" }, copied: { type: "boolean" } },
          required: ["ok", "copied"],
        },
      },
      { status: 404, description: "Session not found", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_selection_paste",
    path: "/sessions/{id}/selection/paste",
    method: "POST",
    summary: "Paste the selection into the PTY",
    description:
      "Writes the current selection into the PTY. When the application negotiated bracketed paste, the text is wrapped in guard sequences.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    mcpTool: {
      name: "sessions_selection_paste",
      description: "Writes the current selection into the PTY (respecting bracketed paste when negotiated).",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" } },
        required: ["sessionId"],
        additionalProperties: false,
      },
    },
    responses: [{ status: 200, description: "OK", schema: OK_SCHEMA }],
  },
  {
    id: "session_stream",
    path: "/sessions/{id}/stream",
    method: "GET",
    summary: "SSE event stream",
    description: "SSE with data/screen/exit events. mode: text (default), raw, or semantic.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    queryParams: [
      {
        name: "mode",
        description: "Snapshot mode for screen events",
        schema: { $ref: "#/components/schemas/SnapshotMode" },
      },
    ],
    streaming: true,
    responses: [
      { status: 200, description: "SSE stream", contentType: "text/event-stream" },
      { status: 400, description: "Invalid mode", schema: { $ref: "#/components/schemas/Error" } },
      { status: 404, description: "Session not found", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_viewer",
    path: "/sessions/{id}/viewer",
    method: "GET",
    summary: "Session web viewer",
    description: "Interactive viewer HTML page (bidirectional WebSocket).",
    tags: ["sessions"],
    responses: [{ status: 200, description: "Viewer page", contentType: "text/html" }],
  },
  {
    id: "viewer_root",
    path: "/viewer",
    method: "GET",
    summary: "Generic viewer",
    description: "Viewer HTML page; use ?session=<id> or /sessions/{id}/viewer.",
    tags: ["sessions"],
    responses: [{ status: 200, description: "Viewer page", contentType: "text/html" }],
  },
  {
    id: "session_ws",
    path: "/sessions/{id}/ws",
    method: "GET",
    summary: "Viewer WebSocket",
    description:
      "Bidirectional WebSocket upgrade: receives the initial snapshot and events; accepts input/mouse/resize/viewport.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    responses: [{ status: 101, description: "WebSocket upgrade" }],
  },
  {
    id: "session_close",
    path: "/sessions/{id}/close",
    method: "DELETE",
    summary: "Close the session",
    description: "Terminates the process (SIGTERM) and marks the session as closed.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "Session ID" }],
    mcpTool: {
      name: "sessions_close",
      description: "Closes the session (SIGTERM) and releases the PTY.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" } },
        required: ["sessionId"],
        additionalProperties: false,
      },
    },
    responses: [{ status: 200, description: "OK", schema: OK_SCHEMA }],
  },
  {
    id: "openapi_doc",
    path: "/docs",
    method: "GET",
    summary: "Swagger UI",
    description:
      "Swagger interface (through the unpkg CDN; requires internet). OpenAPI is available at /docs/openapi.json.",
    tags: ["system"],
    responses: [{ status: 200, description: "Swagger UI", contentType: "text/html" }],
  },
  {
    id: "openapi_json",
    path: "/docs/openapi.json",
    method: "GET",
    summary: "OpenAPI 3.1",
    description: "OpenAPI 3.1 specification generated from the route table (src/contracts.ts).",
    tags: ["system"],
    responses: [{ status: 200, description: "OpenAPI document", contentType: "application/json" }],
  },
];

export const MCP_TOOL_NAMES: string[] = ROUTES.flatMap((route) => (route.mcpTool ? [route.mcpTool.name] : []));

export type { SessionInfo, SessionOptions, SignalName, Snapshot, TerminalEvent, TerminalMouseEvent };
