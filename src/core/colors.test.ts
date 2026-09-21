import { describe, expect, test } from "bun:test";
import { ansi256ToRgb, colorToHex, hexToAnsi256, hexToRgb, rgbToAnsi256, rgbToHex } from "./colors";

describe("color conversions", () => {
  test("converts RGB and hex exactly", () => {
    expect(rgbToHex({ r: 92, g: 156, b: 245 })).toBe("#5c9cf5");
    expect(hexToRgb("#5c9cf5")).toEqual({ r: 92, g: 156, b: 245 });
    expect(hexToRgb("#abc")).toEqual({ r: 170, g: 187, b: 204 });
  });

  test("maps ANSI 256 palette to RGB and hex", () => {
    expect(ansi256ToRgb(0)).toEqual({ r: 0, g: 0, b: 0 });
    expect(ansi256ToRgb(15)).toEqual({ r: 255, g: 255, b: 255 });
    expect(ansi256ToRgb(196)).toEqual({ r: 255, g: 0, b: 0 });
    expect(colorToHex({ type: "ansi", index: 196 })).toBe("#ff0000");
  });

  test("converts RGB and hex to nearest ANSI 256 color", () => {
    expect(rgbToAnsi256({ r: 255, g: 0, b: 0 })).toBe(9);
    expect(hexToAnsi256("#00ff00")).toBe(10);
  });

  test("keeps default color unresolved", () => {
    expect(colorToHex({ type: "default" })).toBeUndefined();
  });
});
