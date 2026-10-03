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

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Camera, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { HazardConversationPanel } from "@/components/site-operations/hazard-conversation";
import {
  confirmerLabel,
  isPermit,
  SafetyReviewDialog,
  SafetySubmitDialog,
  STATUS_TONE,
} from "@/components/site-operations/safety";
import { StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import type { SafetyIncident } from "@/interfaces/site-operations";
import { getSafetyIncident } from "@/services/site-operations.service";

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
  const te = useTranslations("ehs");
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  /*
   * The item's own state, for the two things the room alone cannot offer:
   * the rectifier's 【提交整改】 and the confirmer's 【确认完成】 (B21). A
   * notification lands here, so the button has to be here too - and only the
   * one confirmer the server names gets it. A worker who is only in the
   * conversation reads it; the list endpoint refuses them, so no bar.
   */
  // query-failure: a participant who is neither rectifier nor confirmer is refused this read by design; the conversation below shows its own failure
  const item = useQuery({
    queryKey: ["safety", "field-hazard", hazard.id],
    // Silent: somebody who is only in the conversation is refused the item
    // itself, and that is not an error to show them.
    queryFn: () => getSafetyIncident(hazard.id, { silent: true }),
    retry: false,
  });
  const incident = item.data;
  const canSubmit =
    incident !== undefined &&
    incident.responsible_person === user?.id &&
    !isPermit(incident) &&
    ["ASSIGNED", "RETURNED"].includes(incident.status);
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
      {incident && (
        <div className="space-y-3 rounded-lg border bg-card p-3" data-testid="field-hazard-state">
          <div className="flex flex-wrap items-center gap-2">
            {isPermit(incident) && <StatusBadge label={te("permit.badge")} tone="info" />}
            <StatusBadge
              label={t(`safetyRectification.status.${incident.status}`)}
              tone={STATUS_TONE[incident.status]}
            />
          </div>
          <div className="grid gap-1 text-sm">
            {incident.responsible_person_name && (
              <p>{te("phone.rectifierLine", { name: incident.responsible_person_name })}</p>
            )}
            <p>{te("phone.confirmerLine", { name: confirmerLabel(incident, te) })}</p>
          </div>
          {canSubmit && (
            <Button className="w-full min-h-11" onClick={() => setSubmitting(true)}>
              <Camera />
              {t("safetyRectification.action.submit")}
            </Button>
          )}
          {incident.can_confirm && (
            <Button className="w-full min-h-11" onClick={() => setConfirming(true)}>
              <CheckCircle2 />
              {t(isPermit(incident) ? "ehs.permit.approve" : "ehs.phone.confirm")}
            </Button>
          )}
        </div>
      )}
      <HazardConversationPanel incidentId={hazard.id} />
      {submitting && incident && (
        <SafetySubmitDialog incident={incident} onClose={() => setSubmitting(false)} />
      )}
      {confirming && incident && (
        <SafetyReviewDialog incident={incident} onClose={() => setConfirming(false)} />
      )}
    </section>
  );
}
