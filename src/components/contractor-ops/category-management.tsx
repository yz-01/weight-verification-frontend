"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Inbox,
  ListTree,
  Loader2,
  Pencil,
  Plus,
  Ruler,
  Save,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { recordKindKey } from "@/lib/record-kind";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { PhotoThumb, recordKindIcon } from "@/components/shared/photo-thumb";
import { CategoryDialog, EquipmentDialog } from "@/components/contractor-ops/operations-workspaces";
import { equipmentClassTree } from "@/components/contractor-ops/equipment-classes";
import { MaterialUnitsDialog } from "@/components/contractor-ops/material-units-dialog";
import { ManufacturerCell } from "@/components/shared/manufacturer-picker";
import { RecordSheet } from "@/components/contractor-ops/archive-queue";
import { Shell } from "@/components/contractor-ops/package-shell";
import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { RecordNo } from "@/components/shared/record-no";
import {
  SupplierDateFilter,
  type SupplierDateValue,
} from "@/components/shared/supplier-date-filter";
import { FieldWrapper, ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { useCurrentProject, usePageProject } from "@/components/providers/current-project-provider";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import { WASTE_TYPES } from "@/interfaces/contractor";
import type {
  ArchiveQueueRow,
  CategoryRecordKind,
  ColumnQuantity,
  ProjectCategory,
  ProjectCategoryKind,
  SiteEquipment,
} from "@/interfaces/contractor-ops";
import type { WasteCategory } from "@/interfaces/waste-outgoing";
import {
  isCategoryModuleKey,
  type CategoryModuleKey,
} from "@/lib/category-modules";
import { useDateFormat } from "@/lib/dates";
import { useUnitName } from "@/hooks/use-material-units";
import { recordStatusLabel } from "@/lib/record-status";
import {
  deleteProjectCategory,
  getCategoryRecord,
  getCategoryRecords,
  getProjectCategories,
  getSiteEquipmentItem,
  reorderProjectCategories,
} from "@/services/contractor-ops.service";
import {
  createWasteCategory,
  deleteWasteCategory,
  getWasteCategories,
  updateWasteCategory,
} from "@/services/waste-outgoing.service";

/**
 * One screen for every module's categories, chosen from the left (D-125) -
 * and, since 2026-09-25, the only screen where they are made, changed and
 * removed (D-263, D-264).
 *
 * 客户 2026-09-11 asked for 「左侧分类导航、右侧列表」 and 「用户先选择所属模块，
 * 再看到该模块下面的栏目」. Lucas 2026-09-25 then took away the jumping:
 * 「全部栏目都可以直接在同个页面新增，不需要跳转到其他页面，就是会有弹窗表格，
 * 也不需要打开该模块，不然页面一直跳来跳去太乱了」. Four of the nine modules used
 * to send the reader to another screen to create anything, every row's Edit was
 * a link, and the material columns could not be deleted anywhere (F-465). Now
 * every module opens its own dialog here, and there is no "open the module"
 * button left to press.
 *
 * 2026-10 B1 (Q5, X5): four groups only - 材料、设备、隐患整改、环保材料出场,
 * the four the client uses. 文件分类 is managed on 文档档案 and 施工阶段 on
 * 施工进度; progress, clearance, consultant and sundry records file under no
 * category any more. The four lists come from two tables in two scopes, on
 * purpose (F-338, D-126): recyclable waste is company-wide, the project
 * columns are per project, and real records point at each. So each brings its
 * own editor - the column dialog, the waste category dialog.
 *
 * 隐患整改分类 are read-only here (B1): listed, and their records open, but
 * nothing is added, changed, removed or reordered.
 *
 * Deleting follows the server: a category that still holds records is
 * refused with a sentence saying so, and that sentence is shown here as it is.
 */

type Scope = "project" | "company" | "platform";

/** One category, however its own table spells it. */
interface Row {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  recordCount: number;
  /**
   * Equipment's two levels (2026-10 B2, X1): 0 for a major class, 1 for a
   * sub class, listed under it. Every other module is flat (0).
   */
  depth?: number;
  /** The source row, for the editor that module opens. */
  column?: ProjectCategory;
  waste?: WasteCategory;
}

interface Module {
  key: CategoryModuleKey;
  scope: Scope;
  /**
   * The permission that may create, edit, reorder and delete here. Each
   * table has its own, and the buttons follow it: a button the server would
   * refuse is a dead end with a label on it.
   */
  manage: string;
  /**
   * Set on the modules whose categories are `ProjectCategory` rows. They
   * share one editor, one reorder and one delete; what the kind decides is
   * which list a new column joins.
   */
  columnKind?: ProjectCategoryKind;
  /**
   * Listed and opened, never edited here (2026-10 B1): no create, edit,
   * delete or reorder, whatever the reader's permissions.
   */
  readOnly?: boolean;
  fetch: (project: string) => Promise<Row[]>;
  remove: (id: string) => Promise<void>;
}

const columnRows = (kind: ProjectCategoryKind) => async (project: string) => {
  const page = await getProjectCategories({
    project,
    kind: kind,
    page_size: 200,
    sort_by: "sort_order",
    sort_order: "asc",
  });
  // Equipment is a tree (X1): each major class, then its sub classes. The
  // other kinds have no parent to sort by, so they keep the server's order.
  const ordered =
    kind === "EQUIPMENT"
      ? (() => {
          const tree = equipmentClassTree(page.results);
          return tree.majors.flatMap((major) => [major, ...tree.subClasses(major.id)]);
        })()
      : page.results;
  return ordered.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    isActive: row.is_active,
    recordCount: row.record_count,
    depth: kind === "EQUIPMENT" && row.parent ? 1 : 0,
    column: row,
  }));
};

