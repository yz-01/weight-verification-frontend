"use client";

/**
 * 材料退场's seven steps on its record (JB281, 客户 11-26 事项 22).
 *
 * 「必须严格按照以下顺序执行，不允许跳过任何环节……上一环节尚未完成，下一环节的操作
 * 按钮必须锁定……每个环节自动保留操作人、日期及时间」. The server decides the order
 * (`return_flow.steps`) and refuses a step out of turn; this lists them as it
 * says: done (who, when), the one waiting now, and the locked ones after it.
 */

import { useTranslations } from "next-intl";
import { CheckCircle2, CircleDot, Lock, MinusCircle, XCircle } from "lucide-react";

import type { MaterialOutgoing, ReturnFlowStep } from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";

const ICONS = {
  done: CheckCircle2,
  current: CircleDot,
  locked: Lock,
  rejected: XCircle,
  not_recorded: MinusCircle,
} as const;

const TONES = {
  done: "text-success",
  current: "text-primary",
  locked: "text-muted-foreground",
  rejected: "text-destructive",
  not_recorded: "text-muted-foreground",
} as const;

export function ReturnFlowSteps({ steps }: { steps: ReturnFlowStep[] }) {
  const t = useTranslations("jb281");
  const df = useDateFormat();
  return (
    <section className="rounded-lg border bg-card p-3" data-return-steps>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("title")}
      </h3>
      <ol className="space-y-2">
        {steps.map((step, index) => {
          const Icon = ICONS[step.state] ?? Lock;
          return (
            <li
              key={step.key}
              className="flex items-start gap-2 text-sm"
              data-return-step={step.key}
              data-return-step-state={step.state}
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", TONES[step.state])} />
              <div className="min-w-0">
                <p className={cn("font-medium", step.state === "locked" && "text-muted-foreground")}>
                  {index + 1}. {t(`step.${step.key}`)}
                  <span className={cn("ml-2 text-xs font-normal", TONES[step.state])}>
                    {t(`state.${step.state}`)}
                  </span>
                </p>
                {step.state === "done" && (step.by || step.at) ? (
                  <p className="text-xs text-muted-foreground">
                    {[step.by, step.at ? df.dateTime(step.at) : ""].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
                {step.key === "exit_pass" && step.started_by && step.started_at ? (
                  <p className="text-xs text-muted-foreground">
                    {t("started", { name: step.started_by, when: df.dateTime(step.started_at) })}
                  </p>
                ) : null}
                {step.key === "gate" && step.state === "done" && step.incident_no ? (
                  <p className="text-xs text-muted-foreground">
                    {t("gateRecord", { number: step.incident_no, photos: step.photos ?? 0 })}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * Why 「确认正式退场」 is still locked, or `null` (JB281 step 6 waits for the
 * gate's photographs, step 5). Without the steps (a list row) it says nothing:
 * the server refuses an early press with its own words.
 */
export function exitConfirmLockedReason(
  row: Pick<MaterialOutgoing, "return_steps">,
  t: (key: string) => string,
): string | null {
  const gate = row.return_steps?.find((step) => step.key === "gate");
  if (!gate || gate.state === "done" || gate.state === "not_recorded") return null;
  return t("waitGate");
}
