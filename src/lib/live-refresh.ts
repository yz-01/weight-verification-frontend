import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * How the realtime layer refreshes what is on screen (audit S1 and the perf
 * investigation's item #1, 2026-10-08).
 *
 * The three shells (office, field phone, driver) subscribe to every event in
 * the company. Each event used to call `invalidateQueries()` - every query on
 * every open screen - and the stream-down fallback did the same every 15 s.
 * With the stream capped per process, most clients sit on that fallback, so
 * the whole fleet re-pulled every screen every 15 s, and every receipt save
 * and every driver GPS ping did it again for the rest. Now:
 *
 * - **An event** refreshes the query-key families it concerns
 *   (`REALTIME_FAMILY_KEYS`), fresh or not: the data moved. An event the map
 *   does not know falls back to the stale-only pass below, never to
 *   everything.
 * - **The one-minute safety poll and the stream-down fallback** refetch only
 *   what is on screen *and* already stale by its own `staleTime`, so an
 *   hour-fresh permission matrix or a five-minute option list is left alone,
 *   and a card that polls itself (`refetchInterval`) is not fetched twice.
 * - **Coming back to the tab** still refetches what is stale
 *   (`refetchOnWindowFocus`), which also covers a screen the map misses.
 *
 * None of them re-runs a query tagged `meta: NOT_LIVE` - report aggregations,
 * the expensive reads a person asked for with a filter. Those refresh when
 * the person comes back to the tab, changes a filter or reopens the page.
 */
export const NOT_LIVE = { live: false } as const;

/** The sidebar's unread counts, which every site submission moves. */
// The sidebar badges hook (`use-unread-badges.ts`) keys on this.
const BADGES: QueryKey = ["sidebar-badges"];
/** The head office's approval queue. */
const APPROVAL_QUEUE: QueryKey = ["contractor-dashboard", "approval-queue"];
/** The phone's own submissions list. */
const MINE: QueryKey = ["my-submissions"];
/**
 * An open record chat. A status change can close it (approved, returned,
 * paid), so every family that moves a record's status refreshes it too; it is
 * on screen only while someone has that chat open, so this costs nothing
 * otherwise.
 */
const CHAT: QueryKey = ["record-conversation"];
/** Where a moving lorry or worker is drawn: maps, tracking, live positions. */
const POSITIONS: QueryKey[] = [
  ["dispatches", "detail"],
  ["waste-outgoing", "tracking"],
  ["driver-gps"],
  ["tasks", "gps-monitor"],
  ["driver", "dashboard"],
  ["field-staff-gps"],
  ["workforce-presence"],
];

/**
 * Event family (an event-type prefix, or an exact type) → the query-key
 * prefixes whose screens show it. The longest matching entry wins, so an
 * exact type can narrow its family (a dispatch's GPS ping redraws the map,
 * not every dispatch list). Families from `use-order-realtime`'s
 * `REFRESH_PREFIXES`; keys from the `queryKey:` declarations at the screens.
 */
export const REALTIME_FAMILY_KEYS: Readonly<Record<string, readonly QueryKey[]>> = {
  // The shared order: the contractor's dispatches, the recycler's incoming,
  // the driver's tasks, the weighbridge and the clearance pages.
  "waste_dispatch.": [
    ["dispatches"], ["dispatch"], ["incoming"], ["tasks"], ["driver"], ["weigh-sessions"],
    ["recycler-dashboard"], ["site-disposals"], ["waste-outgoing"], BADGES,
  ],
  "waste_dispatch.gps_recorded": POSITIONS,
  "dispatch.": [
    ["dispatches"], ["dispatch"], ["incoming"], ["tasks"], ["driver"], ["recycler-dashboard"], BADGES,
  ],
  "weighing.": [
    ["weigh-sessions"], ["incoming"], ["dispatches"], ["recycler-dashboard"], ["recycler-inventory"],
    ["transactions"], ["gate-incidents"], ["deductions"],
  ],
  "driver_task.": [["tasks"], ["driver"], ["dispatches"], ["incoming"], ["driver-gps"], ["recycler-dashboard"]],
  "gps.": POSITIONS,
  "approval.": [
    ["approvals"], APPROVAL_QUEUE, BADGES, ["consultant-applications"], ["consultant-application"],
    ["consultant-dashboard"], ["material-requests"], ["sundry-claims"], ["claims"], ["settlements"], MINE, CHAT,
  ],
  "safety.": [
    ["safety"], ["safety-incidents"], ["safety-incident"], ["incident-threads"], ["incident-thread"],
    ["hazard-conversation"], ["field-staff", "incident"], BADGES,
  ],
  "attendance.": [
    ["attendance"], ["attendance-presence"], ["workforce-presence"], ["field-staff", "attendance"], BADGES,
  ],
  "deduction.": [["deductions"], ["settlements"], ["incoming"], ["weigh-sessions"]],
  "partnership.": [["partnerships"], ["projects"], ["recyclers"], ["recycling-sites"]],
  "receipt.": [["receipts"], ["archive-queue"], ["category-records"], APPROVAL_QUEUE, BADGES, MINE, CHAT],
  "field_task.": [["field-tasks"], ["field-staff", "tasks"], ["field-staff", "task"], APPROVAL_QUEUE, BADGES, MINE, CHAT],
  "equipment.": [
    ["site-equipment"], ["equipment-movements"], ["equipment-summary"], ["equipment-hours"],
    APPROVAL_QUEUE, BADGES, MINE, CHAT,
  ],
  "progress.": [
    ["site-progress"], ["site-progress-summary"], ["progress-summaries"], ["progress-photos"],
    ["daily-reports"], ["construction-phases"], APPROVAL_QUEUE, BADGES, MINE, CHAT,
  ],
  "material_outgoing.": [["material-outgoing"], ["waste-outgoing"], APPROVAL_QUEUE, BADGES, MINE, CHAT],
  "material_request.": [["material-requests"], APPROVAL_QUEUE, BADGES, MINE, CHAT],
  "disposal.": [["site-disposals"], ["waste-outgoing"], APPROVAL_QUEUE, BADGES, MINE, CHAT],
  // `record.<kind>.message` / `record.<kind>.closed` (2026-10-09): someone
  // said something on a record, or the office archived it and its chat closed.
  "record.": [CHAT, ["record-closure"], ["archive-queue"], MINE],
  "notification.created": [
    ["notifications"], ["notification-records"], ["admin-notifications"],
    ["contractor-dashboard", "banner-notifications"], BADGES,
  ],
};

/** The query-key prefixes one event refreshes, or `null` when the map does not know it. */
export function keysForEvent(eventType: string | undefined): readonly QueryKey[] | null {
  if (!eventType) return null;
  let best: string | null = null;
  for (const family of Object.keys(REALTIME_FAMILY_KEYS)) {
    const matches = family.endsWith(".") ? eventType.startsWith(family) : eventType === family;
    if (matches && (best === null || family.length > best.length)) best = family;
  }
  return best === null ? null : REALTIME_FAMILY_KEYS[best];
}

function isLive(query: Query): boolean {
  return query.meta?.live !== false;
}

function pollsItself(query: Query): boolean {
  return query.observers.some((observer) => Boolean(observer.options.refetchInterval));
}

/**
 * Events arrived (coalesced): refresh each family's keys, live ones only.
 * Any event the map does not know adds one stale-only pass instead.
 */
export function refreshForEvents(
  queryClient: QueryClient,
  eventTypes: Iterable<string | undefined>,
): Promise<unknown> {
  const keys = new Map<string, QueryKey>();
  let unknown = false;
  for (const eventType of eventTypes) {
    const mapped = keysForEvent(eventType);
    if (mapped === null) {
      unknown = true;
      continue;
    }
    for (const key of mapped) keys.set(JSON.stringify(key), key);
  }
  const work: Promise<unknown>[] = [...keys.values()].map((queryKey) =>
    queryClient.invalidateQueries({ queryKey, predicate: isLive }),
  );
  if (unknown) work.push(refreshStale(queryClient));
  return Promise.all(work);
}

/** Something changed and nobody said what (an offline upload): every live query. */
export function refreshChanged(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ predicate: isLive });
}

/** The safety poll and the fallback: on screen, stale, live and not polling itself. */
export function refreshStale(queryClient: QueryClient): Promise<void> {
  return queryClient.refetchQueries({
    type: "active",
    stale: true,
    predicate: (query) => isLive(query) && !pollsItself(query),
  });
}
