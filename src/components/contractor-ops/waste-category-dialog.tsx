"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldWrapper } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import { WASTE_TYPES } from "@/interfaces/contractor";
import type { WasteCategory } from "@/interfaces/waste-outgoing";
import { createWasteCategory, updateWasteCategory } from "@/services/waste-outgoing.service";

/**
 * Create or change one recyclable waste category.
 *
 * The old dialog on the waste screen could only switch a category off, and a
 * switched-off one disappeared from it for good (F-465). This one renames,
 * changes the dispatch type and the description, and switches it back on.
 * The code is the server's (客户 11-05 事项 7 「分类编号全部自动生成」, JB102):
 * a new category shows none, an old one shows its own, fixed because records
 * cite it.
 */
export function WasteCategoryDialog({
  category,
  group = null,
  parent = null,
  onClose,
  onSaved,
}: {
  category: WasteCategory | null;
  /** A project's own 分类组 (I11); null - the company-wide list. */
  group?: string | null;
  /** 「+ 子分类」 (I11): the category the new one goes under. */
  parent?: WasteCategory | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("categoryManagement");
  const w = useTranslations("wasteOutgoing");
  const ops = useTranslations("contractorOps");
  const types = useTranslations("dispatches");
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [dispatchType, setDispatchType] = useState(
    category?.dispatch_type ?? "",
  );
  const [isActive, setIsActive] = useState(category?.is_active ?? true);
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () =>
      category
        ? updateWasteCategory(category.id, {
            name: name.trim(),
            description: description.trim(),
            dispatch_type: dispatchType,
            is_active: isActive,
          })
        : createWasteCategory({
            name: name.trim(),
            dispatch_type: dispatchType,
            description: description.trim(),
            ...(group ? { group } : {}),
            ...(parent ? { parent: parent.id } : {}),
          }),
    onSuccess: onSaved,
    onError: (reason) =>
      setError(reason instanceof ApiError ? reason.message : t("saveFailed")),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t(category ? "dialogEdit" : "dialogCreate", {
              module: t("module.recycle"),
            })}
          </DialogTitle>
          <DialogDescription>
            {parent ? t("subCategory.under", { name: parent.label }) : t("moduleHelp.recycle")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {/* No code to type on a new one (JB103 第 4 点): shown, read-only, once made. */}
          {category && (
            <FieldWrapper label={w("category.code")}>
              <Input value={category.code} disabled />
            </FieldWrapper>
          )}
          <FieldWrapper label={w("category.name")} required>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={w("category.dispatchType")} required>
            <Select value={dispatchType || undefined} onValueChange={setDispatchType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={w("category.dispatchType")} />
              </SelectTrigger>
              <SelectContent>
                {WASTE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {types(`wasteType.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={ops("field.description")}>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </FieldWrapper>
          {category && (
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm">
                {/* A retired preset stays off: the server refuses it too. */}
                <Checkbox
                  checked={isActive}
                  disabled={category.is_retired}
                  onCheckedChange={(checked) => setIsActive(checked === true)}
                />
                {t("active")}
              </label>
              {category.is_retired && (
                <p className="text-xs text-muted-foreground">{w("category.retiredHelp")}</p>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {ops("action.cancel")}
          </Button>
          <Button
            requires={[
              [name, w("category.name")],
              [dispatchType, w("category.dispatchType")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {ops("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
