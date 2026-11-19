"use client";

/**
 * 分类管理 → 公司通用分类 → 「施工准证 · 施工类别」 (JB216).
 *
 * The choices under 施工类别 when an approver fills a 电子准证 (客户 11-18 事项 1,
 * 图 2 draws it as a drop-down). Lucas the same day: 「施工类别是可以自己添加/删除/
 * 编辑的吗」, and the client's 事项 4: 「不需要替建筑公司设定…由建筑公司自行创建及
 * 命名」 - so each company adds, renames and removes its own, starting from
 * eight common ones. 「其他（写明）」 is always offered and is not a row.
 *
 * Renaming or removing a type never changes an e-permit already filled in:
 * the e-permit keeps the words it was saved with. A removal is armed by a
 * switch first, as everywhere on this page (spec rule 8), with that said in
 * plain words beside it.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { EmptyState, FieldWrapper, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
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
import { Switch } from "@/components/ui/switch";
import { useMissingFields } from "@/hooks/use-missing-fields";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/interfaces/api";
import type { PermitWorkType } from "@/interfaces/permit";
import {
  PERMIT_WORK_TYPES_KEY,
  createPermitWorkType,
  deletePermitWorkType,
  getPermitWorkTypes,
  updatePermitWorkType,
} from "@/services/permit.service";

export function PermitWorkTypesPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("permits.workTypes");
  const columns = useTranslations("categoryManagement.column");
  const [editing, setEditing] = useState<PermitWorkType | "new" | null>(null);
  const types = useQuery({ queryKey: PERMIT_WORK_TYPES_KEY, queryFn: getPermitWorkTypes });
  const rows = types.data ?? [];
  const addButton = canManage && (
    <Button onClick={() => setEditing("new")} data-slot="permit-work-type-add">
      <Plus />
      {t("add")}
    </Button>
  );
  return (
    <div className="space-y-3" data-slot="permit-work-types">
      {canManage ? (
        <div className="flex flex-wrap items-center justify-end gap-2">{addButton}</div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("readOnly")}</p>
      )}
      <QueryFailedNote query={types} what={t("what")} />
      {types.isLoading ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      ) : types.isError ? null : (
        <>
          {rows.length === 0 && <EmptyState title={t("empty")} />}
          <div className="overflow-x-auto rounded-lg border">
            <Table className="min-w-[24rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>{columns("name")}</TableHead>
                  {canManage && <TableHead>{columns("action")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditing(row)}
                            aria-label={`${t("edit")} ${row.name}`}
                          >
                            <Pencil />
                            {t("edit")}
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {/* Always offered, never a row the company can remove. */}
                <TableRow>
                  <TableCell className="font-medium">
                    <span className="flex flex-wrap items-center gap-2">
                      <span>{t("other")}</span>
                      <StatusBadge label={t("system")} tone="neutral" />
                    </span>
                    <span className="block text-xs font-normal text-muted-foreground">{t("otherHelp")}</span>
                  </TableCell>
                  {canManage && <TableCell />}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </>
      )}
      {editing && (
        <PermitWorkTypeDialog row={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

export function PermitWorkTypeDialog({ row, onClose }: { row: PermitWorkType | null; onClose: () => void }) {
  const t = useTranslations("permits.workTypes");
  const queryClient = useQueryClient();
  const [name, setName] = useState(row?.name ?? "");
  // Why 【保存】 is grey, said on screen (walk 11-18: a tip on a button in a
  // window opens behind it).
  const stillMissing = useMissingFields();
  const need = stillMissing([[name.trim(), t("name")]]);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState("");
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: PERMIT_WORK_TYPES_KEY });
    onClose();
  };
  const failed = (reason: unknown) => setError(reason instanceof ApiError ? reason.message : t("failed"));
  const save = useMutation({
    mutationFn: () => (row ? updatePermitWorkType(row.id, name.trim()) : createPermitWorkType(name.trim())),
    onSuccess: done,
    onError: failed,
  });
  const removal = useMutation({
    mutationFn: () => deletePermitWorkType(row!.id, row!.name),
    onSuccess: done,
    onError: failed,
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" data-slot="permit-work-type-dialog">
        <DialogHeader>
          <DialogTitle>{row ? t("editTitle", { name: row.name }) : t("add")}</DialogTitle>
          <DialogDescription>{t("help")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FieldWrapper label={t("name")} required>
            <Input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
          </FieldWrapper>
          {row && (
            <div className="space-y-2 rounded-lg border border-destructive/25 p-3">
              <label className="flex items-center gap-3 text-sm">
                <Switch
                  checked={armed}
                  onCheckedChange={setArmed}
                  aria-label={t("armRemove", { name: row.name })}
                />
                <span>{t("armRemove", { name: row.name })}</span>
              </label>
              <p className="text-xs text-muted-foreground">{t("removeHint")}</p>
              {!armed && (
                <p className="text-xs font-medium text-warning" data-slot="permit-work-type-arm-first">
                  {t("armFirst")}
                </p>
              )}
              <Button
                variant="outline-destructive"
                disabled={!armed || removal.isPending}
                disabledReason={armed ? undefined : t("armFirst")}
                onClick={() => removal.mutate()}
              >
                {removal.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                {t("remove")}
              </Button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {need.reason && (
            <p className="text-sm font-medium text-warning" data-slot="permit-work-type-missing">
              {need.reason}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={save.isPending || need.blocked}
            disabledReason={need.reason}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
