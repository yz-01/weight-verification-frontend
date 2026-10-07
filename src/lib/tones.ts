/**
 * The design's data colours, as class strings, in one place.
 *
 * Every badge, dot, KPI card, chart bar and timeline mark picks its colour
 * here, so "amber means waiting" is decided once. The colours themselves live
 * in `globals.css` (`--tone-*`), light and dark; this file only maps a meaning
 * to the classes that draw it. The strings are written out in full because
 * Tailwind finds classes by reading the source.
 */

export type Tone =
  | "cyan"
  | "blue"
  | "purple"
  | "green"
  | "amber"
  | "rose"
  | "orange"
  | "slate";

export interface ToneClasses {
  /** A small solid mark: a status dot, a legend swatch. */
  dot: string;
  /** Words in the tone, on the page or a panel. */
  text: string;
  /** A soft pill or card: tinted fill, tinted edge, readable words. */
  soft: string;
  /** Just the tinted fill and edge, for a surface whose text is set apart. */
  surface: string;
  /** A bar or progress fill. */
  bar: string;
  /** The halo a lit dot carries in dark mode (none in light). */
  glow: string;
}

export const TONES: Record<Tone, ToneClasses> = {
  cyan: {
    dot: "bg-tone-cyan",
    text: "text-tone-cyan-fg",
    soft: "bg-tone-cyan/12 text-tone-cyan-fg ring-tone-cyan/35",
    surface: "bg-tone-cyan/8 border-tone-cyan/35",
    bar: "bg-tone-cyan",
    glow: "dark:shadow-[0_0_8px_var(--tone-cyan)]",
  },
  blue: {
    dot: "bg-tone-blue",
    text: "text-tone-blue-fg",
    soft: "bg-tone-blue/12 text-tone-blue-fg ring-tone-blue/35",
    surface: "bg-tone-blue/8 border-tone-blue/35",
    bar: "bg-tone-blue",
    glow: "dark:shadow-[0_0_8px_var(--tone-blue)]",
  },
  purple: {
    dot: "bg-tone-purple",
    text: "text-tone-purple-fg",
    soft: "bg-tone-purple/12 text-tone-purple-fg ring-tone-purple/35",
    surface: "bg-tone-purple/8 border-tone-purple/35",
    bar: "bg-tone-purple",
    glow: "dark:shadow-[0_0_8px_var(--tone-purple)]",
  },
  green: {
    dot: "bg-tone-green",
    text: "text-tone-green-fg",
    soft: "bg-tone-green/12 text-tone-green-fg ring-tone-green/35",
    surface: "bg-tone-green/8 border-tone-green/35",
    bar: "bg-tone-green",
    glow: "dark:shadow-[0_0_8px_var(--tone-green)]",
  },
  amber: {
    dot: "bg-tone-amber",
    text: "text-tone-amber-fg",
    soft: "bg-tone-amber/12 text-tone-amber-fg ring-tone-amber/35",
    surface: "bg-tone-amber/8 border-tone-amber/35",
    bar: "bg-tone-amber",
    glow: "dark:shadow-[0_0_8px_var(--tone-amber)]",
  },
  rose: {
    dot: "bg-tone-rose",
    text: "text-tone-rose-fg",
    soft: "bg-tone-rose/12 text-tone-rose-fg ring-tone-rose/35",
    surface: "bg-tone-rose/8 border-tone-rose/35",
    bar: "bg-tone-rose",
    glow: "dark:shadow-[0_0_8px_var(--tone-rose)]",
  },
  orange: {
    dot: "bg-tone-orange",
    text: "text-tone-orange-fg",
    soft: "bg-tone-orange/12 text-tone-orange-fg ring-tone-orange/40",
    surface: "bg-tone-orange/8 border-tone-orange/40",
    bar: "bg-tone-orange",
    glow: "dark:shadow-[0_0_8px_var(--tone-orange)]",
  },
  slate: {
    dot: "bg-tone-slate",
    text: "text-tone-slate-fg",
    soft: "bg-muted text-tone-slate-fg ring-border",
    surface: "bg-muted/60 border-border",
    bar: "bg-tone-slate",
    glow: "",
  },
};

/**
 * What a lifecycle state means, in the six-colour language: done is green,
 * waiting is amber, overdue or refused is rose, information is blue, and a
 * state with no judgement is slate. `primary` is the cyan "waiting for you",
 * `equipment` the purple of the equipment module, `attention` the orange of
 * 「非指定厂商」 - not wrong, but not as agreed.
 */
export type StatusTone =
  | "neutral"
  | "positive"
  | "warning"
  | "danger"
  | "info"
  | "primary"
  | "equipment"
  | "attention";

export const STATUS_TONE: Record<StatusTone, Tone> = {
  positive: "green",
  warning: "amber",
  danger: "rose",
  info: "blue",
  neutral: "slate",
  primary: "cyan",
  equipment: "purple",
  attention: "orange",
};

export function toneOf(status: StatusTone): ToneClasses {
  return TONES[STATUS_TONE[status]];
}
