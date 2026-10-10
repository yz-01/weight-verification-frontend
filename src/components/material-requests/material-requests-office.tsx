"use client";

/**
 * MR / Other Request, the office side (C01–C07, D02).
 *
 * The old 照片审批 entry, rebuilt. Three tabs:
 *
 * 1. **Requests** - every request with its own Request No., the columns the
 *    customer listed (C03) less type and project (D3: the top bar and the
 *    filter row already say them), + New Request, and the detail with its
 *    conversation, Approve and Return (C05) and the formal form's Preview,
 *    Print and Export PDF (C06).
 * 2. **Totals** - per project, material + specification + unit, the approved
 *    and the not-yet-approved quantities side by side, never added (C04).
 *    Not yet approved is pending only: a returned request is finished and is
 *    shown as history, not as something waiting (Q1).
 * 3. **Photo approvals** - the PHOTO site tasks this entry used to show,
 *    pending ones still decided here, and every earlier one still readable
 *    (D02). Nothing about them moved.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Check,
  Eye,
  FilePlus2,
  Loader2,
  Paperclip,
  RotateCcw,
  Settings2,
  UserCheck,
  XCircle,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { FieldDraft } from "@/components/field-staff/field-draft";
import { PhotoApprovals } from "@/components/field-staff/photo-approvals";
import { OptionListsDialog } from "@/components/material-requests/option-lists";
import { materialRequestReviewView } from "@/components/material-requests/review-gate";
import {
  MaterialRequestForm,
  type MaterialRequestPrefill,
  useUnitLabel,
} from "@/components/material-requests/request-form";
import { useAuth } from "@/components/providers/auth-provider";
import { ExportButton } from "@/components/shared/export-button";
import { FileActionButtons } from "@/components/shared/file-actions";
import { photoColumn, rowPhotos } from "@/components/shared/photo-thumb";
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
import { EmptyState, FieldWrapper, FilterBar, LoadFailed, StatusBadge } from "@/components/shared/page-primitives";
import { RecordDetailDialog, RecordDetailShell, RecordRecorder } from "@/components/shared/record-detail-shell";
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
import { useDateFormat } from "@/lib/dates";
import { recordConversationKey } from "@/lib/record-chat";
import {
  exportMaterialRequests,
  getMaterialRequest,
  getMaterialRequests,
  getMaterialRequestTotals,
  materialRequestFormFile,
  reassignMaterialRequestToMe,
  reviewMaterialRequest,
} from "@/services/material-request.service";

const TONE: Record<MaterialRequestStatus, "warning" | "positive" | "neutral"> = {
  SUBMITTED: "warning",
  APPROVED: "positive",
  // Finished, not waiting and not an alarm (Q1): grey, with its reason.
  RETURNED: "neutral",
};

type Tab = "requests" | "totals" | "photos";

export function MaterialRequestsOffice() {
  const t = useTranslations("materialRequest");
  const { can } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canRequests = can("material_request.view");
  const canPhotos = can("field_task.view");
  const tabs: Tab[] = [
    ...(canRequests ? (["requests", "totals"] as const) : []),
    ...(canPhotos ? (["photos"] as const) : []),
  ];
  const asked = searchParams.get("tab") as Tab | null;
  const tab: Tab = asked && tabs.includes(asked) ? asked : (tabs[0] ?? "requests");
  const chooseTab = (next: Tab) => {
    const params = new URLSearchParams();
    if (next !== "requests") params.set("tab", next);
    router.replace(params.size ? `/material-requests?${params.toString()}` : "/material-requests", { scroll: false });
  };

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
      {tab === "photos" && canPhotos && (
        <div className="space-y-4">
          <p className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">{t("photosNote")}</p>
          <PhotoApprovals />
        </div>
      )}
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
    "project", "status", "request_type", "material", "specification", "unit", "supplier", "manufacturer",
    "date_from", "date_to",
  ]);
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
        meta: { label: t("field.requestNo") },
        header: sortable(t("field.requestNo")),
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
      // D3: no request-type or project column - the top bar already names
      // the project and the filter row the type. An Other Request has no
      // material, so its material cell says so in grey instead of a dash.
      {
        accessorKey: "material_name",
        meta: { label: t("field.material") },
        header: sortable(t("field.material")),
        cell: ({ row }) =>
          row.original.request_type === "OTHER" ? (
            <span className="text-muted-foreground">{t("type.OTHER")}</span>
          ) : (
            row.original.material_name || <span className="text-muted-foreground">—</span>
          ),
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
        cell: ({ row }) => <span className="tabular font-medium">{row.original.quantity ?? "—"}</span>,
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
        { key: "request_type", label: t("field.requestType"), values: { MATERIAL: t("type.MATERIAL"), OTHER: t("type.OTHER") } },
        { key: "project_name", label: t("field.project") },
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
      ],
    });

  return (
    <>
      <ModuleRecordsTable
        title={title}
        countLabel={tRoot("moduleTable.count", { count: total })}
        headerAction={
          <div className="flex flex-wrap gap-2">
            {can("material_request.config") && (
              <Button variant="outline" onClick={() => setManaging(true)}>
                <Settings2 className="size-4" />
                {t("options.open")}
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
        storageKey="material-requests.v3"
        toolbar={
          <>
            <ProjectListFilter list={list} />
            <FilterSelect
              list={list}
              param="request_type"
              allLabel={t("allTypes")}
              options={(["MATERIAL", "OTHER"] as const).map((type) => ({ value: type, label: t(`type.${type}`) }))}
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
          onManageLists={can("material_request.config") ? () => setManaging(true) : undefined}
          onClose={() => setCreating(null)}
          onSaved={(row) => {
            setCreating(null);
            setViewing(row.id);
          }}
        />
      )}
      {managing && <OptionListsDialog onClose={() => setManaging(false)} />}
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
  onManageLists,
  onClose,
  onSaved,
}: {
  initialProject: string;
  prefill: MaterialRequestPrefill | null;
  onManageLists?: () => void;
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
            onManageLists={onManageLists}
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
  const takeOvers = row.decisions.filter((entry) => entry.decision === "REASSIGNED");

  return (
    <RecordDetailDialog title={row.request_no} description={`${row.project_name} · ${t(`type.${row.request_type}`)}`} onClose={onClose}>
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
                      material_name: row.material_name,
                      specification: row.specification,
                      quantity: row.quantity ?? "",
                      unit: row.unit,
                      remark: row.remark,
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
          { label: t("field.requestType"), value: t(`type.${row.request_type}`) },
          { label: t("field.project"), value: `${row.project_code} - ${row.project_name}` },
          ...(isMaterial
            ? [
                { label: t("field.material"), value: row.material_name },
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
                    <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
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
                source={{
                  load: () => materialRequestFormFile(row.id, locale, row.request_no),
                  title: t("preview.title", { reference: row.request_no }),
                }}
              />
            </div>
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
    </RecordDetailDialog>
  );
}

