"use client";

/**
 * 顾问仪表板 (JB226, 客户 11-19 事项 6).
 *
 * The client: 「请沿用现有项目经理仪表板的设计及布局，包括工程照片墙、现场地图、最新记录、
 * 工程进度及待处理事项。所有显示内容必须根据总部给予顾问的权限自动呈现，没有授权的模块、
 * 卡片及相关数据一律隐藏。不需要重新设计一套仪表板，直接沿用现有项目仪表板，根据顾问权限
 * 控制显示内容即可。」
 *
 * So this is not a page of its own: it is the project manager's 项目仪表板 -
 * the company banner and `ProjectReference` - on the project chosen in the
 * top bar's project box. The server leaves out every part head office did not
 * give him; what comes back is drawn. Choosing another project in the top bar
 * reads that project's ticks (the box reloads the account), and this page
 * follows. Before that there are only the two sentences below: no project
 * granted at all, or several and none chosen yet. Under the banner one line
 * says that only what head office opened is here, and whom to ask for more
 * (audit F2: with few ticks the page is nearly empty, and should say why).
 */

import { FolderKanban, Info } from "lucide-react";
import { useTranslations } from "next-intl";

import { CompanyBanner } from "@/components/dashboard/company-banner";
import { ProjectReference } from "@/components/dashboard/project-reference";
import { useAuth } from "@/components/providers/auth-provider";

export function ConsultantHome() {
  const t = useTranslations("consultantHome");
  const { user } = useAuth();
  if (!user) return null;
  const granted = (user.consultant_projects ?? []).filter((row) => row.is_current);
  const active = user.active_project;
  if (granted.length === 0 || !active) {
    return (
      <section
        className="surface-panel flex items-start gap-3 rounded-2xl p-5 text-sm"
        data-consultant-home={granted.length === 0 ? "no-project" : "choose-project"}
        role="status"
      >
        <FolderKanban className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p>{granted.length === 0 ? t("noProjects") : t("chooseProject")}</p>
      </section>
    );
  }
  const code = granted.find((row) => row.project_id === active.project_id)?.project_code;
  return (
    <div className="space-y-4" data-consultant-home="project">
      <CompanyBanner scope="project" projectName={code ? `${code} · ${active.project_name}` : active.project_name} />
      {/* Why parts of the project manager's page are not here, and whom to ask (JB226 audit F2). */}
      <p className="flex items-start gap-2 text-sm" data-consultant-scope role="note">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        {t("onlyOpened")}
      </p>
      <ProjectReference project={active.project_id} consultant />
    </div>
  );
}
