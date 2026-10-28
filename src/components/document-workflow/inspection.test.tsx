/**
 * 检验结果 (J11, J12-6..J12-12, Q11, Q12-4..Q12-7): 合格 / 不合格 and the date,
 * never red; filed once after 「提交后不能修改，确定吗？」 said in the dialog;
 * shown on the machine, the hours rows and the delivery; reports running out
 * on the dashboard; the subcategory switch.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { InspectionBadge, machineInspectionItems } from "@/components/document-workflow/inspection";
import type { InspectionInfo } from "@/interfaces/document-workflow";
import messages from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u1", role: "r1" }, can: () => true }),
}));

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

const failed: InspectionInfo = {
  id: "i1", document: "d1", document_no: "DOC-1", target: "EQUIPMENT", equipment: "e1", equipment_name: "Crane",
  material: null, material_name: "", spec: null, spec_name: "", receipt: null, inspection_no: "INS-1",
  inspected_on: "2026-10-05", inspector: "SIRIM", result: "FAIL", report_date: null, valid_until: "2026-10-30",
  expiry: "EXPIRING", created_by_name: "PM", created_at: "2026-10-05T10:00:00+08:00",
};

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      {node}
    </NextIntlClientProvider>,
  );
}

describe("inspection results", () => {
  it("say 不合格 plainly, never in red, with the date and the expiry", () => {
    const html = render(<InspectionBadge inspection={failed} />);
    expect(html).toContain("不合格");
    expect(html).toContain("将于");
    expect(html).not.toMatch(/destructive|text-red|bg-red/);
    expect(render(<InspectionBadge inspection={null} />)).toBe("");
  });

  it("are confirmed in the dialog before they are filed, and filed once", () => {
    const dialog = read("src/components/document-workflow/inspection.tsx");
    expect(dialog).toContain('t("confirm")');
    expect(dialog).not.toContain("window.confirm");
    expect(messages.documents.inspection.confirm).toBe("提交后不能修改，确定吗？");
  });

  it("show on the machine, the hours rows, the delivery and the dashboard", () => {
    expect(read("src/components/contractor-ops/office-module-lists.tsx")).toContain(
      "<InspectionBadge inspection={row.original.inspection} />",
    );
    expect(read("src/components/equipment-hours/equipment-operator-hours.tsx")).toContain(
      "<InspectionBadge inspection={row.inspection} />",
    );
    expect(read("src/components/receipts/view-receipt.tsx")).toContain("<InspectionBadge inspection={data.inspection} />");
    expect(read("src/components/dashboard/contractor-dashboard.tsx")).toContain("<InspectionExpiry");
  });

  it("are asked for by a subcategory switch, and filled by 填写检验结果", () => {
    const page = read("src/components/document-workflow/documents.tsx");
    expect(page).toContain("needs_inspection: needsInspection,");
    expect(page).toContain('can("inspection.record")');
    expect(messages.permissions.code.inspection.record).toBe("填写检验结果");
  });
});

describe("equipment inspection, one result per machine (JB54)", () => {
  it("sends each ticked machine with its own 合格 / 不合格", () => {
    expect(
      machineInspectionItems([
        { equipment: "e1", result: "PASS" },
        { equipment: "e2", result: "FAIL" },
      ]),
    ).toEqual([
      { equipment: "e1", result: "PASS" },
      { equipment: "e2", result: "FAIL" },
    ]);
  });

  it("holds 提交 back while a ticked machine has no result, or none is ticked", () => {
    expect(machineInspectionItems([{ equipment: "e1", result: "PASS" }, { equipment: "e2", result: "" }])).toBeNull();
    expect(machineInspectionItems([])).toBeNull();
  });

  it("lists only machines on site, by the equipment list's own rule", () => {
    const dialog = read("src/components/document-workflow/inspection.tsx");
    expect(dialog).toContain('presence: "on"');
    expect(dialog).toContain('t("noMachinesOnSite")');
    expect(messages.documents.inspection.noMachinesOnSite).toBe("这个项目现在没有在场的设备。");
  });
});
