/**
 * JB206-8 (Lucas 11-16 audit): a supplier row's buttons say what they do in
 * words - 编辑 / 二维码 / 移除 - not only on mouse-over.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

describe("supplier row buttons in words (JB206-8)", () => {
  const page = readFileSync(path.join(process.cwd(), "src/components/suppliers/suppliers.tsx"), "utf8");
  const actions = page.slice(page.indexOf('data-slot="supplier-row-actions"'));
  const cell = actions.slice(0, actions.indexOf("</div>"));

  it("carry their label beside the icon", () => {
    expect(cell).toContain('{t("common.edit")}');
    expect(cell).toContain('{t("suppliers.qr.rowLabel")}');
    expect(cell).toContain('{t("common.remove")}');
    expect(cell).not.toContain('size="icon"');
  });

  it("have the short QR word in every catalogue", () => {
    for (const messages of [zh, zhTW, en, ms]) expect(messages.suppliers.qr.rowLabel).toBeTruthy();
  });
});
