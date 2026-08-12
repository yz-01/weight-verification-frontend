"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  const qc = useQueryClient();
  const [project, setProject] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<IncidentSeverity>("MEDIUM");
  const [recipientIds, setRecipientIds] = useState<string[]>([]);

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
      !description.trim() ||
      !recipientIds.length
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
    });
  };

  const projectOptions = projects.data?.results ?? [];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold">{t("dialog.create.title")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("dialog.create.description")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project">{t("field.project")}</Label>
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">{t("field.title")}</Label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("field.titlePlaceholder")}
              className="flex h-11 w-full rounded-lg border bg-background px-3 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="severity">{t("field.severity")}</Label>
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t("field.description")}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("field.descriptionPlaceholder")}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("field.recipients")}</Label>
            {!project ? (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                {t("chooseProjectFirst")}
              </p>
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
          </div>
        </div>

        <div className="flex gap-2">
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
            disabled={
              !project ||
              !title.trim() ||
              !description.trim() ||
              !recipientIds.length ||
              submit.isPending
            }
          >
            {submit.isPending && <Loader2 className="animate-spin" />}
            {t("action.create")}
          </Button>
        </div>
      </div>
    </div>
  );
}
