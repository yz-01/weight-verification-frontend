/**
 * The theme meets WCAG AA in both modes, measured on the tokens themselves.
 *
 * Light and dark follow the operating system, so a reader can land on either
 * one; both have to be readable. This reads `globals.css` - the one place the
 * colours are decided - and computes the WCAG 2.x contrast ratio of the pairs
 * the screens actually draw: body text, secondary text, every status colour on
 * its own badge tint, and the primary button's words on both ends of its
 * gradient. A token edit that drops a pair below 4.5:1 (text) or 3:1 (large
 * text and UI marks) fails here, not in front of the client.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type RGB = [number, number, number];
type RGBA = [number, number, number, number];

const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

/** The custom properties declared directly in one top-level block. */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  const body = css.slice(open + 1, close);
  const vars = new Map<string, string>();
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars.set(match[1], match[2].trim());
  }
  return vars;
}

const LIGHT = block(":root");
const DARK = new Map([...LIGHT, ...block(".dark")]);

function parse(value: string): RGBA {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = value.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+)(%?))?\s*\)$/);
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]) / (rgb[5] ? 100 : 1);
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), alpha];
  }
  throw new Error(`cannot read colour ${value}`);
}

function token(mode: Map<string, string>, name: string): string {
  const value = mode.get(name);
  if (!value) throw new Error(`token ${name} is missing`);
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  return ref ? token(mode, ref[1]) : value;
}

/** A colour laid over an opaque one. */
function over(top: RGBA, under: RGB): RGB {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)) as RGB;
}

function solid(mode: Map<string, string>, name: string, under?: RGB): RGB {
  const colour = parse(token(mode, name));
  if (colour[3] < 1) {
    if (!under) throw new Error(`${name} is translucent and needs a backdrop`);
    return over(colour, under);
  }
  return [colour[0], colour[1], colour[2]];
}

function luminance([r, g, b]: RGB): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function percent(mode: Map<string, string>, name: string): number {
  return Number(token(mode, name).replace("%", "")) / 100;
}

const TONES = ["cyan", "blue", "purple", "green", "amber", "rose", "orange", "slate"];
const STATUS = ["destructive", "success", "info", "warning"];
const AA_TEXT = 4.5;
const AA_UI = 3;

describe.each([
  ["light", LIGHT],
  ["dark", DARK],
] as const)("%s mode meets WCAG AA", (_name, mode) => {
  const background = solid(mode, "--background");
  const card = solid(mode, "--card");

  it("body text on the page and on a panel", () => {
    expect(ratio(solid(mode, "--foreground"), background)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio(solid(mode, "--card-foreground"), card)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio(solid(mode, "--popover-foreground"), solid(mode, "--popover"))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("secondary (muted) text on a panel, the page and a muted fill", () => {
    const muted = solid(mode, "--muted-foreground");
    expect(ratio(muted, card)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio(muted, background)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio(muted, solid(mode, "--muted"))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("each status colour's words on its own badge tint", () => {
    const soft = percent(mode, "--tone-soft");
    for (const tone of TONES) {
      const base = parse(token(mode, `--tone-${tone}`));
      const tint = over([base[0], base[1], base[2], soft], card);
      const words = solid(mode, `--tone-${tone}-fg`);
      expect(ratio(words, tint), `${tone} badge`).toBeGreaterThanOrEqual(AA_TEXT);
      // The same words straight on a panel (a coloured figure, a link).
      expect(ratio(words, card), `${tone} text`).toBeGreaterThanOrEqual(AA_TEXT);
      // The solid mark (dot, bar) stands out from the panel as a UI element.
      expect(ratio([base[0], base[1], base[2]], card), `${tone} mark`).toBeGreaterThanOrEqual(AA_UI);
    }
  });

  it("the semantic colours as text, and their solid fills' own text", () => {
    for (const name of STATUS) {
      const colour = solid(mode, `--${name}`);
      expect(ratio(colour, card), `${name} text`).toBeGreaterThanOrEqual(AA_TEXT);
      expect(ratio(solid(mode, `--${name}-foreground`), colour), `${name} fill`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("the primary button's words on both ends of its gradient, and primary as a link", () => {
    const words = solid(mode, "--primary-foreground");
    expect(ratio(words, solid(mode, "--primary"))).toBeGreaterThanOrEqual(AA_TEXT);
    const stops = token(mode, "--primary-gradient").match(/#[0-9a-f]{6}/gi) ?? [];
    expect(stops.length).toBeGreaterThanOrEqual(2);
    for (const stop of stops) {
      const [r, g, b] = parse(stop);
      expect(ratio(words, [r, g, b]), `button on ${stop}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
    expect(ratio(solid(mode, "--primary"), card)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("the menu: its words, the highlighted entry, and the accent", () => {
    const sidebar = solid(mode, "--sidebar");
    expect(ratio(solid(mode, "--sidebar-foreground"), sidebar)).toBeGreaterThanOrEqual(AA_TEXT);
    const highlighted = solid(mode, "--sidebar-accent", sidebar);
    expect(ratio(solid(mode, "--sidebar-accent-foreground"), highlighted)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio(solid(mode, "--accent-foreground"), solid(mode, "--accent", card))).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio(solid(mode, "--secondary-foreground"), solid(mode, "--secondary"))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("words over a photograph (a count, a caption)", () => {
    const dark: RGB = [0, 0, 0];
    const light: RGB = [255, 255, 255];
    for (const photo of [dark, light]) {
      expect(ratio(solid(mode, "--overlay-foreground"), solid(mode, "--overlay", photo))).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("the focus ring stands out from a panel", () => {
    expect(ratio(solid(mode, "--ring"), card)).toBeGreaterThanOrEqual(AA_UI);
  });
});
