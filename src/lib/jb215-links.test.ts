import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import zh from "@/messages/zh.json";
import { isFieldAppPage } from "@/lib/auth-token";
import { disposalTaskTitle } from "@/lib/field-task-title";
import { officeNotificationHref } from "@/lib/office-notification";

/**
 * JB215A (the 11-16 audit and the 11-17 walks, leftovers):
 *
 * 2. A site disposal's task reads 「执行清运 DR-…」 on the office's 现场任务 list
 *    and task window too (the phone has since JB204-6).
 * 4. 「收运时间已确认」 filed for an office applicant of a 废料出场 with the
 *    phone's link opens the record on 环保材料出场.
 * 5. 结算单 cards filed for the contractor before JB207-4 open 付款凭证, not the
 *    recycler's /settlements page the contractor cannot open.
 * 6. The installed field app lets the pages its worker uses outside its own
 *    screens open (a scan landing, a file sent by link) instead of sending
 *    every one to its home screen.
 */
function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

const words = (reference: string) => zh.taskFlow.work.disposalTitle.replace("{reference}", reference);

describe("item 2: a site disposal's task on the office side", () => {
  it("is named by the request's number, any other task keeps its own title", () => {
    expect(
      disposalTaskTitle(
        { linked_record_type: "DISPOSAL_EXECUTION", linked_record_reference: "DR-SITE-007" },
        words,
      ),
    ).toBe("执行清运 DR-SITE-007");
    expect(disposalTaskTitle({ linked_record_type: "MATERIAL_RECEIPT", linked_record_reference: "MR-1" }, words)).toBeNull();
    expect(disposalTaskTitle({ linked_record_type: "DISPOSAL_EXECUTION", linked_record_reference: "" }, words)).toBeNull();
    expect(disposalTaskTitle({}, words)).toBeNull();
  });

  it("the 现场任务 list and the task window use it before the consultant wording", () => {
    const list = read("src/components/contractor-ops/operations-workspaces.tsx");
    expect(list).toContain(
      'disposalTaskTitle(row, (reference) => flow("work.disposalTitle", { reference })) ??\n    consultantTaskTitle(row',
    );
    const sheet = read("src/components/dashboard/field-task-sheet.tsx");
    expect(sheet).toContain(
      'const disposal = disposalTaskTitle(row, (reference) => flow("work.disposalTitle", { reference }));',
    );
    expect(sheet).toContain("title={shownTitle}");
    expect(sheet).toContain("reference: disposal ?? row.title,");
    expect(sheet).toContain("reference={disposal ?? row.title}");
  });
});

describe("item 4: 废料出场 notices for an office applicant", () => {
  it("open the record on 环保材料出场, with its project", () => {
    expect(
      officeNotificationHref({
        href: "/field-staff?tab=records&record=waste",
        record_kind: "WASTE_OUTGOING",
        record_id: "r1",
        project_id: "p1",
      }),
    ).toBe("/waste-outgoing?record=r1&project=p1");
    expect(officeNotificationHref({ href: "/field-staff?tab=records&record=waste&record_id=r2" })).toBe(
      "/waste-outgoing?record=r2",
    );
  });

  it("open the list when the notice names no record", () => {
    expect(officeNotificationHref({ href: "/field-staff?tab=records&record=waste" })).toBe("/waste-outgoing");
  });

  it("the office link the server sends now is kept as it is", () => {
    expect(officeNotificationHref({ href: "/waste-outgoing?record=r1&project=p1" })).toBe(
      "/waste-outgoing?record=r1&project=p1",
    );
  });
});

describe("item 5: old settlement cards for the contractor", () => {
  it("open 付款凭证 found by the settlement's number", () => {
    expect(
      officeNotificationHref({
        href: "/settlements/s1",
        settlement_id: "s1",
        settlement_no: "ST-RC-0001",
        dispatch_id: "d1",
        dispatch_no: "DS-1",
        project_id: "p1",
      }),
    ).toBe("/payment-proofs?search=ST-RC-0001&project=p1");
  });

  it("the new cards keep their link, and a settlement link without the card's data is left alone", () => {
    expect(officeNotificationHref({ href: "/payment-proofs?search=ST-RC-0001&project=p1" })).toBe(
      "/payment-proofs?search=ST-RC-0001&project=p1",
    );
    expect(officeNotificationHref({ href: "/settlements/s1" })).toBe("/settlements/s1");
  });
});

describe("item 6: the installed field app's own pages", () => {
  it("lets the scan landings and a file link open", () => {
    expect(isFieldAppPage("/scan/equipment")).toBe(true);
    expect(isFieldAppPage("/scan/qr")).toBe(true);
    expect(isFieldAppPage("/s/abc123")).toBe(true);
  });

  it("still sends everything else to the field app's home", () => {
    for (const page of ["/dashboard", "/settings", "/scrap/login", "/trace/login", "/site-equipment", "/sundry-claims"]) {
      expect(isFieldAppPage(page)).toBe(false);
    }
    const provider = read("src/components/providers/auth-provider.tsx");
    expect(provider).toContain(
      'if (fieldApp && !isFieldSessionPath(pathname) && !isFieldAppPage(pathname)) {\n      router.replace("/field-staff");',
    );
  });
});
