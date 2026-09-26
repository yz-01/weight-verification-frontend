import { describe, expect, it } from "vitest";

import { officeNotificationHref } from "@/lib/office-notification";

describe("officeNotificationHref", () => {
  it("keeps an office link that already opens its record", () => {
    expect(officeNotificationHref({ href: "/sundry-claims?record=s1" })).toBe("/sundry-claims?record=s1");
    expect(officeNotificationHref({ href: "/consultant-applications/a1" })).toBe("/consultant-applications/a1");
  });

  it("turns a field-app link into the office screen for the same item", () => {
    expect(officeNotificationHref({ href: "/field-staff?tab=tasks&task=t1" })).toBe("/field-tasks?task=t1");
    expect(
      officeNotificationHref({ href: "/field-staff?tab=records&record=safety&incident=i1" }),
    ).toBe("/hazard-rectifications?incident=i1");
    expect(
      officeNotificationHref({ href: "/field-staff?tab=records&record=outgoing&outgoing=o1" }),
    ).toBe("/material-outgoing?record=o1");
    expect(
      officeNotificationHref({ href: "/field-staff?tab=records&record=disposal", record_id: "d1" }),
    ).toBe("/site-disposals?record=d1");
    expect(officeNotificationHref({ href: "/field-staff?tab=home" })).toBeNull();
  });

  it("gives a document approval, which stores no href, its own link", () => {
    expect(officeNotificationHref({ approval_id: "p1", approval_no: "AP-1" })).toBe("/approvals?approval=p1");
  });

  it("opens the weigh session rather than the whole list", () => {
    expect(officeNotificationHref({ url: "/weighing", session_id: "w1" })).toBe("/weighing/w1");
    expect(officeNotificationHref({ url: "/weighing" })).toBe("/weighing");
  });

  it("sends a collection-date proposal to its dispatch", () => {
    expect(officeNotificationHref({ href: "/waste-outgoing?dispatch=x1" })).toBe("/dispatches/x1");
    expect(officeNotificationHref({ href: "/waste-outgoing?record=r1" })).toBe("/waste-outgoing?record=r1");
  });

  it("has no destination when nothing names one", () => {
    expect(officeNotificationHref({})).toBeNull();
    expect(officeNotificationHref({ href: "https://example.com" })).toBeNull();
  });
});
