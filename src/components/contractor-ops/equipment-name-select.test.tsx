/**
 * 「设备名称」 (JB96, 客户 11-03 第 1、2 点): chosen from the company's list or
 * added on the spot - 「新增名称自动保存，以后登记可以直接选择」.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";

const { EquipmentNameSelect, equipmentNameChoices, sameEquipmentName } = await import(
  "@/components/contractor-ops/equipment-name-select"
);

function render(node: React.ReactNode, names: { id: string; name: string; is_active: boolean }[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["equipment-names", "p-1"], names);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("the name list", () => {
  it("compares names the way the server does: case and spaces do not count", () => {
    expect(sameEquipmentName("Tower  Crane", " tower crane ")).toBe(true);
    expect(sameEquipmentName("挖土机", "挖土机 ")).toBe(true);
    expect(sameEquipmentName("吊车", "塔吊")).toBe(false);
  });

  it("offers each name once, and keeps a machine's own name that is not on the list", () => {
    expect(equipmentNameChoices(["挖土机", "Crane", "crane"], "")).toEqual(["挖土机", "Crane"]);
    expect(equipmentNameChoices(["挖土机"], "Old Roller")).toEqual(["Old Roller", "挖土机"]);
    expect(equipmentNameChoices(["挖土机"], "挖土机")).toEqual(["挖土机"]);
  });

  it("puts 「新增设备名称」 right beside the dropdown", () => {
    const html = render(
      <EquipmentNameSelect project="p-1" value="挖土机" onChange={() => {}} />,
      [{ id: "n-1", name: "挖土机", is_active: true }],
    );
    expect(html).toContain(zh.contractorOps.equipmentName.add);
    expect(html).toContain('data-testid="equipment-name-select"');
  });

  it("does not offer adding to someone who may not", () => {
    const html = render(<EquipmentNameSelect project="p-1" value="" canAdd={false} onChange={() => {}} />);
    expect(html).not.toContain(zh.contractorOps.equipmentName.add);
  });

  it("is worded in all four languages, plainly", () => {
    expect(zh.contractorOps.equipmentName.label).toBe("设备名称");
    expect(zh.contractorOps.equipmentName.add).toBe("新增设备名称");
    expect(zhTW.contractorOps.equipmentName.add).toBe("新增設備名稱");
    expect(en.contractorOps.equipmentName.add).toBe("Add equipment name");
    expect(ms.contractorOps.equipmentName.label).toBe("Nama peralatan");
    expect(zh.contractorOps.toast.equipmentRegistered.replace("{no}", "EQ0001")).toBe("设备已登记，设备号码 EQ0001。");
  });
});
