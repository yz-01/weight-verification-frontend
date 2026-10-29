"use client";

/**
 * MR / Other Request, the office side (C01–C07, D02).
 *
 * Two tabs:
 *
 * 1. **Requests** - every request with its own Request No., the columns the
 *    customer listed (C03) less project (D3: the top bar says it) and with
 *    the request type back (I16, ID37: 「沿用现有申请类型表头」, filtered by
 *    the project's own types), + New Request, 「管理申请类型」, and the detail with its
 *    conversation, Approve and Return (C05) and the formal form's Preview,
 *    Print and Export PDF (C06).
 * 2. **Totals** - per project, material + specification + unit, the approved
 *    and the not-yet-approved quantities side by side, never added (C04).
 *    Not yet approved is pending only: a returned request is finished and is
 *    shown as history, not as something waiting (Q1).
 *
 * The photo tab that sat beside them was taken out (I17, ID38): a photo
 * submission is a field task, accepted or returned in the field-task list's
 * 待验收 view, and an old `?tab=photos` link opens that view.
 */

import { MaterialLinesChip, MaterialLinesTable } from "@/components/shared/material-lines";
import { requestShownLines } from "@/lib/material-lines";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Check,
  Eye,
  FilePlus2,
  Loader2,
  Pencil,
  RotateCcw,
  Send,
  Settings2,
  UserCheck,
  XCircle,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { FieldDraft } from "@/components/field-staff/field-draft";
import { RequestTypesDialog } from "@/components/material-requests/request-types-dialog";
import { requestTypeNameOptions } from "@/lib/request-types";
import { chosenReviewer, materialRequestReviewView } from "@/components/material-requests/review-gate";
import {
  MaterialRequestForm,
  type MaterialRequestPrefill,
  useUnitLabel,
} from "@/components/material-requests/request-form";
import { useAuth } from "@/components/providers/auth-provider";
import { ExportButton } from "@/components/shared/export-button";
import { FileActionButtons } from "@/components/shared/file-actions";
import { DeleteRecordButton, useNotArchivedReason } from "@/components/shared/delete-record-button";
import { MaterialRequestEditDialog } from "@/components/material-requests/material-request-edit";
import { photoColumn, rowPhotos } from "@/components/shared/photo-thumb";
import { FileThumbs } from "@/components/shared/file-thumbs";
import { RecordNo } from "@/components/shared/record-no";
import {
  ManufacturerCell,
  ManufacturerPicker,
  hideEmptyManufacturerColumn,
} from "@/components/shared/manufacturer-picker";
import { SupplierDateListFilter } from "@/components/shared/supplier-date-filter";
import { SupplierPicker } from "@/components/shared/supplier-picker";
import {
  FilterSelect,
  ModuleRecordsTable,
  PlainHeader,
  ProjectListFilter,
  sortable,
} from "@/components/shared/module-records-table";
import {
  EmptyState,
  FieldWrapper,
  FilterBar,
  LoadFailed,
  QueryFailedNote,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RecordDetailDialog, RecordDetailShell, RecordRecorder } from "@/components/shared/record-detail-shell";
import { RecordSendLog } from "@/components/shared/record-send-log";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import { useUrlSelection } from "@/hooks/use-url-selection";
import { ApiError } from "@/interfaces/api";
import {
  MATERIAL_REQUEST_STATUSES,
  type MaterialRequest,
  type MaterialRequestStatus,
} from "@/interfaces/material-request";
import { awaitingFieldTasksAddress } from "@/lib/awaiting-field-tasks";
import { useDateFormat } from "@/lib/dates";
import { recordConversationKey } from "@/lib/record-chat";
import {
  deleteMaterialRequest,
  exportMaterialRequests,
  getMaterialRequest,
  getMaterialRequests,
  getMaterialRequestTotals,
  materialRequestFormFile,
  managerDecideMaterialRequest,
  getMaterialRequestReviewerOptions,
  reassignMaterialRequestToMe,
  reviewMaterialRequest, exportMaterialRequestTotals, getRequestTypes } from "@/services/material-request.service";
import { LIST_FITS } from "@/lib/list-fits";

const TONE: Record<MaterialRequestStatus, "warning" | "positive" | "neutral"> = {
  SUBMITTED: "warning",
  APPROVED: "positive",
  // Finished, not waiting and not an alarm (Q1): grey, with its reason.
  RETURNED: "neutral",
};

type Tab = "requests" | "totals";

