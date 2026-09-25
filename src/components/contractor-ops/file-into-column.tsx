"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/interfaces/api";
import type { ProjectCategoryKind } from "@/interfaces/contractor-ops";
import { getProjectCategories } from "@/services/contractor-ops.service";

/**
 * File one record under one of its module's columns, or take it back out.
 *
 * 客户「现场工作人员不需要选择栏目」, and a record arrives unclassified until
 * somebody in the office looks at it: 「先进『未归类』，后台看的时候再归」
 * (D-108). This is that screen, for the two modules that had no way to file at
 * all until now - progress records (T-231) and construction waste (T-232).
 *
 * One component for both, mirroring the server, where one helper checks the
 * rule for both actions. Two copies of "the same dialog" is how the two
 * dispatch routes drifted apart on the pickup address (F-311), and the rule
 * here has the same shape: the column must belong to this record's project,
 * be open, and be this record's module.
 *
 * `kind` is passed to the query rather than inferred, because every column of
 * every module is reachable: asking without it would offer a debris column on
 * a progress record, and the save would come back refused.
 */

/** Sentinel: Radix's Select has no value for "nothing selected". */
const UNFILED = "__unfiled__";

export function FileIntoColumnDialog({
  projectId,
  kind,
  current,
  reference,
  onFile,
  onFiled,
  onClose,
}: {
  projectId: string;
  kind: ProjectCategoryKind;
  current: string | null;
  /** What the reader is filing, named the way the list names it. */
  reference: string;
  onFile: (category: string | null, reason: string) => Promise<unknown>;
  onFiled: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("contractorOps");
  const common = useTranslations("common");
  const [category, setCategory] = useState(current ?? UNFILED);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const columns = useQuery({
    queryKey: ["project-categories", "filing", kind, projectId],
    queryFn: () =>
      getProjectCategories({
        project: projectId,
        // Written out rather than as object shorthand: `check-category-kinds`
        // looks for `kind:` to prove a caller said which filing scheme it
        // wants, and shorthand reads as a caller that did not.
        kind: kind,
        is_active: true,
        page_size: 200,
        sort_by: "sort_order",
        sort_order: "asc",
      }),
  });
  // Every column is offered: there are no parent columns any more, and the
  // "file at the last level only" rule went with them (D-265).
  const options = columns.data?.results ?? [];

  const submit = useMutation({
    mutationFn: () =>
      onFile(category === UNFILED ? null : category, reason.trim()),
    onSuccess: () => {
      onFiled();
      onClose();
    },
    onError: (failure) =>
      setError(
        failure instanceof ApiError ? failure.message : t("filing.failed"),
      ),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("filing.title")}</DialogTitle>
          <DialogDescription>
            {t("filing.help", { reference })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FieldWrapper label={t("filing.fileInto")} required>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Unfiled stays on offer: taking a record back out is the
                    honest answer when the first guess was wrong, and the
                    server accepts it for the same reason. */}
                <SelectItem value={UNFILED}>{t("filing.unfiled")}</SelectItem>
                {options.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          {columns.isError ? (
            <p className="text-sm text-destructive">{t("filing.columnsFailed")}</p>
          ) : !columns.isLoading && options.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("filing.noColumns")}</p>
          ) : null}
          <FieldWrapper
            label={t("filing.reason")}
            optional={common("optional")}
          >
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </FieldWrapper>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button disabled={submit.isPending} onClick={() => submit.mutate()}>
            {t("filing.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
