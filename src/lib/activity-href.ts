import type { ActivityKind, ActivityRow } from "@/interfaces/contractor-dashboard";

/** The module screen for each kind, and how it opens one record, if it can. */
const ACTIVITY_ROUTES: Record<ActivityKind, { list: string; one?: (id: string) => string }> = {
  MATERIAL_OUTGOING: { list: "/material-outgoing", one: (id) => `/material-outgoing?record=${id}` },
  EQUIPMENT_MOVEMENT: { list: "/site-equipment" },
  SITE_PROGRESS: { list: "/progress" },
  DISPOSAL: { list: "/site-disposals", one: (id) => `/site-disposals?record=${id}` },
  WASTE_DISPATCH: { list: "/dispatches", one: (id) => `/dispatches/${id}` },
  // Not /safety: that route is not in the sidebar any more, so the route
  // guard sent the click straight back to the dashboard.
  SAFETY_INCIDENT: {
    list: "/hazard-rectifications",
    one: (id) => `/hazard-rectifications?incident=${id}`,
  },
  CONSULTANT_APPLICATION: {
    list: "/consultant-applications",
    one: (id) => `/consultant-applications/${id}`,
  },
  FIELD_TASK: { list: "/field-tasks", one: (id) => `/field-tasks?task=${id}` },
};

/**
 * Where a row of the dashboard's 今日现场动态 feed leads: the record itself
 * where its screen can open one, otherwise its module.
 */
export function activityHref(row: Pick<ActivityRow, "kind" | "id">): string {
  const route = ACTIVITY_ROUTES[row.kind];
  return row.id && route.one ? route.one(encodeURIComponent(row.id)) : route.list;
}

export const ACTIVITY_KINDS = Object.keys(ACTIVITY_ROUTES) as ActivityKind[];
