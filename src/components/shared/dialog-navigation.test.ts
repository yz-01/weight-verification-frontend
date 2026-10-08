/**
 * How a dialog drawn by an intercepted route leaves the screen.
 *
 * Lucas, of 编辑用户: 「为什么我保存了不会自动关掉，然后要点两次取消才可以关掉？」
 * The save pushed the list, which on a soft navigation leaves the modal slot
 * showing what it showed before; each cancel then went back one history entry
 * of the two the push had made. These pin the rule that replaced it, without
 * a router: the forms say where they would go, the rule says how.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  decideDismiss,
  decideFormExit,
  recordVisit,
  resetTrail,
  sectionRoot,
} from "@/components/shared/dialog-navigation";

afterEach(() => resetTrail());

describe("after a successful save", () => {
  it("edit user opened from the list: the dialog closes once, by going back", () => {
    // What Lucas did. Back restores the list exactly as he left it - its
    // filters, its page, its scroll - and the browser's Back no longer
    // reopens a form for a record that was already saved.
    expect(
      decideFormExit({
        surface: "dialog",
        href: "/users",
        visited: ["/users", "/users/42/edit"],
      }),
    ).toEqual({ action: "back" });
  });

  it("the platform admin's user list is handled the same way", () => {
    expect(
      decideFormExit({
        surface: "dialog",
        href: "/users/admin/management",
        visited: ["/users/admin/management", "/users/42/edit"],
      }),
    ).toEqual({ action: "back" });
  });

  it("ignores the list's query string when deciding whether that is where it came from", () => {
    // 废料清运 lives at `/waste-clearance?kind=dispatch`; the list behind may
    // have `&page=2` on it. Same screen.
    expect(
      decideFormExit({
        surface: "dialog",
        href: "/waste-clearance?kind=dispatch",
        visited: ["/waste-clearance", "/dispatches/7/edit"],
      }),
    ).toEqual({ action: "back" });
  });

  it("edit opened from the record's own detail dialog returns to that detail", () => {
    expect(
      decideFormExit({
        surface: "dialog",
        href: "/projects/9",
        visited: ["/projects", "/projects/9", "/projects/9/edit"],
      }),
    ).toEqual({ action: "back" });
  });

  it("a create that lands on the record it made replaces the form, so closing the record never shows the form again", () => {
    expect(
      decideFormExit({
        surface: "dialog",
        href: "/roles/15",
        visited: ["/roles", "/roles/create"],
      }),
    ).toEqual({ action: "replace", href: "/roles/15" });
  });

  it("an edit opened from a detail but heading for the list replaces, never leaving two entries to close", () => {
    expect(
      decideFormExit({
        surface: "dialog",
        href: "/users",
        visited: ["/users", "/users/42", "/users/42/edit"],
      }),
    ).toEqual({ action: "replace", href: "/users" });
  });

  it("with nothing to go back to, replaces rather than leaving the app", () => {
    expect(
      decideFormExit({ surface: "dialog", href: "/users", visited: ["/users/42/edit"] }),
    ).toEqual({ action: "replace", href: "/users" });
    expect(decideFormExit({ surface: "dialog", href: "/users", visited: [] })).toEqual({
      action: "replace",
      href: "/users",
    });
  });

  it("on a full page goes forward to the address, as it always did", () => {
    expect(
      decideFormExit({
        surface: "page",
        href: "/users",
        visited: ["/users", "/users/42/edit"],
      }),
    ).toEqual({ action: "push", href: "/users" });
  });
});

describe("cancel, Escape and the X", () => {
  it("go back once when the dialog was opened from inside the app", () => {
    expect(
      decideDismiss({
        surface: "dialog",
        fallbackHref: "/users",
        visited: ["/users", "/users/42/edit"],
      }),
    ).toEqual({ action: "back" });
  });

  it("fall back to the module's list when there is no in-app history", () => {
    expect(
      decideDismiss({ surface: "dialog", fallbackHref: "/users", visited: ["/users/42/edit"] }),
    ).toEqual({ action: "replace", href: "/users" });
    // A full page with its own cancel button (the consultant application) goes
    // to the list rather than backing out of the site.
    expect(
      decideDismiss({
        surface: "page",
        fallbackHref: "/consultant-applications",
        visited: ["/consultant-applications/create"],
      }),
    ).toEqual({ action: "push", href: "/consultant-applications" });
  });
});

describe("the trail of visited addresses", () => {
  it("is what the rules read when nothing is passed", () => {
    recordVisit("/users");
    recordVisit("/users/42/edit");
    expect(decideFormExit({ surface: "dialog", href: "/users" })).toEqual({ action: "back" });
    expect(decideDismiss({ surface: "dialog", fallbackHref: "/users" })).toEqual({
      action: "back",
    });
  });

  it("does not count the same address twice in a row (React runs effects twice in development)", () => {
    recordVisit("/users/42/edit");
    recordVisit("/users/42/edit");
    expect(decideDismiss({ surface: "dialog", fallbackHref: "/users" })).toEqual({
      action: "replace",
      href: "/users",
    });
  });

  it("stays bounded on a long session", () => {
    for (let i = 0; i < 200; i += 1) recordVisit(`/page/${i}`);
    recordVisit("/users/42/edit");
    expect(decideFormExit({ surface: "dialog", href: "/page/199" })).toEqual({ action: "back" });
  });
});

describe("the module's list, when nothing better is known", () => {
  it("is the first segment of the address", () => {
    expect(sectionRoot("/users/42/edit")).toBe("/users");
    expect(sectionRoot("/receipts/7")).toBe("/receipts");
    expect(sectionRoot("/")).toBe("/");
  });
});
