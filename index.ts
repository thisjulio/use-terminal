export { handleMcp } from "./src/adapters/mcp";
export { createRestServer } from "./src/adapters/rest";
export { TerminalEmulator } from "./src/core/emulator";
export { TerminalManager } from "./src/core/manager";
export { TerminalSession } from "./src/core/session";
export { renderScreenshot, renderScreenshotSvg } from "./src/core/screenshot";
export type { ScreenshotFormat, ScreenshotOptions } from "./src/core/screenshot";
export * from "./src/types";
export * from "./src/core/colors";

export function redact(value: string): string {
  return value.replace(/(password|token|secret|api[_-]?key)(\s*[=:]\s*)[^\s&]+/gi, "$1$2[REDACTED]");
}

export { TerminalSession as default } from "./src/core/session";
