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
});
