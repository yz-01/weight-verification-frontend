"use client";

/**
 * How consultant applications are used, in three steps (T-373, D-254).
 *
 * Lucas: 「顾问申请那里我是真的用不明白所以到现在还没有测试过，能不能弄成
 * 简单用的，还有说明该怎么使用」. The screen gave no idea what the order of
 * things was, and the first form asked for a workflow and a template nobody
 * had built. Those are optional now (the project gets a default one-step
 * route); what is left is three steps and one thing to set up once - the
 * consultant's access to the project - and this says so where the work starts.
 */

import { BookOpen, KeyRound, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

export function ConsultantHowTo({
  defaultOpen,
  canConfigure,
}: {
  defaultOpen: boolean;
  canConfigure: boolean;
}) {
  const t = useTranslations("consultantWorkflow.howTo");
  const steps = ["create", "submit", "decide"] as const;
  return (
    <details open={defaultOpen} className="rounded-lg border bg-primary/5 px-4 py-3">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
        <BookOpen className="size-4 text-primary" />
        {t("title")}
      </summary>
      <ol className="mt-3 grid gap-3 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step} className="rounded-md border bg-card p-3">
            <p className="text-xs font-semibold text-primary">{t("stepNumber", { number: index + 1 })}</p>
            <p className="mt-1 text-sm font-medium">{t(`${step}.title`)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t(`${step}.body`)}</p>
          </li>
        ))}
      </ol>
      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        <p className="flex items-start gap-1.5">
          <Settings2 className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {t("setupOnce")}{" "}
            {canConfigure ? (
              <Link href="/consultant-settings" className="font-medium text-primary hover:underline">
                {t("openSettings")}
              </Link>
            ) : (
              t("askAdmin")
            )}
          </span>
        </p>
        <p className="flex items-start gap-1.5">
          <KeyRound className="mt-0.5 size-3.5 shrink-0" />
          <span>{t("signatureOnce")}</span>
        </p>
      </div>
    </details>
  );
}
