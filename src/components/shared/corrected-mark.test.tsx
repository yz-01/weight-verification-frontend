/**
 * One gold 「已修改」 on every list a record can be corrected in (J1-3, J1-4,
 * J1-5, J20, Q1-2, Q20): at the front of the row, the whole row framed in
 * gold, a press opening the record's history - and it never goes away (it
 * reads `was_corrected`, which only grows).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CORRECTED_ROW_CLASS, CorrectedTag } from "@/components/shared/record-correction";
import messages from "@/messages/zh.json";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      {node}
    </NextIntlClientProvider>,
  );
}

describe("the gold 已修改 (J20)", () => {
  it("is gold, says 已修改, and opens the history when it knows the record", () => {
    const html = render(<CorrectedTag kind="MATERIAL_RECEIPT" recordId="r1" />);
    expect(html).toContain("已修改");
    expect(html).toContain("text-gold-fg");
    expect(html).toContain("<button");
    expect(html).toContain('aria-label="看修改记录"');
    expect(CORRECTED_ROW_CLASS).toContain("outline-gold");
  });

  it("is on all twelve modules' lists", () => {
    const tables: Array<[string, string]> = [
      ["src/components/receipts/receipts.tsx", "MATERIAL_RECEIPT"],
      ["src/components/contractor-ops/office-module-lists.tsx", "MATERIAL_OUTGOING"],
      ["src/components/contractor-ops/office-module-lists.tsx", "EQUIPMENT_MOVEMENT"],
      ["src/components/contractor-ops/office-module-lists.tsx", "PROGRESS"],
      ["src/components/site-operations/safety.tsx", "HAZARD"],
      ["src/components/sundry-claims/sundry-claims-office.tsx", "SUNDRY_CLAIM"],
      ["src/components/contractor-ops/site-disposal-workspaces.tsx", "DISPOSAL_REQUEST"],
      ["src/components/contractor-ops/waste-outgoing-workspace.tsx", "WASTE_OUTGOING"],
    ];
    for (const [file, kind] of tables) {
      expect(read(file), `${file} ${kind}`).toContain(`corrected={{ kind: "${kind}" }}`);
    }
    expect(read("src/components/site-access/gate-records.tsx")).toContain(
      '<CorrectedTag kind="GATE_INCIDENT" recordId={row.id} />',
    );
    expect(read("src/components/progress/daily-reports.tsx")).toContain(
      '<CorrectedTag kind="DAILY_REPORT" recordId={row.id} />',
    );
    expect(read("src/components/contractor-ops/operations-workspaces.tsx")).toContain(
      "row.was_corrected && CORRECTED_ROW_CLASS",
    );
    // 设备工时 joins with its own corrections (J1-13..16).
  });
});
