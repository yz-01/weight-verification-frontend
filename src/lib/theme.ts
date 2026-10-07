/**
 * Light / dark for the whole app (Lucas, 2026-10-08).
 *
 * Three choices - 跟随系统, 浅色, 深色 - one setting for the whole app,
 * remembered on this device only (localStorage; no account or server
 * change). 跟随系统 is the default and stays live: while it is chosen, a
 * change in Windows' (or the phone's) setting is followed at once.
 *
 * next-themes does the work: it reads the stored choice in a tiny inline
 * script before the first paint and writes `.light` or `.dark` on <html>, so
 * there is no flash of the wrong theme; it wraps every storage call in
 * try/catch. Where that script cannot apply a choice (storage blocked), no
 * class is written and `globals.css` falls back to the system's
 * `prefers-color-scheme` - see `theme.test.tsx`.
 */
export const THEME_CHOICES = ["system", "light", "dark"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

/** The one place the provider is configured; the test renders the same. */
export const THEME_PROVIDER_PROPS = {
  attribute: "class",
  defaultTheme: "system",
  enableSystem: true,
  disableTransitionOnChange: true,
  storageKey: "theme",
} as const;