/** The project-column modules share everything except the kind. */
const columnModule = (
  key: CategoryModuleKey,
  kind: ProjectCategoryKind,
): Module => ({
  key,
  scope: "project",
  manage: "category.manage",
  columnKind: kind,
  fetch: columnRows(kind),
  remove: deleteProjectCategory,
});

const MODULES: Module[] = [
  // The material columns used to live on /material-columns, which had no
  // create and no delete at all (F-465). They are an ordinary column module
  // now, with their money shown in the table and edited in the dialog.
  columnModule("material", "MATERIAL"),
  // The machines a contractor registers on a site, filed under this project's
  // own columns (T-242) - not MSE's own hardware register (F-369).
  columnModule("equipment", "EQUIPMENT"),
  // Read-only (2026-10 B1): the hazard categories are fixed for the site.
  { ...columnModule("ehs", "EHS"), readOnly: true },
  {
    key: "recycle",
    scope: "company",
    manage: "waste_outgoing.config",
    // Every row, switched-off ones included: a category that vanished when
    // it was turned off could never be turned back on (F-465).
    fetch: async () => {
      const page = await getWasteCategories({ page_size: 200 });
      return page.results.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        isActive: row.is_active,
        recordCount: row.record_count,
        waste: row,
      }));
    },
    remove: deleteWasteCategory,
  },
  // No 文件分类 (managed on 文档档案) and no 施工阶段 (managed on 施工进度),
  // Q5; no progress, clearance, consultant or sundry categories, X5.
];

