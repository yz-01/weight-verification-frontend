"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListTree, Loader2, Pencil, Plus, Save, Send, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { WasteCategoryDialog } from "@/components/contractor-ops/waste-category-dialog";
import {
  EmptyState,
  FieldWrapper,
  QueryFailedNote,
  StatusBadge,
} from "@/components/shared/page-primitives";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMaterialUnits, useUnitName } from "@/hooks/use-material-units";
import { ApiError } from "@/interfaces/api";
import type {
  CompanyCategoriesAdded,
  CompanyCategory,
  CompanyCategoryKind,
  EquipmentName,
} from "@/interfaces/contractor-ops";
import type { WasteCategory } from "@/interfaces/waste-outgoing";
import {
  addCompanyCategoriesToProjects,
  createCompanyCategory,
  createEquipmentName,
  deleteCompanyCategory,
  getCompanyCategories,
  getEquipmentNames,
  updateCompanyCategory,
  updateEquipmentName,
} from "@/services/contractor-ops.service";
import { getWasteCategories } from "@/services/waste-outgoing.service";

/**
 * 「公司通用分类」 (JB103, 客户 11-05 事项 8): the company's own categories, kept
 * with no project - 「公司管理员即使还没有建立项目，也应该可以提前设置所有公司
 * 常用分类」「公司通用分类不需要选择项目，可以直接新增及管理」.
 *
 * Six lists in three places, each where it already lived or belongs:
 * material (with its specifications), request types, EHS and Progress Claim
 * on the company's new list (copied into every new project); 「设备名称」,
 * company-wide since JB96; and the recyclable categories, company-wide since
 * ID2. Nothing here asks for a project, and no code is typed anywhere - the
 * server numbers every row (事项 7 「分类编号全部自动生成」).
 */

export type CompanyModuleKey = "material" | "requestType" | "ehs" | "claim" | "equipmentName" | "recycle";

interface CompanyModule {
  key: CompanyModuleKey;
  /** Set on the four kept on the company's own list. */
  kind?: CompanyCategoryKind;
  /** Who may add and change here; the buttons follow it. */
  manage: string[];
}

export const COMPANY_MODULES: CompanyModule[] = [
  { key: "material", kind: "MATERIAL", manage: ["category.manage"] },
  { key: "requestType", kind: "REQUEST_TYPE", manage: ["category.manage"] },
  { key: "ehs", kind: "EHS", manage: ["category.manage"] },
  { key: "claim", kind: "CLAIM", manage: ["category.manage"] },
  // 「设备」 since JB96 is its name only (客户 11-03 第 1 点).
  { key: "equipmentName", manage: ["category.manage", "equipment.manage"] },
  // Company-wide since ID2, kept with its own permission (ID4).
  { key: "recycle", manage: ["waste_outgoing.config"] },
];

/** One line of the table, whichever list it came from. */
interface Line {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  isFixed: boolean;
  depth: 0 | 1;
  unit?: string;
  category?: CompanyCategory;
  parent?: CompanyCategory;
  equipment?: EquipmentName;
  waste?: WasteCategory;
}

export const linesOf = (rows: CompanyCategory[]): Line[] =>
  rows.flatMap((row) => [
    {
      id: row.id,
      name: row.name,
      description: row.description,
      isActive: row.is_active,
      isFixed: row.is_fixed,
      depth: 0 as const,
      unit: row.default_unit,
      category: row,
    },
    ...(row.specs ?? []).map((spec) => ({
      id: spec.id,
      name: spec.name,
      description: spec.description,
      isActive: spec.is_active,
      isFixed: spec.is_fixed,
      depth: 1 as const,
      unit: spec.default_unit,
      category: spec,
      parent: row,
    })),
  ]);

async function fetchLines(module: CompanyModule): Promise<Line[]> {
  if (module.kind) return linesOf((await getCompanyCategories(module.kind)).results);
  if (module.key === "equipmentName") {
    return (await getEquipmentNames(undefined, { includeInactive: true })).map((row) => ({
      id: row.id,
      name: row.name,
      isActive: row.is_active,
      isFixed: false,
      depth: 0 as const,
      equipment: row,
    }));
  }
  // The recyclable company list: every row, switched-off ones included.
  const page = await getWasteCategories({ page_size: 200 });
  return page.results
    .filter((row) => !row.group)
    .map((row) => ({
      id: row.id,
      name: row.label,
      description: row.description,
      isActive: row.is_active,
      isFixed: Boolean(row.is_other),
      depth: row.parent ? (1 as const) : (0 as const),
      waste: row,
    }));
}

