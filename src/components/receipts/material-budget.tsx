"use client";

/**
 * 材料目标 › 预算金额 (JB262 / JB263, 客户 11-26 事项 3、4).
 *
 * 「材料目标统一管理数量目标、预算金额及追加记录，不要在两个不同的页面分别设定目标
 * 及预算。」 The budget used to be set in the material's own form on 分类管理
 * (D-263); it is set here now, beside the quantity targets and their 追加记录,
 * and the material form no longer has it.
 *
 * Nothing moved in the database: the budget is still the material's (one per
 * material, money), where every alert, the spend and the 材料成本报表 read it
 * - so old budgets show here as they were. The same rules as before: whoever
 * holds `category.manage` sets it (「按照现有权限」), signed with the sign-off
 * PIN (the shared PIN dialog), and each change is an audit row with the
 * figure before and after.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Loader2, Save, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { SpendCell } from "@/components/contractor-ops/category-management";
import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper, LoadFailed } from "@/components/shared/page-primitives";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/interfaces/api";
import type { ProjectCategory } from "@/interfaces/contractor-ops";
import { parseAlertAmounts, parseAlertPercentages } from "@/lib/category-modules";
import { useDateFormat } from "@/lib/dates";
import {
  getBudgetHistory,
  getProjectCategories,
  updateProjectCategory,
  type BudgetHistoryRow,
  type BudgetSide,
} from "@/services/contractor-ops.service";

/** A project's materials, as 材料分类 lists them (top level; specs are under each). */
export function useProjectMaterials(project: string | undefined) {
  return useQuery({
    queryKey: ["project-categories", "materials", project ?? ""],
    queryFn: () =>
      getProjectCategories({
        project: project ?? "",
        kind: "MATERIAL",
        page_size: 200,
        sort_by: "sort_order",
        sort_order: "asc",
      }),
    enabled: Boolean(project),
    select: (page) => page.results.filter((row) => !row.parent),
  });
}

/** What the budget dialog sends: the budget and nothing else of the material. */
export function budgetPayload(input: {
  tracksSpend: boolean;
  budget: string;
  alerts: number[];
  amounts: number[];
}) {
  return {
    tracks_spend: input.tracksSpend,
    // Null, not "", for a material that counts nothing: the field is a
    // nullable decimal and an empty string is not a number.
    budget_amount: input.tracksSpend && input.budget.trim() ? input.budget.trim() : null,
    budget_alert_percentages: input.alerts,
    // Money only since I18 (ID40): a quantity is a material target.
    budget_mode: "AMOUNT" as const,
    budget_quantity: null,
    budget_alert_amounts: input.amounts,
  };
}

/** The 预算金额 table on 材料目标: one row per material of the project -
 * or one material's only, as 材料统计's 【材料目标】 opens it (`material`). */
