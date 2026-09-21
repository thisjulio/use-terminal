import { Resvg } from "@resvg/resvg-js";
import type { Snapshot, TerminalColor } from "../types";

export type ScreenshotFormat = "svg" | "png" | "jpeg";
export type ScreenshotOptions = {
  cellWidth?: number;
  cellHeight?: number;
  fontFamily?: string;
  fontSize?: number;
  background?: string;
  foreground?: string;
  cursor?: boolean;
};

const DEFAULTS = {
  cellWidth: 8,
  cellHeight: 16,
  fontFamily: "'DejaVu Sans Mono', 'Liberation Mono', 'Noto Color Emoji', 'Apple Color Emoji', monospace",
  fontSize: 13,
  background: "#1e2229",
  foreground: "#d0d0d0",
  cursor: true,
} as const;

function color(value: TerminalColor | undefined, fallback: string): string {
  if (!value || value.type === "default") return fallback;
  if (value.type === "rgb") return `rgb(${value.r},${value.g},${value.b})`;
  const ansi = [
    "#000000",
    "#800000",
    "#008000",
    "#808000",
    "#000080",
    "#800080",
    "#008080",
    "#c0c0c0",
    "#808080",
    "#ff0000",
    "#00ff00",
    "#ffff00",
    "#0000ff",
    "#ff00ff",
    "#00ffff",
    "#ffffff",
  ];
  return ansi[value.index % ansi.length] ?? fallback;
}

export function renderScreenshot(
  snapshot: Snapshot,
  format: ScreenshotFormat = "svg",
  options: ScreenshotOptions = {},
): string | Uint8Array {
  const svg = renderScreenshotSvg(snapshot, options);
  if (format === "svg") return svg;
  if (format === "png") return new Resvg(svg).render().asPng();
  throw new Error("JPEG output is not supported by @resvg/resvg-js; use PNG or SVG");
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function high(value: string): boolean {
  const code = value.charCodeAt(0);
  return code >= 0xd800 && code <= 0xdbff;
}

function low(value: string): boolean {
  const code = value.charCodeAt(0);
  return code >= 0xdc00 && code <= 0xdfff;
}

export function renderScreenshotSvg(snapshot: Snapshot, options: ScreenshotOptions = {}): string {
  if (!snapshot.cells) throw new Error("raw snapshot cells are required for screenshot rendering");
  const opts = { ...DEFAULTS, ...options };
  const width = snapshot.cols * opts.cellWidth;
  const height = snapshot.rows * opts.cellHeight;
  const layers: string[] = [];

  for (const [y, row] of snapshot.cells.entries()) {
    for (const [x, cell] of row.entries()) {
      if (cell.background?.type !== "default") {
        layers.push(
          `<rect x="${x * opts.cellWidth}" y="${y * opts.cellHeight}" width="${opts.cellWidth}" height="${opts.cellHeight}" fill="${color(cell.background, opts.background)}"/>`,
        );
      }
    }
  }

  for (const [y, row] of snapshot.cells.entries()) {
    for (const [x, cell] of row.entries()) {
      const next = row[x + 1];
      if (low(cell.char)) continue;
      let glyph = cell.char;
      if (high(cell.char) && next && low(next.char)) glyph += next.char;
      if (!glyph || glyph === " ") continue;
      const attrs = [
        `x="${x * opts.cellWidth}"`,
        `y="${(y + 1) * opts.cellHeight - 3}"`,
        `textLength="${opts.cellWidth}"`,
        `lengthAdjust="spacingAndGlyphs"`,
        `fill="${color(cell.foreground, opts.foreground)}"`,
        `font-family="${escapeXml(opts.fontFamily)}"`,
        `font-size="${opts.fontSize}px"`,
        `dominant-baseline="auto"`,
        `xml:space="preserve"`,
        cell.bold ? `font-weight="bold"` : "",
        cell.italic ? `font-style="italic"` : "",
        cell.underline ? `text-decoration="underline"` : "",
      ]
        .filter(Boolean)
        .join(" ");
      layers.push(`<text ${attrs}>${escapeXml(glyph)}</text>`);
    }
  }

  const cursor =
    opts.cursor && snapshot.cursor.visible
      ? `<rect x="${snapshot.cursor.x * opts.cellWidth}" y="${snapshot.cursor.y * opts.cellHeight}" width="${opts.cellWidth}" height="${opts.cellHeight}" fill="${opts.foreground}" opacity="0.7"/>`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${opts.background}"/>${layers.join("")}${cursor}</svg>`;
}
