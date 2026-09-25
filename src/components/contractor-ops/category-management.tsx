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
  Save,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  CategoryDialog,
  PhaseDialog,
} from "@/components/contractor-ops/operations-workspaces";
import { RecordSheet } from "@/components/contractor-ops/archive-queue";
import { Shell } from "@/components/contractor-ops/package-shell";
import { CategoryForm as DocumentCategoryForm } from "@/components/document-workflow/documents";
import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FieldWrapper, ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
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
  ConstructionPhase,
  ColumnQuantity,
  ProjectCategory,
  ProjectCategoryKind,
} from "@/interfaces/contractor-ops";
import type { DocumentCategory } from "@/interfaces/document-workflow";
import type { WasteCategory } from "@/interfaces/waste-outgoing";
import {
  isCategoryModuleKey,
  type CategoryModuleKey,
} from "@/lib/category-modules";
import { useDateFormat } from "@/lib/dates";
import { recordStatusLabel } from "@/lib/record-status";
import {
  deleteConstructionPhase,
  deleteProjectCategory,
  getCategoryRecord,
  getCategoryRecords,
  getConstructionPhases,
  getProjectCategories,
  reorderProjectCategories,
} from "@/services/contractor-ops.service";
import {
  deleteDocumentCategory,
  getDocumentCategories,
} from "@/services/document-workflow.service";
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
 * The twelve lists still come from five different tables in three scopes, on
 * purpose (F-338, D-126): documents and recyclable waste are company-wide, the
 * weighted construction stages and the project columns are per project, and
 * real records point at each of them. So each module brings its own editor -
 * the column dialog, the document category form, the phase dialog, the waste
 * category dialog - rather than one form pretending the tables are the same.
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
  /** Shown as a tail note, for the phases that carry progress weight. */
  note?: string;
  /** The source row, for the editor that module opens. */
  column?: ProjectCategory;
  document?: DocumentCategory;
  phase?: ConstructionPhase;
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
  return page.results.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    isActive: row.is_active,
    recordCount: row.record_count,
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
  // No 现场资料分类 (D-285): the customer never defined such a module, and its
  // hazard categories moved to 隐患整改分类 below.
  {
    key: "document",
    scope: "company",
    manage: "document.manage",
    fetch: async () => {
      const page = await getDocumentCategories({ page_size: 200 });
      return page.results.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        isActive: row.is_active,
        recordCount: row.record_count,
        document: row,
      }));
    },
    remove: deleteDocumentCategory,
  },
  // The machines a contractor registers on a site, filed under this project's
  // own columns (T-242) - not MSE's own hardware register (F-369).
  columnModule("equipment", "EQUIPMENT"),
  columnModule("progress", "PROGRESS"),
  {
    // The other half of the customer's "Progress", and deliberately not
    // merged into the one above: a phase carries the weight the completion
    // percentage is computed against (D-127).
    key: "phase",
    scope: "project",
    manage: "progress.manage",
    fetch: async (project: string) => {
      const page = await getConstructionPhases({ project, page_size: 200 });
      return page.results.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        isActive: row.is_active,
        recordCount: row.record_count,
        note: row.planned_weight,
        phase: row,
      }));
    },
    remove: deleteConstructionPhase,
  },
  columnModule("ehs", "EHS"),
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
  columnModule("debris", "CONSTRUCTION_WASTE"),
  // Consultant submissions used to file under the site-record columns; they
  // have their own now, chosen on the phone when submitting (D-274).
  columnModule("consultant", "CONSULTANT"),
  // Sundry claims are filed by the office after the fact - the phone never
  // chooses one (D-275). One set only: the period claims' own set duplicated
  // it and is gone (D-286).
  columnModule("sundry", "SUNDRY"),
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
  const [project, setProject] = useState(initialProject);
  const [editing, setEditing] = useState<Row | "new" | null>(
    searchParams.get("create") === "1" &&
      can(initialModule.manage) &&
      (initialModule.scope !== "project" || Boolean(initialProject))
      ? "new"
      : null,
  );
  const [removing, setRemoving] = useState<Row | null>(null);
  /** The column whose records are open in the dialog (T-396). */
  const [viewing, setViewing] = useState<Row | null>(null);
  const [refusal, setRefusal] = useState<{ name: string; reason: string } | null>(
    null,
  );
  const active =
    MODULES.find((module) => module.key === selected) ?? MODULES[0];
  const needsProject = active.scope === "project";
  const canManage = can(active.manage);
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
  // different list, so "move up" would have nothing to swap with.
  const canReorder = Boolean(active.columnKind) && canManage && Boolean(project);
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
      <FieldWrapper label={ops("field.project")} required={needsProject} className="rounded-lg border bg-card px-3 py-2 shadow-sm">
        <ProjectPicker
          value={project}
          onValueChange={(next) => setProject(next === "all" ? "" : next)}
          placeholder={ops("field.selectProject")}
          allowAll
          allLabel={ops("field.allProjects")}
          className="w-full sm:w-72"
        />
      </FieldWrapper>
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
            <div className="ml-auto">{createButton}</div>
          </header>
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
                        <button
                          type="button"
                          onClick={() => setViewing(row)}
                          className="text-left text-primary underline-offset-4 hover:underline"
                        >
                          {row.name}
                        </button>
                        {/* The weight a phase carries (D-127). */}
                        {row.note && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {t("weight", { weight: row.note })}
                          </span>
                        )}
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
 * One switch rather than one generic form: each table has fields the others
 * do not - a column's access and budget, a phase's progress weight, a waste
 * category's dispatch type - and a form that pretended otherwise would either
 * drop them or show fields that do nothing.
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
  if (module.key === "document") {
    return (
      <DocumentCategoryDialog
        category={row?.document ?? null}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  }
  if (module.key === "phase") {
    return (
      <PhaseDialog
        project={project}
        phase={row?.phase}
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
  const root = useTranslations();
  const unitName = (unit: string) =>
    unit && root.has(`receipts.unit.${unit}`) ? root(`receipts.unit.${unit}`) : unit;
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

  const records = useQuery({
    queryKey: ["category-records", moduleKey, column.id, page],
    queryFn: () =>
      getCategoryRecords({
        module: moduleKey,
        category: column.id,
        page,
        page_size: RECORDS_PAGE_SIZE,
      }),
  });
  const rows = records.data?.results ?? [];
  const total = records.data?.count ?? 0;
  const groups = records.data?.groups ?? [];
  const lastPage = Math.max(1, Math.ceil(total / RECORDS_PAGE_SIZE));

  return (
    <>
      <Shell title={t("records.title", { name: column.name })} onClose={onClose}>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <p className="text-xs text-muted-foreground">{t("records.help")}</p>
          {records.isLoading ? (
            <p className="text-sm text-muted-foreground">{queue("loading")}</p>
          ) : records.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {queue("failed")}
            </p>
          ) : rows.length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              <Inbox className="size-4" />
              {t("records.empty")}
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
                    <button
                      type="button"
                      onClick={() => setOpen(row)}
                      className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-muted/40"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {row.reference}
                        </span>
                        {row.detail && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {row.detail}
                          </span>
                        )}
                        <span className="block text-xs text-muted-foreground">
                          {[
                            // A consultant submission is a site record in the
                            // tables, and a 顾问资料提交 to everyone who files
                            // one - the phone's own name for it (D-274).
                            moduleKey === "consultant" && row.kind === "SITE_RECORD"
                              ? root("fieldStaffPwa.records.consultant")
                              : queue(`kind.${row.kind}`),
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
                    </button>
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
      {open && (
        <RecordSheet
          row={open}
          fetchRecord={getCategoryRecord}
          onClose={() => {
            setOpen(null);
            // A confirmation or a mark made in the sheet changes this list.
            void qc.invalidateQueries({ queryKey: ["category-records"] });
          }}
        />
      )}
    </>
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
  const percent = column.budget_used_percent;
  const uncounted = column.spend_uncounted_deliveries ?? 0;
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
      {column.tracks_spend && column.budget_amount ? (
        <>
          <p
            className={`text-xs tabular-nums ${
              percent !== null && percent >= 100 ? "font-semibold text-destructive" : ""
            }`}
          >
            RM {column.spend_amount} / RM {column.budget_amount}
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
 * The document category form from the documents screen, in a dialog.
 *
 * The same form rather than a second copy of it: a company-wide list edited
 * through two forms is two chances for them to disagree.
 */
function DocumentCategoryDialog({
  category,
  onClose,
  onSaved,
}: {
  category: DocumentCategory | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("categoryManagement");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {/* The form carries its own visible heading. */}
        <DialogHeader className="sr-only">
          <DialogTitle>
            {t(category ? "dialogEdit" : "dialogCreate", {
              module: t("module.document"),
            })}
          </DialogTitle>
          <DialogDescription>{t("moduleHelp.document")}</DialogDescription>
        </DialogHeader>
        <DocumentCategoryForm
          category={category}
          onCancel={onClose}
          onDone={onSaved}
        />
      </DialogContent>
    </Dialog>
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
