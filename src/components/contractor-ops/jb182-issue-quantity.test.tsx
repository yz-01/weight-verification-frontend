/**
 * JB182 (客户 11-12 追加 6, 追加图 7) on screen - the shared 「改正记录内容」
 * window of a 材料领用:
 *
 * 「目前点击「改正」后，只能修改原因／备注和材料单价，没有修改领用数量的选项。
 *  1. 允许修改领用数量（Liter）。
 *  2. 保留现有单价修改功能。
 *  3. 修改数量或单价后，系统自动重新计算总金额。
 *  4. 所有改正必须保留原始数据及修改历史，不可覆盖原始记录。」
 *
 * Rendered to static markup like the other screen tests - the runner has no
 * DOM, so what is typed is the window's starting value (`field.value`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { CorrectionField, CorrectionForm, RecordCorrectionHistory } from "@/interfaces/record-correction";
import { badNumber, correctionChanges, initialDraft, isCorrecting, missingRequired, overPlaces } from "@/lib/record-correction";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-office", full_name: "Office", is_field_staff: false },
    can: () => true,
  }),
}));

vi.mock("@/components/ui/dialog", () => {
  const Inline = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Dialog: Inline,
    DialogContent: Inline,
    DialogDescription: Inline,
    DialogFooter: Inline,
    DialogHeader: Inline,
    DialogTitle: Inline,
  };
});

const { RecordCorrectionDialog, RecordCorrectionHistory: History, recordCorrectionsKey } = await import(
  "@/components/shared/record-correction"
);
const { linePriceField } = await import("@/components/contractor-ops/material-issue");

const rc = zh.recordCorrection;
const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

function render(node: React.ReactNode, seed?: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["material-units", "active"], []);
  client.setQueryData(["material-units", "all"], []);
  seed?.(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const DISEL = {
  id: "l-1",
  position: 1,
  material_name: "Disel",
  material_specification: "Disel",
  unit: "Liter",
  quantity: "200.000",
  issued_quantity: "200.000",
};
const REBAR = {
  id: "l-2",
  position: 2,
  material_name: "钢筋",
  material_specification: "Y16",
  unit: "Liter",
  quantity: "2.000",
  issued_quantity: "0.000",
};

function quantity(line: typeof DISEL, value: string): CorrectionField {
  return {
    name: `line_quantity:${line.id}`,
    type: "decimal",
    required: true,
    max_length: null,
    value,
    display: line.issued_quantity ?? line.quantity,
    options: null,
    locked: false,
    places: 3,
    line,
    line_part: "quantity",
  };
}

function price(line: typeof DISEL, value: string): CorrectionField {
  return {
    name: `line_price:${line.id}`,
    type: "decimal",
    required: false,
    max_length: null,
    value,
    display: value,
    options: null,
    locked: false,
    places: 2,
    line,
    line_part: "price",
  };
}

const REASON: CorrectionField = {
  name: "reason",
  type: "textarea",
  required: true,
  max_length: null,
  value: "材料领用",
  display: "材料领用",
  options: null,
  locked: false,
};

function form(fields: CorrectionField[]): CorrectionForm {
  return {
    kind: "MATERIAL_OUTGOING",
    record: "o-1",
    reference: "MIN-PRJ-0003-003",
    blocked: null,
    archived: false,
    fields,
  };
}

const dialog = (answer: CorrectionForm, only?: string[]) =>
  render(<RecordCorrectionDialog kind="MATERIAL_OUTGOING" recordId="o-1" only={only} onClose={() => {}} />, (client) =>
    client.setQueryData(["record-correction-form", "MATERIAL_OUTGOING", "o-1"], answer),
  );

/** The handed-over Disel of 追加图 7, and a second material. */
const HANDED_OVER = form([
  REASON,
  quantity(DISEL, "200.000"),
  price(DISEL, "6.80"),
  quantity(REBAR, "0.000"),
  price(REBAR, ""),
]);

/* ------------------------------------------------------------------ */

