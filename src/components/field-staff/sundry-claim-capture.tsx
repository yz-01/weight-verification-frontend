"use client";

/**
 * 杂费报销 from the phone (T-379; D-232, 第 59 条).
 *
 * 「现场人员直接从手机端进入 Sundry Claim，填写金额、说明，上传相关照片或凭证
 * 后提交到后台处理」. The same shape as the other phone forms - every field in
 * the draft so a mis-tap or a closed page loses nothing, location taken
 * automatically, submitted through the offline queue - and held in a 挂号 like
 * every other capture (D-259). After submitting, the claim is on 「我提交过的」
 * with its conversation and, once paid, the vouchers.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ReceiptText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useClearDraft, useDraftState } from "@/components/field-staff/field-draft";
import { LocationField } from "@/components/field-staff/location-field";
import { useAuth } from "@/components/providers/auth-provider";
import { FieldCamera } from "@/components/shared/field-camera";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import type { LocationFix } from "@/lib/field-location";
import { submitSundryClaimOfflineAware } from "@/services/offline-sync.service";

/** The server's own ceiling (`MAX_ATTACHMENTS`). */
const MAX_ATTACHMENTS = 10;

export function SundryClaimCapture({
  initialProject = "",
  onSaved,
}: {
  initialProject?: string;
  onSaved: () => void;
}) {
  const t = useTranslations("sundryClaim.capture");
  const tLocation = useTranslations("fieldStaffPwa");
  const { user } = useAuth();
  const qc = useQueryClient();
  const [project, setProject] = useDraftState("project", initialProject);
  const [amount, setAmount] = useDraftState("amount", "");
  const [description, setDescription] = useDraftState("description", "");
  const [attachments, setAttachments] = useDraftState<File[]>("attachments", []);
  const clearDraft = useClearDraft();
  // Not in the draft, like every other phone form: a location restored the
  // next day would be yesterday's place stamped on today's claim.
  const [location, setLocation] = useState<LocationFix | null>(null);
  const [error, setError] = useState("");
  const validAmount = Number(amount) > 0;

  const save = useMutation({
    mutationFn: () => {
      if (!user || !location) throw new Error("missing_location");
      return submitSundryClaimOfflineAware(user.id, {
        project,
        amount: amount.trim(),
        description: description.trim(),
        latitude: location.latitude,
        longitude: location.longitude,
        client_event_id: crypto.randomUUID(),
        attachments,
      });
    },
    onSuccess: () => {
      // Only after the server took it, or the offline queue did.
      clearDraft();
      void qc.invalidateQueries({ queryKey: ["my-submissions"] });
      onSaved();
    },
    onError: (reason) =>
      setError(reason instanceof ApiError ? reason.message : t("failed")),
  });

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
      <FieldWrapper label={t("project")} required>
        <ProjectPicker
          value={project}
          onValueChange={setProject}
          placeholder={t("chooseProject")}
          className="h-12 w-full"
          disabled={Boolean(initialProject)}
        />
      </FieldWrapper>
      <FieldWrapper label={t("amount")} required hint={t("amountHint")}>
        <Input
          inputMode="decimal"
          type="number"
          min="0"
          step="0.01"
          className="h-12"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </FieldWrapper>
      <FieldWrapper label={t("description")} required>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("descriptionPlaceholder")}
        />
      </FieldWrapper>
      <FieldWrapper label={t("attachments")} required hint={t("attachmentsHint")}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {attachments.map((file, index) => (
            <FieldCamera
              key={`${file.name}-${file.lastModified}-${index}`}
              label={t("attachmentNumber", { number: index + 1 })}
              file={file}
              fileCount={1}
              onCapture={(replacement) =>
                setAttachments((items) => (items ?? []).map((item, i) => (i === index ? replacement : item)))
              }
              onClear={() => setAttachments((items) => (items ?? []).filter((_, i) => i !== index))}
            />
          ))}
          {attachments.length < MAX_ATTACHMENTS && (
            <FieldCamera
              label={t("addAttachment")}
              fileCount={0}
              onCapture={(file) => setAttachments((items) => [...(items ?? []), file])}
            />
          )}
        </div>
      </FieldWrapper>
      <LocationField
        label={t("location")}
        actionLabel={tLocation("attendance.getLocation")}
        readyLabel={tLocation("attendance.locationReady")}
        value={location}
        onChange={setLocation}
        required
      />
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        className="h-12 w-full text-sm"
        requires={[
          [project, t("project")],
          [validAmount, t("amount")],
          [description.trim(), t("description")],
          [attachments.length > 0, t("attachments")],
          [location, t("location")],
        ]}
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? <Loader2 className="animate-spin" /> : <ReceiptText />}
        {t("submit")}
      </Button>
    </div>
  );
}
