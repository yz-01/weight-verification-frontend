import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  emptyIssueLine,
  isIssue,
  issueLinePayload,
  issueLineReady,
  issueStatusKey,
  machineNumber,
  receiptsHref,
} from "@/components/contractor-ops/material-issue";
import type { ProjectCategory } from "@/interfaces/contractor-ops";

const rebar = {
  id: "mat-rebar",
  project: "p1",
  parent: null,
  parent_name: null,
  name: "钢筋",
  default_unit: "TONNE",
  specs: [
    { id: "spec-y12", name: "Y12", default_unit: "TONNE", is_other: false, is_active: true, sort_order: 1 },
    { id: "spec-other", name: "其他", default_unit: "", is_other: true, is_active: true, sort_order: 9 },
  ],
} as unknown as ProjectCategory;

describe("材料领用 (JB168): one material line", () => {
  it("is ready only with a material, its unit and a quantity above zero", () => {
    const line = { ...emptyIssueLine(), category: "mat-rebar" };
    expect(issueLineReady(line, rebar)).toBe(false);
    expect(issueLineReady({ ...line, quantity: "0" }, rebar)).toBe(false);
    expect(issueLineReady({ ...line, quantity: "2.5" }, rebar)).toBe(true);
    expect(issueLineReady({ ...emptyIssueLine(), quantity: "2" }, undefined)).toBe(false);
  });

  it("sends a listed specification with its own unit, and 「其他」 typed", () => {
    const listed = issueLinePayload(
      { ...emptyIssueLine(), category: "mat-rebar", spec_category: "spec-y12", quantity: "3" },
      rebar,
    );
    expect(listed).toMatchObject({ category: "mat-rebar", spec_category: "spec-y12", unit: "TONNE", quantity: "3" });
    expect(listed.material_specification).toBeUndefined();
    const typed = issueLinePayload(
      {
        ...emptyIssueLine(),
        category: "mat-rebar",
        spec_category: "spec-other",
        material_specification: " T16 ",
        unit: "PIECE",
        quantity: "4",
      },
      rebar,
    );
    expect(typed).toMatchObject({ material_specification: "T16", unit: "PIECE" });
  });
});

describe("材料领用 (JB168): words and links", () => {
  it("tells an issue from a return, a cached row from before being a return", () => {
    expect(isIssue({ kind: "ISSUE" })).toBe(true);
    expect(isIssue({ kind: "RETURN" })).toBe(false);
    expect(isIssue({})).toBe(false);
    expect(issueStatusKey("APPROVED")).toBe("issue.status.APPROVED");
  });

  it("names a machine by the number on it, else its system code", () => {
    expect(machineNumber({ site_no: "EQ0007", code: "EQ-1" })).toBe("EQ0007");
    expect(machineNumber({ site_no: "", code: "EQ-1" })).toBe("EQ-1");
  });

  it("opens the deliveries of the same project, material and specification", () => {
    expect(receiptsHref({ project: "p1" }, { category: "mat-rebar", spec_category: "spec-y12", material_name: "钢筋" })).toBe(
      "/receipts?project=p1&category=mat-rebar&spec_category=spec-y12",
    );
    expect(receiptsHref({ project: "p1" }, { category: null, spec_category: null, material_name: "钢筋" })).toContain(
      "search=",
    );
  });

  it("the office list's header is exactly the client's, in his order (11-11)", () => {
    const source = readFileSync(join(__dirname, "material-issue.tsx"), "utf-8");
    const header = source.slice(source.indexOf("<TableHeader>"), source.indexOf("</TableHeader>"));
    const keys = [...header.matchAll(/<TableHead[^>]*>\{t\("issue\.([A-Za-z]+)"\)\}/g)].map((found) => found[1]);
    expect(keys).toEqual([
      "colAt",
      "material",
      "spec",
      "quantity",
      "unit",
      "equipmentCompany",
      "equipmentNo",
      "recipientShort",
      "issuer",
      "colSignatures",
      "colPhotos",
      "colView",
    ]);
    const zh = JSON.parse(readFileSync(join(__dirname, "..", "..", "messages", "zh.json"), "utf-8")).contractorOps.issue;
    expect(keys.map((key) => zh[key])).toEqual([
      "日期时间", "材料名称", "规格", "领用数量", "单位", "所属公司", "设备编号", "领用人", "发料负责人", "双方签名", "照片", "查看",
    ]);
  });

  it("has every word it uses in all four catalogues, the PDF's words matching the server's", () => {
    const root = join(__dirname, "..", "..", "messages");
    for (const language of ["en", "zh", "zh-TW", "ms"]) {
      const catalogue = JSON.parse(readFileSync(join(root, `${language}.json`), "utf-8"));
      const issue = catalogue.contractorOps.issue;
      for (const key of ["chooseReturn", "chooseIssue", "quantity", "issued", "issuerSignature", "recipientSignature", "issueNo", "docTitle", "noGps"]) {
        expect(issue[key], `${language} contractorOps.issue.${key}`).toBeTruthy();
      }
      for (const status of ["PENDING", "APPROVED", "REJECTED", "PROCESSED", "COMPLETED", "RELEASED"]) {
        expect(issue.status[status]).toBeTruthy();
      }
      expect(catalogue.archiveQueue.kind.MATERIAL_ISSUE).toContain("Material Issue Note");
      expect(catalogue.errors.api.issue_has_no_return_note).toBeTruthy();
    }
    const zh = JSON.parse(readFileSync(join(root, "zh.json"), "utf-8"));
    expect(zh.contractorOps.issue.quantity).toBe("领用数量");
    expect(zh.contractorOps.issue.recipientSignature).toBe("领用人签名");
    expect(zh.contractorOps.issue.issuerSignature).toBe("发料负责人签名");
  });
});
