/**
 * Where a notification takes a field worker, if anywhere.
 *
 * The field app is a different set of routes from the office console, so an
 * href written for the office cannot be pushed at a phone. What this used to
 * do with one was send the worker to `/field-staff` - the home screen. The
 * customer's complaint was 「每个通知也是可以点进去看细节的」, and landing on the
 * home after tapping a notification about a specific delivery is the same
 * answer as landing nowhere, only more confusing: it looks like the app
 * decided to go there (F-273).
 *
 * So an office path now returns `null`, meaning "no destination on this app",
 * and the caller opens the notification where it stands instead of navigating.
 * Two things follow from that, and both are deliberate:
 *
 * - A worker always gets to read the whole message, which is what they needed
 *   from a notification with no screen behind it.
 * - The office path is no longer quietly swallowed, so the fix for a
 *   notification that *should* have a field destination belongs where the href
 *   is written - on the server, per notifier - rather than being guessed at
 *   here. Guessing would mean a table of office-to-field translations that
 *   nobody updates when a route moves.
 *
 * The hazard-thread branch is kept and is the one exception, because that
 * link's shape is the field app's own. See T-211 and F-317 for what it can and
 * cannot currently open.
 */
/**
 * The record kinds 「我提交过的」 opens one by one (`?submission=KIND:id`),
 * as the backend's `notification_links.SUBMISSION_KINDS` names them.
 */
const SUBMISSION_KINDS = new Set([
  "MATERIAL_RECEIPT",
  "SITE_RECORD",
  "WASTE_OUTGOING",
  "PROGRESS",
  "MATERIAL_OUTGOING",
  "EQUIPMENT_MOVEMENT",
  "DISPOSAL_REQUEST",
  "SUNDRY_CLAIM",
  "MATERIAL_REQUEST",
]);

/** The parameters with which a phone link opens one item, not a whole tab. */
const ITEM_PARAMS = [
  "task",
  "incident",
  "movement",
  "outgoing",
  "disposal",
  "chat",
  "announcement",
  "visitor_arrival",
  "gate_arrival",
  "gate_incident",
  "permit",
  "submission",
  "notice",
];

/**
 * JB97 (Lucas 11-03: 「铃铛那里按进去确保是可以看到事项的详情，不是首页」): the
 * one item a notice names, on the phone - for notices filed before the server
 * wrote phone links itself, whose link was an office page or a whole tab
 * (`?tab=submissions`).
 */
function itemHref(
  data: Record<string, unknown> | undefined,
  subject?: { kind?: string | null; id?: string | null },
): string | null {
  const text = (value: unknown) => (typeof value === "string" && value ? value : null);
  const kind = text(data?.record_kind) ?? text(subject?.kind);
  const id = text(data?.record_id) ?? text(subject?.id);
  if (kind && id) {
    if (kind === "HAZARD") {
      return `/field-staff?tab=records&record=safety&incident=${encodeURIComponent(id)}`;
    }
    if (SUBMISSION_KINDS.has(kind)) {
      return `/field-staff?tab=home&submission=${encodeURIComponent(`${kind}:${id}`)}`;
    }
    if (kind === "GATE_INCIDENT") {
      return `/field-staff?tab=records&record=gate&gate_incident=${encodeURIComponent(id)}`;
    }
  }
  const task = text(data?.task_id);
  if (task && !text(data?.driver_id)) {
    return `/field-staff?tab=tasks&task=${encodeURIComponent(task)}`;
  }
  return null;
}

export function fieldNotificationHref(
  href: unknown,
  data?: Record<string, unknown>,
  subject?: { kind?: string | null; id?: string | null },
): string | null {
  // A safety-incident broadcast sent before it carried an href names the
  // incident but no page; the field app's own safety record opens it.
  if (
    (typeof href !== "string" || !href) &&
    data?.entity === "safety_incident" &&
    typeof data.id === "string" &&
    data.id
  ) {
    return `/field-staff?tab=records&record=safety&incident=${encodeURIComponent(data.id)}`;
  }
  const parsed =
    typeof href === "string" && href.startsWith("/")
      ? new URL(href, "https://field.mse-trace.local")
      : null;
  const local = parsed?.origin === "https://field.mse-trace.local" ? parsed : null;
  const field = local?.pathname === "/field-staff" ? local : null;

  // A field link that already opens one item stays as it is.
  if (field && ITEM_PARAMS.some((name) => field.searchParams.get(name))) {
    return `${field.pathname}${field.search}`;
  }
  const thread = local?.searchParams.get("thread");
  if (thread) {
    return `/field-staff?tab=incidents&thread=${encodeURIComponent(thread)}`;
  }
  // An office link or a whole tab: the item the notice names, when it names one.
  const item = itemHref(data, subject);
  if (item) return item;

  // Field paths pass through with their query intact; everything else has no
  // destination here. Returning the home screen was the bug.
  return field ? `${field.pathname}${field.search}` : null;
}

/** ``fieldNotificationHref`` for a notice row as the server sends it. */
export function fieldNoticeHref(notice: {
  data: Record<string, unknown>;
  subject_kind?: string | null;
  subject_id?: string | null;
}): string | null {
  return fieldNotificationHref(notice.data.href ?? notice.data.url, notice.data, {
    kind: notice.subject_kind,
    id: notice.subject_id,
  });
}

/** The field workspace's own way in: see `openFieldHref`. */
export const FIELD_OPEN_EVENT = "mse:field-open";

/**
 * Open a field link, on the screen already showing when it can be.
 *
 * `router.push` to `/field-staff?…` from `/field-staff` changes only the query,
 * and two things went wrong with that on a phone. A link to the address already
 * showing - the same task tapped twice, 「查看我的全部任务」 after coming back
 * from it - changed nothing, so the workspace had nothing to follow and the tap
 * did nothing. Every other tap waited for the server's copy of a page that was
 * already on screen, so on a site connection it looked dead until it arrived,
 * and people tapped again. The workspace listens for this event and switches
 * there and then; it cancels the event to say it has, and anything it does not
 * cover (another page, no workspace mounted) still goes through `push`.
 */
export function openFieldHref(href: string, push: (href: string) => void) {
  const target = new URL(href, window.location.origin);
  if (
    target.origin === window.location.origin &&
    target.pathname === "/field-staff" &&
    window.location.pathname === "/field-staff"
  ) {
    const event = new CustomEvent(FIELD_OPEN_EVENT, {
      detail: `${target.pathname}${target.search}`,
      cancelable: true,
    });
    if (!window.dispatchEvent(event)) return;
  }
  push(href);
}
