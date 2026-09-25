"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, LocateFixed, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldWrapper, LoadFailed, QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  completedFieldEvidence,
  createEmptyFieldEvidence,
  FIELD_EVIDENCE_PHOTO_COUNT,
  FieldEvidenceGrid,
  hasRequiredFieldEvidence,
} from "@/components/field-staff/field-evidence-grid";
import { useAuth } from "@/components/providers/auth-provider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/interfaces/api";
import type { IncidentSeverity } from "@/interfaces/incident-report";
import { getProjects } from "@/services/contractor.service";
import {
  createIncidentThread,
  getIncidentRecipientOptions,
} from "@/services/site-operations.service";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function CreateIncidentDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const t = useTranslations("incidentReporting");
  const { user } = useAuth();
  const qc = useQueryClient();
  const [project, setProject] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<IncidentSeverity>("MEDIUM");
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [evidence, setEvidence] = useState(createEmptyFieldEvidence);
  const [location, setLocation] = useState<{
    latitude: string;
    longitude: string;
    accuracy: string;
  }>();
  const [locating, setLocating] = useState(false);
  const fieldMode = Boolean(user?.is_field_staff);
  const photos = completedFieldEvidence(evidence);
  const evidenceLabels = [
    t("evidence.overview"),
    t("evidence.detail"),
    t("evidence.risk"),
    t("evidence.surroundings"),
  ];

  const projects = useQuery({
    queryKey: ["projects", "options"],
    queryFn: () => getProjects({ page_size: 100, sort_by: "name" }),
    staleTime: 60_000,
  });

  const recipients = useQuery({
    queryKey: ["incident-recipient-options", project],
    queryFn: () => getIncidentRecipientOptions(project),
    enabled: Boolean(project),
    staleTime: 60_000,
  });

  const submit = useMutation({
    mutationFn: createIncidentThread,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["incident-threads"] });
      onSuccess();
    },
    onError: (error: ApiError) => {
      toast.error(error.message || t("submitError"));
    },
  });

  const handleSubmit = () => {
    if (
      !project ||
      !title.trim() ||
      (!fieldMode && !description.trim()) ||
      !recipientIds.length ||
      (fieldMode &&
        (!hasRequiredFieldEvidence(evidence) || !location))
    ) {
      toast.error(t("fillRequired"));
      return;
    }

    submit.mutate({
      project,
      title: title.trim(),
      description: description.trim(),
      recipient_ids: recipientIds,
      severity,
      occurred_at: new Date().toISOString(),
      latitude: location?.latitude,
      longitude: location?.longitude,
      accuracy_m: location?.accuracy,
      photos: fieldMode ? photos : undefined,
    });
  };

  const captureLocation = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
          accuracy: position.coords.accuracy.toFixed(2),
        });
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast.error(t("locationError"));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  const projectOptions = projects.data?.results ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-1rem)] touch-pan-y overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] p-5 sm:max-w-md sm:p-6"
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0 pr-2">
            <DialogTitle>{t("dialog.create.title")}</DialogTitle>
            <DialogDescription className="mt-1">
              {t("dialog.create.description")}
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-muted"
          >
            <X className="size-4" />
            <span className="sr-only">{t("action.cancel")}</span>
          </button>
        </div>

        <div className="space-y-4">
          <FieldWrapper label={t("field.project")} required>
            <Select
              value={project}
              onValueChange={(value) => {
                setProject(value);
                setRecipientIds([]);
              }}
            >
              <SelectTrigger id="project">
                <SelectValue placeholder={t("chooseProject")} />
              </SelectTrigger>
              <SelectContent>
                {projectOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <QueryFailedNote query={projects} what={t("what.projects")} />
          </FieldWrapper>

          <FieldWrapper label={t("field.title")} required>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("field.titlePlaceholder")}
              className="flex h-11 w-full rounded-lg border bg-background px-3 text-sm"
            />
          </FieldWrapper>

          <FieldWrapper label={t("field.severity")}>
            <Select
              value={severity}
              onValueChange={(v: IncidentSeverity) => setSeverity(v)}
            >
              <SelectTrigger id="severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">{t("severity.LOW")}</SelectItem>
                <SelectItem value="MEDIUM">{t("severity.MEDIUM")}</SelectItem>
                <SelectItem value="HIGH">{t("severity.HIGH")}</SelectItem>
                <SelectItem value="CRITICAL">{t("severity.CRITICAL")}</SelectItem>
              </SelectContent>
            </Select>
          </FieldWrapper>

          <FieldWrapper
            label={t("field.description")}
            required={!fieldMode}
            optional={fieldMode ? t("optional") : undefined}
          >
            <Textarea
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("field.descriptionPlaceholder")}
              rows={4}
            />
          </FieldWrapper>

          {fieldMode ? (
            <div className="space-y-3">
              <FieldWrapper label={t("evidence.title")} required>
                <FieldEvidenceGrid
                  labels={evidenceLabels}
                  files={evidence}
                  progressLabel={t("evidence.progress", {
                    current: photos.length,
                    required: FIELD_EVIDENCE_PHOTO_COUNT,
                  })}
                  onChange={setEvidence}
                />
              </FieldWrapper>
              {/* Only field mode refuses to submit without a fix, so the
                  asterisk appears only there. A star that is not always true
                  is its own small lie. */}
              <FieldWrapper label={t("location")} required={fieldMode}>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full"
                  disabled={locating}
                  onClick={captureLocation}
                >
                  {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
                  {location ? t("locationReady") : t("captureLocation")}
                </Button>
              </FieldWrapper>
            </div>
          ) : null}

          <FieldWrapper label={t("field.recipients")} required>
            {!project ? (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                {t("chooseProjectFirst")}
              </p>
            ) : recipients.isError ? (
              <LoadFailed what={t("what.recipients")} onRetry={() => void recipients.refetch()} />
            ) : recipients.isLoading ? (
              <div className="flex items-center gap-2 rounded-md border p-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t("loadingRecipients")}
              </div>
            ) : (recipients.data ?? []).length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                {t("noRecipients")}
              </p>
            ) : (
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                {(recipients.data ?? []).map((recipient) => {
                  const checked = recipientIds.includes(recipient.id);
                  return (
                    <label
                      key={recipient.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) =>
                          setRecipientIds((current) =>
                            value === true
                              ? [...current, recipient.id]
                              : current.filter((id) => id !== recipient.id),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {recipient.full_name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {recipient.is_supervisor
                            ? `${recipient.role_name} / ${t("supervisor")}`
                            : recipient.role_name}
                        </span>
                      </span>
                      {checked && <Check className="size-4 text-primary" />}
                    </label>
                  );
                })}
              </div>
            )}
          </FieldWrapper>
        </div>

        <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex gap-2 border-t bg-card p-5 sm:-mx-6 sm:-mb-6 sm:p-6">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={submit.isPending}
          >
            {t("action.cancel")}
          </Button>
          <Button
            className="flex-1"
            onClick={handleSubmit}
            requires={[[project, t("field.project")], [title, t("field.title")], [fieldMode || description, t("field.description")], [recipientIds.length, t("field.recipients")], [!fieldMode || hasRequiredFieldEvidence(evidence), t("evidence.title")], [!fieldMode || location, t("location")]]}
            disabled={submit.isPending}
          >
            {submit.isPending && <Loader2 className="animate-spin" />}
            {t("action.create")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
