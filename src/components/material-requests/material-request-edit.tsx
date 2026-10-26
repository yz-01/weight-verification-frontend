"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldWrapper } from "@/components/shared/page-primitives";
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
import { Textarea } from "@/components/ui/textarea";
import type { MaterialRequest } from "@/interfaces/material-request";
import { updateMaterialRequest } from "@/services/material-request.service";

/**
 * 修改 a request still waiting for its decision (JB25, 客户 10-26 事项 1:
 * 「未确认归档前，可以直接修改」「修改直接覆盖原资料，不保留旧版本」).
 *
 * What the office most often gets wrong is the amount and the words: each
 * material's quantity, the remark, and an other request's subject and
 * content. The material and its specification stay as chosen from the
 * material data; a different material is a new request. Saved over the
 * request - no old version is kept.
 */
export function MaterialRequestEditDialog({
  row,
  onClose,
}: {
  row: MaterialRequest;
  onClose: () => void;
}) {
  const t = useTranslations("materialRequest");
  const draft = useTranslations("draftRecords");
  const common = useTranslations("common");
  const qc = useQueryClient();
  const isMaterial = row.request_type === "MATERIAL";
  const lines = row.lines ?? [];
  const [quantities, setQuantities] = useState<string[]>(lines.map((line) => line.quantity ?? ""));
  const [remark, setRemark] = useState(row.remark ?? "");
  const [subject, setSubject] = useState(row.subject ?? "");
  const [content, setContent] = useState(row.content ?? "");
  const save = useMutation({
    mutationFn: () =>
      updateMaterialRequest(row.id, {
        remark,
        ...(isMaterial && lines.length
          ? {
              lines: JSON.stringify(
                lines.map((line, index) => ({
                  category: line.category,
                  spec_category: line.spec_category,
                  material_name: line.material_name,
                  specification: line.specification,
                  unit: line.unit,
                  quantity: quantities[index],
                })),
              ),
            }
          : {}),
        ...(!isMaterial ? { subject, content } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["material-requests"] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" data-slot="material-request-edit">
        <DialogHeader>
          <DialogTitle>
            {draft("edit")} · {row.request_no}
          </DialogTitle>
          <DialogDescription>{draft("draftHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {isMaterial
            ? lines.map((line, index) => (
                <FieldWrapper
                  key={line.id ?? index}
                  label={`${line.material_name} · ${line.specification} (${line.unit})`}
                  required
                >
                  <Input
                    inputMode="decimal"
                    value={quantities[index] ?? ""}
                    onChange={(event) =>
                      setQuantities((old) => old.map((value, at) => (at === index ? event.target.value : value)))
                    }
                  />
                </FieldWrapper>
              ))
            : (
                <>
                  <FieldWrapper label={t("field.subject")}>
                    <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
                  </FieldWrapper>
                  <FieldWrapper label={t("field.content")}>
                    <Textarea rows={4} value={content} onChange={(event) => setContent(event.target.value)} />
                  </FieldWrapper>
                </>
              )}
          <FieldWrapper label={t("field.remark")}>
            <Textarea rows={3} value={remark} onChange={(event) => setRemark(event.target.value)} />
          </FieldWrapper>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            <X />
            {common("cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {draft("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
