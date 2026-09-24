export type SessionStatus = "running" | "exited" | "closed";
export type SignalName = "SIGINT" | "SIGTERM" | "SIGKILL" | "SIGTSTP" | "SIGHUP";
export type MouseButton = "left" | "middle" | "right";
export type MouseEvent = {
  type: "click" | "move" | "release" | "press" | "wheel";
  button?: MouseButton;
  x: number;
  y: number;
  delta?: number;
  shift?: boolean;
  meta?: boolean;
  ctrl?: boolean;
};
export type TerminalColor =
  | { type: "default" }
  | { type: "ansi"; index: number }
  | { type: "rgb"; r: number; g: number; b: number };
export type Cell = {
  char: string;
  fg: string;
  bg: string;
  foreground?: TerminalColor;
  background?: TerminalColor;
  bold: boolean;
  inverse: boolean;
  underline?: boolean;
  dim?: boolean;
  italic?: boolean;
  strike?: boolean;
  hyperlink?: string;
};
export type SelectionPoint = { x: number; y: number };
export type Selection = {
  start: SelectionPoint;
  end: SelectionPoint;
};
export type SemanticRole =
  | "terminal"
  | "line"
  | "text"
  | "prompt"
  | "input"
  | "output"
  | "error"
  | "menu"
  | "table"
  | "header"
  | "status"
  | "cursor";

export type SemanticAction = {
  id: string;
  label: string;
  description?: string;
  input?: string;
  confidence: number;
};

export type SemanticNode = {
  role: SemanticRole;
  text?: string;
  children?: SemanticNode[];
  confidence: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  actions?: SemanticAction[];
  colorUsage?: Array<{
    color: TerminalColor;
    count: number;
    regions: Array<{ x: number; y: number; width: number; height: number }>;
  }>;
};
export type Snapshot = {
  mode: "text" | "raw" | "semantic";
  cols: number;
  rows: number;
  viewport?: { offset: number; height: number; totalRows: number };
  scrollback?: Cell[][];
  cursor: { x: number; y: number; visible: boolean };
  selection?: Selection;
  modes?: Record<string, boolean>;
  text?: string;
  cells?: Cell[][];
  tree?: SemanticNode;
  actions?: SemanticAction[];
  colorUsage?: Array<{
    color: TerminalColor;
    count: number;
    regions: Array<{ x: number; y: number; width: number; height: number }>;
  }>;
};
export type TerminalEvent = {
  id: string;
  sessionId: string;
  type: "data" | "screen" | "exit";
  timestamp: number;
  data?: string;
  snapshot?: Snapshot;
  exitCode?: number;
};
export type SessionInfo = {
  id: string;
  status: SessionStatus;
  headed: boolean;
  pid?: number;
  cwd: string;
  shell: string;
  cols: number;
  rows: number;
  exitCode?: number;
  createdAt: number;
};
export type SessionOptions = {
  headed?: boolean;
  cwd?: string;
  shell?: string;
  command?: string;
  args?: string[];
  cols?: number;
  rows?: number;
};
export type McpMessage = {
  method: string;
  params?: SessionOptions & {
    mode?: Snapshot["mode"];
    input?: string;
    signal?: SignalName;
  };
};