export function MaterialRequestsOffice() {
  const t = useTranslations("materialRequest");
  const { can } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canRequests = can("material_request.view");
  const tabs: Tab[] = canRequests ? ["requests", "totals"] : [];
  const asked = searchParams.get("tab");
  const tab: Tab = tabs.find((key) => key === asked) ?? tabs[0] ?? "requests";
  // The photo tab is gone (I17): its old link opens the field tasks waiting
  // for acceptance, for whoever can see them; anyone else gets the requests.
  const forwardPhotos = asked === "photos" && can("field_task.view");
  useEffect(() => {
    if (forwardPhotos) router.replace(awaitingFieldTasksAddress(searchParams.toString()));
  }, [forwardPhotos, router, searchParams]);
  const chooseTab = (next: Tab) => {
    const params = new URLSearchParams();
    if (next !== "requests") params.set("tab", next);
    router.replace(params.size ? `/material-requests?${params.toString()}` : "/material-requests", { scroll: false });
  };

  if (forwardPhotos) return null;
  return (
    <div className="flex flex-col gap-4">
      {tabs.length > 1 && (
        <Tabs value={tab} onValueChange={(value) => chooseTab(value as Tab)}>
          <TabsList>
            {tabs.map((key) => (
              <TabsTrigger key={key} value={key}>
                {t(`tab.${key}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      {tab === "requests" && canRequests && <RequestsTab />}
      {tab === "totals" && canRequests && <TotalsTab onOpenGroup={(filters) => {
        const params = new URLSearchParams(filters);
        router.replace(`/material-requests?${params.toString()}`, { scroll: false });
      }} />}
      {tabs.length === 0 && <p className="text-sm text-muted-foreground">{t("noAccess")}</p>}
    </div>
  );
}

function RequestsTab() {
  const t = useTranslations("materialRequest");
  const tRoot = useTranslations();
  const df = useDateFormat();
  const unitLabel = useUnitLabel();
  const { can } = useAuth();
  const list = useListQuery([
    "project", "status", "request_type", "request_kind", "request_kind_name", "material", "specification",
    "unit", "supplier", "manufacturer", "date_from", "date_to",
  ]);
  // The type filter (ID37): the chosen project's own types, or on 全部项目
  // each name once (设备申请 on every site).
  const typeFilter = useRequestTypeFilter(list.filters.project ?? "");
  // A type chosen on another project is not this project's: let it go, or the
  // list would be empty with nothing on screen saying why.
  const { setFilter } = list;
  const chosenKind = list.filters.request_kind;
  useEffect(() => {
    if (!chosenKind || !typeFilter.ready) return;
    if (typeFilter.param !== "request_kind" || !typeFilter.options.some((option) => option.value === chosenKind)) {
      setFilter("request_kind", undefined);
    }
  }, [chosenKind, typeFilter, setFilter]);
  const rows = useQuery({
    queryKey: ["material-requests", "office", list.query],
    queryFn: () => getMaterialRequests(list.query),
  });
  const [viewing, setViewing] = useUrlSelection("record");
  const [creating, setCreating] = useState<MaterialRequestPrefill | "blank" | null>(null);
  const [managing, setManaging] = useState(false);
  const total = rows.data?.count ?? 0;
  const title = tRoot("nav.material_requests");

  const columns = useMemo<ColumnDef<MaterialRequest, unknown>[]>(
    () => [
      {
        accessorKey: "request_no",
        // 记录编号 (I6).
        meta: { label: tRoot("recordNo.column") },
        header: sortable(tRoot("recordNo.column")),
        // Short number big, project small (2026-10 D4).
        cell: ({ row }) => <RecordNo value={row.original.request_no} />,
      },
      // The record's photograph beside its main column (E3).
      photoColumn<MaterialRequest>({
        label: tRoot("moduleTable.photos"),
        icon: FilePlus2,
        reference: (row) => row.request_no,
        // The stamped copies (Q30.1): a request's pictures carry the
        // watermark like every photograph the platform shows.
        photos: (row) => rowPhotos(row.attachments.filter((file) => file.is_image).map((file) => ({ id: file.id, watermarked: file.watermarked, caption: file.original_name, captured_at: file.uploaded_at })), row.request_no),
      }),
      // 申请类型 is back (I16, ID37: 「沿用现有申请类型表头」); no project
      // column - the top bar already names the project (D3).
      {
        id: "request_kind",
        meta: { label: t("field.requestType") },
        header: () => <PlainHeader label={t("field.requestType")} />,
        cell: ({ row }) => requestTypeName(row.original, t),
      },
      // The simple form's 申请事项 sits where a material would (ID48); an old
      // other request without one says its type in grey instead of a dash.
      {
        accessorKey: "material_name",
        meta: { label: t("field.materialOrSubject") },
        header: sortable(t("field.materialOrSubject")),
        cell: ({ row }) => (
          <>
            <span className="block">
              {row.original.request_type === "OTHER" ? (
                row.original.subject || <span className="text-muted-foreground">{t("type.OTHER")}</span>
              ) : (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {row.original.material_name || <span className="text-muted-foreground">—</span>}
                  {/* 「2 种材料」 (J35): one request, several materials. */}
                  <MaterialLinesChip lines={requestShownLines(row.original)} />
                </span>
              )}
            </span>
            {/* 材料编号 and the spec under the material (I39), so the list
                fits without their own columns, which 「栏位」 still offers. */}
            <MaterialSubLine code={row.original.category_code} spec={row.original.specification} />
          </>
        ),
      },
      // 材料编号 (I19-15): the category's code; toggled in 「栏位」.
      {
        id: "category_code",
        meta: { label: t("field.materialCode") },
        header: () => <PlainHeader label={t("field.materialCode")} />,
        cell: ({ row }) => row.original.category_code || <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: "specification",
        meta: { label: t("field.specification") },
        header: () => <PlainHeader label={t("field.specification")} />,
        cell: ({ row }) => row.original.specification || <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: "quantity",
        meta: { label: t("field.quantity") },
        header: sortable(t("field.quantity")),
        // The unit beside the number (I39); its own column is in 「栏位」.
        cell: ({ row }) => (
          <span className="tabular font-medium">
            {row.original.quantity ?? "—"}
            {row.original.quantity != null && row.original.unit ? ` ${unitLabel(row.original.unit)}` : ""}
          </span>
        ),
      },
      {
        accessorKey: "unit",
        meta: { label: t("field.unit") },
        header: () => <PlainHeader label={t("field.unit")} />,
        cell: ({ row }) => (row.original.unit ? unitLabel(row.original.unit) : "—"),
      },
      // 业主指定厂商 and who sells it (2026-10 D1, D3; 2026-10-10): the
      // supplier is settled on approval; the named manufacturer only when the
      // owner names one, so its column shows only when a row in view has one.
      {
        accessorKey: "manufacturer_name",
        meta: { label: t("field.manufacturer") },
        header: () => <PlainHeader label={t("field.manufacturer")} />,
        cell: ({ row }) => <ManufacturerCell name={row.original.manufacturer_name} />,
      },
      {
        accessorKey: "supplier_name",
        meta: { label: t("field.supplier") },
        header: () => <PlainHeader label={t("field.supplier")} />,
        cell: ({ row }) => row.original.supplier_name || <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: "submitted_by_name",
        meta: { label: t("field.submittedBy") },
        header: () => <PlainHeader label={t("field.submittedBy")} />,
        cell: ({ row }) => row.original.submitted_by_name || "—",
      },
      {
        accessorKey: "created_at",
        meta: { label: t("field.date") },
        header: sortable(t("field.date")),
        cell: ({ row }) => <span className="tabular text-muted-foreground">{df.dateTime(row.original.created_at)}</span>,
      },
      {
        id: "status",
        meta: { label: t("field.status") },
        header: () => <PlainHeader label={t("field.status")} />,
        cell: ({ row }) => <StatusBadge label={t(`status.${row.original.status}`)} tone={TONE[row.original.status]} />,
      },
      {
        id: "view",
        meta: { label: t("field.view") },
        header: () => <PlainHeader label={t("field.view")} />,
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={(event) => {
              event.stopPropagation();
              setViewing(row.original.id);
            }}
          >
            <Eye className="size-3.5" />
            {t("action.view")}
          </Button>
        ),
      },
    ],
    [t, tRoot, df, unitLabel, setViewing],
  );

  const runExport = (format: "xlsx" | "pdf") =>
    exportMaterialRequests({
      format,
      title,
      subtitle: tRoot("moduleTable.count", { count: total }),
      emptyLabel: t("empty"),
      query: list.query,
      columns: [
        { key: "request_no", label: t("field.requestNo") },
        { key: "request_kind_name", label: t("field.requestType") },
        { key: "project_name", label: t("field.project") },
        { key: "subject", label: t("field.subject") },
        { key: "category_code", label: t("field.materialCode") },
        { key: "material_name", label: t("field.material") },
        { key: "specification", label: t("field.specification") },
        { key: "quantity", label: t("field.quantity") },
        { key: "unit", label: t("field.unit") },
        { key: "manufacturer_name", label: t("field.manufacturer") },
        { key: "supplier_name", label: t("field.supplier") },
        { key: "submitted_by_name", label: t("field.submittedBy") },
        { key: "submitted_at", label: t("field.date") },
        {
          key: "status",
          label: t("field.status"),
          values: { SUBMITTED: t("status.SUBMITTED"), APPROVED: t("status.APPROVED"), RETURNED: t("status.RETURNED") },
        },
        { key: "decided_by_name", label: t("field.decidedBy") },
        { key: "decided_at", label: t("field.decidedAt") },
        { key: "decision_note", label: t("field.returnReason") },
        { key: "content", label: t("field.content") },
        { key: "remark", label: t("field.remark") },
      ],
    });

  return (
    <>
      <ModuleRecordsTable
        title={title}
        countLabel={tRoot("moduleTable.count", { count: total })}
        headerAction={
          <div className="flex flex-wrap gap-2">
            {(can("material_request.config") || can("category.manage")) && (
              <Button variant="outline" onClick={() => setManaging(true)}>
                <Settings2 className="size-4" />
                {t("types.open")}
              </Button>
            )}
            {can("material_request.submit") && (
              <Button onClick={() => setCreating("blank")}>
                <FilePlus2 className="size-4" />
                {t("action.new")}
              </Button>
            )}
          </div>
        }
        list={list}
        columns={hideEmptyManufacturerColumn(columns, rows.data?.results)}
        rows={rows.data?.results ?? []}
        totalCount={total}
        needsActionCount={rows.data?.needs_action_count}
        isLoading={rows.isLoading}
        isError={rows.isError}
        // New key (D3): an old saved column set must not bring back the dropped
        // columns, nor hide the manufacturer and supplier ones (D1).
        // `.v4` since the request type column came back (I16, ID37); `.v5`
        // since 材料编号 joined (I19-15), so a saved set shows it.
        storageKey={LIST_FITS.materialRequests.storageKey}
        phoneCard={LIST_FITS.materialRequests.phoneCard}
        // 加入资料包 (J30-2): ticked into a package while one is being put together.
        pack="MATERIAL_REQUEST"
        defaultHidden={LIST_FITS.materialRequests.hidden}
        toolbar={
          <>
            <ProjectListFilter list={list} />
            <FilterSelect
              list={list}
              param={typeFilter.param}
              allLabel={t("allTypes")}
              options={typeFilter.options}
            />
            <FilterSelect
              list={list}
              param="status"
              allLabel={tRoot("moduleTable.allStatuses")}
              options={MATERIAL_REQUEST_STATUSES.map((status) => ({ value: status, label: t(`status.${status}`) }))}
            />
            <TextFilter list={list} param="material" placeholder={t("filter.material")} />
            <TextFilter list={list} param="specification" placeholder={t("filter.specification")} />
            <SupplierDateListFilter list={list} showManufacturer />
            <ExportButton onExport={runExport} disabled={total === 0} />
          </>
        }
        onOpen={(row) => setViewing(row.id)}
      />
      {viewing && (
        <MaterialRequestDetail
          id={viewing}
          onClose={() => setViewing(null)}
          onRaiseAgain={(prefill) => {
            setViewing(null);
            setCreating(prefill);
          }}
        />
      )}
      {creating && (
        <NewRequestDialog
          initialProject={list.filters.project ?? ""}
          prefill={creating === "blank" ? null : creating}
          onClose={() => setCreating(null)}
          onSaved={(row) => {
            setCreating(null);
            setViewing(row.id);
          }}
        />
      )}
      {managing && (
        <RequestTypesDialog initialProject={list.filters.project ?? ""} onClose={() => setManaging(false)} />
      )}
    </>
  );
}

/** A filter box that writes to the URL when the person stops typing. */
function TextFilter({
  list,
  param,
  placeholder,
}: {
  list: ReturnType<typeof useListQuery>;
  param: string;
  placeholder: string;
}) {
  const [value, setValue] = useState(list.filters[param] ?? "");
  const current = list.filters[param] ?? "";
  const { setFilter } = list;
  useEffect(() => {
    if (value === current) return;
    const timer = setTimeout(() => setFilter(param, value.trim() || undefined), 400);
    return () => clearTimeout(timer);
  }, [value, current, param, setFilter]);
  return (
    <Input
      aria-label={placeholder}
      placeholder={placeholder}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      className="w-full sm:w-40"
    />
  );
}

export function NewRequestDialog({
  initialProject,
  prefill,
  onClose,
  onSaved,
}: {
  initialProject: string;
  prefill: MaterialRequestPrefill | null;
  onClose: () => void;
  onSaved: (row: MaterialRequest) => void;
}) {
  const t = useTranslations("materialRequest");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("form.title")}</DialogTitle>
          <DialogDescription>{prefill ? t("form.raiseAgainHelp") : t("form.help")}</DialogDescription>
        </DialogHeader>
        {/* A fresh draft for a re-raise, so the returned request's words do
            not overwrite a half-typed new one, and the other way round. */}
        <FieldDraft scope={prefill ? "material-request:again" : "material-request:new"}>
          <MaterialRequestForm
            initialProject={initialProject}
            prefill={prefill}
            // 「+ 增加材料」 on the desktop (J35).
            multiLine
            onCancel={onClose}
            onSaved={onSaved}
          />
        </FieldDraft>
      </DialogContent>
    </Dialog>
  );
}

function TotalsTab({ onOpenGroup }: { onOpenGroup: (filters: Record<string, string>) => void }) {
  const t = useTranslations("materialRequest");
  const tRoot = useTranslations();
  const unitLabel = useUnitLabel();
  const list = useListQuery(["project", "material", "specification"]);
  const totals = useQuery({
    queryKey: ["material-requests", "totals", list.filters],
    queryFn: () => getMaterialRequestTotals(list.filters),
  });
  const rows = totals.data ?? [];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("totals.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("totals.basis")}</p>
      </div>
      <FilterBar>
        <ProjectListFilter list={list} />
        <TextFilter list={list} param="material" placeholder={t("filter.material")} />
        <TextFilter list={list} param="specification" placeholder={t("filter.specification")} />
        {/* The totals on screen, as a file (H16, HD13). */}
        <ExportButton
          disabled={rows.length === 0}
          disabledReason={t("totals.basis")}
          title={t("totals.title")}
          onExport={(format) =>
            exportMaterialRequestTotals({
              format,
              title: t("totals.title"),
              subtitle: t("totals.basis"),
              query: list.filters,
              columns: [
                { key: "project_label", label: t("field.project") },
                { key: "material_name", label: t("field.material") },
                { key: "specification", label: t("field.specification") },
                { key: "unit", label: t("field.unit"), values: tRoot.raw("mySubmissions.unit") as Record<string, string> },
                { key: "approved_quantity", label: t("totals.approved") },
                { key: "approved_count", label: t("totals.approvedCount") },
                { key: "pending_quantity", label: t("totals.pending") },
                { key: "pending_count", label: t("totals.pendingCount") },
                { key: "returned_count", label: t("totals.returned") },
              ],
            })
          }
        />
      </FilterBar>
      {totals.isError ? (
        <LoadFailed what={t("totals.title")} onRetry={() => void totals.refetch()} />
      ) : totals.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : rows.length === 0 ? (
        <EmptyState title={t("totals.empty")} />
      ) : (
        <div className="surface-panel overflow-hidden rounded-xl">
          <Table className="min-w-180">
            <TableHeader>
              <TableRow>
                <TableHead>{t("field.project")}</TableHead>
                <TableHead>{t("field.material")}</TableHead>
                <TableHead>{t("field.specification")}</TableHead>
                <TableHead>{t("field.unit")}</TableHead>
                <TableHead className="tabular text-right">{t("totals.approved")}</TableHead>
                <TableHead className="tabular text-right">{t("totals.pending")}</TableHead>
                <TableHead className="tabular text-right">{t("totals.returned")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={`${row.project}|${row.material_name}|${row.specification}|${row.unit}`}
                  className="cursor-pointer"
                  onClick={() =>
                    onOpenGroup({
                      project: row.project,
                      material: row.material_name,
                      specification: row.specification,
                      unit: row.unit,
                    })
                  }
                >
                  <TableCell>{row.project_code} - {row.project_name}</TableCell>
                  <TableCell className="font-medium">{row.material_name}</TableCell>
                  <TableCell>{row.specification}</TableCell>
                  <TableCell>{unitLabel(row.unit)}</TableCell>
                  <TableCell className="tabular text-right">
                    <span className="tabular font-semibold text-success">{row.approved_quantity}</span>
                    <span className="block text-2xs text-muted-foreground">{t("totals.requests", { count: row.approved_count })}</span>
                  </TableCell>
                  <TableCell className="tabular text-right">
                    <span className="tabular font-semibold text-warning">{row.pending_quantity}</span>
                    <span className="block text-2xs text-muted-foreground">{t("totals.requests", { count: row.pending_count })}</span>
                  </TableCell>
                  <TableCell className="tabular text-right text-muted-foreground">
                    {t("totals.requests", { count: row.returned_count })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("totals.notStock")}</p>
    </section>
  );
}

export function MaterialRequestDetail({
  id,
  onClose,
  onRaiseAgain,
}: {
  id: string;
  onClose: () => void;
  onRaiseAgain: (prefill: MaterialRequestPrefill) => void;
}) {
  const t = useTranslations("materialRequest");
  const tFile = useTranslations("fileActions");
  const df = useDateFormat();
  const unitLabel = useUnitLabel();
  const locale = useLocale();
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ["material-requests", "detail", id], queryFn: () => getMaterialRequest(id) });
  const [returnArmed, setReturnArmed] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const draft = useTranslations("draftRecords");
  const notArchived = useNotArchivedReason();
  const [editingRequest, setEditingRequest] = useState(false);
  // Approving is the purchase (2026-10 D1, D2): who it is bought from, and
  // the 业主指定厂商 when the owner names one (optional since 2026-10-10).
  // Starts from what the applicant suggested; `null` = untouched.
  const [supplier, setSupplier] = useState<string | null>(null);
  const [manufacturer, setManufacturer] = useState<string | null>(null);
  const chosenSupplier = supplier ?? detail.data?.supplier ?? "";
  const chosenManufacturer = manufacturer ?? detail.data?.manufacturer ?? "";
  const review = useMutation({
    mutationFn: (decision: "APPROVED" | "RETURNED") =>
      reviewMaterialRequest(
        id,
        decision,
        decision === "RETURNED" ? reason.trim() : "",
        decision === "APPROVED" && detail.data?.request_type === "MATERIAL"
          ? { supplier: chosenSupplier, manufacturer: chosenManufacturer }
          : undefined,
      ),
    onSuccess: () => {
      setReturnArmed(false);
      setReason("");
      setError("");
      void qc.invalidateQueries({ queryKey: ["material-requests"] });
      // Deciding closes the request's conversation (C05): refetch so the
      // composer is replaced by the reason without a reload.
      void qc.invalidateQueries({ queryKey: recordConversationKey("MATERIAL_REQUEST", id) });
    },
    onError: (reasonError) => setError(reasonError instanceof ApiError ? reasonError.message : t("failed")),
  });
  // 「改派给我」 (D2, Q15): another approver takes it over, then decides it.
  const takeOver = useMutation({
    mutationFn: () => reassignMaterialRequestToMe(id),
    onSuccess: () => {
      setError("");
      void qc.invalidateQueries({ queryKey: ["material-requests"] });
    },
    onError: (reasonError) => setError(reasonError instanceof ApiError ? reasonError.message : t("failed")),
  });

  const row = detail.data;
  if (!row) {
    return (
      <RecordDetailDialog title={t("detailTitle")} onClose={onClose}>
        <div className="grid min-h-32 place-items-center">
          {detail.isError ? <p className="text-sm text-destructive">{t("failed")}</p> : <Loader2 className="size-7 animate-spin text-primary" />}
        </div>
      </RecordDetailDialog>
    );
  }
  const who = (name: string | null, at: string | null) => (name ? `${name}${at ? ` · ${df.dateTime(at)}` : ""}` : "—");
  const decided = row.status !== "SUBMITTED";
  const decidedLabel = row.status === "RETURNED" ? t("field.returnedBy") : t("field.approvedBy");
  const isMaterial = row.request_type === "MATERIAL";
  // The applicant never sees approve / return, whatever their role (D2);
  // an approver it was not sent to takes it over first (Q15).
  const reviewView = materialRequestReviewView(row, user?.id, can("material_request.review"));
  // 「等待 XXX 审批」: whose desk it is on. Requests from before D2 name nobody.
  const waitingLine = row.assigned_reviewer_name
    ? t("waitingFor", { name: row.assigned_reviewer_name })
    : null;
  const changeable =
    !decided && !user?.is_field_staff && reviewView !== "waiting";
  const takeOvers = row.decisions.filter((entry) => entry.decision === "REASSIGNED");
  // 「转呈总部」 (I12, ID29): the project manager sent it on.
  const forwards = row.decisions.filter((entry) => entry.decision === "FORWARDED");

  return (
    <RecordDetailDialog title={row.request_no} description={`${row.project_name} · ${requestTypeName(row, t)}`} onClose={onClose}>
      <RecordDetailShell
        reference={row.request_no}
        // 记录人 (E8): who recorded it, with a number to call.
        recorder={<RecordRecorder record={row} />}
        notices={
          row.status === "RETURNED" ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span>{t("returnedNotice")}</span>
              {can("material_request.submit") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onRaiseAgain({
                      project: row.project,
                      request_type: row.request_type,
                      request_kind: row.request_kind,
                      category: row.category,
                      spec_category: row.spec_category,
                      material_name: row.material_name,
                      specification: row.specification,
                      quantity: row.quantity ?? "",
                      unit: row.unit,
                      remark: row.remark,
                      subject: row.subject,
                      content: row.content,
                      lines: row.lines,
                    })
                  }
                >
                  <RotateCcw className="size-4" />
                  {t("action.raiseAgain")}
                </Button>
              )}
            </div>
          ) : null
        }
        facts={[
          { label: t("field.status"), value: <StatusBadge label={t(`status.${row.status}`)} tone={TONE[row.status]} /> },
          { label: t("field.requestType"), value: requestTypeName(row, t) },
          { label: t("field.project"), value: `${row.project_code} - ${row.project_name}` },
          // The simple form (ID48): what is asked for, and the details.
          ...(!isMaterial && row.subject ? [{ label: t("field.subject"), value: row.subject, wide: true }] : []),
          ...(!isMaterial && row.content ? [{ label: t("field.content"), value: row.content, wide: true }] : []),
          // Several materials (J35): each on its own row, approved together.
          ...(isMaterial && (row.line_count ?? 1) > 1
            ? [
                {
                  label: t("field.materials"),
                  wide: true,
                  value: <MaterialLinesTable lines={requestShownLines(row)} />,
                },
                { label: t("field.supplier"), value: row.supplier_name || "—" },
                { label: t("field.manufacturer"), value: row.manufacturer_name || "—" },
              ]
            : isMaterial
            ? [
                { label: t("field.material"), value: row.material_name },
                { label: t("field.materialCode"), value: row.category_code || "—" },
                { label: t("field.specification"), value: row.specification },
                { label: t("field.quantity"), value: `${row.quantity ?? "—"} ${unitLabel(row.unit)}` },
                { label: t("field.supplier"), value: row.supplier_name || "—" },
                { label: t("field.manufacturer"), value: row.manufacturer_name || "—" },
              ]
            : []),
          { label: t("field.submittedBy"), value: who(row.submitted_by_name, row.submitted_at) },
          ...(row.assigned_reviewer_name
            ? [{ label: t("field.assignedReviewer"), value: row.assigned_reviewer_name }]
            : []),
          {
            label: decided ? decidedLabel : t("field.decidedBy"),
            value: decided ? who(row.decided_by_name, row.decided_at) : t("pendingDecision"),
          },
          { label: t("field.remark"), value: row.remark || t("noRemark"), wide: true },
          ...(row.decision_note
            ? [{ label: row.status === "RETURNED" ? t("field.returnReason") : t("field.decisionNote"), value: row.decision_note, wide: true }]
            : []),
          ...(row.awaiting_manager
            ? [{ label: t("field.stage"), value: t("stage.manager") }]
            : []),
          ...(forwards.length
            ? [
                {
                  label: t("field.forwardHistory"),
                  wide: true,
                  value: (
                    <ul className="space-y-0.5">
                      {forwards.map((entry) => (
                        <li key={entry.id}>
                          {t("forwarded", {
                            by: entry.decided_by_name ?? "—",
                            at: df.dateTime(entry.decided_at),
                          })}
                          {entry.note ? ` · ${entry.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  ),
                },
              ]
            : []),
          // The record of every take-over (Q15 「留改派记录」).
          ...(takeOvers.length
            ? [
                {
                  label: t("field.reassignHistory"),
                  wide: true,
                  value: (
                    <ul className="space-y-0.5">
                      {takeOvers.map((entry) => (
                        <li key={entry.id}>
                          {entry.previous_reviewer_name
                            ? t("reassignedFrom", {
                                by: entry.decided_by_name ?? "—",
                                from: entry.previous_reviewer_name,
                                at: df.dateTime(entry.decided_at),
                              })
                            : t("reassigned", { by: entry.decided_by_name ?? "—", at: df.dateTime(entry.decided_at) })}
                        </li>
                      ))}
                    </ul>
                  ),
                },
              ]
            : []),
        ]}
        // Full size is the stamped copy (Q30.1); a picture without one is
        // not shown unstamped.
        photos={row.attachments
          .filter((file) => file.is_image && file.watermarked)
          .map((file) => ({ id: file.id, url: file.watermarked ?? "", label: file.original_name, takenAt: file.uploaded_at }))}
        panel={
          <section className="rounded-lg border bg-card p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("attachments.title")}</h3>
            {row.attachments.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("attachments.none")}</p>
            ) : (
              <ol className="space-y-1 text-xs">
                {row.attachments.map((file, index) => (
                  <li key={file.id} className="flex items-center gap-2">
                    {/* The file as a picture (J34-11): the stamped copy, never
                        the original (Q30.1); a PDF or other file its type. */}
                    <FileThumbs
                      files={[
                        {
                          id: file.id,
                          name: file.original_name,
                          thumbnail_url: file.is_image ? (file.watermarked ?? null) : null,
                          href: file.is_image ? (file.watermarked ?? null) : file.file,
                        },
                      ]}
                    />
                    {/* A picture opens as its stamped copy (Q30.1); a PDF or
                        other file as uploaded. */}
                    {file.is_image && !file.watermarked ? (
                      <span className="truncate text-muted-foreground">
                        {index + 1}. {file.original_name}
                      </span>
                    ) : (
                      <a href={file.is_image ? (file.watermarked ?? "") : file.file} target="_blank" rel="noreferrer" className="truncate text-primary underline-offset-2 hover:underline">
                        {index + 1}. {file.original_name}
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        }
        actions={
          <div className="space-y-2">
            {error && <p role="alert" className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">{error}</p>}
            {/* The formal form (C06) and, after it, the complete evidence
                (2026-10-10, 审批证据完整性): attachments' content, approval
                history, conversation. 预览 · 打印 · 导出 · 发送, as every
                exported file (PDF 统一操作规则). */}
            <div className="grid grid-cols-2 gap-1.5">
              <FileActionButtons
                label={tFile("completeEvidence")}
                labelHint={tFile("completeEvidenceHint")}
                // JB25: waiting for its decision, it is previewed only.
                blockedReason={decided ? undefined : notArchived}
                source={{
                  load: () => materialRequestFormFile(row.id, locale, row.request_no),
                  title: t("preview.title", { reference: row.request_no }),
                  project: row.project,
                  recordKind: "MATERIAL_REQUEST",
                  recordId: row.id,
                }}
              />
            </div>
            {/* JB25 (客户 10-26 事项 1): before its decision the applicant or an
                approver changes it in place, or deletes it with the PIN. */}
            {changeable && (
              <div className="flex flex-wrap gap-1.5" data-slot="material-request-draft-actions">
                <Button size="sm" variant="outline" onClick={() => setEditingRequest(true)}>
                  <Pencil />
                  {draft("edit")}
                </Button>
                <DeleteRecordButton
                  what={row.request_no}
                  onDelete={() => deleteMaterialRequest(row.id)}
                  onDeleted={() => {
                    void qc.invalidateQueries({ queryKey: ["material-requests"] });
                    onClose();
                  }}
                />
              </div>
            )}
            {editingRequest && <MaterialRequestEditDialog row={row} onClose={() => setEditingRequest(false)} />}
            {reviewView === "decide" && (
              <>
                {isMaterial && (
                  // D2 + D1: approving settles the supplier; the owner's
                  // named manufacturer is optional (2026-10-10). Returning
                  // needs neither.
                  <div className="space-y-2 rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">{t("approve.help")}</p>
                    <FieldWrapper label={t("field.supplier")} required>
                      <SupplierPicker
                        value={chosenSupplier}
                        onChange={setSupplier}
                        knownName={row.supplier_name}
                        placeholder={t("approve.chooseSupplier")}
                      />
                    </FieldWrapper>
                    <FieldWrapper label={t("field.manufacturer")}>
                      <ManufacturerPicker
                        value={chosenManufacturer}
                        onChange={setManufacturer}
                        knownName={chosenManufacturer === row.manufacturer ? row.manufacturer_name : null}
                      />
                    </FieldWrapper>
                  </div>
                )}
                <Button
                  className="w-full"
                  requires={
                    isMaterial
                      ? [[chosenSupplier, t("field.supplier")]]
                      : []
                  }
                  disabled={review.isPending}
                  onClick={() => review.mutate("APPROVED")}
                >
                  <Check />
                  {t("action.approve")}
                </Button>
                <label className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                  <Switch
                    checked={returnArmed}
                    onCheckedChange={(next) => {
                      setReturnArmed(next);
                      if (!next) setReason("");
                    }}
                    aria-label={t("action.armReturn")}
                  />
                  <span className="text-xs text-muted-foreground">{t("action.armReturnHelp")}</span>
                </label>
                {returnArmed && (
                  <FieldWrapper label={t("field.returnReason")} required>
                    <Textarea value={reason} onChange={(event) => setReason(event.target.value)} />
                    <Button
                      className="mt-2 w-full"
                      variant="destructive"
                      requires={[[reason.trim(), t("field.returnReason")]]}
                      disabled={review.isPending}
                      onClick={() => review.mutate("RETURNED")}
                    >
                      <XCircle />
                      {t("action.return")}
                    </Button>
                  </FieldWrapper>
                )}
              </>
            )}
            {reviewView === "manager" && (
              <ManagerForward
                requestId={row.id}
                project={row.project}
                onDone={() => {
                  setError("");
                  void qc.invalidateQueries({ queryKey: ["material-requests"] });
                  void qc.invalidateQueries({ queryKey: recordConversationKey("MATERIAL_REQUEST", id) });
                }}
                onError={(message) => setError(message)}
              />
            )}
            {reviewView === "takeOver" && (
              <div className="space-y-1.5">
                <p className="rounded-md border border-warning/25 bg-warning/5 px-2 py-1.5 text-xs">{waitingLine ?? t("waitingForReview")}</p>
                <Button className="w-full" variant="outline" disabled={takeOver.isPending} onClick={() => takeOver.mutate()}>
                  <UserCheck />
                  {t("action.reassignToMe")}
                </Button>
                <p className="text-xs text-muted-foreground">{t("reassignHelp")}</p>
              </div>
            )}
            {reviewView === "own" && (
              <p className="rounded-md border border-warning/25 bg-warning/5 px-2 py-1.5 text-xs">{waitingLine ?? t("ownRequestWaiting")}</p>
            )}
            {reviewView === "waiting" && (
              <p className="rounded-md border border-warning/25 bg-warning/5 px-2 py-1.5 text-xs">{waitingLine ?? t("waitingForReview")}</p>
            )}
          </div>
        }
        conversation={{ kind: "MATERIAL_REQUEST", recordId: row.id }}
      />
      {/* 发送记录 (JB65): every send of this record, to whom and whether it went. */}
      <RecordSendLog recordKind="MATERIAL_REQUEST" recordId={row.id} />
    </RecordDetailDialog>
  );
}

/** The request's type in the reader's words: the project's own name, or the old kind (I16). */
/**
 * The project manager's part (I12, ID29): 「提交总部审批」 - choose who at
 * head office approves, and send it on (same request, same number) - or
 * return it, behind its switch like every return.
 */
function ManagerForward({
  requestId,
  project,
  onDone,
  onError,
}: {
  requestId: string;
  project: string;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations("materialRequest");
  // The project manager's own list is head office's (`stage` HEAD_OFFICE).
  const options = useQuery({
    queryKey: ["material-request-reviewers", project],
    queryFn: () => getMaterialRequestReviewerOptions(project),
  });
  const rows = (options.data ?? []).filter((row) => row.stage !== "MANAGER");
  const [chosen, setChosen] = useState("");
  const target = chosenReviewer(rows, chosen);
  const [returnArmed, setReturnArmed] = useState(false);
  const [reason, setReason] = useState("");
  const decide = useMutation({
    mutationFn: (decision: "FORWARD" | "RETURNED") =>
      managerDecideMaterialRequest(requestId, decision, {
        assignedReviewer: target,
        note: decision === "RETURNED" ? reason.trim() : "",
      }),
    onSuccess: onDone,
    onError: (failure) => onError(failure instanceof ApiError ? failure.message : t("failed")),
  });
  return (
    <div className="space-y-2">
      <p className="rounded-md border border-warning/25 bg-warning/5 px-2 py-1.5 text-xs">{t("managerHelp")}</p>
      <FieldWrapper label={t("field.headOfficeReviewer")} required>
        <Select value={target || undefined} onValueChange={setChosen}>
          <SelectTrigger className="w-full" aria-label={t("field.headOfficeReviewer")}>
            <SelectValue placeholder={t("form.chooseReviewer")} />
          </SelectTrigger>
          <SelectContent position="popper">
            {rows.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <QueryFailedNote query={options} what={t("field.headOfficeReviewer")} />
      </FieldWrapper>
      <Button
        className="w-full"
        requires={[[target, t("field.headOfficeReviewer")]]}
        disabled={decide.isPending}
        onClick={() => decide.mutate("FORWARD")}
      >
        <Send />
        {t("action.forward")}
      </Button>
      <label className="flex items-center gap-2 rounded-md border px-2 py-1.5">
        <Switch
          checked={returnArmed}
          onCheckedChange={(next) => {
            setReturnArmed(next);
            if (!next) setReason("");
          }}
          aria-label={t("action.armReturn")}
        />
        <span className="text-xs text-muted-foreground">{t("action.armReturnHelp")}</span>
      </label>
      {returnArmed && (
        <FieldWrapper label={t("field.returnReason")} required>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} />
          <Button
            className="mt-2 w-full"
            variant="destructive"
            requires={[[reason.trim(), t("field.returnReason")]]}
            disabled={decide.isPending}
            onClick={() => decide.mutate("RETURNED")}
          >
            <XCircle />
            {t("action.return")}
          </Button>
        </FieldWrapper>
      )}
    </div>
  );
}

export function requestTypeName(
  row: Pick<MaterialRequest, "request_kind_name" | "request_type">,
  t: (key: string) => string,
): string {
  return row.request_kind_name || t(`type.${row.request_type}`);
}

/**
 * The list's type filter (I16, ID37): one project's types by id, or - on
 * 「全部项目」 - every visible project's types by name, each name once.
 */
function useRequestTypeFilter(project: string) {
  // query-failure: no types read leaves the old two kinds, which still filter
  const types = useQuery({
    queryKey: ["material-request-types", project || "all"],
    queryFn: () => getRequestTypes(project),
    staleTime: 60_000,
  });
  const rows = types.data;
  const t = useTranslations("materialRequest");
  return useMemo(() => {
    if (!rows) {
      return {
        ready: false,
        param: "request_type",
        options: (["MATERIAL", "OTHER"] as const).map((type) => ({ value: type, label: t(`type.${type}`) })),
      };
    }
    if (project) {
      return { ready: true, param: "request_kind", options: rows.map((row) => ({ value: row.id, label: row.name })) };
    }
    return { ready: true, param: "request_kind_name", options: requestTypeNameOptions(rows) };
  }, [rows, project, t]);
}

/** 材料编号 · 规格, one small grey line under the material; nothing when neither. */
function MaterialSubLine({ code, spec }: { code?: string | null; spec?: string | null }) {
  const text = [code, spec].filter(Boolean).join(" · ");
  if (!text) return null;
  return <span className="block text-muted-foreground">{text}</span>;
}
