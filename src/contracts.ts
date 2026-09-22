import type {
  SessionInfo,
  SessionOptions,
  SignalName,
  Snapshot,
  TerminalEvent,
  MouseEvent as TerminalMouseEvent,
} from "./types";

/**
 * Tabela de rotas do adapter REST com schemas JSON compartilhados.
 *
 * Esta tabela é a fonte única de verdade usada para:
 * - documentar as operações do REST (gera o OpenAPI em `src/adapters/openapi.ts`);
 * - definir as tools MCP (input schemas idênticos em `src/adapters/mcp.ts`);
 * - validar paridade REST/MCP nos testes (`tests/contracts.test.ts`).
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
      headed: { type: "boolean", description: "Abre também o viewer web para esta sessão" },
      cwd: { type: "string" },
      shell: { type: "string" },
      command: { type: "string", description: "Programa a executar (padrão: $SHELL)" },
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
      delta: { type: "number", description: "Só para wheel; positivo = scroll down" },
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
      tree: { type: "object", description: "Árvore semântica heurística (presente em mode=semantic)" },
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
    enum: ["ENTER", "TAB", "CTRL_C", "CTRL_D", "CTRL_Z"],
    description: "Teclas especiais suportadas pela API high-level",
  },
  Error: ERROR_SCHEMA,
};

export const ROUTES: RestRoute[] = [
  {
    id: "health",
    path: "/health",
    method: "GET",
    summary: "Health do servidor",
    description: "Retorna status e versão do use-terminal.",
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
    summary: "Lista sessões",
    description: "Retorna metadados de todas as sessões abertas no manager.",
    tags: ["sessions"],
    mcpTool: {
      name: "sessions_list",
      description: "Lista todas as sessões ativas com metadados (id, status, pid, cwd, dimensões).",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    responses: [
      {
        status: 200,
        description: "Lista de sessões",
        schema: { type: "array", items: { $ref: "#/components/schemas/SessionInfo" } },
      },
    ],
  },
  {
    id: "sessions_create",
    path: "/sessions",
    method: "POST",
    summary: "Cria sessão",
    description: "Cria uma sessão PTY (shell por padrão ou comando explícito) e retorna o SessionInfo.",
    tags: ["sessions"],
    requestBody: { $ref: "#/components/schemas/SessionOptions" },
    mcpTool: {
      name: "sessions_create",
      description:
        "Cria uma sessão de terminal real (PTY). Usa $SHELL por padrão; aceita command/args para programas específicos (TUIs, REPLs). headed=true também abre o viewer.",
      inputSchema: {
        type: "object",
        properties: COMPONENT_SCHEMAS.SessionOptions!.properties,
        additionalProperties: false,
      },
    },
    responses: [{ status: 201, description: "Sessão criada", schema: { $ref: "#/components/schemas/SessionInfo" } }],
  },
  {
    id: "session_info",
    path: "/sessions/{id}",
    method: "GET",
    summary: "Metadados da sessão",
    description: "Retorna SessionInfo da sessão (status, pid, cwd, dimensões, exitCode).",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "ID da sessão (UUID)" }],
    mcpTool: {
      name: "sessions_info",
      description: "Retorna os metadados da sessão (status, pid, cwd, dimensões, exitCode).",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" } },
        required: ["sessionId"],
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "Sessão encontrada", schema: { $ref: "#/components/schemas/SessionInfo" } },
      { status: 404, description: "Sessão não encontrada", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_snapshot",
    path: "/sessions/{id}/snapshot",
    method: "GET",
    summary: "Snapshot da tela",
    description: "Snapshot textual (padrão), bruto (células) ou semântico (árvore heurística).",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "ID da sessão" }],
    queryParams: [
      { name: "mode", description: "Modo do snapshot", schema: { $ref: "#/components/schemas/SnapshotMode" } },
    ],
    mcpTool: {
      name: "sessions_snapshot",
      description:
        "Retorna o snapshot da tela: text (padrão), raw (células + scrollback + viewport) ou semantic (árvore heurística com ações sugeridas).",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" }, mode: { $ref: "#/components/schemas/SnapshotMode" } },
        required: ["sessionId"],
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "Snapshot", schema: { $ref: "#/components/schemas/Snapshot" } },
      { status: 404, description: "Sessão não encontrada", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_screenshot",
    path: "/sessions/{id}/screenshot",
    method: "GET",
    summary: "Screenshot da tela",
    description: "Renderiza a tela em SVG (padrão) ou PNG.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "ID da sessão" }],
    queryParams: [
      { name: "format", description: "svg (padrão) ou png", schema: { type: "string", enum: ["svg", "png"] } },
      { name: "cellWidth", description: "Largura da célula em px", schema: { type: "integer" } },
      { name: "cellHeight", description: "Altura da célula em px", schema: { type: "integer" } },
    ],
    mcpTool: {
      name: "sessions_screenshot",
      description: "Retorna a tela renderizada como imagem (SVG ou PNG, base64).",
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
      { status: 200, description: "Imagem", contentType: "image/svg+xml ou image/png" },
      { status: 400, description: "Formato inválido", schema: { $ref: "#/components/schemas/Error" } },
      { status: 404, description: "Sessão não encontrada", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_input",
    path: "/sessions/{id}/input",
    method: "POST",
    summary: "Escreve bytes no PTY (low-level)",
    description: 'Escreve texto/bytes crus no stdin do PTY. Body: string JSON (ex.: "cmd\\r") ou texto puro.',
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "ID da sessão" }],
    requestBody: { type: "string", description: "Texto (string JSON ou texto puro) a escrever no PTY" },
    mcpTool: {
      name: "sessions_input",
      description:
        "Escreve bytes crus no PTY (low-level). Use strings de escape (\\r, \\x1b) para teclas e sequências VT.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" }, data: { type: "string" } },
        required: ["sessionId", "data"],
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "OK", schema: OK_SCHEMA },
      { status: 400, description: "Body não é string", schema: { $ref: "#/components/schemas/Error" } },
      { status: 404, description: "Sessão não encontrada", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_key",
    path: "/sessions/{id}/key",
    method: "POST",
    summary: "Envia tecla especial (high-level)",
    description: "Envia teclas especiais mapeadas (ENTER, TAB, CTRL_C, CTRL_D, CTRL_Z).",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "ID da sessão" }],
    requestBody: { type: "object", properties: { key: { $ref: "#/components/schemas/KeyName" } }, required: ["key"] },
    mcpTool: {
      name: "sessions_key",
      description: "Envia uma tecla especial mapeada (ENTER, TAB, CTRL_C, CTRL_D, CTRL_Z).",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" }, key: { $ref: "#/components/schemas/KeyName" } },
        required: ["sessionId", "key"],
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "OK", schema: OK_SCHEMA },
      { status: 400, description: "Tecla inválida", schema: { $ref: "#/components/schemas/Error" } },
      { status: 404, description: "Sessão não encontrada", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_type",
    path: "/sessions/{id}/type",
    method: "POST",
    summary: "Digita texto com Enter opcional (high-level)",
    description: "Digita o texto e, se submit=true, envia Enter na mesma chamada.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "ID da sessão" }],
    requestBody: {
      type: "object",
      properties: {
        text: { type: "string" },
        submit: { type: "boolean", description: "Envia Enter após o texto (padrão: false)" },
      },
      required: ["text"],
    },
    mcpTool: {
      name: "sessions_type",
      description:
        "Digita texto na sessão (high-level). Com submit=true envia o Enter na mesma chamada — use para executar comandos.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" }, text: { type: "string" }, submit: { type: "boolean" } },
        required: ["sessionId", "text"],
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "OK", schema: OK_SCHEMA },
      { status: 400, description: "text ausente", schema: { $ref: "#/components/schemas/Error" } },
      { status: 404, description: "Sessão não encontrada", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_mouse",
    path: "/sessions/{id}/mouse",
    method: "POST",
    summary: "Evento de mouse (low-level)",
    description: "click, move, press, release ou wheel. Wheel sem mouse tracking ativo rola o viewport local.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "ID da sessão" }],
    requestBody: { $ref: "#/components/schemas/MouseEvent" },
    mcpTool: {
      name: "sessions_mouse",
      description:
        "Envia eventos de mouse (click/move/press/release/wheel) em SGR. Se a TUI habilitou mouse tracking, os eventos vão para o processo; wheel sem tracking rola o viewport local.",
      inputSchema: {
        type: "object",
        properties: COMPONENT_SCHEMAS.MouseEvent!.properties,
        required: COMPONENT_SCHEMAS.MouseEvent!.required,
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "OK", schema: OK_SCHEMA },
      { status: 400, description: "Evento inválido", schema: { $ref: "#/components/schemas/Error" } },
      { status: 404, description: "Sessão não encontrada", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_drag",
    path: "/sessions/{id}/drag",
    method: "POST",
    summary: "Arraste de mouse (high-level)",
    description: "Press em `from`, move para `to`, release em `to`.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "ID da sessão" }],
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
      description: "Executa um arraste de mouse (press → move → release) na sessão.",
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
      { status: 400, description: "Parâmetros inválidos", schema: { $ref: "#/components/schemas/Error" } },
      { status: 404, description: "Sessão não encontrada", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_viewport",
    path: "/sessions/{id}/viewport",
    method: "POST",
    summary: "Controla viewport/scrollback",
    description:
      "Define offset (posição absoluta no scrollback) ou delta (rolagem relativa). Retorna o snapshot raw atualizado.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "ID da sessão" }],
    requestBody: {
      type: "object",
      properties: {
        offset: { type: "integer", description: "Offset absoluto (linha 0 = topo do scrollback)" },
        delta: { type: "integer", description: "Rolagem relativa (positivo = para baixo)" },
      },
    },
    mcpTool: {
      name: "sessions_viewport",
      description:
        "Navega o scrollback da sessão: offset (posicional) ou delta (relativo). Retorna o snapshot raw da tela visível.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" }, offset: { type: "integer" }, delta: { type: "integer" } },
        required: ["sessionId"],
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "Snapshot raw atualizado", schema: { $ref: "#/components/schemas/Snapshot" } },
      { status: 400, description: "Nem offset nem delta informados", schema: { $ref: "#/components/schemas/Error" } },
      { status: 404, description: "Sessão não encontrada", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_wait",
    path: "/sessions/{id}/wait",
    method: "POST",
    summary: "Espera por texto na tela (high-level)",
    description: "Aguarda até o texto aparecer no snapshot text ou o timeout expirar.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "ID da sessão" }],
    requestBody: {
      type: "object",
      properties: { text: { type: "string" }, timeoutMs: { type: "integer", description: "Padrão: 10000" } },
      required: ["text"],
    },
    mcpTool: {
      name: "sessions_wait",
      description:
        "Aguarda (com timeout) até o texto aparecer na tela. Essencial para automatizar programas interativos.",
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
        description: "Texto encontrado",
        schema: { type: "object", properties: { ok: { type: "boolean" }, text: { type: "string" } }, required: ["ok"] },
      },
      { status: 504, description: "Timeout esperando texto", schema: { $ref: "#/components/schemas/Error" } },
      { status: 404, description: "Sessão não encontrada", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_events",
    path: "/sessions/{id}/events",
    method: "GET",
    summary: "Coleta eventos em janela (polling)",
    description:
      "Retorna até maxEvents eventos (data/screen/exit) coletados em até timeoutMs. Streaming contínuo via SSE em /stream.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "ID da sessão" }],
    queryParams: [
      { name: "maxEvents", description: "Máximo de eventos (padrão: 50)", schema: { type: "integer" } },
      { name: "timeoutMs", description: "Janela de coleta em ms (padrão: 2000)", schema: { type: "integer" } },
    ],
    mcpTool: {
      name: "sessions_events",
      description:
        "Coleta eventos do terminal (data/screen/exit) em uma janela limitada — alternativa ao SSE em MCP stdio.",
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
        description: "Lista de eventos",
        schema: {
          type: "object",
          properties: { events: { type: "array", items: { $ref: "#/components/schemas/TerminalEvent" } } },
          required: ["events"],
        },
      },
      { status: 404, description: "Sessão não encontrada", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_signal",
    path: "/sessions/{id}/signal",
    method: "POST",
    summary: "Envia sinal POSIX",
    description: "Body: texto puro com o nome do sinal (SIGINT, SIGTERM, SIGKILL, SIGTSTP, SIGHUP).",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "ID da sessão" }],
    requestBody: { type: "string", description: "Nome do sinal (ex.: SIGINT)" },
    mcpTool: {
      name: "sessions_signal",
      description: "Envia um sinal POSIX para o processo da sessão.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" }, signal: { $ref: "#/components/schemas/SignalName" } },
        required: ["sessionId", "signal"],
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "OK", schema: OK_SCHEMA },
      { status: 400, description: "Sinal inválido", schema: { $ref: "#/components/schemas/Error" } },
      { status: 404, description: "Sessão não encontrada", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_resize",
    path: "/sessions/{id}/resize",
    method: "POST",
    summary: "Redimensiona PTY",
    description: "Altera cols/rows do emulador e do PTY.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "ID da sessão" }],
    requestBody: {
      type: "object",
      properties: { cols: { type: "integer", minimum: 1 }, rows: { type: "integer", minimum: 1 } },
      required: ["cols", "rows"],
    },
    mcpTool: {
      name: "sessions_resize",
      description: "Redimensiona a sessão (cols/rows) do emulador e do PTY.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" }, cols: { type: "integer" }, rows: { type: "integer" } },
        required: ["sessionId", "cols", "rows"],
        additionalProperties: false,
      },
    },
    responses: [
      { status: 200, description: "SessionInfo atualizado", schema: { $ref: "#/components/schemas/SessionInfo" } },
      { status: 404, description: "Sessão não encontrada", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_clipboard_copy",
    path: "/sessions/{id}/clipboard/copy",
    method: "POST",
    summary: "Copia texto para o clipboard do host",
    description: "Usa xclip/xsel/wl-copy se disponível no host.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "ID da sessão" }],
    requestBody: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    mcpTool: {
      name: "sessions_clipboard_copy",
      description:
        "Copia o texto para o clipboard do host (requer xclip/xsel/wl-copy instalados). Retorna copied=false se nenhum tool estiver disponível.",
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
        description: "Resultado",
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" }, copied: { type: "boolean" } },
          required: ["ok", "copied"],
        },
      },
      { status: 404, description: "Sessão não encontrada", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_clipboard_paste",
    path: "/sessions/{id}/clipboard/paste",
    method: "POST",
    summary: "Cola o clipboard do host no PTY",
    description: "Lê o clipboard do host e escreve no PTY da sessão.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "ID da sessão" }],
    mcpTool: {
      name: "sessions_clipboard_paste",
      description: "Lê o clipboard do host e escreve o conteúdo no PTY da sessão.",
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
        description: "Resultado",
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" }, pasted: { type: "boolean" } },
          required: ["ok", "pasted"],
        },
      },
      { status: 404, description: "Sessão não encontrada", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_stream",
    path: "/sessions/{id}/stream",
    method: "GET",
    summary: "Stream SSE de eventos",
    description: "SSE com eventos data/screen/exit. mode: text (padrão), raw ou semantic.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "ID da sessão" }],
    queryParams: [
      {
        name: "mode",
        description: "Modo do snapshot nos eventos screen",
        schema: { $ref: "#/components/schemas/SnapshotMode" },
      },
    ],
    streaming: true,
    responses: [
      { status: 200, description: "Fluxo SSE", contentType: "text/event-stream" },
      { status: 400, description: "Modo inválido", schema: { $ref: "#/components/schemas/Error" } },
      { status: 404, description: "Sessão não encontrada", schema: { $ref: "#/components/schemas/Error" } },
    ],
  },
  {
    id: "session_viewer",
    path: "/sessions/{id}/viewer",
    method: "GET",
    summary: "Viewer web da sessão",
    description: "Página HTML do viewer interativo (WebSocket bidirecional).",
    tags: ["sessions"],
    responses: [{ status: 200, description: "Página do viewer", contentType: "text/html" }],
  },
  {
    id: "viewer_root",
    path: "/viewer",
    method: "GET",
    summary: "Viewer genérico",
    description: "Página HTML do viewer; use ?session=<id> ou /sessions/{id}/viewer.",
    tags: ["sessions"],
    responses: [{ status: 200, description: "Página do viewer", contentType: "text/html" }],
  },
  {
    id: "session_ws",
    path: "/sessions/{id}/ws",
    method: "GET",
    summary: "WebSocket do viewer",
    description:
      "Upgrade WebSocket bidirecional: recebe snapshot inicial + eventos; aceita input/mouse/resize/viewport.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "ID da sessão" }],
    responses: [{ status: 101, description: "Upgrade para WebSocket" }],
  },
  {
    id: "session_close",
    path: "/sessions/{id}/close",
    method: "DELETE",
    summary: "Fecha a sessão",
    description: "Encerra o processo (SIGTERM) e marca a sessão como closed.",
    tags: ["sessions"],
    pathParams: [{ name: "id", description: "ID da sessão" }],
    mcpTool: {
      name: "sessions_close",
      description: "Encerra a sessão (SIGTERM) e libera a PTY.",
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
    description: "Interface Swagger (via CDN unpkg; requer internet). OpenAPI em /docs/openapi.json.",
    tags: ["system"],
    responses: [{ status: 200, description: "Swagger UI", contentType: "text/html" }],
  },
  {
    id: "openapi_json",
    path: "/docs/openapi.json",
    method: "GET",
    summary: "OpenAPI 3.1",
    description: "Especificação OpenAPI 3.1 gerada da tabela de rotas (src/contracts.ts).",
    tags: ["system"],
    responses: [{ status: 200, description: "Documento OpenAPI", contentType: "application/json" }],
  },
];

export const MCP_TOOL_NAMES: string[] = ROUTES.flatMap((route) => (route.mcpTool ? [route.mcpTool.name] : []));

export type { SessionInfo, SessionOptions, SignalName, Snapshot, TerminalEvent, TerminalMouseEvent };
