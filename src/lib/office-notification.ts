/**
 * Where a notification takes someone in the office console, if anywhere.
 *
 * The customer's words for the pop-up task cards were 「点一下直接进去处理」:
 * a card opens the item it is about. Taking the stored href as-is did that for
 * only a few notifiers, so this is where the rest are turned into a link that
 * opens the one record:
 *
 * - A field-app link (`/field-staff...`) sent to an office account used to
 *   bounce that person to the field login page. It becomes the office screen
 *   for the same task, incident or record.
 * - A document approval stores no href at all, only its id.
 * - A reweigh notice links to the whole weighing list when it knows the
 *   session.
 * - A collection-date proposal names a dispatch the waste list cannot open,
 *   so it goes to the dispatch itself.
 *
 * Mapping here rather than on the server also fixes notices already sent,
 * which is every card on screen today. `null` means no destination.
 */
export function officeNotificationHref(data: Record<string, unknown>): string | null {
  const text = (value: unknown) => (typeof value === "string" && value ? value : null);
  const raw = text(data.href) ?? text(data.url);

  if (raw?.startsWith("/")) {
    const parsed = new URL(raw, "https://office.mse-trace.local");
    const query = parsed.searchParams;

    if (parsed.pathname === "/field-staff") {
      const task = query.get("task") ?? text(data.task_id);
      if (task) return `/field-tasks?task=${encodeURIComponent(task)}`;
      const incident = query.get("incident") ?? text(data.incident_id);
      if (incident) return `/hazard-rectifications?incident=${encodeURIComponent(incident)}`;
      const record = query.get("record");
      const outgoing = query.get("outgoing") ?? (record === "outgoing" ? text(data.record_id) : null);
      if (outgoing) return `/material-outgoing?record=${encodeURIComponent(outgoing)}`;
      if (record === "disposal") {
        const id = text(data.record_id);
        return id ? `/site-disposals?record=${encodeURIComponent(id)}` : "/site-disposals";
      }
      return null;
    }

    const session = text(data.session_id);
    if (parsed.pathname === "/weighing" && session) {
      return `/weighing/${encodeURIComponent(session)}`;
    }

    const dispatch = query.get("dispatch");
    if (parsed.pathname === "/waste-outgoing" && dispatch && !query.get("record")) {
      return `/dispatches/${encodeURIComponent(dispatch)}`;
    }

    return `${parsed.pathname}${parsed.search}`;
  }

  const approval = text(data.approval_id);
  if (approval) return `/approvals?approval=${encodeURIComponent(approval)}`;

  return null;
}