describe("第 1 点: the window offers each material's 领用数量", () => {
  it("names it 「1. Disel Disel 领用数量（Liter）」 once handed over, with 原来 under it", () => {
    const html = dialog(HANDED_OVER);
    expect(html).toContain("1. Disel Disel 领用数量（Liter）");
    expect(html).toContain("2. 钢筋 Y16 领用数量（Liter）");
    expect(html).toContain(rc.was.replace("{value}", "200.000"));
    // Three decimals, like every quantity.
    expect(html).toContain('step="0.001"');
  });

  it("names it 「申请数量」 before the handover (申请中 / 已批准)", () => {
    const waiting = { ...DISEL, quantity: "200.000", issued_quantity: null };
    const html = dialog(form([REASON, quantity(waiting as never, "200.000"), price(waiting as never, "6.80")]));
    expect(html).toContain("1. Disel Disel 申请数量（Liter）");
    expect(html).not.toContain("领用数量（Liter）");
  });

  it("puts each material's 数量 directly above its 单价", () => {
    const html = dialog(HANDED_OVER);
    const at = (text: string) => html.indexOf(text);
    expect(at("1. Disel Disel 领用数量")).toBeGreaterThan(at(rc.field.reason));
    expect(at("1. Disel Disel 单价")).toBeGreaterThan(at("1. Disel Disel 领用数量"));
    expect(at("2. 钢筋 Y16 领用数量")).toBeGreaterThan(at("1. Disel Disel 单价"));
    expect(at("2. 钢筋 Y16 单价")).toBeGreaterThan(at("2. 钢筋 Y16 领用数量"));
  });

  it("offers the 数量 without 金额查看 - and no 单价, 金额 or 总金额", () => {
    const html = dialog(form([REASON, quantity(DISEL, "200.000"), quantity(REBAR, "0.000")]));
    expect(html).toContain("1. Disel Disel 领用数量（Liter）");
    expect(html).not.toContain("单价");
    expect(html).not.toContain("RM");
    expect(html).not.toContain("data-lines-total");
  });

  it("refuses a blank, zero, negative or four-decimal quantity before 保存", () => {
    const fields = [quantity(DISEL, "200.000")];
    const name = fields[0].name;
    expect(missingRequired(fields, { [name]: "" })?.name).toBe(name);
    expect(badNumber(fields, { [name]: "0" })?.name).toBe(name);
    expect(badNumber(fields, { [name]: "-5" })?.name).toBe(name);
    expect(overPlaces(fields, { [name]: "180.1234" })?.name).toBe(name);
    expect(badNumber(fields, { [name]: "180.5" })).toBeNull();
    expect(overPlaces(fields, { [name]: "180.125" })).toBeNull();
  });

  it("does not stop a save over a material handed over as 0 and left as it is", () => {
    const fields = [quantity(DISEL, "200.000"), quantity(REBAR, "0.000")];
    const draft = { ...initialDraft(fields), [fields[0].name]: "180" };
    expect(badNumber(fields, draft)).toBeNull();
    expect(missingRequired(fields, draft)).toBeNull();
  });

  it("sends only the changed quantity, with the figure it started from, as a correction (reason + PIN)", () => {
    const fields = HANDED_OVER.fields;
    const draft = { ...initialDraft(fields), "line_quantity:l-1": "180" };
    const { changes, expected } = correctionChanges(fields, draft);
    expect(changes).toEqual({ "line_quantity:l-1": "180" });
    expect(expected).toEqual({ "line_quantity:l-1": "200.000" });
    expect(isCorrecting(fields, changes)).toBe(true);
    // The same figure typed differently is no change.
    expect(correctionChanges(fields, { ...initialDraft(fields), "line_quantity:l-1": "200" }).changes).toEqual({});
  });
});

describe("第 2 点: the 单价 stays as it was", () => {
  it("still reads 「1. Disel Disel 单价（RM / Liter）」 with 原来 under it", () => {
    const html = dialog(HANDED_OVER);
    expect(html).toContain("1. Disel Disel 单价（RM / Liter）");
    expect(html).toContain(rc.was.replace("{value}", "6.80"));
    expect(html).toContain('step="0.01"');
  });

  it("「填写单价」 still opens the window on that line's 单价 alone", () => {
    expect(linePriceField("l-2")).toBe("line_price:l-2");
    const html = dialog(HANDED_OVER, [linePriceField("l-2")]);
    expect(html).toContain("2. 钢筋 Y16 单价（RM / Liter）");
    expect(html).not.toContain("领用数量");
    expect(html).not.toContain("1. Disel");
    expect(html).not.toContain("data-lines-total");
  });

  it("asks for the PIN note for a 单价 only, not for a 数量 (a 数量 is a correction like any other)", () => {
    const source = read("src/components/shared/record-correction.tsx");
    expect(source).toContain("const pricing = fields.some((field) => isLinePrice(field) && field.name in changes);");
  });
});

