export function fieldNotificationHref(href: unknown): string | null {
  if (typeof href !== "string" || !href.startsWith("/")) return null;

  const parsed = new URL(href, "https://field.mse-trace.local");
  const thread = parsed.searchParams.get("thread");
  if (thread) {
    return `/field-staff?tab=incidents&thread=${encodeURIComponent(thread)}`;
  }

  return parsed.pathname === "/field-staff"
    ? `${parsed.pathname}${parsed.search}`
    : "/field-staff";
}
