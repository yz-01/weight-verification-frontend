import { describe, expect, it } from "vitest";

import { fieldNotificationHref } from "@/lib/field-notification";

/**
 * Where a notification takes a field worker (T-217).
 *
 * The customer's words: 「每个通知也是可以点进去看细节的，我之前好像改过了可是
 * 不确定」. Clickable was done (F-273); two gaps were not.
 *
 * The one this file covers: an href written for the office console used to
 * come back as `/field-staff`, the home screen. That is the same answer as no
 * destination, only more confusing - it looks like the app chose to go there.
 * It now returns `null`, and the caller opens the notification in place so the
 * worker can at least read the whole message.
 *
 * A pure function with a real decision in it, so this is a unit test rather
 * than a browser one. The in-place expansion it enables is asserted in
 * `e2e/notification-modes.spec.ts`.
 */

describe("fieldNotificationHref (T-217)", () => {
  it("keeps a field path, query and all", () => {
    expect(
      fieldNotificationHref("/field-staff?tab=records&record=waste&record_id=7"),
    ).toBe("/field-staff?tab=records&record=waste&record_id=7");
  });

  it("keeps the bare field home", () => {
    expect(fieldNotificationHref("/field-staff")).toBe("/field-staff");
  });

  it("gives an office path no destination, rather than the home screen", () => {
    // The bug. A notification about one delivery used to land on the home,
    // which reads as "the app went somewhere else on purpose".
    expect(fieldNotificationHref("/waste-outgoing?record=7")).toBeNull();
    expect(fieldNotificationHref("/receipts?category=3")).toBeNull();
    expect(fieldNotificationHref("/dispatches/7")).toBeNull();
  });

  it("routes a hazard thread link to the hazard tab", () => {
    // Kept because the shape is the field app's own. What that link can
    // actually open is a separate question - see F-317.
    expect(fieldNotificationHref("/incident-reports?thread=abc")).toBe(
      "/field-staff?tab=incidents&thread=abc",
    );
  });

  it("escapes a thread id rather than pasting it into the query", () => {
    expect(fieldNotificationHref("/incident-reports?thread=a%2Fb c")).toBe(
      "/field-staff?tab=incidents&thread=a%2Fb%20c",
    );
  });

  it("refuses anything that is not an absolute in-app path", () => {
    // An href from the server is data, and an open redirect through a
    // notification would be a way out of the app.
    expect(fieldNotificationHref("https://evil.example/x")).toBeNull();
    expect(fieldNotificationHref("//evil.example/x")).toBe(null);
    expect(fieldNotificationHref(undefined)).toBeNull();
    expect(fieldNotificationHref(42)).toBeNull();
    expect(fieldNotificationHref("")).toBeNull();
  });

  it("opens the incident a safety broadcast names when it carries no href", () => {
    expect(fieldNotificationHref(undefined, { entity: "safety_incident", id: "i1" })).toBe(
      "/field-staff?tab=records&record=safety&incident=i1",
    );
    expect(fieldNotificationHref(undefined, { entity: "driver_task", id: "t1" })).toBeNull();
  });
});

/**
 * JB97 (Lucas 11-03: 「铃铛那里按进去确保是可以看到事项的详情，不是首页，手机端和
 * 后台都一样」): a notice names one item, and the phone opens that item - also
 * for notices filed before the server wrote phone links itself.
 */
describe("fieldNotificationHref opens the item a notice names (JB97)", () => {
  it("turns a whole tab into the one submission the notice is about", () => {
    // The lock-screen notice Lucas sent: a progress record corrected.
    expect(
      fieldNotificationHref("/field-staff?tab=submissions", {
        record_kind: "PROGRESS",
        record_id: "pg-4",
      }),
    ).toBe("/field-staff?tab=home&submission=PROGRESS%3Apg-4");
  });

  it("turns an office link into the phone's own record", () => {
    expect(
      fieldNotificationHref("/material-requests?record=mr-1", { record_id: "mr-1" }, {
        kind: "MATERIAL_REQUEST",
        id: "mr-1",
      }),
    ).toBe("/field-staff?tab=home&submission=MATERIAL_REQUEST%3Amr-1");
    expect(
      fieldNotificationHref("/hazard-rectifications?incident=h1", {}, { kind: "HAZARD", id: "h1" }),
    ).toBe("/field-staff?tab=records&record=safety&incident=h1");
    expect(fieldNotificationHref("/field-tasks?task=t1", { task_id: "t1" })).toBe(
      "/field-staff?tab=tasks&task=t1",
    );
  });

  it("keeps a field link that already opens one item", () => {
    expect(
      fieldNotificationHref("/field-staff?tab=home&movement=m1", {
        record_kind: "EQUIPMENT_MOVEMENT",
        record_id: "m1",
      }),
    ).toBe("/field-staff?tab=home&movement=m1");
    expect(
      fieldNotificationHref("/field-staff?tab=records&record=permit&permit=p1", {
        record_kind: "HAZARD",
        record_id: "p1",
      }),
    ).toBe("/field-staff?tab=records&record=permit&permit=p1");
  });

  it("reads a notice row the way the server sends it", async () => {
    const { fieldNoticeHref } = await import("@/lib/field-notification");
    expect(
      fieldNoticeHref({
        data: { href: "/field-staff?tab=submissions" },
        subject_kind: "SUNDRY_CLAIM",
        subject_id: "s9",
      }),
    ).toBe("/field-staff?tab=home&submission=SUNDRY_CLAIM%3As9");
    // Nothing named and no phone page: no destination - the bell opens it in place.
    expect(fieldNoticeHref({ data: { href: "/site-access?pass=x" }, subject_kind: "", subject_id: null })).toBeNull();
  });
});