export function MaterialBudgets({ project, material }: { project: string; material?: string }) {
  const t = useTranslations("jb262");
  const { can } = useAuth();
  const qc = useQueryClient();
  const materials = useProjectMaterials(project);
  const [editing, setEditing] = useState<ProjectCategory | null>(null);
  // 「…预算金额及追加记录」 (QA1 audit #24): each budget's own 修改记录.
  const [history, setHistory] = useState<ProjectCategory | null>(null);
  const canSet = can("category.manage");
  const rows = (materials.data ?? []).filter(
    (row) => (row.is_active || row.tracks_spend) && (!material || row.id === material),
  );

  return (
    <section className="space-y-2" data-slot="material-budgets">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Wallet className="size-4" />
          {t("budgets.title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("budgets.help")}</p>
      </div>
      {!project ? (
        <p className="rounded-xl border border-dashed border-panel-border p-4 text-center text-sm text-muted-foreground">
          {t("budgets.chooseProject")}
        </p>
      ) : materials.isError ? (
        <LoadFailed what={t("budgets.title")} onRetry={() => void materials.refetch()} />
      ) : materials.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("budgets.empty")}</p>
      ) : (
        <div className="rounded-lg border">
          <Table fit>
            <TableHeader>
              <TableRow>
                <TableHead>{t("col.material")}</TableHead>
                <TableHead>{t("col.spend")}</TableHead>
                <TableHead>{t("budgets.alerts")}</TableHead>
                <TableHead pin="end">{t("col.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} data-material={row.code}>
                  <TableCell className="font-medium">
                    {row.name}
                    <span className="block font-mono text-2xs font-normal text-muted-foreground">{row.code}</span>
                  </TableCell>
                  <TableCell>
                    <SpendCell column={row} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.tracks_spend && row.budget_amount
                      ? [
                          ...(row.budget_alert_percentages ?? []).map((value) => `${value}%`),
                          ...(row.budget_alert_amounts ?? []).map((value) => `RM ${value}`),
                        ].join("、") || t("budgets.noAlerts")
                      : "—"}
                  </TableCell>
                  <TableCell pin="end">
                    <div className="flex flex-wrap gap-1">
                      {canSet && (
                        <Button size="sm" variant="outline" className="h-7" onClick={() => setEditing(row)}>
                          <Wallet />
                          {t("budgets.set")}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        onClick={() => setHistory(row)}
                        data-slot="budget-history-open"
                      >
                        <History />
                        {t("budgets.history")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {history && <BudgetHistoryDialog material={history} onClose={() => setHistory(null)} />}
      {editing && (
        <MaterialBudgetDialog
          material={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            for (const queryKey of [["project-categories"], ["category-management"], ["material-overview"]]) {
              void qc.invalidateQueries({ queryKey });
            }
          }}
        />
      )}
    </section>
  );
}

function alertsText(side: BudgetSide, none: string) {
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  const parts = [
    ...list(side.budget_alert_percentages).map((value) => `${value}%`),
    ...list(side.budget_alert_amounts).map((value) => `RM ${value}`),
  ];
  return parts.length ? parts.join("、") : none;
}

/** 预算修改记录 (JB262, QA1 audit #24): newest first, from the audit rows. */
export function BudgetHistoryDialog({ material, onClose }: { material: ProjectCategory; onClose: () => void }) {
  const t = useTranslations("jb262");
  const common = useTranslations("common");
  const query = useQuery({
    queryKey: ["budget-history", material.id],
    queryFn: () => getBudgetHistory(material.id),
  });
  const rows = query.data?.rows ?? [];
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("budgets.historyTitle", { name: material.name })}</DialogTitle>
          <DialogDescription>{t("budgets.historyHelp")}</DialogDescription>
        </DialogHeader>
        {query.isError ? (
          <LoadFailed what={t("budgets.history")} onRetry={() => void query.refetch()} />
        ) : query.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : (
          <BudgetHistoryList rows={rows} />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {common("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The rows of 预算修改记录: who · when, the budget before → after, the alerts. */
export function BudgetHistoryList({ rows }: { rows: BudgetHistoryRow[] }) {
  const t = useTranslations("jb262");
  const formatter = useDateFormat();
  const money = (value: string | null | undefined) => (value === undefined ? null : value === null ? "—" : `RM ${value}`);
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-slot="budget-history-empty">
        {t("budgets.historyEmpty")}
      </p>
    );
  }
  return (
          <ul className="grid gap-2" data-slot="budget-history">
            {rows.map((row) => {
              const before = money(row.before.budget_amount);
              const after = money(row.after.budget_amount);
              const alertsMoved =
                "budget_alert_percentages" in row.after || "budget_alert_amounts" in row.after;
              return (
                <li key={row.id} className="rounded-lg border px-3 py-2 text-sm">
                  <p className="text-xs text-muted-foreground">
                    {row.by || "—"} · {formatter.dateTime(row.at)}
                  </p>
                  {after !== null && (
                    <p className="font-medium tabular-nums">
                      {t("budgets.historyBudget", { before: before ?? "—", after })}
                    </p>
                  )}
                  {alertsMoved && (
                    <p>
                      {t("budgets.historyAlerts", {
                        before: alertsText(row.before, t("budgets.noAlerts")),
                        after: alertsText(row.after, t("budgets.noAlerts")),
                      })}
                    </p>
                  )}
                  {"tracks_spend" in row.after && (
                    <p>{row.after.tracks_spend ? t("budgets.historyOn") : t("budgets.historyOff")}</p>
                  )}
                </li>
              );
            })}
          </ul>
  );
}

/**
 * The budget of one material: the same fields, words and checks the
 * material's form on 分类管理 had (D-263, A6, JB167), sent alone.
 */
export function MaterialBudgetDialog({
  material,
  onClose,
  onSaved,
}: {
  material: ProjectCategory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("jb262");
  const modules = useTranslations("categoryManagement");
  const [tracksSpend, setTracksSpend] = useState(material.tracks_spend ?? false);
  const [budget, setBudget] = useState(material.budget_amount ?? "");
  const [alerts, setAlerts] = useState((material.budget_alert_percentages ?? []).join(", "));
  const [alertAmounts, setAlertAmounts] = useState((material.budget_alert_amounts ?? []).join(", "));
  const [error, setError] = useState("");
  const parsedAlerts = parseAlertPercentages(alerts);
  const alertsInvalid = tracksSpend && parsedAlerts === null;
  const parsedAmounts = parseAlertAmounts(alertAmounts);
  const amountsInvalid = tracksSpend && parsedAmounts === null;
  const save = useMutation({
    mutationFn: () =>
      updateProjectCategory(
        material.id,
        budgetPayload({
          tracksSpend,
          budget,
          alerts: parsedAlerts ?? material.budget_alert_percentages ?? [],
          amounts: parsedAmounts ?? material.budget_alert_amounts ?? [],
        }),
      ),
    onSuccess: onSaved,
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t("failed")),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="size-5" />
            {t("budgets.dialogTitle", { name: material.name })}
          </DialogTitle>
          <DialogDescription>{modules("budget.help")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {/* JB167: the client typed his price per tonne here once. */}
          <p className="rounded-lg border border-panel-border bg-muted/40 px-3 py-2 text-xs">
            {modules("budget.vsPrice")}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={tracksSpend} onCheckedChange={(checked) => setTracksSpend(checked === true)} />
            {modules("budget.tracksSpend")}
          </label>
          {tracksSpend && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldWrapper label={modules("budget.amount")} hint={modules("budget.amountHint")}>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  aria-label={modules("budget.amount")}
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                />
              </FieldWrapper>
              <FieldWrapper
                label={modules("budget.alerts")}
                hint={modules("budget.alertsHint")}
                error={alertsInvalid ? modules("budget.alertsInvalid") : undefined}
              >
                <Input value={alerts} onChange={(event) => setAlerts(event.target.value)} />
              </FieldWrapper>
              <FieldWrapper
                label={modules("budget.thresholdAmounts")}
                hint={modules("budget.thresholdAmountsHint")}
                error={amountsInvalid ? modules("budget.thresholdAmountsInvalid") : undefined}
                className="sm:col-span-2"
              >
                <Input value={alertAmounts} onChange={(event) => setAlertAmounts(event.target.value)} />
              </FieldWrapper>
              <p className="text-xs text-muted-foreground sm:col-span-2">{modules("budget.recipients")}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t("budgets.pinNote")}</p>
          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            // Not a `requires` entry: the warning lines are optional - empty
            // means "do not warn me"; what is wrong is the text, said inline.
            disabledReason={
              alertsInvalid
                ? modules("budget.alertsInvalid")
                : amountsInvalid
                  ? modules("budget.thresholdAmountsInvalid")
                  : undefined
            }
            disabled={save.isPending || alertsInvalid || amountsInvalid}
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
