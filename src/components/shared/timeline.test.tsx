/**
 * E2: the dashboard timeline's dots sit on the line, in the colour of the
 * row's badge, and each row opens its record.
 *
 * The client's screenshot circled a column of grey specks beside the line:
 * the old `<ol className="... border-l">` drew the line and each dot
 * `absolute -left-[1.4rem]` was placed by hand - two coordinate systems - and
 * every dot was `bg-border`. Rendered to static markup (the runner has no DOM),
 * so these read the classes that decide the geometry.
 */
import { ShieldAlert } from "lucide-react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { STATUS_DOT_CLASS, StatusBadge } from "@/components/shared/page-primitives";
import { Timeline, type TimelineItem } from "@/components/shared/timeline";

function item(key: string, overrides: Partial<TimelineItem> = {}): TimelineItem {
  return { key, title: `Row ${key}`, ...overrides };
}

function rows(markup: string): string[] {
  return markup.split("<li ").slice(1);
}

describe("Timeline", () => {
  it("puts every dot's centre on the line, in one rail", () => {
    const markup = renderToStaticMarkup(
      <Timeline items={[item("a"), item("b"), item("c")]} />,
    );
    for (const row of rows(markup)) {
      const dot = row.match(/<span data-timeline-dot="[a-z]+" class="([^"]+)"/);
      expect(dot).not.toBeNull();
      const classes = dot![1].split(" ");
      // Centred on the rail both ways - the same left-1/2 the line uses.
      expect(classes).toEqual(
        expect.arrayContaining(["absolute", "left-1/2", "-translate-x-1/2", "-translate-y-1/2"]),
      );
      // 12px, with a ring in the page colour to stand off the line.
      expect(classes).toEqual(expect.arrayContaining(["size-3", "ring-2", "ring-background"]));
      // The line segments start and stop at the dot's centre.
      const top = classes.find((name) => name.startsWith("top-"));
      const below = row.match(/data-timeline-line="below" class="([^"]+)"/);
      if (below) expect(below[1].split(" ")).toContain(top);
      const above = row.match(/data-timeline-line="above" class="([^"]+)"/);
      if (above) expect(above[1].split(" ")).toContain(top!.replace("top-", "h-"));
      for (const line of [above, below]) {
        if (line) expect(line[1].split(" ")).toEqual(expect.arrayContaining(["left-1/2", "-translate-x-1/2", "w-px"]));
      }
    }
  });

  it("draws no line above the first dot or below the last", () => {
    const [first, middle, last] = rows(
      renderToStaticMarkup(<Timeline items={[item("a"), item("b"), item("c")]} />),
    );
    expect(first).not.toContain('data-timeline-line="above"');
    expect(first).toContain('data-timeline-line="below"');
    expect(middle).toContain('data-timeline-line="above"');
    expect(middle).toContain('data-timeline-line="below"');
    expect(last).toContain('data-timeline-line="above"');
    expect(last).not.toContain('data-timeline-line="below"');

    const [only] = rows(renderToStaticMarkup(<Timeline items={[item("solo")]} />));
    expect(only).not.toContain("data-timeline-line");
  });

  it("colours the dot exactly like the badge beside it", () => {
    for (const tone of ["danger", "warning", "info", "positive", "neutral"] as const) {
      const markup = renderToStaticMarkup(
        <Timeline items={[item(tone, { tone, badge: <StatusBadge label="x" tone={tone} /> })]} />,
      );
      const dot = markup.match(/data-timeline-dot="[a-z]+" class="([^"]+)"/)![1];
      expect(dot.split(" ")).toContain(STATUS_DOT_CLASS[tone]);
      // The badge's own leading dot carries the same class.
      const badgeDot = markup.match(/<span class="h-1\.5 w-1\.5 rounded-full ([^"]+)"/)![1];
      expect(badgeDot).toBe(STATUS_DOT_CLASS[tone]);
      // Never the old grey that disappeared into the line.
      expect(dot.split(" ")).not.toContain("bg-border");
    }
  });

  it("makes the whole row open the record, by link or by button", () => {
    const markup = renderToStaticMarkup(
      <Timeline
        items={[
          item("link", { href: "/hazard-rectifications?incident=7" }),
          item("button", { onOpen: () => undefined }),
          item("plain"),
        ]}
      />,
    );
    const [link, button, plain] = rows(markup);
    // The anchor wraps the rail and the text, so the dot is clickable too.
    expect(link).toMatch(/<a [^>]*href="\/hazard-rectifications\?incident=7"[^>]*>[\s\S]*data-timeline-dot[\s\S]*Row link[\s\S]*<\/a>/);
    expect(button).toMatch(/<button type="button"[^>]*>[\s\S]*data-timeline-dot[\s\S]*Row button[\s\S]*<\/button>/);
    expect(plain).not.toMatch(/<a |<button /);
  });

  it("shows the type icon, and the 40x40 thumbnail only when there is a photo", () => {
    const [withPhoto, without] = rows(
      renderToStaticMarkup(
        <Timeline
          items={[
            item("photo", { icon: ShieldAlert, thumbnail: "https://cdn.test/p.jpg" }),
            item("none", { icon: ShieldAlert, thumbnail: null }),
          ]}
        />,
      ),
    );
    expect(withPhoto).toContain("data-timeline-icon");
    expect(withPhoto).toMatch(/<img[^>]*src="https:\/\/cdn\.test\/p\.jpg"[^>]*class="size-10 /);
    expect(without).toContain("data-timeline-icon");
    expect(without).not.toContain("<img");
  });
});

describe("the dashboard uses it", () => {
  it("no longer hand-places dots beside a border-l line", () => {
    const code = readFileSync(
      path.join(process.cwd(), "src/components/dashboard/contractor-dashboard.tsx"),
      "utf8",
    );
    expect(code).not.toContain("-left-[1.4rem]");
    expect(code).not.toMatch(/<ol className="relative space-y-3 border-l/);
    expect(code).toContain("<DashboardTimeline");
    expect(code).toContain("<Timeline");
  });
});
