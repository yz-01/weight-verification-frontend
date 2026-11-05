"use client";

/**
 * 设备操作 - the equipment operator's own page (JB104, 客户 11-05 事项 9 第 2 点).
 *
 * 「选设备（本项目在场设备）、开工 / 收工打卡、当天工时。和现在司机打卡链接的功能
 * 一样，记录进同一张「设备操作员工时」表，后台照旧审核」. So it is the driver's
 * link screen on an account: scan or type the machine, 开工 or 收工, the
 * photo, the signature, the location - the server checks the fence as it does
 * for the link - and under it what this operator clocked today. Only the
 * operator's phone has it; site staff keep their own 设备操作员工时 entry.
 */

import { useTranslations } from "next-intl";

import { EquipmentHoursCapture } from "@/components/equipment-hours/equipment-hours-capture";
import { useAuth } from "@/components/providers/auth-provider";

export function EquipmentOperatePanel() {
  const t = useTranslations("fieldStaffPwa.operate");
  const { user } = useAuth();
  return (
    <section className="space-y-4" data-testid="equipment-operate">
      <div>
        <h2 className="text-xl font-bold leading-tight">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <EquipmentHoursCapture initialProject={user?.active_project?.project_id ?? ""} operator />
    </section>
  );
}