export function CategoryManagement() {
  const t = useTranslations("categoryManagement");
  const ops = useTranslations("contractorOps");
  const waste = useTranslations("wasteOutgoing");
  const common = useTranslations("common");
  const { can } = useAuth();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  /*
   * `?project=…&module=…&create=1` - where the retired /material-columns and
   * /project-categories addresses, and the dashboard's "new column" shortcut,
   * land (D-263).
   */
  const requestedModule = searchParams.get("module")?.trim() ?? "";
  const initialModule =
    MODULES.find((module) => module.key === requestedModule) ?? MODULES[0];
  const initialProject = searchParams.get("project")?.trim() ?? "";
  const [selected, setSelected] = useState<CategoryModuleKey>(
    isCategoryModuleKey(requestedModule) ? requestedModule : MODULES[0].key,
  );
  // The top bar's 「当前项目」 when it is in force (B13); `?project=` moves it.
  const topBar = useCurrentProject();
  const [project, setProject] = usePageProject(initialProject);
  const [editing, setEditing] = useState<Row | "new" | null>(
    searchParams.get("create") === "1" &&
      can(initialModule.manage) &&
      !initialModule.readOnly &&
      (initialModule.scope !== "project" || Boolean(project))
      ? "new"
      : null,
  );
  const [removing, setRemoving] = useState<Row | null>(null);
  const [unitsOpen, setUnitsOpen] = useState(false);
  /** The column whose records are open in the dialog (T-396). */
  const [viewing, setViewing] = useState<Row | null>(null);
  const [refusal, setRefusal] = useState<{ name: string; reason: string } | null>(
    null,
  );
  const active =
    MODULES.find((module) => module.key === selected) ?? MODULES[0];
  const needsProject = active.scope === "project";
  const canManage = can(active.manage) && !active.readOnly;
  const isMaterial = active.key === "material";

  const rows = useQuery({
    queryKey: ["category-management", active.key, project],
    queryFn: () => active.fetch(project),
    enabled: !needsProject || Boolean(project),
  });
  const list = rows.data ?? [];

  /** Every list that shows these categories somewhere else, not just this one. */
  const refresh = () => {
    for (const queryKey of [
      ["category-management"],
      ["project-categories"],
      ["construction-phases"],
      ["documents", "categories"],
      ["waste-outgoing", "options"],
    ]) {
      void qc.invalidateQueries({ queryKey });
    }
  };
  const removal = useMutation({
    mutationFn: (row: Row) => active.remove(row.id),
    onSuccess: () => {
      setRemoving(null);
      setRefusal(null);
      refresh();
    },
    // The server says which records are still filed there; that sentence is
    // the answer, so it is shown as it is and stays until the next action.
    onError: (reason, row) => {
      setRemoving(null);
      setRefusal({
        name: row.name,
        reason: reason instanceof ApiError ? reason.message : t("saveFailed"),
      });
    },
  });
  const reorder = useMutation({
    mutationFn: reorderProjectCategories,
    onSuccess: refresh,
  });
  // Only within one project: across projects the row above belongs to a
  // different list, so "move up" would have nothing to swap with. Not in the
  // equipment tree (B2): the row above may be another level.
  const canReorder =
    Boolean(active.columnKind) && canManage && Boolean(project) && active.key !== "equipment";
  /** Swap a column with its neighbour, sending both places at once. */
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    reorder.mutate([
      { id: list[index].id, sort_order: target },
      { id: list[target].id, sort_order: index },
    ]);
  };

  const chooseModule = (key: CategoryModuleKey) => {
    setSelected(key);
    setEditing(null);
    setViewing(null);
    setRefusal(null);
  };
  const saved = () => {
    setEditing(null);
    setRefusal(null);
    refresh();
  };

  const createButton = canManage && (
    <Button
      size="sm"
      requires={needsProject ? [[project, ops("field.project")]] : []}
      onClick={() => {
        setRefusal(null);
        setEditing("new");
      }}
    >
      <Plus />
      {t("create")}
    </Button>
  );

  return (
    <div className="space-y-5">
      <ListHeader title={t("title")} subtitle={t("subtitle")} />
      {/* The project filter, and for a project-scoped module the project a new
          column is created in - so it wears the star the create button asks for. */}
      {/* With the top bar's project in force there is no second box: on one
          project it is that project; on 全部项目 a project-scoped module asks
          once, and the answer moves the top bar (B13). */}
      {(!topBar.active || (needsProject && !project)) && (
      <FieldWrapper label={ops("field.project")} required={needsProject} className="rounded-lg border bg-card px-3 py-2 shadow-sm">
        <ProjectPicker
          value={project}
          onValueChange={(next) => setProject(next === "all" ? "" : next)}
          placeholder={ops("field.selectProject")}
          allowAll={!topBar.active}
          allLabel={ops("field.allProjects")}
          className="w-full sm:w-72"
          scope={topBar.active ? "page" : "filter"}
        />
      </FieldWrapper>
      )}
      <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
        {/* The left-hand module list the customer asked for. Buttons rather
            than links: the table beside it is the page. */}
        <nav aria-label={t("modules")} className="flex flex-col gap-1">
          {MODULES.map((module) => (
            <button
              key={module.key}
              type="button"
              onClick={() => chooseModule(module.key)}
              aria-current={module.key === selected ? "true" : undefined}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                module.key === selected
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "bg-card hover:bg-muted/40"
              }`}
            >
              <ListTree className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {t(`module.${module.key}`)}
              </span>
            </button>
          ))}
        </nav>

        <section className="min-w-0">
          <header className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{t(`module.${active.key}`)}</h2>
            {/* Said out loud, not left to be discovered. */}
            <StatusBadge label={t(`scope.${active.scope}`)} tone="neutral" />
            <div className="ml-auto flex items-center gap-2">
              {/* 「单位管理」 (2026-10 A4): the units a material category is
                  measured in, kept here beside the categories that use them. */}
              {isMaterial && can("category.manage") && (
                <Button size="sm" variant="outline" onClick={() => setUnitsOpen(true)}>
                  <Ruler />
                  {t("units.open")}
                </Button>
              )}
              {createButton}
            </div>
          </header>
          {unitsOpen && <MaterialUnitsDialog onClose={() => setUnitsOpen(false)} />}
          <p className="mb-1 text-xs text-muted-foreground">
            {t(`moduleHelp.${active.key}`)}
          </p>
          {/* Where this module's records come from, and whether the phone can
              file into it (D-173). */}
          <p className="mb-3 text-xs text-muted-foreground">
            {t(`moduleSource.${active.key}`)}
          </p>
          {refusal && (
            <p
              role="alert"
              className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {t("removeFailed", refusal)}
            </p>
          )}

          {needsProject && !project ? (
            <p className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              {t("chooseProject")}
            </p>
          ) : rows.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : rows.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {t("failed")}
            </p>
          ) : !list.length ? (
            <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              <p>{t("empty")}</p>
              {canManage && <div className="mt-3">{createButton}</div>}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table className={isMaterial ? "min-w-[56rem]" : "min-w-[36rem]"}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("column.name")}</TableHead>
                    <TableHead>{t("column.code")}</TableHead>
                    <TableHead>{t("column.module")}</TableHead>
                    <TableHead className="text-right">
                      {t("column.records")}
                    </TableHead>
                    {isMaterial && (
                      <>
                        <TableHead className="text-right">
                          {t("column.archived")}
                        </TableHead>
                        <TableHead>{t("column.spend")}</TableHead>
                        <TableHead className="text-right">
                          {t("column.quantity")}
                        </TableHead>
                      </>
                    )}
                    <TableHead>{t("column.status")}</TableHead>
                    <TableHead>{t("column.action")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((row, index) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        {/* The name opens what is filed in it, on this page
                            (T-396): 「点一个栏目，同一页弹出这个栏目里的全部
                            记录」. */}
                        <span className={row.depth ? "flex items-center gap-1 pl-5" : "flex items-center gap-1"}>
                          {row.depth ? <span aria-hidden className="text-muted-foreground">└</span> : null}
                          <button
                            type="button"
                            onClick={() => setViewing(row)}
                            className="text-left text-primary underline-offset-4 hover:underline"
                          >
                            {row.name}
                          </button>
                          {/* 大类 / 小类 (B2), said rather than left to the indent. */}
                          {active.key === "equipment" && (
                            <span className="text-xs font-normal text-muted-foreground">
                              {t(row.depth ? "equipment.subClass" : "equipment.majorClass")}
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.code}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {t(`module.${active.key}`)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.recordCount}
                      </TableCell>
                      {isMaterial && row.column && (
                        <>
                          <TableCell className="text-right tabular-nums">
                            {row.column.archived_deliveries ?? 0}
                          </TableCell>
                          <TableCell>
                            <SpendCell column={row.column} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <QuantityCell quantities={row.column.quantities ?? []} />
                          </TableCell>
                        </>
                      )}
                      <TableCell>
                        <StatusBadge
                          label={t(row.isActive ? "active" : "inactive")}
                          tone={row.isActive ? "positive" : "neutral"}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                        {/* For every reader, not only a manager: looking at
                            what is filed is not managing the column. */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setViewing(row)}
                        >
                          {t("viewRecords")}
                        </Button>
                        {canManage && (
                          <div className="flex items-center gap-1">
                            {canReorder && (
                              <>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  title={ops("categories.moveUp")}
                                  disabledReason={
                                    index === 0 ? common("alreadyFirst") : undefined
                                  }
                                  disabled={index === 0 || reorder.isPending}
                                  onClick={() => move(index, -1)}
                                >
                                  <ChevronUp />
                                </Button>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  title={ops("categories.moveDown")}
                                  disabledReason={
                                    index === list.length - 1
                                      ? common("alreadyLast")
                                      : undefined
                                  }
                                  disabled={
                                    index === list.length - 1 || reorder.isPending
                                  }
                                  onClick={() => move(index, 1)}
                                >
                                  <ChevronDown />
                                </Button>
                              </>
                            )}
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              title={t("edit")}
                              onClick={() => {
                                setRefusal(null);
                                setEditing(row);
                              }}
                            >
                              <Pencil />
                            </Button>
                            {/* The seeded waste categories are refused by the
                                server every time, so the bin says why instead
                                of answering with an error (F-129). */}
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="text-destructive"
                              title={ops("action.remove")}
                              disabledReason={
                                row.waste?.is_system
                                  ? waste("category.standardHelp")
                                  : undefined
                              }
                              disabled={Boolean(row.waste?.is_system)}
                              onClick={() => setRemoving(row)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>

      {editing && (
        <CategoryEditor
          module={active}
          project={project}
          row={editing === "new" ? null : editing}
          nextSortOrder={list.length}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
      {viewing && (
        <ColumnRecordsDialog
          moduleKey={active.key}
          column={viewing}
          onClose={() => setViewing(null)}
        />
      )}
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={() => setRemoving(null)}
          title={ops("categories.removeTitle", { name: removing.name })}
          description={ops("categories.removeBody")}
          confirmLabel={ops("action.remove")}
          confirmIcon={Trash2}
          isPending={removal.isPending}
          onConfirm={() => removal.mutate(removing)}
        />
      )}
    </div>
  );
}

/**
 * The editor this module owns, opened in place (D-264).
 *
 * One switch rather than one generic form: each table has fields the other
 * does not - a column's access and budget, a waste category's dispatch type -
 * and a form that pretended otherwise would either drop them or show fields
 * that do nothing.
 */
function CategoryEditor({
  module,
  project,
  row,
  nextSortOrder,
  onClose,
  onSaved,
}: {
  module: Module;
  project: string;
  row: Row | null;
  nextSortOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  if (module.columnKind) {
    return (
      <CategoryDialog
        project={row?.column?.project ?? project}
        defaultKind={module.columnKind}
        row={row?.column ?? null}
        nextSortOrder={nextSortOrder}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  }
  return (
    <WasteCategoryDialog
      category={row?.waste ?? null}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

const RECORDS_PAGE_SIZE = 20;

/**
 * Everything filed in one column, in a dialog on this page (T-396, D-276).
 *
 * Lucas: 「栏目管理里点一个栏目，同一页弹出这个栏目里的全部记录，点一笔就在弹窗
 * 里看详情，不跳页」. One list for all twelve modules, from the one endpoint that
 * knows where each module's records live; a click opens the archive queue's
 * own detail sheet on top (「与总栏目同一个详情」), fed from this list's door
 * because a column holds unfinished records the queue's door will not open.
 */
/**
 * Received quantities, one line per unit (D-281, F-481).
 *
 * The column used to show tonnes only, so a category of concrete - measured in
 * cubic metres - read 0.000 with four deliveries in it.
 */
export function QuantityCell({
  quantities,
  inline = false,
}: {
  quantities: readonly ColumnQuantity[];
  inline?: boolean;
}) {
  const t = useTranslations("categoryManagement");
  // Built-in codes translated, a unit the company added by its own label (A4).
  const unitName = useUnitName();
  if (quantities.length === 0) {
    return <span className="text-muted-foreground">0</span>;
  }
  return (
    <span className={inline ? "inline" : "block space-y-0.5"}>
      {quantities.map((quantity) => (
        <span key={quantity.unit} className={inline ? "inline" : "block"}>
          {quantity.received} {unitName(quantity.unit)}
          {Number(quantity.returned) > 0 && (
            <span className="text-xs text-muted-foreground">
              {" · "}
              {t("quantityReturned", {
                quantity: `${quantity.returned} ${unitName(quantity.unit)}`,
              })}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

/**
 * The modules whose records can come from a supplier (2026-10 B16): a
 * delivery, a delivery note, a return, a machine and its movements. The
 * others - a hazard, a recyclable load - are offered dates only.
 */
const SUPPLIER_MODULES: ReadonlySet<CategoryModuleKey> = new Set<CategoryModuleKey>([
  "material",
  "equipment",
]);

function ColumnRecordsDialog({
  moduleKey,
  column,
  onClose,
}: {
  moduleKey: CategoryModuleKey;
  column: Row;
  onClose: () => void;
}) {
  const t = useTranslations("categoryManagement");
  const queue = useTranslations("archiveQueue");
  const root = useTranslations();
  const formatter = useDateFormat();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ArchiveQueueRow<CategoryRecordKind> | null>(
    null,
  );
  // An equipment class lists machine profiles (2026-10 B2); one opens in its
  // own profile dialog to edit - for whoever may edit machines. Anybody else
  // reads it in the record sheet (Fable B4 #5: saving would be refused).
  const { can } = useAuth();
  const [machine, setMachine] = useState<SiteEquipment | null>(null);
  const [machineError, setMachineError] = useState("");
  const isEquipment = moduleKey === "equipment";
  const openRow = (row: ArchiveQueueRow<CategoryRecordKind>) => {
    if (!isEquipment || row.kind !== "SITE_EQUIPMENT" || !can("equipment.manage")) {
      setOpen(row);
      return;
    }
    setMachineError("");
    getSiteEquipmentItem(row.id).then(setMachine, () => setMachineError(queue("failed")));
  };
  // Supplier, dates and a search box (2026-10 B3, B16): 「点『钢筋』→ 选供应商
  // + 日期 → 只剩对应记录」. Any change goes back to the first page.
  const [filters, setFilters] = useState<SupplierDateValue>({});
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    // One request when the typing stops, not one per key.
    const timer = setTimeout(() => {
      setSearch(typed.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [typed]);

  const records = useQuery({
    queryKey: ["category-records", moduleKey, column.id, page, filters, search],
    queryFn: () =>
      getCategoryRecords({
        module: moduleKey,
        category: column.id,
        page,
        page_size: RECORDS_PAGE_SIZE,
        ...filters,
        search: search || undefined,
      }),
  });
  // Whether the records of this module come from a supplier at all: the
  // server says once it has answered; until then, the modules that do.
  const supplierFilter =
    records.data?.supplier_filter ?? SUPPLIER_MODULES.has(moduleKey);
  // By whose make too (2026-10 D1): material only.
  const manufacturerFilter = records.data?.manufacturer_filter ?? moduleKey === "material";
  const filtered = Boolean(
    filters.supplier || filters.manufacturer || filters.date_from || filters.date_to || search,
  );
  const rows = records.data?.results ?? [];
  const total = records.data?.count ?? 0;
  const groups = records.data?.groups ?? [];
  const lastPage = Math.max(1, Math.ceil(total / RECORDS_PAGE_SIZE));

  return (
    <>
      <Shell title={t("records.title", { name: column.name })} onClose={onClose}>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <p className="text-xs text-muted-foreground">{t("records.help")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="search"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={t("records.search")}
              aria-label={t("records.search")}
              className="h-8 w-[200px] max-w-full text-sm"
            />
            <SupplierDateFilter
              value={filters}
              showSupplier={supplierFilter}
              showManufacturer={manufacturerFilter}
              onChange={(next) => {
                setFilters((current) => ({ ...current, ...next }));
                setPage(1);
              }}
            />
          </div>
          {records.isLoading ? (
            <p className="text-sm text-muted-foreground">{queue("loading")}</p>
          ) : records.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {queue("failed")}
            </p>
          ) : rows.length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              <Inbox className="size-4" />
              {filtered ? t("records.emptyFiltered") : t("records.empty")}
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {t("records.count", { count: total })}
              </p>
              {/* Each material on its own line with its own total (D-281):
                  「之前的混凝土和今天的混凝土混在一起了，不会分开」. */}
              {groups.length > 0 && (
                <div className="rounded-lg border">
                  <p className="border-b bg-muted/30 px-3 py-2 text-xs font-semibold">
                    {t("records.byMaterial")}
                  </p>
                  <ul className="divide-y">
                    {groups.map((group) => (
                      <li
                        key={`${group.material_name}|${group.material_specification}|${group.unit}`}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 truncate">
                          {group.material_name}
                          {group.material_specification
                            ? ` · ${group.material_specification}`
                            : ""}
                        </span>
                        <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                          {t("records.groupCount", { count: group.deliveries })}
                          {" · "}
                          <QuantityCell quantities={[group]} inline />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <ul className="divide-y rounded-lg border">
                {rows.map((row) => (
                  <li key={`${row.kind}:${row.id}`}>
                    {/* A div acting as the row's button, not a <button>: the
                        number inside carries its own copy button (D4), and a
                        button cannot hold another. */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => openRow(row)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openRow(row);
                        }
                      }}
                      className="flex w-full cursor-pointer items-start gap-3 px-3 py-2 text-left hover:bg-muted/40"
                    >
                      {/* The record's photograph on the left (E3). A picture
                          only: the row is the button, and it opens the
                          record with every photograph (audit #11). */}
                      <PhotoThumb
                        coverUrl={row.cover_photo_url}
                        count={row.photo_count}
                        icon={recordKindIcon(row.kind)}
                        reference={row.reference}
                        openable={false}
                      />
                      <span className="min-w-0 flex-1">
                        {/* The short number big, the project small (D4). */}
                        <RecordNo value={row.reference} projectCode={row.project_code} />
                        {row.detail && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {row.detail}
                          </span>
                        )}
                        {/* The DO and the supplier (B3): what the office
                            matches a delivery against. */}
                        {(row.delivery_note_no || row.supplier_name) && (
                          <span className="block truncate text-xs">
                            {[
                              row.delivery_note_no
                                ? `${t("records.deliveryNoteNo")} ${row.delivery_note_no}`
                                : "",
                              row.supplier_name ?? "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                        {/* A machine's plate and paperwork dates (B2). */}
                        {isEquipment && row.kind === "SITE_EQUIPMENT" && (
                          <MachineProfileLine row={row as EquipmentProfileRow} />
                        )}
                        {/* Whose make (D1), orange when not designated. */}
                        {row.manufacturer_name && (
                          <span className="block text-xs">
                            <ManufacturerCell
                              name={row.manufacturer_name}
                              offList={row.manufacturer_off_list}
                            />
                          </span>
                        )}
                        <span className="block text-xs text-muted-foreground">
                          {[
                            queue(`kind.${recordKindKey(row)}` as never),
                            row.project_name,
                            formatter.dateTime(row.submitted_at),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1 text-xs">
                        <StatusBadge
                          label={recordStatusLabel(root, row)}
                          tone="neutral"
                        />
                        {/* Who archived it and when (T-391), in the queue's
                            own words. */}
                        {!row.archivable ? (
                          <span className="text-muted-foreground">
                            {queue("closure.notApplicable")}
                          </span>
                        ) : row.archived ? (
                          <span className="text-right">
                            <span className="font-medium text-success">
                              {queue("closure.closed")}
                            </span>
                            <span className="block text-muted-foreground">
                              {row.archived.by}
                              {row.archived.at
                                ? ` · ${formatter.dateTime(row.archived.at)}`
                                : ""}
                            </span>
                          </span>
                        ) : (
                          <span className="text-warning">{queue("closure.open")}</span>
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        {lastPage > 1 && (
          <footer className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              {queue("pageOf", { page, pages: lastPage })}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                disabledReason={queue("firstPage")}
                onClick={() => setPage((current) => current - 1)}
              >
                {queue("previous")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= lastPage}
                disabledReason={queue("lastPage")}
                onClick={() => setPage((current) => current + 1)}
              >
                {queue("next")}
              </Button>
            </div>
          </footer>
        )}
      </Shell>
      {machineError && (
        <p role="alert" className="text-sm text-destructive">
          {machineError}
        </p>
      )}
      {machine && (
        <EquipmentDialog
          project={machine.project}
          equipment={machine}
          onClose={() => setMachine(null)}
          onSaved={() => {
            setMachine(null);
            void qc.invalidateQueries({ queryKey: ["category-records"] });
            void qc.invalidateQueries({ queryKey: ["category-management"] });
          }}
        />
      )}
      {open && (
        <RecordSheet
          row={open}
          fetchRecord={getCategoryRecord}
          // 分类里不做验收 (2026-10 B4): read here, decided in the module.
          onClose={() => {
            setOpen(null);
            void qc.invalidateQueries({ queryKey: ["category-records"] });
          }}
        />
      )}
    </>
  );
}

/** A machine row of the equipment records list (2026-10 B2). */
type EquipmentProfileRow = ArchiveQueueRow<CategoryRecordKind> & {
  registration_no?: string;
  needs_profile?: boolean;
  expiry?: Partial<Record<string, string>>;
};

const EXPIRY_LABELS: Record<string, string> = {
  road_tax_expires_on: "field.roadTaxExpiresOn",
  certificate_expires_on: "field.certificateExpiresOn",
  insurance_expires_on: "field.insuranceExpiresOn",
  pma_expires_on: "field.pmaExpiresOn",
  permit_expires_on: "field.permitExpiresOn",
};

/** The plate and each expiry date the profile has, on one line. */
function MachineProfileLine({ row }: { row: EquipmentProfileRow }) {
  const ops = useTranslations("contractorOps");
  const formatter = useDateFormat();
  const dates = Object.entries(row.expiry ?? {}).filter(([field, value]) => value && EXPIRY_LABELS[field]);
  return (
    <span className="block text-xs">
      <span className="font-medium">
        {ops("field.plateNo")} {row.registration_no || "—"}
      </span>
      {dates.map(([field, value]) => (
        <span key={field} className="text-muted-foreground">
          {" · "}
          {ops(EXPIRY_LABELS[field])} {formatter.date(value as string)}
        </span>
      ))}
      {row.needs_profile && <span className="text-warning">{" · "}{ops("equipment.needsProfile")}</span>}
    </span>
  );
}

/**
 * Money spent against the budget, with a bar.
 *
 * Over budget is its own state, not "100% and a bit": the bar stops at full
 * so the number, not the bar, says how far past it went.
 */
function SpendCell({ column }: { column: ProjectCategory }) {
  const t = useTranslations("categoryManagement");
  const unitName = useUnitName();
  const percent = column.budget_used_percent;
  // Quantity mode (2026-10 A6): the total is the quantity in the category's
  // unit, and the loads in another unit are what it could not count.
  const quantityMode = column.budget_mode === "QUANTITY";
  const uncounted = quantityMode
    ? (column.quantity_uncounted_deliveries ?? 0)
    : (column.spend_uncounted_deliveries ?? 0);
  const hasBudget = quantityMode ? Boolean(column.budget_quantity) : Boolean(column.budget_amount);
  const barWidth = percent === null ? 0 : Math.min(percent, 100);
  const barTone =
    percent === null
      ? "bg-muted-foreground/30"
      : percent >= 100
        ? "bg-destructive"
        : percent >= 80
          ? "bg-warning"
          : "bg-primary";
  return (
    <div className="min-w-44 space-y-1">
      {column.tracks_spend && hasBudget ? (
        <>
          <p
            className={`text-xs tabular-nums ${
              percent !== null && percent >= 100 ? "font-semibold text-destructive" : ""
            }`}
          >
            {quantityMode
              ? t("budget.quantityUsed", {
                  used: column.quantity_used ?? "0",
                  budget: column.budget_quantity ?? "",
                  unit: unitName(column.default_unit, column.default_unit_label),
                })
              : `RM ${column.spend_amount} / RM ${column.budget_amount}`}
            {percent !== null && ` (${percent}%)`}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${barTone}`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{t("budget.none")}</p>
      )}
      {uncounted > 0 && (
        // Said out loud: a total that quietly skipped these reads as under
        // budget exactly when the paperwork could not be read.
        <p className="flex items-start gap-1 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {t("budget.uncounted", { count: uncounted })}
        </p>
      )}
    </div>
  );
}

/**
 * Create or change one recyclable waste category.
 *
 * The old dialog on the waste screen could only switch a category off, and a
 * switched-off one disappeared from it for good (F-465). This one renames,
 * changes the dispatch type and the description, and switches it back on.
 * The code is fixed once made, because records cite it.
 */
function WasteCategoryDialog({
  category,
  onClose,
  onSaved,
}: {
  category: WasteCategory | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("categoryManagement");
  const w = useTranslations("wasteOutgoing");
  const ops = useTranslations("contractorOps");
  const types = useTranslations("dispatches");
  const [code, setCode] = useState(category?.code ?? "");
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
            code: code.trim().toUpperCase(),
            name: name.trim(),
            dispatch_type: dispatchType,
            description: description.trim(),
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
          <DialogDescription>{t("moduleHelp.recycle")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FieldWrapper label={w("category.code")} required>
            <Input
              value={code}
              disabled={category !== null}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          </FieldWrapper>
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
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
              />
              {t("active")}
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
          <Button
            requires={[
              [code, w("category.code")],
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
