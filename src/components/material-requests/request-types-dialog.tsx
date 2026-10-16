"use client";

/**
 * 「管理申请类型」 (I16, ID36): one dialog, opened from the MR page and from
 * 分类管理's 「申请类型」.
 *
 * A project's types, on one level: rename, choose the form, switch off, add,
 * remove one nobody has used. 材料申请 and 其他申请 are the system's - renamed,
 * never switched off or removed, and they keep their form (old requests of
 * the two old kinds belong to them). A new type takes the simple form unless
 * the material form is chosen; no type gets a form of its own.
 *
 * Removing is armed by the row's switch, then the bin acts at once (rule 8);
 * a type with requests is refused by the server and the sentence is shown.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldWrapper, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/interfaces/api";
import type { RequestFormStyle, RequestType } from "@/interfaces/material-request";
import { newTypeName } from "@/lib/request-types";
import {
  createRequestType,
  deleteRequestType,
  getRequestTypes,
  updateRequestType,
} from "@/services/material-request.service";

const STYLES: readonly RequestFormStyle[] = ["MATERIAL", "GENERAL"];

export function RequestTypesDialog({
  initialProject = "",
  onClose,
}: {
  initialProject?: string;
  onClose: () => void;
}) {
  const t = useTranslations("materialRequest");
  const [project, setProject] = useState(initialProject);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("types.title")}</DialogTitle>
          <DialogDescription>{t("types.help")}</DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("field.project")} required>
          <ProjectPicker value={project} onValueChange={setProject} placeholder={t("form.chooseProject")} />
        </FieldWrapper>
        {project ? (
          <RequestTypesEditor project={project} />
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {t("types.chooseProject")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The list and its editing, for one project - also inline in 分类管理. */
export function RequestTypesEditor({ project }: { project: string }) {
  const t = useTranslations("materialRequest");
  const qc = useQueryClient();
  const types = useQuery({
    queryKey: ["material-request-types", project, "all"],
    queryFn: () => getRequestTypes(project, true),
  });
  const rows = types.data ?? [];
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [armed, setArmed] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newStyle, setNewStyle] = useState<RequestFormStyle>("GENERAL");
  const [error, setError] = useState("");

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["material-request-types"] });
    void qc.invalidateQueries({ queryKey: ["material-requests"] });
  };
  const failed = (reason: unknown) =>
    setError(reason instanceof ApiError ? reason.message : t("types.failed"));
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateRequestType>[1] }) =>
      updateRequestType(id, payload),
    onSuccess: () => {
      setError("");
      setEditing(null);
      refresh();
    },
    onError: failed,
  });
  const create = useMutation({
    mutationFn: () => createRequestType({ project, name: newName.trim(), form_style: newStyle }),
    onSuccess: () => {
      setError("");
      setNewName("");
      setNewStyle("GENERAL");
      refresh();
    },
    onError: failed,
  });
  const removal = useMutation({
    mutationFn: (id: string) => deleteRequestType(id),
    onSuccess: () => {
      setError("");
      setArmed(null);
      refresh();
    },
    onError: (reason) => {
      setArmed(null);
      failed(reason);
    },
  });
  const adding = newTypeName(newName, rows);

  return (
    <div className="space-y-3">
      <QueryFailedNote query={types} what={t("types.title")} />
      {types.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((row: RequestType) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                {editing === row.id ? (
                  <Input
                    aria-label={t("types.name")}
                    value={draftName}
                    maxLength={150}
                    onChange={(event) => setDraftName(event.target.value)}
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={row.is_active ? "font-medium" : "font-medium text-muted-foreground line-through"}>
                      {row.name}
                    </span>
                    {row.is_fixed && <StatusBadge label={t("types.system")} tone="neutral" />}
                    <span className="text-xs text-muted-foreground">
                      {t("types.requestCount", { count: row.request_count })}
                    </span>
                  </div>
                )}
              </div>
              <Select
                value={row.form_style}
                onValueChange={(value) =>
                  update.mutate({ id: row.id, payload: { form_style: value as RequestFormStyle } })
                }
                disabled={row.is_fixed || update.isPending}
              >
                <SelectTrigger className="w-40" aria-label={t("types.form")} title={row.is_fixed ? t("types.fixedHelp") : undefined}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STYLES.map((style) => (
                    <SelectItem key={style} value={style}>
                      {t(`types.style.${style}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1.5 text-xs" title={row.is_fixed ? t("types.fixedHelp") : undefined}>
                <Switch
                  checked={row.is_active}
                  disabled={row.is_fixed || update.isPending}
                  onCheckedChange={(next) => update.mutate({ id: row.id, payload: { is_active: next } })}
                  aria-label={t("types.active", { name: row.name })}
                />
                {t("types.activeLabel")}
              </label>
              {editing === row.id ? (
                <>
                  <Button
                    size="icon-sm"
                    title={t("types.save")}
                    disabledReason={draftName.trim() ? undefined : t("types.nameRequired")}
                    disabled={!draftName.trim() || update.isPending}
                    onClick={() => update.mutate({ id: row.id, payload: { name: draftName.trim() } })}
                  >
                    {update.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                  </Button>
                  <Button size="icon-sm" variant="ghost" title={t("types.cancel")} onClick={() => setEditing(null)}>
                    <X />
                  </Button>
                </>
              ) : (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title={t("types.rename")}
                  onClick={() => {
                    setEditing(row.id);
                    setDraftName(row.name);
                  }}
                >
                  <Pencil />
                </Button>
              )}
              {/* Removing is armed by the switch, then the bin acts (rule 8).
                  The two fixed types offer no switch; the bin says why. */}
              {!row.is_fixed && row.request_count === 0 && (
                <Switch
                  checked={armed === row.id}
                  onCheckedChange={(next) => setArmed(next ? row.id : null)}
                  aria-label={t("types.armRemove", { name: row.name })}
                />
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-destructive"
                title={t("types.remove")}
                disabledReason={
                  row.is_fixed
                    ? t("types.fixedHelp")
                    : row.request_count > 0
                      ? t("types.hasRecordsHelp", { count: row.request_count })
                      : armed !== row.id
                        ? t("types.armFirst")
                        : undefined
                }
                disabled={row.is_fixed || row.request_count > 0 || armed !== row.id || removal.isPending}
                onClick={() => removal.mutate(row.id)}
              >
                {removal.isPending && armed === row.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-[1fr_11rem_auto] sm:items-end">
        <FieldWrapper label={t("types.newName")} required error={adding.taken ? t("types.taken") : undefined}>
          <Input value={newName} maxLength={150} onChange={(event) => setNewName(event.target.value)} placeholder={t("types.newPlaceholder")} />
        </FieldWrapper>
        <FieldWrapper label={t("types.form")} hint={t("types.formHint")}>
          <Select value={newStyle} onValueChange={(value) => setNewStyle(value as RequestFormStyle)}>
            <SelectTrigger className="w-full" aria-label={t("types.form")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STYLES.map((style) => (
                <SelectItem key={style} value={style}>
                  {t(`types.style.${style}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
        <Button
          requires={[[adding.name, t("types.newName")]]}
          disabledReason={adding.taken ? t("types.taken") : undefined}
          disabled={adding.taken || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
          {t("types.add")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
