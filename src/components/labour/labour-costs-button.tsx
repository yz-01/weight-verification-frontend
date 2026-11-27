"use client";

/**
 * 【人工费用统计】 in the header of 人员进场记录 (JB295 R13, 「没有看到人工费用统计
 * 及结算入口」): opens the 人员名单 page on its 人工费用统计 tab (JB295b). For
 * whoever may read labour (`labour.view`); never on the phone.
 */

import { HandCoins } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { labourTabHref } from "@/lib/labour-links";

/** The 人工费用统计 tab, on the header's project when one is chosen. */
export function labourCostsHref(project?: string): string {
  return labourTabHref("labour", { project });
}

export function LabourCostsButton({ project }: { project?: string }) {
  const t = useTranslations("jb295");
  const { can, user } = useAuth();
  // The tab is closed with 人员进场 (attendance) switched off for the company (QA295).
  if (user?.is_field_staff || !can("labour.view") || !(user?.features?.includes("attendance") ?? true)) return null;
  return (
    <Button asChild variant="outline" data-slot="labour-costs-button">
      <Link href={labourCostsHref(project)}>
        <HandCoins />
        {t("tab.labour")}
      </Link>
    </Button>
  );
}