describe("第 3 点: 金额 and 总金额 follow what is typed", () => {
  it("works 金额 out from the 数量 box above it, not the stored figure", () => {
    // The box reads 180 (typed); the line still holds 200.
    const html = dialog(form([REASON, quantity(DISEL, "180"), price(DISEL, "6.80")]));
    expect(html).toContain("金额：180 Liter × RM 6.80 = RM 1224.00");
    expect(html).not.toContain("RM 1360.00");
  });

  it("shows the window's own figures before anything is typed, as 追加图 7 did", () => {
    const html = dialog(form([REASON, quantity(DISEL, "200.000"), price(DISEL, "6.80")]));
    expect(html).toContain("金额：200.000 Liter × RM 6.80 = RM 1360.00");
    // One material: no 总金额 line.
    expect(html).not.toContain("data-lines-total");
  });

  it("adds 「总金额」 under the last material when there is more than one, leaving out and counting the unpriced", () => {
    const html = dialog(HANDED_OVER);
    expect(html).toContain("data-lines-total");
    expect(html).toContain(rc.lineTotal.replace("{amount}", "1360.00"));
    expect(html).toContain(rc.lineTotalUnpriced.replace("{count}", "1"));
    expect(html.indexOf("data-lines-total")).toBeGreaterThan(html.indexOf("2. 钢筋 Y16 单价"));
  });

  it("adds every priced material's amount, as typed", () => {
    const html = dialog(
      form([REASON, quantity(DISEL, "180"), price(DISEL, "6.80"), quantity(REBAR, "2.5"), price(REBAR, "10")]),
    );
    // 180 x 6.80 = 1224.00; 2.5 x 10.00 = 25.00.
    expect(html).toContain(rc.lineTotal.replace("{amount}", "1249.00"));
    expect(html).not.toContain(rc.lineTotalUnpriced.replace("{count}", "0"));
  });

  it("says plainly when no material has a 单价 yet - never RM 0.00", () => {
    const html = dialog(form([REASON, quantity(DISEL, "200.000"), price(DISEL, ""), quantity(REBAR, "1"), price(REBAR, "")]));
    expect(html).toContain(rc.lineTotalNone);
    expect(html).not.toContain("RM 0.00");
  });
});

describe("第 4 点: the history keeps the old figure under its own name", () => {
  it("reads 「领用数量 #1 Disel: 200.000 → 180.000」 with the reason", () => {
    const history: RecordCorrectionHistory = {
      kind: "MATERIAL_OUTGOING",
      record: "o-1",
      corrections: [
        {
          id: "c-1",
          batch: "b-1",
          source: "CORRECTION",
          field: "issued_quantity",
          item_label: "#1 Disel",
          value_from: "200.000",
          value_to: "180.000",
          reason: "现场写错了",
          corrected_by_name: "Office",
          created_at: "2026-11-12T12:00:00Z",
        },
        {
          id: "c-2",
          batch: "b-2",
          source: "CORRECTION",
          field: "requested_quantity",
          item_label: "#2 钢筋",
          value_from: "2.000",
          value_to: "3.000",
          reason: "申请写错了",
          corrected_by_name: "Office",
          created_at: "2026-11-12T11:00:00Z",
        },
      ],
    };
    const html = render(<History kind="MATERIAL_OUTGOING" recordId="o-1" />, (client) =>
      client.setQueryData(recordCorrectionsKey("MATERIAL_OUTGOING", "o-1"), history),
    );
    expect(html).toContain("领用数量 #1 Disel");
    expect(html).toContain("200.000");
    expect(html).toContain("180.000");
    expect(html).toContain("申请数量 #2 钢筋");
    expect(html).toContain(rc.reasonLine.replace("{reason}", "现场写错了"));
  });
});

describe("every word in all four catalogues", () => {
  it("has the labels, the 总金额 lines and the history names", () => {
    for (const catalogue of [zh, zhTW, en, ms]) {
      const words = catalogue.recordCorrection as Record<string, unknown> & { field: Record<string, string> };
      for (const key of ["lineQuantityIssued", "lineQuantityRequested", "lineTotal", "lineTotalUnpriced", "lineTotalNone"]) {
        expect(words[key], key).toBeTruthy();
      }
      expect(words.field.issued_quantity).toBeTruthy();
      expect(words.field.requested_quantity).toBeTruthy();
      expect(String(words.lineQuantityIssued)).toContain("{name}");
      expect(String(words.lineQuantityIssued)).toContain("{unit}");
      expect(String(words.lineTotal)).toContain("{amount}");
      expect(String(words.lineTotalUnpriced)).toContain("{count}");
    }
    expect(zh.recordCorrection.lineQuantityIssued).toBe("{name} 领用数量（{unit}）");
    expect(zh.recordCorrection.lineQuantityRequested).toBe("{name} 申请数量（{unit}）");
    expect(zh.recordCorrection.lineTotal).toBe("总金额：RM {amount}");
    expect(zh.recordCorrection.field.issued_quantity).toBe("领用数量");
    expect(zh.recordCorrection.field.requested_quantity).toBe("申请数量");
  });
});
