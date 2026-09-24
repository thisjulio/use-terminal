/**
 * Shared key map: the single source of truth for named-key → byte sequences.
 *
 * The web viewer (src/adapters/rest.ts) and the programmatic
 * `TerminalSession` both resolve named keys through this table, so the bytes
 * a key produces are identical everywhere. Control keys (the ones that map to
 * pure control bytes) live in `session.ts` (`sendKey`); everything else that
 * maps to a VT/ANSI escape sequence lives here.
 */

export const NAMED_KEY_SEQUENCES = {
  ESC: "\x1b",
  ENTER: "\r",
  TAB: "\t",
  BACKSPACE: "\x7f",
  ARROW_UP: "\x1b[A",
  ARROW_DOWN: "\x1b[B",
  ARROW_RIGHT: "\x1b[C",
  ARROW_LEFT: "\x1b[D",
  HOME: "\x1b[H",
  END: "\x1b[F",
  INSERT: "\x1b[2~",
  DELETE: "\x1b[3~",
  PAGE_UP: "\x1b[5~",
  PAGE_DOWN: "\x1b[6~",
  F1: "\x1bOP",
  F2: "\x1bOQ",
  F3: "\x1bOR",
  F4: "\x1bOS",
  F5: "\x1b[15~",
  F6: "\x1b[17~",
  F7: "\x1b[18~",
  F8: "\x1b[19~",
  F9: "\x1b[20~",
  F10: "\x1b[21~",
  F11: "\x1b[23~",
  F12: "\x1b[24~",
} as const;

export type NamedKey = keyof typeof NAMED_KEY_SEQUENCES;

/** Returns the byte sequence for a named key, or null when it is not named. */
export function namedKeySequence(key: string): string | null {
  const upper = key.toUpperCase() as NamedKey;
  const sequence = NAMED_KEY_SEQUENCES[upper];
  return sequence ?? null;
}

/** True when `key` is a recognized named key. */
export function isNamedKey(key: string): boolean {
  return namedKeySequence(key) !== null;
}

/** Control keys that map to pure control bytes (the `sendKey` set). */
export const CONTROL_KEYS = ["ENTER", "TAB", "CTRL_C", "CTRL_D", "CTRL_Z"] as const;

/**
 * True when `key` is a recognized mapped key — either a control key
 * (ENTER, TAB, CTRL_C, CTRL_D, CTRL_Z) or a named key (arrows, function
 * keys, Home/End, PageUp/Down, ESC, Backspace, Insert/Delete).
 */
export function isMappedKey(key: string): boolean {
  return (CONTROL_KEYS as readonly string[]).includes(key) || isNamedKey(key);
}
