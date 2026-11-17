/**
 * What a refused page says before the dashboard shell moves on, or `null`.
 *
 * A page this account may not open bounced to the first page it may, with no
 * word, and the reader thought the button was broken (JB206-8, Lucas 11-16
 * audit). The home address is everyone's way in, so leaving it says nothing.
 */
export function refusedPageNotice(pathname: string, features: readonly string[] = []): string | null {
  if (pathname === "/" || pathname === "/dashboard") return null;
  // A consultant's page is a module head office ticks per project (JB210,
  // walk 11-17 F-A3): he is told so, in the server's own words.
  if (features.includes("consultant_menu")) return "errors.api.consultant_module_not_granted";
  return "common.pageNotOpen";
}
