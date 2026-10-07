import { describe, expect, it } from "vitest";

import { PORTAL_NAVIGATION, isRouteAllowed } from "@/lib/navigation";

/**
 * Every page the consultant settings hub links to has to open (B16).
 *
 * 「新增顾问的页面打不开」. Folding workflows, templates and consultant access
 * into one hub entry (T-373, D-254) took their menu lines away - and their
 * routes with them. `isRouteAllowed` asks whether navigation owns a path
 * before it asks whether the account holds the permission, so an unowned path
 * is refused for everybody, however many permissions they have. Each card on
 * the hub bounced the reader to the dashboard.
 *
 * Driven through `isRouteAllowed` rather than by reading the tree, because the
 * ownership rule is the thing that broke and a structural assertion would have
 * passed either way.
 */
const HUB_PAGES = [
  "/consultant-settings",
  "/consultant-access",
  "/consultant-workflows",
  "/consultant-templates",
] as const;

const FEATURES = ["consultant_applications", "field_tasks"];

describe("the consultant settings hub", () => {
  it.each(HUB_PAGES)("opens %s for an account that may configure consultants", (path) => {
    expect(
      isRouteAllowed("MSE_TRACE", FEATURES, path, ["consultant.config"], false),
    ).toBe(true);
  });

  it.each(HUB_PAGES.slice(1))("still refuses %s without consultant.config", (path) => {
    expect(isRouteAllowed("MSE_TRACE", FEATURES, path, ["approval.view"], false)).toBe(
      false,
    );
  });

  it("keeps the three pages out of the menu, since the hub is the entry", () => {
    const consultants = PORTAL_NAVIGATION.MSE_TRACE.find(
      (entry) => entry.feature === "consultant_applications",
    );
    const hidden = (consultants?.children ?? [])
      .filter((entry) => entry.menuHidden)
      .map((entry) => entry.href);
    expect(hidden).toEqual([
      // Not a settings page: the old inbox address, kept routable while its
      // menu line went (2026-10 C1) - it forwards to 顾问申请's tab.
      "/consultant-field-inbox",
      "/consultant-access",
      "/consultant-workflows",
      "/consultant-templates",
    ]);
  });
});
