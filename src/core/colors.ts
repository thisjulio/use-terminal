import type { TerminalColor } from "../types";

export type RgbColor = { r: number; g: number; b: number };
export type ColorTheme = { ansi: RgbColor[] };

const ANSI16: RgbColor[] = [
  { r: 0, g: 0, b: 0 },
  { r: 128, g: 0, b: 0 },
  { r: 0, g: 128, b: 0 },
  { r: 128, g: 128, b: 0 },
  { r: 0, g: 0, b: 128 },
  { r: 128, g: 0, b: 128 },
  { r: 0, g: 128, b: 128 },
  { r: 192, g: 192, b: 192 },
  { r: 128, g: 128, b: 128 },
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 255, g: 255, b: 0 },
  { r: 0, g: 0, b: 255 },
  { r: 255, g: 0, b: 255 },
  { r: 0, g: 255, b: 255 },
  { r: 255, g: 255, b: 255 },
];

const clamp = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
const normalizeRgb = (rgb: RgbColor): RgbColor => ({ r: clamp(rgb.r), g: clamp(rgb.g), b: clamp(rgb.b) });

export function ansi256ToRgb(index: number): RgbColor {
  const normalized = Math.max(0, Math.min(255, Math.round(index)));
  if (normalized < 16) return { ...ANSI16[normalized]! };
  if (normalized >= 232) {
    const value = 8 + (normalized - 232) * 10;
    return { r: value, g: value, b: value };
  }
  const cube = normalized - 16;
  const channel = (value: number): number => (value === 0 ? 0 : 55 + value * 40);
  return { r: channel(Math.floor(cube / 36)), g: channel(Math.floor((cube % 36) / 6)), b: channel(cube % 6) };
}

export function rgbToHex(rgb: RgbColor): string {
  const color = normalizeRgb(rgb);
  return `#${[color.r, color.g, color.b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function hexToRgb(hex: string): RgbColor {
  const value = hex.trim().replace(/^#/, "");
  const expanded =
    value.length === 3
      ? value
          .split("")
          .map((part) => part + part)
          .join("")
      : value;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) throw new Error(`invalid hex color: ${hex}`);
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

export function colorToRgb(color: TerminalColor, theme: ColorTheme = { ansi: ANSI16 }): RgbColor | undefined {
  if (color.type === "default") return undefined;
  if (color.type === "rgb") return normalizeRgb(color);
  return theme.ansi[color.index] ?? ansi256ToRgb(color.index);
}

export function colorToHex(color: TerminalColor, theme?: ColorTheme): string | undefined {
  const rgb = colorToRgb(color, theme);
  return rgb ? rgbToHex(rgb) : undefined;
}

export function rgbToAnsi256(rgb: RgbColor): number {
  const color = normalizeRgb(rgb);
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < 256; index++) {
    const candidate = ansi256ToRgb(index);
    const current = (candidate.r - color.r) ** 2 + (candidate.g - color.g) ** 2 + (candidate.b - color.b) ** 2;
    if (current < distance) {
      distance = current;
      best = index;
    }
  }
  return best;
}

export function hexToAnsi256(hex: string): number {
  return rgbToAnsi256(hexToRgb(hex));
}

export function rgbToTerminalColor(rgb: RgbColor): TerminalColor {
  return { type: "rgb", ...normalizeRgb(rgb) };
}
