"use client";

/**
 * 【人工费用】 in the header of 人员名单 and 人员进场记录 (JB295 R13): the
 * client's 「没有看到人工费用统计及结算入口」. For whoever may read labour
 * (`labour.view`); never on the phone.
 */

import { HandCoins } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";

/** The 人工费用 page, on the header's project when one is chosen. */
export function labourCostsHref(project?: string): string {
  return project && project !== "all" ? `/labour-costs?project=${encodeURIComponent(project)}` : "/labour-costs";
}

export function LabourCostsButton({ project }: { project?: string }) {
  const t = useTranslations();
  const { can, user } = useAuth();
  if (user?.is_field_staff || !can("labour.view")) return null;
  return (
    <Button asChild variant="outline" data-slot="labour-costs-button">
      <Link href={labourCostsHref(project)}>
        <HandCoins />
        {t("nav.submodule.labourCosts")}
      </Link>
    </Button>
  );
}
