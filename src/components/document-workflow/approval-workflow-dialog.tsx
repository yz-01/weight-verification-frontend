"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  WorkflowStep,
  WorkflowTemplate,
} from "@/interfaces/document-workflow";
import type { Role, UserRow } from "@/interfaces/auth";
import {
  addWorkflowStep,
  createWorkflowTemplate,
  deleteWorkflowStep,
  deleteWorkflowTemplate,
  getWorkflowTemplate,
  getWorkflowTemplates,
  updateWorkflowStep,
  updateWorkflowTemplate,
} from "@/services/document-workflow.service";

/** The only resource type approvals are raised against today. */
const DEFAULT_RESOURCE_TYPE = "document";

/**
 * Configure who approves what, and in which order.
 *
 * The backend has always supported multi-step chains, but nothing in the
 * product could reach the endpoints that define one. With no template, approval
 * falls back to "anybody holding the review permission signs it off in a single
 * step" — so a customer promised a two-level chain got a one-level one, and
 * nothing anywhere said so. This screen is what makes the configured chain real.
 */
export function ApprovalWorkflowDialog({
  users,
  roles,
  onClose,
}: {
  users: UserRow[];
  roles: Role[];
  onClose: () => void;
}) {
  const t = useTranslations("approvals");
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [removing, setRemoving] = useState<WorkflowTemplate | null>(null);
  const [renaming, setRenaming] = useState<WorkflowTemplate | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const templates = useQuery({
    queryKey: ["workflow-templates"],
    queryFn: () => getWorkflowTemplates({ page_size: 100, sort_by: "name" }),
  });

  const detail = useQuery({
    queryKey: ["workflow-templates", selectedId],
    queryFn: () => getWorkflowTemplate(selectedId as string),
    enabled: Boolean(selectedId),
  });

  const refreshAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ["workflow-templates"] });
  };

  const create = useMutation({
    mutationFn: () =>
      createWorkflowTemplate({
        name: newName.trim(),
        resource_type: DEFAULT_RESOURCE_TYPE,
      }),
    onSuccess: async (row) => {
      setNewName("");
      setSelectedId(row.id);
      await refreshAll();
    },
  });

  const remove = useMutation({
    mutationFn: (template: WorkflowTemplate) => deleteWorkflowTemplate(template.id),
    onSuccess: async () => {
      setRemoving(null);
      setSelectedId(null);
      await refreshAll();
    },
  });

  // Renaming and retiring are the two corrections a live template needs.
  // Without them the only way to fix a typo was to delete the chain and
  // rebuild every step, which loses the template's history along with it.
  const rename = useMutation({
    mutationFn: (template: WorkflowTemplate) =>
      updateWorkflowTemplate(template.id, { name: renameDraft.trim() }),
    onSuccess: async () => {
      setRenaming(null);
      setRenameDraft("");
      await refreshAll();
    },
  });

  const setActive = useMutation({
    mutationFn: (template: WorkflowTemplate) =>
      updateWorkflowTemplate(template.id, { is_active: !template.is_active }),
    onSuccess: refreshAll,
  });

  const rows = templates.data?.results ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("workflow.title")}</DialogTitle>
          <DialogDescription>{t("workflow.help")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={t("workflow.namePlaceholder")}
            aria-label={t("workflow.name")}
            className="min-w-48 flex-1"
          />
          <Button
            requires={[[newName, t("workflow.name")]]}
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            {t("workflow.addTemplate")}
          </Button>
        </div>

        {templates.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("workflow.loading")}</p>
        ) : !rows.length ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {t("workflow.noTemplates")}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {rows.map((row) => (
              <li key={row.id}>
                <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <button
                    type="button"
                    className="min-w-0 text-left"
                    onClick={() =>
                      setSelectedId(selectedId === row.id ? null : row.id)
                    }
                  >
                    <p className="font-medium">{row.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("workflow.stepCount", { count: row.step_count ?? 0 })}
                      {row.project_name ? ` · ${row.project_name}` : ""}
                      {row.is_active ? "" : ` · ${t("workflow.inactive")}`}
                    </p>
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRenaming(row);
                        setRenameDraft(row.name);
                      }}
                    >
                      <Pencil />
                      {t("workflow.renameTemplate")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={setActive.isPending}
                      onClick={() => setActive.mutate(row)}
                    >
                      {row.is_active
                        ? t("workflow.deactivate")
                        : t("workflow.activate")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRemoving(row)}
                    >
                      <Trash2 />
                      {t("workflow.removeTemplate")}
                    </Button>
                  </div>
                </div>
                {selectedId === row.id ? (
                  <StepEditor
                    templateId={row.id}
                    steps={detail.data?.steps ?? []}
                    loading={detail.isLoading}
                    users={users}
                    roles={roles}
                    onChanged={refreshAll}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("workflow.close")}
          </Button>
        </DialogFooter>

        {renaming ? (
          <Dialog
            open
            onOpenChange={(next) => {
              if (!next) {
                setRenaming(null);
                setRenameDraft("");
              }
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("workflow.renameTemplate")}</DialogTitle>
                <DialogDescription>{renaming.name}</DialogDescription>
              </DialogHeader>
              <Input
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                aria-label={t("workflow.name")}
              />
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setRenaming(null);
                    setRenameDraft("");
                  }}
                >
                  {t("workflow.close")}
                </Button>
                <Button
                  requires={[[renameDraft, t("workflow.name")]]}
                  disabled={rename.isPending}
                  onClick={() => rename.mutate(renaming)}
                >
                  {rename.isPending && <Loader2 className="animate-spin" />}
                  {t("workflow.saveName")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}

        {removing ? (
          <ConfirmDialog
            open
            onOpenChange={(next) => !next && setRemoving(null)}
            title={t("workflow.removeTitle")}
            description={t("workflow.removeConfirm", { name: removing.name })}
            confirmLabel={t("workflow.removeTemplate")}
            isPending={remove.isPending}
            onConfirm={() => remove.mutate(removing)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The rungs of one chain, in order.
 *
 * A step points at either one named reviewer or a role, never both — the
 * backend rejects a step carrying neither, because a step nobody is assigned to
 * would stall every approval that reached it.
 */
function StepEditor({
  templateId,
  steps,
  loading,
  users,
  roles,
  onChanged,
}: {
  templateId: string;
  steps: WorkflowStep[];
  loading: boolean;
  users: UserRow[];
  roles: Role[];
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations("approvals");
  const [name, setName] = useState("");
  const [assignee, setAssignee] = useState("");

  const add = useMutation({
    mutationFn: () => {
      const [kind, id] = assignee.split(":");
      return addWorkflowStep(templateId, {
        sequence: (steps.at(-1)?.sequence ?? 0) + 1,
        name: name.trim(),
        reviewer_user: kind === "user" ? id : null,
        reviewer_role: kind === "role" ? id : null,
        is_required: true,
      });
    },
    onSuccess: async () => {
      setName("");
      setAssignee("");
      await onChanged();
    },
  });

  const drop = useMutation({
    mutationFn: (step: WorkflowStep) => deleteWorkflowStep(templateId, step.id),
    onSuccess: onChanged,
  });

  // Editing a step keeps its place in the chain. Deleting and re-adding would
  // push it to the end, which silently reorders an approval chain - the one
  // thing about a chain that must not change by accident.
  const [editing, setEditing] = useState<WorkflowStep | null>(null);
  const [editName, setEditName] = useState("");
  const [editAssignee, setEditAssignee] = useState("");

  const openEditor = (step: WorkflowStep) => {
    setEditing(step);
    setEditName(step.name);
    setEditAssignee(
      step.reviewer_user
        ? `user:${step.reviewer_user}`
        : step.reviewer_role
          ? `role:${step.reviewer_role}`
          : "",
    );
  };

  const closeEditor = () => {
    setEditing(null);
    setEditName("");
    setEditAssignee("");
  };

  const save = useMutation({
    mutationFn: (step: WorkflowStep) => {
      const [kind, id] = editAssignee.split(":");
      return updateWorkflowStep(templateId, {
        id: step.id,
        sequence: step.sequence,
        name: editName.trim(),
        reviewer_user: kind === "user" ? id : null,
        reviewer_role: kind === "role" ? id : null,
        is_required: step.is_required,
      });
    },
    onSuccess: async () => {
      closeEditor();
      await onChanged();
    },
  });

  return (
    <div className="space-y-3 border-t bg-muted/20 p-3">
      {loading ? (
        <p className="text-sm text-muted-foreground">{t("workflow.loading")}</p>
      ) : !steps.length ? (
        <p className="text-sm text-muted-foreground">
          {t("workflow.noSteps")}
        </p>
      ) : (
        <ol className="space-y-2">
          {steps.map((step) => (
            <li
              key={step.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {step.sequence}. {step.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {step.reviewer_user_name ||
                    step.reviewer_role_name ||
                    t("workflow.noReviewer")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditor(step)}
                >
                  <Pencil />
                  {t("workflow.editStep")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={drop.isPending}
                  onClick={() => drop.mutate(step)}
                >
                  <Trash2 />
                  {t("workflow.removeStep")}
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("workflow.stepNamePlaceholder")}
          aria-label={t("workflow.stepName")}
        />
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger aria-label={t("workflow.reviewer")}>
            <SelectValue placeholder={t("workflow.reviewerPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {roles.map((role) => (
              <SelectItem key={`role:${role.id}`} value={`role:${role.id}`}>
                {t("workflow.byRole", { name: role.name })}
              </SelectItem>
            ))}
            {users.map((person) => (
              <SelectItem key={`user:${person.id}`} value={`user:${person.id}`}>
                {person.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          requires={[
            [name, t("workflow.stepName")],
            [assignee, t("workflow.reviewer")],
          ]}
          disabled={add.isPending}
          onClick={() => add.mutate()}
        >
          {add.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
          {t("workflow.addStep")}
        </Button>
      </div>

      {editing ? (
        <Dialog open onOpenChange={(next) => !next && closeEditor()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("workflow.editStep")}</DialogTitle>
              <DialogDescription>
                {t("workflow.editStepHelp", { sequence: editing.sequence })}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Input
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                aria-label={t("workflow.stepName")}
              />
              <Select value={editAssignee} onValueChange={setEditAssignee}>
                <SelectTrigger aria-label={t("workflow.reviewer")}>
                  <SelectValue placeholder={t("workflow.reviewerPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={`role:${role.id}`} value={`role:${role.id}`}>
                      {t("workflow.byRole", { name: role.name })}
                    </SelectItem>
                  ))}
                  {users.map((person) => (
                    <SelectItem key={`user:${person.id}`} value={`user:${person.id}`}>
                      {person.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeEditor}>
                {t("workflow.close")}
              </Button>
              <Button
                requires={[
                  [editName, t("workflow.stepName")],
                  [editAssignee, t("workflow.reviewer")],
                ]}
                disabled={save.isPending}
                onClick={() => save.mutate(editing)}
              >
                {save.isPending && <Loader2 className="animate-spin" />}
                {t("workflow.saveStep")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
