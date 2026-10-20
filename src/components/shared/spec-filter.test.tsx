/**
 * 「规格」 filter on every material list and report (J2-3, Q2-2).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SpecFilterSelect } from "@/components/shared/spec-filter";
import messages from "@/messages/zh.json";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      {node}
    </NextIntlClientProvider>,
  );
}

describe("SpecFilterSelect", () => {
  it("asks for the material first, and is off until one is chosen", () => {
    const html = render(<SpecFilterSelect material={null} value={undefined} onChange={() => {}} />);
    expect(html).toContain('aria-label="规格"');
    expect(html).toContain('disabled=""');
  });

  it("offers the material's specifications once it is chosen", () => {
    const html = render(
      <SpecFilterSelect
        material={{
          id: "m1",
          name: "Concrete",
          specs: [{ id: "s1", name: "G15", default_unit: "TONNE", is_active: true, is_other: false, sort_order: 0 } as never],
        }}
        value={undefined}
        onChange={() => {}}
      />,
    );
    expect(html).not.toContain('disabled=""');
  });
});

describe("the pages (J2-3)", () => {
  it("material in, material out and the material reports filter by specification", () => {
    expect(read("src/components/receipts/receipts.tsx")).toContain(
      'onChange={(spec) => list.setFilter("spec_category", spec)}',
    );
    expect(read("src/components/contractor-ops/office-module-lists.tsx")).toContain(
      '<ColumnFilter list={list} kind="MATERIAL" withSpecs />',
    );
    expect(read("src/components/reports/material-report.tsx")).toContain("<SpecFilterSelect");
  });
});
