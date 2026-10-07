import type { TimelineEntry } from "@/interfaces/contractor-dashboard";
import { type RecordTarget, recordTarget } from "@/lib/record-routes";

/**
 * Where a dashboard timeline row opens (E2), and where the two figures that
 * left the rectification card (C15) open.
 *
 * Records go through `recordTarget`, the one record -> business-detail route
 * (F9), so a timeline row and a 「等你处理」 row for the same record land on
 * the same page. The two kinds the timeline adds on top of the activity feed:
 *
 * - `OVERDUE_RECTIFICATION` is a hazard: it opens the hazard, where the
 *   dialog the reader can act on opens by itself.
 * - `GEOFENCE_FAILURE` is an attendance record, which has no detail page:
 *   it opens the attendance list on that day, outside the fence only.
 */

/**
 * The server's calendar day (`YYYY-MM-DD`) for an instant.
 *
 * The list filters compare `occurred_at__date` in the server's time zone
 * (`TIME_ZONE = Asia/Kuala_Lumpur`), so the day is taken there, not in the
 * browser's zone - a laptop set to another zone would otherwise open the
 * wrong day.
 */
export function localDay(at: string | Date, timeZone = "Asia/Kuala_Lumpur"): string {
  const when = typeof at === "string" ? new Date(at) : at;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);
}

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return search.toString();
}

/** Clock-ins outside the fence, on the attendance list. */
export function geofenceBreachesHref({
  from,
  to,
  project,
}: {
  from?: string;
  to?: string;
  project?: string;
}): string {
  return `/attendance?${query({
    geofence_result: "OUTSIDE",
    date_from: from,
    date_to: to,
    project,
  })}`;
}

/** Approved passes running out within the week, on the site access list. */
export function expiringPassesHref(project?: string): string {
  return `/site-access?${query({ expiring: "1", project })}`;
}

export function timelineTarget(
  entry: Pick<TimelineEntry, "kind" | "id" | "at">,
): RecordTarget {
  if (entry.kind === "GEOFENCE_FAILURE") {
    const day = entry.at ? localDay(entry.at) : undefined;
    return { href: geofenceBreachesHref({ from: day, to: day }) };
  }
  if (entry.kind === "OVERDUE_RECTIFICATION") {
    return recordTarget("SAFETY_INCIDENT", entry.id);
  }
  return recordTarget(entry.kind, entry.id);
}

/** The badge tone - and so the dot colour - of each severity. */
export function timelineTone(
  severity: TimelineEntry["severity"],
): "danger" | "warning" | "info" {
  if (severity === "DANGER") return "danger";
  if (severity === "WARNING") return "warning";
  return "info";
}