type Editing =
  | { line: Line | null; parent?: CompanyCategory | null }
  | null;

export function CompanyCategories() {
  const t = useTranslations("categoryManagement");
  const { can } = useAuth();
  const qc = useQueryClient();
  const [moduleKey, setModuleKey] = useState<CompanyModuleKey>("material");
  const [editing, setEditing] = useState<Editing>(null);
  const [adding, setAdding] = useState(false);
  const active = COMPANY_MODULES.find((entry) => entry.key === moduleKey) ?? COMPANY_MODULES[0];
  const canManage = active.manage.some((code) => can(code));
  const unitName = useUnitName();

  const lines = useQuery({
    queryKey: ["company-categories", active.key],
    queryFn: () => fetchLines(active),
  });
  const rows = lines.data ?? [];
  const refresh = () => {
    for (const queryKey of [["company-categories"], ["equipment-names"], ["waste-outgoing", "options"], ["category-management"]]) {
      void qc.invalidateQueries({ queryKey });
    }
  };
  const saved = () => {
    setEditing(null);
    refresh();
  };

  const createButton = canManage && (
    <Button onClick={() => setEditing({ line: null })}>
      <Plus />
      {t("company.create")}
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="surface-panel flex flex-col gap-3 rounded-xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
        <p className="text-sm text-muted-foreground">{t("company.intro")}</p>
        {/* 「加到现有项目」 (JB103 第 3 点): the whole company list, by name. */}
        {can("category.manage") && (
          <Button variant="outline" className="shrink-0" onClick={() => setAdding(true)}>
            <Send />
            {t("company.addToProjects")}
          </Button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
        <nav aria-label={t("company.modules")} className="flex flex-col gap-1">
          {COMPANY_MODULES.map((entry) => {
            const current = entry.key === active.key;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => {
                  setModuleKey(entry.key);
                  setEditing(null);
                }}
                aria-current={current ? "true" : undefined}
                className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  current
                    ? "border-primary/40 bg-primary/12 font-semibold text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <ListTree className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{t(`company.module.${entry.key}`)}</span>
              </button>
            );
          })}
        </nav>
        <section className="surface-panel min-w-0 rounded-xl p-4 sm:p-6">
          <header className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="panel-title">{t(`company.module.${active.key}`)}</h2>
            <StatusBadge label={t("scope.company")} tone="neutral" />
            <div className="ml-auto flex flex-wrap items-center gap-2">{createButton}</div>
          </header>
          <p className="mb-3 text-xs text-muted-foreground">{t(`company.moduleHelp.${active.key}`)}</p>
          <QueryFailedNote query={lines} what={t(`company.module.${active.key}`)} />
          {lines.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : lines.isError ? null : !rows.length ? (
            <EmptyState title={t("company.empty")} action={createButton || undefined} />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table className="min-w-[32rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("column.name")}</TableHead>
                    {active.key === "material" && <TableHead>{t("company.unit")}</TableHead>}
                    <TableHead>{t("column.status")}</TableHead>
                    {canManage && <TableHead>{t("column.action")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="font-medium">
                        <span className={line.depth ? "flex items-center gap-1 pl-5" : "flex items-center gap-1"}>
                          {line.depth ? <span aria-hidden className="text-muted-foreground">└</span> : null}
                          <span>{line.name}</span>
                          {line.isFixed && (
                            <span title={t("company.fixedHelp")}>
                              <StatusBadge label={t("system")} tone="neutral" />
                            </span>
                          )}
                        </span>
                        {line.description ? (
                          <span className={`block text-xs font-normal text-muted-foreground ${line.depth ? "pl-8" : ""}`}>
                            {line.description}
                          </span>
                        ) : null}
                      </TableCell>
                      {active.key === "material" && (
                        <TableCell className="text-sm">{line.unit ? unitName(line.unit) : "—"}</TableCell>
                      )}
                      <TableCell>
                        <StatusBadge
                          label={t(line.isActive ? "active" : "inactive")}
                          tone={line.isActive ? "positive" : "neutral"}
                        />
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {/* 「客户可以在这些基础分类上自行增加其他材料、规格」 */}
                            {active.key === "material" && line.depth === 0 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditing({ line: null, parent: line.category ?? null })}
                              >
                                <Plus />
                                {t("company.addSpec")}
                              </Button>
                            )}
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              title={t("edit")}
                              onClick={() => setEditing({ line, parent: line.parent ?? null })}
                            >
                              <Pencil />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>
      {editing && active.key === "recycle" && (
        <WasteCategoryDialog
          category={editing.line?.waste ?? null}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
      {editing && active.key === "equipmentName" && (
        <EquipmentNameDialog row={editing.line?.equipment ?? null} onClose={() => setEditing(null)} onSaved={saved} />
      )}
      {editing && active.kind && (
        <CompanyCategoryDialog
          kind={active.kind}
          moduleKey={active.key}
          row={editing.line?.category ?? null}
          parent={editing.parent ?? null}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
      {adding && <AddToProjectsDialog onClose={() => setAdding(false)} onDone={refresh} />}
    </div>
  );
}

const failure = (reason: unknown, fallback: string) =>
  reason instanceof ApiError ? reason.message : fallback;

/** Add or change one row of the company's list; a material's specification too. */
function CompanyCategoryDialog({
  kind,
  moduleKey,
  row,
  parent,
  onClose,
  onSaved,
}: {
  kind: CompanyCategoryKind;
  moduleKey: CompanyModuleKey;
  row: CompanyCategory | null;
  parent: CompanyCategory | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("categoryManagement");
  const types = useTranslations("materialRequest.types");
  const ops = useTranslations("contractorOps");
  const unitName = useUnitName();
  // query-failure: the unit list stays at 「不设单位」 and the unit already set; the name still saves
  const units = useMaterialUnits({ enabled: kind === "MATERIAL" });
  const [name, setName] = useState(row?.name ?? "");
  const [description, setDescription] = useState(row?.description ?? "");
  const [unit, setUnit] = useState(row?.default_unit ?? "");
  const [formStyle, setFormStyle] = useState<CompanyCategory["form_style"]>(row?.form_style || "GENERAL");
  const [isActive, setIsActive] = useState(row?.is_active ?? true);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () =>
      row
        ? updateCompanyCategory(row.id, {
            name: name.trim(),
            description: description.trim(),
            ...(kind === "MATERIAL" ? { default_unit: unit } : {}),
            ...(kind === "REQUEST_TYPE" && !row.is_fixed ? { form_style: formStyle } : {}),
            ...(row.is_fixed ? {} : { is_active: isActive }),
          })
        : createCompanyCategory({
            kind,
            name: name.trim(),
            description: description.trim(),
            ...(kind === "MATERIAL" ? { default_unit: unit } : {}),
            ...(kind === "REQUEST_TYPE" ? { form_style: formStyle } : {}),
            ...(parent ? { parent: parent.id } : {}),
          }),
    onSuccess: onSaved,
    onError: (reason) => setError(failure(reason, t("saveFailed"))),
  });
  const removal = useMutation({
    mutationFn: () => deleteCompanyCategory(row!.id),
    onSuccess: onSaved,
    onError: (reason) => setError(failure(reason, t("saveFailed"))),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {row
              ? t("company.editTitle", { name: row.name })
              : parent
                ? t("company.addSpecTitle", { name: parent.name })
                : t("company.createTitle", { module: t(`company.module.${moduleKey}`) })}
          </DialogTitle>
          <DialogDescription>{t(row?.is_fixed ? "company.fixedHelp" : "company.codeAuto")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FieldWrapper label={t("company.name")} required>
            <Input value={name} maxLength={150} onChange={(event) => setName(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("company.description")} hint={t("company.descriptionHint")}>
            <Input value={description} onChange={(event) => setDescription(event.target.value)} />
          </FieldWrapper>
          {kind === "MATERIAL" && (
            <FieldWrapper label={t("company.unit")}>
              <Select value={unit || "none"} onValueChange={(value) => setUnit(value === "none" ? "" : value)}>
                <SelectTrigger className="w-full" aria-label={t("company.unit")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("company.noUnit")}</SelectItem>
                  {(units.data ?? []).map((option) => (
                    <SelectItem key={option.code} value={option.code}>
                      {unitName(option.code, option.label)}
                    </SelectItem>
                  ))}
                  {unit && !(units.data ?? []).some((option) => option.code === unit) && (
                    <SelectItem value={unit}>{unitName(unit)}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </FieldWrapper>
          )}
          {kind === "REQUEST_TYPE" && (
            <FieldWrapper label={types("form")} hint={types("formHint")}>
              <Select
                value={formStyle || "GENERAL"}
                onValueChange={(value) => setFormStyle(value as CompanyCategory["form_style"])}
                disabled={Boolean(row?.is_fixed)}
              >
                <SelectTrigger className="w-full" aria-label={types("form")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["MATERIAL", "GENERAL"] as const).map((style) => (
                    <SelectItem key={style} value={style}>
                      {types(`style.${style}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
          )}
          {row && !row.is_fixed && (
            <label className="flex min-h-10 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
              <span>
                {t("active")}
                <span className="block text-xs text-muted-foreground">{t("company.activeHint")}</span>
              </span>
              <Switch checked={isActive} onCheckedChange={setIsActive} aria-label={t("active")} />
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {row && !row.is_fixed ? (
            <div className="flex items-center gap-2" title={t("company.removeHint")}>
              <Switch checked={armed} onCheckedChange={setArmed} aria-label={t("company.armRemove", { name: row.name })} />
              <Button
                variant="ghost"
                className="text-destructive"
                disabled={!armed || removal.isPending}
                disabledReason={armed ? undefined : t("armFirst")}
                onClick={() => removal.mutate()}
              >
                <Trash2 />
                {t("company.remove")}
              </Button>
            </div>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {ops("action.cancel")}
            </Button>
            <Button
              requires={[[name.trim(), t("company.name")]]}
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {ops("action.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Add, rename or switch off one 「设备名称」. A name is never removed (JB96). */
function EquipmentNameDialog({
  row,
  onClose,
  onSaved,
}: {
  row: EquipmentName | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("categoryManagement");
  const ops = useTranslations("contractorOps");
  const [name, setName] = useState(row?.name ?? "");
  const [isActive, setIsActive] = useState(row?.is_active ?? true);
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () =>
      row ? updateEquipmentName(row.id, { name: name.trim(), is_active: isActive }) : createEquipmentName(name.trim()),
    onSuccess: onSaved,
    onError: (reason) => setError(failure(reason, t("saveFailed"))),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {row ? t("company.editTitle", { name: row.name }) : t("company.createTitle", { module: t("company.module.equipmentName") })}
          </DialogTitle>
          <DialogDescription>{t("company.moduleHelp.equipmentName")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FieldWrapper label={ops("equipmentName.label")} required>
            <Input
              value={name}
              maxLength={200}
              placeholder={ops("equipmentName.newNamePlaceholder")}
              onChange={(event) => setName(event.target.value)}
            />
          </FieldWrapper>
          {row && (
            <label className="flex min-h-10 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
              <span>
                {t("active")}
                <span className="block text-xs text-muted-foreground">{t("company.equipmentActiveHint")}</span>
              </span>
              <Switch checked={isActive} onCheckedChange={setIsActive} aria-label={t("active")} />
            </label>
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
          <Button requires={[[name.trim(), ops("equipmentName.label")]]} disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {ops("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 「加到现有项目」 (JB103 第 3 点): what each open project is missing, by name.
 * Said before it runs - nothing is removed, renamed or overwritten - and
 * what it added said after.
 */
function AddToProjectsDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useTranslations("categoryManagement");
  const common = useTranslations("common");
  const [result, setResult] = useState<CompanyCategoriesAdded | null>(null);
  const [error, setError] = useState("");
  const run = useMutation({
    mutationFn: () => addCompanyCategoriesToProjects(),
    onSuccess: (data) => {
      setResult(data);
      onDone();
    },
    onError: (reason) => setError(failure(reason, t("saveFailed"))),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("company.addToProjects")}</DialogTitle>
          <DialogDescription>{t("company.addToProjectsBody")}</DialogDescription>
        </DialogHeader>
        {result && (
          <div role="status" className="grid gap-2 text-sm">
            <p className="font-medium">
              {result.added_count
                ? t("company.addedSome", { projects: result.project_count, count: result.added_count })
                : t("company.addedNone")}
            </p>
            <ul className="grid gap-1">
              {result.projects.map((line) => (
                <li key={line.project} className="rounded-lg border px-3 py-2">
                  <span className="font-medium">{line.project_name}</span>
                  <span className="block text-xs text-muted-foreground">{line.added.join("、")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {result ? common("close") : common("cancel")}
          </Button>
          {!result && (
            <Button disabled={run.isPending} onClick={() => run.mutate()}>
              {run.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              {t("company.addToProjectsGo")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
