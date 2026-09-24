/**
 * Phase 6: VT/ANSI/OSC/CSI/DCS compatibility matrix.
 *
 * This module is the single source of truth for which byte sequences the
 * built-in emulator understands. Each entry states the supported feature and
 * the exact escape prefix that produces it. The matrix is asserted by unit
 * tests so the matrix and the emulator stay in lock-step: if a sequence stops
 * being handled, the corresponding test fails.
 *
 * "implemented" means the emulator produces a deterministic, observable effect
 * (screen state, mode flag, or a no-op that is safely ignored). "planned" sequences
 * are listed for transparency and are intentionally NOT asserted as implemented.
 */

export type CompatibilityStatus = "implemented" | "planned";

export type CompatibilityEntry = {
  /** Human-readable feature (the behavior the sequence enables). */
  feature: string;
  /** Sequence class: VT (control chars), CSI, OSC, DCS, or ESC single char. */
  class: "VT" | "CSI" | "OSC" | "DCS" | "ESC";
  /** Exact prefix that identifies the sequence (escaped). */
  prefix: string;
  status: CompatibilityStatus;
};

export const COMPATIBILITY_MATRIX: CompatibilityEntry[] = [
  // --- VT (control characters) ---
  { feature: "carriage return (cursor home column)", class: "VT", prefix: "\r", status: "implemented" },
  { feature: "line feed (advance to next line)", class: "VT", prefix: "\n", status: "implemented" },
  { feature: "backspace (cursor left)", class: "VT", prefix: "\b", status: "implemented" },
  { feature: "tab (advance to next tab stop)", class: "VT", prefix: "\t", status: "planned" },

  // --- CSI ---
  { feature: "cursor position (CUP)", class: "CSI", prefix: "\x1b[", status: "implemented" },
  { feature: "erase in display (ED, codes 0/1/2/3)", class: "CSI", prefix: "\x1b[J", status: "implemented" },
  { feature: "erase in line (EL, codes 0/1/2)", class: "CSI", prefix: "\x1b[K", status: "implemented" },
  { feature: "scroll up (SU)", class: "CSI", prefix: "\x1b[S", status: "implemented" },
  { feature: "scroll down (SD)", class: "CSI", prefix: "\x1b[T", status: "implemented" },
  {
    feature: "cursor up/down/right/left movement (CUU/CUD/CUF/CUB)",
    class: "CSI",
    prefix: "\x1b[A",
    status: "implemented",
  },
  { feature: "save/restore cursor (DECSC/DECRC)", class: "CSI", prefix: "\x1b[7", status: "implemented" },
  {
    feature: "SGR text attributes (colors, bold, italic, underline, ...)",
    class: "CSI",
    prefix: "\x1b[m",
    status: "implemented",
  },
  { feature: "mode set/reset with '?' (DECTBM/DECSET)", class: "CSI", prefix: "\x1b[?", status: "implemented" },

  // --- Private modes (CSI ? N h / l) ---
  { feature: "cursor show/hide (DECVM, 25)", class: "CSI", prefix: "\x1b[?25", status: "implemented" },
  { feature: "alternate screen (1049/1047/47)", class: "CSI", prefix: "\x1b[?1049", status: "implemented" },
  { feature: "SGR mouse tracking (1006)", class: "CSI", prefix: "\x1b[?1006", status: "implemented" },
  { feature: "focus reporting (1004)", class: "CSI", prefix: "\x1b[?1004", status: "implemented" },
  { feature: "bracketed paste (2004)", class: "CSI", prefix: "\x1b[?2004", status: "implemented" },

  // --- OSC ---
  { feature: "OSC 8 hyperlinks", class: "OSC", prefix: "\x1b]8;", status: "implemented" },
  { feature: "OSC title/icon (safely ignored, no crash)", class: "OSC", prefix: "\x1b]", status: "implemented" },

  // --- DCS ---
  { feature: "DCS terminator (safely ignored, no crash)", class: "DCS", prefix: "\x1bP", status: "implemented" },

  // --- ESC single char ---
  { feature: "application/normal cursor keys (DECCKM)", class: "ESC", prefix: "\x1b=", status: "implemented" },
  { feature: "DECID (terminal identification, ignored)", class: "ESC", prefix: "\x1b[c", status: "planned" },
];

/** Returns the matrix rows with a given status. */
export function selectCompatibility(status: CompatibilityStatus): CompatibilityEntry[] {
  return COMPATIBILITY_MATRIX.filter((entry) => entry.status === status);
}
