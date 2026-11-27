/**
 * JB256 (客户 11-24b 事项 3, 图 4–5): 材料成本报表's PDF and Excel.
 *
 * 「请由系统自动计算，并在报表底部显示累计数量及总金额，必须与后台搜索结果一致。
 * 预览及导出时，支持选择包含照片或不包含照片。其他保持不变。」
 *
 * The server computes the closing block (`receiving.costs.cost_totals_summary`,
 * the same function as the page's 「按材料统计成本」); the screen asks for it
 * with `group_by: "material_cost"` and its words, and sends `include_photos:
 * false` when 「不包含照片」 is chosen. The quantity report is unchanged.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";
import { exportBody } from "@/services/contractor.service";

function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

const base = {
  format: "pdf" as const,
  title: "材料成本报表",
  columns: [{ key: "receipt_no", label: "进退场记录编号" }],
  query: {},
};

describe("JB256 the request body", () => {
  it("asks for the cost block with its words", () => {
    const body = exportBody({
      ...base,
      summary: {
        groupBy: "material_cost",
        title: "累计数量及总金额",
        materialLabel: "材料",
        specificationLabel: "规格",
        unitLabel: "单位",
        quantityLabel: "累计数量",
        countLabel: "收货次数",
        amountLabel: "采购成本",
        totalLabel: "总金额",
      },
    });
    expect(body.summary).toMatchObject({
      group_by: "material_cost",
      title: "累计数量及总金额",
      material_label: "材料",
      specification_label: "规格",
      unit_label: "单位",
      quantity_label: "累计数量",
      count_label: "收货次数",
      amount_label: "采购成本",
      total_label: "总金额",
    });
  });

  it("「不包含照片」 sends include_photos: false; otherwise nothing changes", () => {
    expect(exportBody({ ...base, includePhotos: false })).toMatchObject({ include_photos: false });
    expect(exportBody({ ...base, includePhotos: true })).not.toHaveProperty("include_photos");
    expect(exportBody(base)).not.toHaveProperty("include_photos");
  });
});

describe("JB256 the page", () => {
  const page = read("src/components/reports/material-report.tsx");

  it("材料成本报表 offers the photo choice and the cost block; 材料数量报表 does not", () => {
    expect(page).toContain('photoChoice={mode === "cost"}');
    expect(page).toContain('summary: mode === "quantity" ? cumulativeSummary : costSummary');
    expect(page).toContain('groupBy: "material_cost" as const');
    expect(page).toContain('...(mode === "cost" && choice ? { includePhotos: choice.includePhotos } : {})');
  });

  it("the menu's choice reaches every file action", () => {
    const button = read("src/components/shared/export-button.tsx");
    expect(button).toContain("onExport(format, { includePhotos })");
    expect(button).toContain('data-slot="export-photos-with"');
    expect(button).toContain('data-slot="export-photos-without"');
    // Picking a choice keeps the menu open for the file.
    expect(button.match(/onSelect=\{\(event\) => event\.preventDefault\(\)\}/g)?.length).toBe(2);
  });
});

describe("JB256 four languages", () => {
  const keys = ["photos", "withPhotos", "withoutPhotos", "summaryTitle", "totalAmount"] as const;
  it.each([
    ["zh", zh],
    ["zh-TW", zhTW],
    ["en", en],
    ["ms", ms],
  ])("%s", (_, catalogue) => {
    const group = (catalogue as unknown as { jb256: Record<string, string> }).jb256;
    for (const key of keys) expect(group[key], key).toBeTruthy();
  });

  it("the Chinese words are the client's", () => {
    expect(zh.jb256.withPhotos).toBe("包含照片");
    expect(zh.jb256.withoutPhotos).toBe("不包含照片");
    expect(zh.jb256.summaryTitle).toBe("累计数量及总金额");
    expect(zh.jb256.totalAmount).toBe("总金额");
  });
});
