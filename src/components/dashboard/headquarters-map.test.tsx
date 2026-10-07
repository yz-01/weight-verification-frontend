/**
 * F8 / Q22 (audit #5): every per-project number on the head-office overview
 * opens the list it counts, narrowed to that project - not plain text, and
 * not the project's dashboard. 逾期 is two lists (tasks, rectifications), so
 * it is two numbers, each opening its own.
 *
 * Rendered to static markup (the runner has no DOM); the map itself is
 * Leaflet and is replaced.
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { HeadquartersProject } from "@/interfaces/headquarters";
import messages from "@/messages/zh.json";

vi.mock("@/components/shared/location-map", () => ({
  LocationMap: () => null,
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u1" }, can: () => true }),
}));

const { HeadquartersMap, ProjectCard } = await import(
  "@/components/dashboard/headquarters-map"
);

const date = "2026-10-07";

const project = {
  id: "p1",
  code: "TOWER",
  name: "Alpha Tower",
  status: "ACTIVE",
  address: "Jalan 1",
  city: "Kuala Lumpur",
  state: "",
  latitude: null,
  longitude: null,
  has_location: false,
  latest_photo: null,
  today_records: 9,
  on_site_now: 6,
  pending_approvals: 8,
  open_tasks: 4,
  overdue_tasks: 3,
  overdue_rectifications: 2,
  material_receipts_today: 1,
  today_records_by_kind: {},
  waste_dispatches: { records: 0, trips: 0, weighed_kg: "0.00" },
  site_disposals: { records: 0, trips: 0, weight_kg: "0.00", completed: 0, with_weight: 0 },
} as unknown as HeadquartersProject;

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      {node}
    </NextIntlClientProvider>,
  );
}

/** `{field: href}` of every figure link in the markup. */
function figureLinks(html: string) {
  const links: Record<string, string> = {};
  for (const match of html.matchAll(/<a [^>]*>/g)) {
    const field = /data-figure-link="([a-z_]+)"/.exec(match[0])?.[1];
    const href = /href="([^"]+)"/.exec(match[0])?.[1];
    if (field && href) links[field] = href.replaceAll("&amp;", "&");
  }
  return links;
}

const expected = {
  pending_approvals: "/dashboard?work=approvals&work_project=p1#headquarters-work",
  open_tasks: "/field-tasks?open=1&project=p1",
  overdue_tasks: "/field-tasks?overdue=1&project=p1",
  overdue_rectifications: "/hazard-rectifications?overdue=1&project=p1",
  on_site_now: "/attendance?project=p1",
};

describe("项目总览: each project's numbers open their list (F8)", () => {
  const html = render(
    <HeadquartersMap projects={[project]} withoutLocation={[]} date={date} />,
  );

  it("links every number in the row to the list it counts for that project", () => {
    expect(figureLinks(html)).toEqual(expected);
  });

  it("shows overdue tasks and overdue rectifications apart, never summed", () => {
    expect(html).toContain("逾期任务");
    expect(html).toContain("逾期整改");
    // 3 + 2: the old single 逾期 cell.
    expect(html).not.toMatch(/>5<\/td>/);
  });
});

describe("the selected project's card (F8)", () => {
  it("opens the same lists; 今日现场记录 has no one list and stays a number", () => {
    const html = render(<ProjectCard project={project} date={date} />);
    expect(figureLinks(html)).toEqual(expected);
    expect(html).not.toContain('data-figure-link="today_records"');
  });
});
