"use client";

/**
 * 「设备操作员工时」 on the site staff's phone since JB227 (客户 11-19 事项 7):
 * 「现场人员不能代替设备司机打卡。只有绑定了对应设备的司机手机端，才允许进行设备
 * 工时打卡。」 The tile stays, but only to read: one plain sentence saying who
 * clocks and whom to ask, then the project's recent hours with 正常 / 超时 /
 * 总工时 as before (J37-2). No scan, no photo, no signature - the server
 * refuses a site staff's 开工 / 收工 as well.
 */

import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldStaffRecords } from "@/components/equipment-hours/equipment-phone-records";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";

export function SiteStaffHoursView({ initialProject = "" }: { initialProject?: string }) {
  const t = useTranslations("equipmentHours");
  const [project, setProject] = useState(initialProject);
  return (
    <div className="space-y-4" data-testid="site-staff-hours">
      <p
        role="status"
        className="rounded-lg border border-info/40 bg-info/10 px-3 py-3 text-base font-medium leading-6"
      >
        {t("phone.staffViewOnly")}
      </p>
      {!initialProject ? (
        <FieldWrapper label={t("phone.project")} required>
          <ProjectPicker
            value={project}
            onValueChange={setProject}
            placeholder={t("phone.project")}
            className="h-11 w-full"
          />
        </FieldWrapper>
      ) : null}
      {project ? <FieldStaffRecords project={project} /> : null}
    </div>
  );
}
