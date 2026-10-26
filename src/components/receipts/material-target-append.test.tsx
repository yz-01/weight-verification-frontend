/**
 * 「修改目标数量」 (JB26, 客户 10-26 事项 2): the full history above - 日期时间,
 * 姓名, 账号, 原目标, 追加, 修改后累计 - and the amount to add below, signed
 * with the user's own PIN. Nothing on the screen names the operator.
 */
import { describe, expect, it, vi } from "vitest";

import type { MaterialTarget, MaterialTargetChange } from "@/interfaces/material-target";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", company_preferences: { time_format: "24H" } },
    can: () => true,
  }),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { AppendTargetDialog } = await import("@/components/receipts/material-target-append");

const row = {
  id: "t-1",
  category_name: "钢筋",
  spec_name: "Y12",
  unit: "TONNE",
  unit_label: null,
  target_quantity: "300.000",
} as unknown as MaterialTarget;

const history: MaterialTargetChange[] = [
  {
    id: "c-1",
    kind: "ORIGINAL",
    quantity: "100.000",
    target_before: "0.000",
    target_after: "100.000",
    actor_name: "Tan Ah Kow",
    actor_account: "qs@site.test",
    created_at: "2026-10-01T08:00:00+08:00",
  },
  {
    id: "c-2",
    kind: "ADDED",
    quantity: "200.000",
    target_before: "100.000",
    target_after: "300.000",
    actor_name: "Lim Mei Ling",
    actor_account: "pm@site.test",
    created_at: "2026-10-26T15:30:00+08:00",
  },
];

describe("修改目标数量 (JB26)", () => {
  const html = renderDetail(<AppendTargetDialog row={row} onClose={() => {}} onSaved={() => {}} />, (client) =>
    client.setQueryData(["material-target-history", "t-1"], {
      results: history,
    }),
  );

  it("shows the whole history with who, which account and the figures", () => {
    for (const word of ["日期时间", "姓名", "账号", "原目标", "追加数量", "修改后累计目标"]) {
      expect(html).toContain(word);
    }
    expect(html).toContain("Tan Ah Kow");
    expect(html).toContain("qs@site.test");
    expect(html).toContain("原目标 100.000");
    expect(html).toContain("+200.000");
    expect(html).toContain("300.000");
    // 24-hour clock.
    expect(html).toContain("15:30");
    expect(html.indexOf("Tan Ah Kow")).toBeLessThan(html.indexOf("Lim Mei Ling"));
  });

  it("asks only for the amount: the person comes from the PIN", () => {
    expect(html).toContain("钢筋 · Y12：目前累计目标 300.000");
    expect(html).toContain("本人六位数密码");
    expect(html).not.toMatch(/name="actor/);
    expect((html.match(/<input/g) ?? []).length).toBe(1);
  });

  it("names the PIN action in every language", async () => {
    for (const locale of ["en", "ms", "zh", "zh-TW"]) {
      const words = (await import(`@/messages/${locale}.json`)).default;
      expect(words.signOff.action.material_target_append, locale).toBeTruthy();
      expect(words.materialTargets.append.title, locale).toBeTruthy();
    }
  });
});
