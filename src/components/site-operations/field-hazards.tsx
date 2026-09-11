"use client";

/**
 * One hazard's conversation, on the phone.
 *
 * This used to be a list page with one button on it. The customer asked for
 * the list to go - 「图3也可以移除，是隐患的那部分，当工作人员按隐患后可以直接
 * 上报，不需要跳两个页面」 - so pressing 隐患 now opens the reporting form in
 * one tap, and this component is only the room you land in afterwards (T-211).
 *
 * It is still the same room the 事故 tab used to hold. The customer folded
 * that feature in here: 「报告事故的聊天室是结合进去隐患整改的，然后报告事故
 * 移除掉」.
 *
 * Where past hazards are read now that the list is gone: 「我提交过的」 on the
 * home screen, whose hazard rows open this component (T-210). That ordering
 * was deliberate - T-211 depends on T-209 and T-210 precisely so there is
 * never a build where a worker can report a hazard and then not find it
 * again. Nothing would have errored; the way back would simply have been
 * missing.
 *
 * Built for somebody who cannot comfortably read (D-094): the header says
 * which hazard this is in the words the reporter typed themselves, and
 * everything else on the screen is the conversation.
 */

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { HazardConversationPanel } from "@/components/site-operations/hazard-conversation";
import { Button } from "@/components/ui/button";
import type { SafetyIncident } from "@/interfaces/site-operations";

export function FieldHazardsPanel({
  hazard,
  onBack,
}: {
  /**
   * The hazard whose room this is.
   *
   * Narrowed from `SafetyIncident` to the three fields actually read here
   * (T-210): the caller may only hold a history row, and widening that into a
   * whole incident would have meant a second fetch to satisfy a type rather
   * than a need. The room itself is keyed by `id`.
   */
  hazard: Pick<SafetyIncident, "id" | "title" | "incident_no">;
  onBack: () => void;
}) {
  const t = useTranslations();
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          variant="outline"
          className="shrink-0"
          title={t("common.back")}
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{hazard.title}</h2>
          <p className="truncate text-sm text-muted-foreground">
            {hazard.incident_no}
          </p>
        </div>
      </div>
      <HazardConversationPanel incidentId={hazard.id} />
    </section>
  );
}
