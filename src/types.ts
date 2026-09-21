export type SessionStatus = "running" | "exited" | "closed";
export type SignalName = "SIGINT" | "SIGTERM" | "SIGKILL" | "SIGTSTP" | "SIGHUP";
export type Cell = { char: string; fg: string; bg: string; bold: boolean; inverse: boolean };
export type SemanticNode = {
  role: "terminal" | "line" | "text";
  text?: string;
  children?: SemanticNode[];
  confidence: number;
};
export type Snapshot = {
  mode: "text" | "raw" | "semantic";
  cols: number;
  rows: number;
  cursor: { x: number; y: number; visible: boolean };
  text?: string;
  cells?: Cell[][];
  tree?: SemanticNode;
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
  pid?: number;
  cwd: string;
  shell: string;
  cols: number;
  rows: number;
  exitCode?: number;
  createdAt: number;
};
export type SessionOptions = { cwd?: string; shell?: string; cols?: number; rows?: number };
export type McpMessage = { method: string; params?: SessionOptions };
