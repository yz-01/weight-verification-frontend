"use client";

/**
 * The office pages of material outgoing, equipment movement and project
 * progress, in the receipt list's layout (图 4, T-370) with each record opening
 * on the shared detail shell (图 1／图 2, T-369).
 *
 * Only the office. The phone keeps the cards in `operations-workspaces.tsx`
 * (「手机端不受影响」), and every dialog and step button here is the one the
 * phone uses - imported, not copied - so the two cannot offer different steps
 * for the same record.
 *
 * Each title is the sidebar's own key (`nav.submodule.*`), so the page cannot
 * be called one thing while the menu calls it another (C-020 第 7 条, the
 * 材料收货／材料进场 complaint).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Camera,
  ImagePlus,
  ListTree,
  Loader2,
  MapPin,
  Pencil,
  Plus,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { MaterialTabs } from "@/components/receipts/material-tabs";
import {
  EquipmentMovementActions,
  movementTone,
} from "@/components/contractor-ops/equipment-applications";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { AddToPackageButton } from "@/components/contractor-ops/add-to-package";
import {
  EquipmentDialog,
  MovementDialog,
  OutgoingActions,
  OutgoingDetailDialog,
  ProgressDialog,
  RejectOutgoingDialog,
  ReturnProcessingDialog,
  tone,
} from "@/components/contractor-ops/operations-workspaces";
import { usePageTitle } from "@/components/layout/page-title-override";
import { useAuth } from "@/components/providers/auth-provider";
import { ExportButton } from "@/components/shared/export-button";
import { RecordNo } from "@/components/shared/record-no";
import { SupplierDateListFilter } from "@/components/shared/supplier-date-filter";
import { ManufacturerCell } from "@/components/shared/manufacturer-picker";
import { useUnitExportValues, useUnitName } from "@/hooks/use-material-units";
import {
  ColumnFilter,
  FilterSelect,
  ModuleRecordsTable,
  PlainHeader,
  ProjectListFilter,
  sortable,
  SummaryStrip,
} from "@/components/shared/module-records-table";
import { FieldWrapper, QueryFailedNote, StatusBadge, TypeBadge } from "@/components/shared/page-primitives";
import { useRecordArchived } from "@/components/shared/record-closure";
import {
  RecordDetailDialog,
  RecordDetailShell,
} from "@/components/shared/record-detail-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import { equipmentDirectionTitleKey } from "@/lib/equipment-title";
import { useUrlSelection } from "@/hooks/use-url-selection";
import type {
  EquipmentMovement,
  MaterialOutgoing,
  SiteEquipment,
  SiteProgressRecord,
} from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import {
  addEquipmentMovementPhotos,
  addEquipmentPhotos,
  exportEquipmentMovements,
  exportMaterialOutgoing,
  addProgressPhotos,
  addProgressRemark,
  exportSiteProgressRecords,
  getConstructionPhases,
  getEquipmentMovements,
  getEquipmentSummary,
  getMaterialOutgoing,
  getSiteEquipment,
  getSiteEquipmentItem,
  getSiteProgressRecords,
  getSiteProgressSummary,
  reviewMaterialOutgoing,
} from "@/services/contractor-ops.service";

const OUTGOING_STATES = [
  "PENDING",
  "APPROVED",
  "PROCESSED",
  "COMPLETED",
  "REJECTED",
] as const;
const PROGRESS_STATES = ["SUBMITTED", "CONFIRMED", "RETURNED"] as const;

/** The create button, top right, in the receipt list's shape. */
function CreateButton({
  label,
  onClick,
  icon = <Plus className="h-4 w-4" />,
  variant,
}: {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  variant?: "outline";
}) {
  return (
    <Button
      size="sm"
      variant={variant}
      className="rounded-full px-4 shadow-sm"
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );
}

/**
 * The office's 【上传文件】 under a record's photographs (D-209): choose, then
 * upload. One control for every record that takes office uploads here.
 */
function OfficeUpload({ onUpload }: { onUpload: (files: File[]) => Promise<unknown> }) {
  const t = useTranslations("contractorOps");
  const [files, setFiles] = useState<File[]>([]);
  const upload = useMutation({
    mutationFn: () => onUpload(files),
    onSuccess: () => setFiles([]),
  });
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-2">
      <FieldWrapper label={t("outgoing.uploadFiles")} required>
        <Input
          type="file"
          multiple
          accept="image/*"
          className="h-8 text-xs"
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
        />
      </FieldWrapper>
      <Button
        size="sm"
        requires={[[files.length > 0, t("outgoing.uploadFiles")]]}
        disabled={upload.isPending}
        onClick={() => upload.mutate()}
      >
        {upload.isPending ? <Loader2 className="animate-spin" /> : <ImagePlus />}
        {t("outgoing.uploadFiles")}
      </Button>
    </div>
  );
}

function Unfiled({ name }: { name: string | null | undefined }) {
  const t = useTranslations("moduleTable");
  return name ? (
    <span className="text-foreground">{name}</span>
  ) : (
    // Not blank: "not filed yet" is a backlog somebody acts on.
    <span className="text-muted-foreground">{t("unfiled")}</span>
  );
}

/* ------------------------------------------------------------------ */
/* 材料出场                                                             */
/* ------------------------------------------------------------------ */

export function MaterialOutgoingOffice() {
  const t = useTranslations("contractorOps");
  const tRoot = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const qc = useQueryClient();
  const list = useListQuery([
    "project",
    "status",
    "category",
    "uncategorised",
    "supplier",
    "manufacturer",
    "date_from",
    "date_to",
  ]);
  const unitName = useUnitName();
  const unitValues = useUnitExportValues();
  const rows = useQuery({
    queryKey: ["material-outgoing", "office", list.query],
    queryFn: () => getMaterialOutgoing(list.query),
  });
  const review = useMutation({
    mutationFn: ({
      id,
      status,
      note,
    }: {
      id: string;
      status: MaterialOutgoing["status"];
      note?: string;
    }) => reviewMaterialOutgoing(id, status, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["material-outgoing"] }),
  });
  // No 「新增退场申请」 and no `?create=1` here (2026-10 A1, X9): the site
  // applies on the phone; the office decides. A task card links here with
  // ?record=<id>.
  const [viewing, setViewing] = useUrlSelection("record");
  const [rejecting, setRejecting] = useState<MaterialOutgoing | null>(null);
  const [returning, setReturning] = useState<MaterialOutgoing | null>(null);
  const onReview = (
    row: MaterialOutgoing,
    status: MaterialOutgoing["status"],
  ) =>
    // A rejection asks for its reason first (D-211); the others are one press.
    status === "REJECTED"
      ? setRejecting(row)
      : review.mutate({ id: row.id, status, note: "" });
  const total = rows.data?.count ?? 0;
  const title = tRoot("nav.submodule.materialOutgoing");

  const columns = useMemo<ColumnDef<MaterialOutgoing, unknown>[]>(
    () => [
      {
        accessorKey: "reference_no",
        meta: { label: t("outgoing.referenceNo") },
        header: () => <PlainHeader label={t("outgoing.referenceNo")} />,
        // Short number big, project small (2026-10 D4).
        cell: ({ row }) => <RecordNo value={row.original.reference_no} />,
      },
      {
        accessorKey: "status",
        meta: { label: t("field.status") },
        header: sortable(t("field.status")),
        cell: ({ row }) => (
          <div className="min-w-0">
            <StatusBadge
              label={t(`outgoingStatus.${row.original.status}`)}
              tone={tone(row.original.status)}
            />
            {row.original.status === "REJECTED" && row.original.review_note ? (
              <p className="mt-1 max-w-64 truncate text-xs font-medium text-destructive">
                {row.original.review_note}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "category_name",
        meta: { label: t("field.category") },
        header: () => <PlainHeader label={t("field.category")} />,
        cell: ({ row }) => <Unfiled name={row.original.category_name} />,
      },
      {
        accessorKey: "captured_at",
        meta: { label: t("outgoing.capturedAt") },
        header: sortable(t("outgoing.capturedAt")),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {df.date(row.original.captured_at)}
          </span>
        ),
      },
      {
        accessorKey: "material_name",
        meta: { label: t("field.material") },
        header: sortable(t("field.material")),
        cell: ({ row }) => (
          <span
            className="block max-w-[200px] truncate font-medium text-foreground"
            title={row.original.material_name}
          >
            {row.original.material_name}
          </span>
        ),
      },
      {
        id: "quantity",
        meta: { label: t("field.quantity") },
        header: () => <PlainHeader label={t("field.quantity")} />,
        cell: ({ row }) => (
          <span className="tabular">
            {row.original.quantity} {unitName(row.original.unit, row.original.unit_label)}
          </span>
        ),
      },
      // The supplier it goes back to (2026-10 C7), in place of the
      // destination - since 10-02 a return goes to its supplier, and the
      // destination only repeated the supplier's name. Since C9 a return
      // may name none: 「—」.
      {
        accessorKey: "supplier_name",
        meta: { label: t("field.supplier") },
        header: () => <PlainHeader label={t("field.supplier")} />,
        cell: ({ row }) => (
          <span
            className="block max-w-[180px] truncate"
            title={row.original.supplier_name ?? ""}
          >
            {row.original.supplier_name || "—"}
          </span>
        ),
      },
      // Whose make (2026-10 D1), copied from the delivery it went back from.
      {
        accessorKey: "manufacturer_name",
        meta: { label: tRoot("manufacturers.column") },
        header: () => <PlainHeader label={tRoot("manufacturers.column")} />,
        cell: ({ row }) => (
          <span className="block max-w-[200px]">
            <ManufacturerCell
              name={row.original.manufacturer_name}
              offList={row.original.manufacturer_off_list}
            />
          </span>
        ),
      },
      {
        accessorKey: "executor_name",
        meta: { label: t("outgoing.executor") },
        header: () => <PlainHeader label={t("outgoing.executor")} />,
      },
      {
        accessorKey: "project_name",
        meta: { label: t("field.project") },
        header: () => <PlainHeader label={t("field.project")} />,
        cell: ({ row }) => (
          <p className="max-w-[180px] truncate">{row.original.project_name}</p>
        ),
      },
      {
        id: "photos",
        meta: { label: tRoot("moduleTable.photos") },
        header: () => <PlainHeader label={tRoot("moduleTable.photos")} />,
        cell: ({ row }) => (
          <TypeBadge label={String(row.original.photos.length)} />
        ),
      },
    ],
    [t, tRoot, df, unitName],
  );

  const runExport = (format: "xlsx" | "pdf") =>
    exportMaterialOutgoing({
      format,
      title,
      subtitle: tRoot("moduleTable.count", { count: total }),
      emptyLabel: t("state.empty"),
      query: list.query,
      columns: [
        { key: "reference_no", label: t("outgoing.referenceNo") },
        { key: "category_name", label: t("field.category") },
        // Who it went back to (2026-10 C7).
        { key: "supplier_name", label: t("field.supplier") },
        { key: "manufacturer_name", label: tRoot("manufacturers.column") },
        { key: "material_name", label: t("field.material") },
        { key: "quantity", label: t("field.quantity") },
        { key: "unit", label: t("field.unit"), values: unitValues },
        { key: "destination", label: t("field.destination") },
        // DO and plate head every record that has them (2026-10 C12).
        { key: "delivery_note_no", label: t("field.deliveryNote") },
        { key: "vehicle_plate", label: t("field.vehiclePlate") },
        {
          key: "status",
          label: t("field.status"),
          values: Object.fromEntries(
            [...OUTGOING_STATES, "RELEASED"].map((state) => [
              state,
              t(`outgoingStatus.${state}`),
            ]),
          ),
        },
        { key: "submitted_by_name", label: t("outgoing.submittedBy") },
        { key: "captured_at", label: t("outgoing.capturedAt") },
        // The Return Note it was approved on (2026-10 C9).
        { key: "return_note_no", label: t("returnNote.number") },
        { key: "approver_name", label: t("returnNote.approverName") },
      ],
      summary: {
        groupBy: "unit",
        title: tRoot("exportTotals.title"),
        unitLabel: t("field.unit"),
        quantityLabel: tRoot("exportTotals.quantity"),
        note: tRoot("exportTotals.note"),
      },
    });

  return (
    <>
      <ModuleRecordsTable
        title={title}
        countLabel={tRoot("moduleTable.count", { count: total })}
        // Material Out in 材料管理's views (B09, C14), with the supplier and
        // date filter beside them (B5). Returns typed 退场 on the receipt
        // form before 10-02 are listed on their own, one click away.
        above={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <MaterialTabs>
              <SupplierDateListFilter list={list} showManufacturer />
            </MaterialTabs>
            <Link href="/receipts?direction=OUT" className="text-xs text-primary underline-offset-2 hover:underline">
              {tRoot("receipts.tabs.legacyReturns")}
            </Link>
          </div>
        }
        list={list}
        columns={columns}
        rows={rows.data?.results ?? []}
        totalCount={total}
        isLoading={rows.isLoading}
        isError={rows.isError}
        // `.v2` with the manufacturer column (2026-10 D1).
        storageKey="material-outgoing.v2"
        toolbar={
          <>
            <ProjectListFilter list={list} />
            <ColumnFilter list={list} kind="MATERIAL" />
            <FilterSelect
              list={list}
              param="status"
              allLabel={tRoot("moduleTable.allStatuses")}
              options={OUTGOING_STATES.map((state) => ({
                value: state,
                label: t(`outgoingStatus.${state}`),
              }))}
            />
            {can("report.export") ? (
              <ExportButton onExport={runExport} disabled={total === 0} />
            ) : null}
          </>
        }
        onOpen={(row) => setViewing(row.id)}
      />
      {viewing && (
        <OutgoingDetailDialog
          id={viewing}
          onClose={() => setViewing(null)}
          renderActions={(current) => (
            <OutgoingActions
              row={current}
              pending={review.isPending}
              onReview={(status) => onReview(current, status)}
              onReturn={() => setReturning(current)}
            />
          )}
        />
      )}
      {rejecting && (
        <RejectOutgoingDialog
          row={rejecting}
          pending={review.isPending}
          onClose={() => setRejecting(null)}
          onConfirm={(note) => {
            review.mutate({ id: rejecting.id, status: "REJECTED", note });
            setRejecting(null);
          }}
        />
      )}
      {returning && (
        <ReturnProcessingDialog
          row={returning}
          onClose={() => setReturning(null)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["material-outgoing"] });
            void qc.invalidateQueries({ queryKey: ["my-submissions"] });
            setReturning(null);
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 设备进退场                                                           */
/* ------------------------------------------------------------------ */

/**
 * Two tables under one title: the movements, which are the records (what the
 * archive files as EQUIPMENT_MOVEMENT and what has a conversation), and the
 * register of machines they are recorded against. A tab rather than two
 * tables stacked, so the page keeps the receipt list's one-table shape.
 */
export function SiteEquipmentOffice() {
  const t = useTranslations("contractorOps");
  const tRoot = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const qc = useQueryClient();
  const list = useListQuery([
    "view",
    "project",
    "direction",
    "category",
    "uncategorised",
    "expiring",
    // One machine's entries and exits, from its profile (2026-10 B2).
    "equipment",
  ]);
  // The dashboard's expiring-certificates card links here with ?expiring=1,
  // which is a question about machines, so it opens the register.
  const expiring = list.filters.expiring === "1";
  const register = list.filters.view === "register" || expiring;
  const movements = useQuery({
    queryKey: ["equipment-movements", "office", list.query],
    queryFn: () => getEquipmentMovements(list.query),
    enabled: !register,
  });
  const machines = useQuery({
    queryKey: ["site-equipment", "office", list.query],
    queryFn: () => getSiteEquipment(list.query),
    enabled: register,
  });
  const summary = useQuery({
    queryKey: ["equipment-summary", list.filters.project ?? ""],
    queryFn: () => getEquipmentSummary(list.filters.project || undefined),
  });
  const searchParams = useSearchParams();
  const [creating, setCreating] = useState(searchParams.get("create") === "1");
  const [editing, setEditing] = useState<SiteEquipment | null>(null);
  // 「直接交接」 of an application made before the one-step flow (C8, Q27).
  // Nothing is applied for any more, entry or exit: the site records the
  // movement on the phone and the office accepts it here.
  const [moving, setMoving] = useState<{ machine: SiteEquipment; movement: EquipmentMovement } | null>(null);
  const [viewingMovement, setViewingMovement] =
    useState<EquipmentMovement | null>(null);
  const [viewingMachine, setViewingMachine] = useState<SiteEquipment | null>(
    null,
  );
  // A notification or a card links to one movement or one machine (C8, B14).
  const [linkedMovement, setLinkedMovement] = useUrlSelection("movement");
  const [linkedMachine, setLinkedMachine] = useUrlSelection("machine");
  // query-failure: a link to a movement that cannot be read leaves the list as it is.
  const linkedMovementQuery = useQuery({
    queryKey: ["equipment-movements", "one", linkedMovement],
    queryFn: () => getEquipmentMovements({ id: linkedMovement ?? "", page_size: 1 }),
    enabled: Boolean(linkedMovement) && !viewingMovement,
  });
  // query-failure: a link to a machine that cannot be read leaves the list as it is.
  const linkedMachineQuery = useQuery({
    queryKey: ["site-equipment", "one", linkedMachine],
    queryFn: () => getSiteEquipmentItem(linkedMachine ?? ""),
    enabled: Boolean(linkedMachine) && !viewingMachine,
  });
  const shownMovement =
    viewingMovement ?? (linkedMovement ? linkedMovementQuery.data?.results[0] ?? null : null);
  const shownMachine = viewingMachine ?? (linkedMachine ? linkedMachineQuery.data ?? null : null);
  const closeMovement = () => {
    setViewingMovement(null);
    setLinkedMovement(null);
  };
  const closeMachine = () => {
    setViewingMachine(null);
    setLinkedMachine(null);
  };
  // 「补齐档案」 from an entry waiting for acceptance (C8).
  const completeProfile = async (machineId: string) => {
    setEditing(await getSiteEquipmentItem(machineId));
  };
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["site-equipment"] });
    void qc.invalidateQueries({ queryKey: ["equipment-movements"] });
    void qc.invalidateQueries({ queryKey: ["equipment-summary"] });
  };
  // The title follows the direction being looked at (B14): a list of exits
  // is 「设备退场」, not 「设备进退场」, here, in the top bar and in the export.
  const directionTitleKey = equipmentDirectionTitleKey(
    list.filters.direction,
    register,
  );
  const directionTitle = directionTitleKey ? tRoot(directionTitleKey) : null;
  usePageTitle(directionTitle);
  const title = directionTitle ?? tRoot("nav.submodule.siteEquipment");
  const project = list.filters.project ?? "";

  const movementColumns = useMemo<ColumnDef<EquipmentMovement, unknown>[]>(
    () => [
      {
        accessorKey: "occurred_at",
        meta: { label: t("equipment.occurredAt") },
        header: sortable(t("equipment.occurredAt")),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <span className="tabular text-muted-foreground">
              {df.dateTime(row.original.occurred_at)}
            </span>
            {row.original.latitude && row.original.longitude ? (
              <MapPin
                className="h-3 w-3 text-success"
                aria-label={tRoot("moduleTable.located")}
              />
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "direction",
        meta: { label: t("equipment.directionLabel") },
        header: sortable(t("equipment.directionLabel")),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`direction.${row.original.direction}`)}
            tone={row.original.direction === "ENTRY" ? "positive" : "neutral"}
          />
        ),
      },
      {
        // 等待后台验收 / 已验收 / 未通过 (C8, Q27); an application from before
        // the one-step flow keeps its own state; rows from before 10-02 are
        // all handed over.
        id: "status",
        meta: { label: t("field.status") },
        header: () => <PlainHeader label={t("field.status")} />,
        cell: ({ row }) => (
          <StatusBadge
            label={t(`equipmentMovementStatus.${row.original.status ?? "COMPLETED"}`)}
            tone={movementTone(row.original.status)}
          />
        ),
      },
      {
        id: "equipment",
        meta: { label: t("field.name") },
        header: () => <PlainHeader label={t("field.name")} />,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="max-w-[200px] truncate font-medium text-foreground">
              {row.original.equipment_name}
            </p>
            <p className="tabular truncate text-xs text-muted-foreground">
              {row.original.equipment_registration_no || row.original.equipment_code}
            </p>
          </div>
        ),
      },
      {
        id: "quantity",
        meta: { label: t("field.quantity") },
        header: () => <PlainHeader label={t("field.quantity")} />,
        cell: ({ row }) => (
          <span className="tabular">
            {row.original.quantity} {row.original.unit}
          </span>
        ),
      },
      {
        accessorKey: "supplier_name",
        meta: { label: t("field.supplier") },
        header: () => <PlainHeader label={t("field.supplier")} />,
        cell: ({ row }) => row.original.supplier_name || "—",
      },
      {
        accessorKey: "delivery_note_no",
        meta: { label: t("field.deliveryNote") },
        header: () => <PlainHeader label={t("field.deliveryNote")} />,
      },
      {
        accessorKey: "operator_name",
        meta: { label: t("field.operator") },
        header: sortable(t("field.operator")),
      },
      {
        accessorKey: "project_name",
        meta: { label: t("field.project") },
        header: () => <PlainHeader label={t("field.project")} />,
        cell: ({ row }) => (
          <p className="max-w-[180px] truncate">{row.original.project_name}</p>
        ),
      },
      {
        id: "photos",
        meta: { label: tRoot("moduleTable.photos") },
        header: () => <PlainHeader label={tRoot("moduleTable.photos")} />,
        cell: ({ row }) => (
          <TypeBadge label={String(row.original.photos.length)} />
        ),
      },
    ],
    [t, tRoot, df],
  );

  const machineColumns = useMemo<ColumnDef<SiteEquipment, unknown>[]>(
    () => [
      {
        // 「编号」 is the plate (2026-10 A8, X4): what the office reads off the
        // machine. The register's own number stays underneath, short (D4).
        accessorKey: "code",
        meta: { label: t("field.plateNo") },
        header: sortable(t("field.plateNo")),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium text-foreground">
              {row.original.registration_no || t("state.noPlate")}
            </p>
            <RecordNo value={row.original.code} />
          </div>
        ),
      },
      {
        accessorKey: "name",
        meta: { label: t("field.name") },
        header: sortable(t("field.name")),
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {row.original.name}
          </span>
        ),
      },
      {
        accessorKey: "status",
        meta: { label: t("field.status") },
        header: sortable(t("field.status")),
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1">
            <StatusBadge
              label={t(`equipmentStatus.${row.original.status}`)}
              tone={tone(row.original.status)}
            />
            {/* An exit waiting for 验收 is still on site (Q27): both say so. */}
            {row.original.awaiting_acceptance && (
              <StatusBadge
                label={t(
                  row.original.awaiting_acceptance === "EXIT"
                    ? "equipment.exitWaiting"
                    : "equipment.entryWaiting",
                )}
                tone="warning"
              />
            )}
          </div>
        ),
      },
      {
        accessorKey: "category_name",
        meta: { label: t("field.equipmentColumn") },
        header: () => <PlainHeader label={t("field.equipmentColumn")} />,
        // 大类 › 小类 (X1); a 「新设备」 waits for the office to file it (C8).
        cell: ({ row }) => (
          <div className="min-w-0">
            {row.original.category_parent_name ? (
              <span className="text-foreground">
                {row.original.category_parent_name} › {row.original.category_name}
              </span>
            ) : (
              <Unfiled name={row.original.category_name} />
            )}
            {row.original.needs_profile && (
              <StatusBadge label={t("equipment.needsProfile")} tone="warning" />
            )}
          </div>
        ),
      },
      {
        accessorKey: "quantity_on_site",
        meta: { label: t("field.quantity") },
        header: () => <PlainHeader label={t("field.quantity")} />,
        cell: ({ row }) => (
          <span className="tabular">{row.original.quantity_on_site}</span>
        ),
      },
      {
        accessorKey: "project_name",
        meta: { label: t("field.project") },
        header: () => <PlainHeader label={t("field.project")} />,
        cell: ({ row }) => (
          <p className="max-w-[180px] truncate">{row.original.project_name}</p>
        ),
      },
    ],
    [t],
  );

  const runExport = (format: "xlsx" | "pdf") =>
    exportEquipmentMovements({
      format,
      title,
      subtitle: tRoot("moduleTable.count", {
        count: movements.data?.count ?? 0,
      }),
      emptyLabel: t("state.empty"),
      query: list.query,
      summary: {
        groupBy: "unit",
        title: tRoot("exportTotals.title"),
        unitLabel: t("field.unit"),
        quantityLabel: tRoot("exportTotals.quantity"),
        note: tRoot("exportTotals.note"),
      },
      columns: [
        { key: "occurred_at", label: t("equipment.occurredAt") },
        { key: "project_name", label: t("field.project") },
        { key: "equipment_code", label: t("field.code") },
        { key: "equipment_name", label: t("field.name") },
        {
          key: "direction",
          label: t("equipment.directionLabel"),
          values: { ENTRY: t("direction.ENTRY"), EXIT: t("direction.EXIT") },
        },
        { key: "quantity", label: t("field.quantity") },
        { key: "unit", label: t("field.unit") },
        { key: "supplier_name", label: t("field.supplier") },
        { key: "delivery_note_no", label: t("field.deliveryNote") },
        { key: "vehicle_plate", label: t("field.vehiclePlate") },
        { key: "operator_name", label: t("field.operator") },
      ],
    });

  const tabs = (
    <div className="flex flex-wrap items-center gap-3">
      <SummaryStrip
        items={
          summary.data || summary.isError
            ? (
                [
                  "today",
                  "month",
                  "year",
                  "project_total",
                  "quantity_on_site",
                ] as const
              ).map((key) => ({
                key,
                label: t(`equipment.summary.${key}`),
                value: summary.isError ? "—" : summary.data?.[key],
              }))
            : []
        }
      />
      <QueryFailedNote query={summary} what={t("what.equipmentSummary")} />
      {/* Opened from a machine's profile (B2): its entries and exits only. */}
      {list.filters.equipment && !register && (
        <p className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-xs">
          {t("equipment.oneMachineOnly")}
          <button
            type="button"
            className="font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => list.setFilter("equipment", undefined)}
          >
            {tRoot("moduleTable.showAll")}
          </button>
        </p>
      )}
      {expiring && (
        <p className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs">
          {tRoot("moduleTable.expiringOnly")}
          <button
            type="button"
            className="font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => list.setFilter("expiring", undefined)}
          >
            {tRoot("moduleTable.showAll")}
          </button>
        </p>
      )}
      <div className="ml-auto inline-flex w-fit rounded-lg border bg-muted/30 p-0.5 text-sm">
        {(["movements", "register"] as const).map((view) => {
          const active = (view === "register") === register;
          return (
            <button
              key={view}
              type="button"
              aria-pressed={active}
              className={`rounded-md px-3 py-1 font-medium transition ${active ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() =>
                list.setFilters({
                  view: view === "register" ? "register" : undefined,
                  // Each table has its own filters; carrying one across gives
                  // the other table a parameter it does not read.
                  direction: undefined,
                  category: undefined,
                  uncategorised: undefined,
                  expiring: undefined,
                  equipment: undefined,
                })
              }
            >
              {tRoot(`moduleTable.equipmentView.${view}`)}
            </button>
          );
        })}
      </div>
    </div>
  );

  const headerAction = can("equipment.manage") ? (
    <CreateButton
      label={t("equipment.add")}
      onClick={() => setCreating(true)}
    />
  ) : undefined;

  return (
    <>
      {register ? (
        <ModuleRecordsTable
          title={title}
          countLabel={tRoot("moduleTable.count", {
            count: machines.data?.count ?? 0,
          })}
          headerAction={headerAction}
          above={tabs}
          list={list}
          columns={machineColumns}
          rows={machines.data?.results ?? []}
          totalCount={machines.data?.count ?? 0}
          isLoading={machines.isLoading}
          isError={machines.isError}
          storageKey="site-equipment-register"
          toolbar={
            <>
              <ProjectListFilter list={list} />
              <ColumnFilter list={list} kind="EQUIPMENT" />
            </>
          }
          onOpen={setViewingMachine}
        />
      ) : (
        <ModuleRecordsTable
          title={title}
          countLabel={tRoot("moduleTable.count", {
            count: movements.data?.count ?? 0,
          })}
          headerAction={headerAction}
          above={tabs}
          list={list}
          columns={movementColumns}
          rows={movements.data?.results ?? []}
          totalCount={movements.data?.count ?? 0}
          isLoading={movements.isLoading}
          isError={movements.isError}
          storageKey="equipment-movements"
          toolbar={
            <>
              <ProjectListFilter list={list} />
              <ColumnFilter list={list} kind="EQUIPMENT" />
              <FilterSelect
                list={list}
                param="direction"
                allLabel={tRoot("moduleTable.allDirections")}
                options={(["ENTRY", "EXIT"] as const).map((direction) => ({
                  value: direction,
                  label: t(`direction.${direction}`),
                }))}
              />
              {can("report.export") ? (
                <ExportButton
                  onExport={runExport}
                  disabled={!movements.data?.count}
                />
              ) : null}
            </>
          }
          onOpen={setViewingMovement}
        />
      )}

      {shownMovement && (
        <RecordDetailDialog
          title={`${shownMovement.equipment_registration_no || shownMovement.equipment_code} - ${shownMovement.equipment_name}`}
          description={`${t(`direction.${shownMovement.direction}`)} · ${df.dateTime(shownMovement.occurred_at)}`}
          exportRecord={{
            kind: "EQUIPMENT_MOVEMENT",
            recordId: shownMovement.id,
            reference: `${shownMovement.equipment_code}-${shownMovement.direction}`,
          }}
          onClose={closeMovement}
        >
          <RecordDetailShell
            reference={`${shownMovement.equipment_code}-${shownMovement.direction}`}
            facts={[
              {
                label: t("equipment.directionLabel"),
                value: (
                  <StatusBadge
                    label={t(`direction.${shownMovement.direction}`)}
                    tone={
                      shownMovement.direction === "ENTRY"
                        ? "positive"
                        : "neutral"
                    }
                  />
                ),
              },
              {
                label: t("field.status"),
                value: (
                  <StatusBadge
                    label={t(`equipmentMovementStatus.${shownMovement.status ?? "COMPLETED"}`)}
                    tone={movementTone(shownMovement.status)}
                  />
                ),
              },
              ...(shownMovement.requested_by_name
                ? [{ label: t("equipment.requestedBy"), value: shownMovement.requested_by_name }]
                : []),
              ...(shownMovement.approved_by_name
                ? [
                    {
                      // 验收人 since the one-step flow (the office decides
                      // after the site); 审批人 on an application from before.
                      label: t(
                        acceptedAfterSubmission(shownMovement)
                          ? "equipment.acceptedBy"
                          : "equipment.reviewedBy",
                      ),
                      value: `${shownMovement.approved_by_name}${shownMovement.approved_at ? ` · ${df.dateTime(shownMovement.approved_at)}` : ""}`,
                    },
                  ]
                : []),
              ...(shownMovement.review_note
                ? [
                    {
                      label: t(
                        shownMovement.status === "REJECTED"
                          ? "equipment.acceptance.reason"
                          : "equipment.returnReason",
                      ),
                      value: shownMovement.review_note,
                      wide: true,
                    },
                  ]
                : []),
              {
                label: t("field.project"),
                value: shownMovement.project_name,
              },
              {
                label: t("field.name"),
                value: `${shownMovement.equipment_name} · ${shownMovement.equipment_registration_no || shownMovement.equipment_code}`,
              },
              // One movement is one machine (F3, Q27); a record from before
              // that in another quantity still says how many.
              ...(Number(shownMovement.quantity) !== 1
                ? [
                    {
                      label: t("field.quantity"),
                      value: `${shownMovement.quantity} ${shownMovement.unit}`,
                    },
                  ]
                : []),
              {
                label: t("equipment.occurredAt"),
                value: df.dateTime(shownMovement.occurred_at),
              },
              {
                label: t("field.operator"),
                value: shownMovement.operator_name,
              },
              {
                label: t("field.supplier"),
                value: shownMovement.supplier_name,
              },
              {
                label: t("field.vehiclePlate"),
                value: shownMovement.vehicle_plate,
              },
              ...(shownMovement.latitude && shownMovement.longitude
                ? [
                    {
                      label: t("field.location"),
                      value: `${shownMovement.latitude}, ${shownMovement.longitude}`,
                    },
                  ]
                : []),
              ...(shownMovement.notes
                ? [
                    {
                      // Why it went, for an exit (Q27); a remark otherwise.
                      label: t(
                        shownMovement.direction === "EXIT"
                          ? "equipment.exitReason"
                          : "field.notes",
                      ),
                      value: shownMovement.notes,
                      wide: true,
                    },
                  ]
                : []),
            ]}
            photos={shownMovement.photos.map((photo) => ({
              id: photo.id,
              url: photo.watermarked || photo.image,
              label: tRoot(
                `moduleTable.equipmentPhoto.${photo.kind in PHOTO_KIND ? photo.kind : "OTHER"}`,
              ),
              takenAt: photo.captured_at,
              latitude: shownMovement.latitude,
              longitude: shownMovement.longitude,
            }))}
            photoActions={
              can("equipment.manage") ? (
                <OfficeUpload
                  onUpload={async (files) => {
                    const fresh = await addEquipmentMovementPhotos(shownMovement.id, files);
                    setViewingMovement(fresh);
                    refresh();
                  }}
                />
              ) : null
            }
            panel={
              <section className="rounded-lg border bg-card p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {tRoot("moduleTable.deliveryPanel")}
                </h3>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">
                    {t("field.deliveryNote")}
                  </dt>
                  <dd className="break-words font-medium">
                    {shownMovement.delivery_note_no || "—"}
                  </dd>
                  <dt className="text-muted-foreground">
                    {t("field.supplier")}
                  </dt>
                  <dd className="break-words font-medium">
                    {shownMovement.supplier_name || "—"}
                  </dd>
                  <dt className="text-muted-foreground">
                    {t("field.vehiclePlate")}
                  </dt>
                  <dd className="font-medium">
                    {shownMovement.vehicle_plate || "—"}
                  </dd>
                </dl>
              </section>
            }
            signatures={(
              [
                ["siteSignature", shownMovement.receiver_signature],
                ["supplierSignature", shownMovement.supplier_signature],
              ] as const
            )
              .filter(([, source]) => Boolean(source))
              .map(([who, source]) => ({ label: t(`equipment.${who}`), url: source as string }))}
            actions={
              <div className="flex flex-col gap-2">
                {/* Accept an entry or an exit (C8, Q27), or hand over an
                    application from before directly (「直接交接」). */}
                <EquipmentMovementActions
                  movement={shownMovement}
                  onDone={(row) => setViewingMovement(row)}
                  onHandover={async (movement) => {
                    const machine = await getSiteEquipmentItem(movement.equipment);
                    setMoving({ machine, movement });
                  }}
                  onCompleteProfile={(machineId) => void completeProfile(machineId)}
                />
                <AddToPackageButton
                  kind="EQUIPMENT_MOVEMENT"
                  recordId={shownMovement.id}
                  projectId={shownMovement.project}
                  reference={`${shownMovement.equipment_code} - ${shownMovement.equipment_name}`}
                />
              </div>
            }
            conversation={{
              kind: "EQUIPMENT_MOVEMENT",
              recordId: shownMovement.id,
            }}
            // 【确认归档】 with the movement itself (C4), once it is done.
            closure={{ kind: "EQUIPMENT_MOVEMENT", recordId: shownMovement.id }}
          />
        </RecordDetailDialog>
      )}

      {shownMachine && (
        <RecordDetailDialog
          title={`${shownMachine.registration_no || shownMachine.code} - ${shownMachine.name}`}
          description={t(`equipmentStatus.${shownMachine.status}`)}
          onClose={closeMachine}
        >
          <RecordDetailShell
            reference={shownMachine.code}
            // Its own photographs and those from every entry and exit, on
            // one page (T-298, #20).
            photos={(shownMachine.photos ?? []).map((shot) => ({
              id: shot.id,
              url: shot.url,
              label: shot.caption || tRoot(`moduleTable.equipmentPhotoSource.${shot.source}`),
              takenAt: shot.captured_at,
            }))}
            photoActions={
              can("equipment.manage") ? (
                <OfficeUpload
                  onUpload={async (files) => {
                    const fresh = await addEquipmentPhotos(shownMachine.id, files);
                    setViewingMachine(fresh);
                    refresh();
                  }}
                />
              ) : null
            }
            facts={[
              {
                label: t("field.status"),
                value: (
                  <StatusBadge
                    label={t(`equipmentStatus.${shownMachine.status}`)}
                    tone={tone(shownMachine.status)}
                  />
                ),
              },
              { label: t("field.project"), value: shownMachine.project_name },
              // 车牌号码 (X4); the serial number is no longer shown.
              {
                label: t("field.plateNo"),
                value: shownMachine.registration_no || "—",
              },
              { label: t("field.code"), value: shownMachine.code },
              {
                label: t("field.supplier"),
                value: shownMachine.supplier_name,
              },
              {
                label: t("field.quantity"),
                value: shownMachine.quantity_on_site,
              },
              {
                label: t("field.equipmentSubClass"),
                value: shownMachine.category_parent_name ? (
                  `${shownMachine.category_parent_name} › ${shownMachine.category_name}`
                ) : (
                  <Unfiled name={shownMachine.category_name} />
                ),
              },
              {
                label: t("field.roadTaxExpiresOn"),
                value: shownMachine.road_tax_expires_on ? df.date(shownMachine.road_tax_expires_on) : "—",
              },
              {
                label: t("field.certificateExpiresOn"),
                value: shownMachine.certificate_expires_on
                  ? df.date(shownMachine.certificate_expires_on)
                  : "—",
              },
              {
                label: t("field.insuranceExpiresOn"),
                value: shownMachine.insurance_expires_on
                  ? df.date(shownMachine.insurance_expires_on)
                  : "—",
              },
              {
                label: t("field.pmaExpiresOn"),
                value: shownMachine.pma_expires_on ? df.date(shownMachine.pma_expires_on) : "—",
              },
              {
                label: t("field.permitExpiresOn"),
                value: shownMachine.permit_expires_on ? df.date(shownMachine.permit_expires_on) : "—",
              },
              ...(shownMachine.description
                ? [
                    {
                      label: t("field.description"),
                      value: shownMachine.description,
                      wide: true,
                    },
                  ]
                : []),
            ]}
            actions={
              can("equipment.capture") || can("equipment.manage") ? (
                <div className="flex flex-col gap-2">
                  {/* Recorded on the phone, accepted on the movement (Q27). */}
                  {shownMachine.awaiting_acceptance && (
                    <StatusBadge
                      label={t(
                        shownMachine.awaiting_acceptance === "EXIT"
                          ? "equipment.exitWaiting"
                          : "equipment.entryWaiting",
                      )}
                      tone="warning"
                    />
                  )}
                  {can("equipment.manage") && (
                    <Button
                      variant="outline"
                      onClick={() => setEditing(shownMachine)}
                    >
                      <Pencil />
                      {t("action.edit")}
                    </Button>
                  )}
                  {/* Its entries and exits (B2). */}
                  <Link
                    href={`/site-equipment?equipment=${shownMachine.id}`}
                    onClick={closeMachine}
                    className="text-center text-sm text-primary underline-offset-2 hover:underline"
                  >
                    {t("equipment.movementsLink")}
                  </Link>
                </div>
              ) : null
            }
          />
        </RecordDetailDialog>
      )}

      {creating && (
        <EquipmentDialog
          project={project}
          onClose={() => setCreating(false)}
          onSaved={() => {
            refresh();
            setCreating(false);
          }}
        />
      )}
      {editing && (
        <EquipmentDialog
          project={editing.project}
          equipment={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            refresh();
            setEditing(null);
            closeMachine();
            // The entry it was completed for can now be accepted (C8).
            if (shownMovement) {
              void getEquipmentMovements({ id: shownMovement.id, page_size: 1 }).then(
                (page) => page.results[0] && setViewingMovement(page.results[0]),
              );
            }
          }}
        />
      )}
      {moving && (
        <MovementDialog
          row={moving.machine}
          movement={moving.movement}
          onClose={() => setMoving(null)}
          onSaved={() => {
            refresh();
            setMoving(null);
            closeMachine();
            closeMovement();
          }}
        />
      )}
    </>
  );
}

/**
 * Whether the office decided after the site recorded it - an acceptance (C8,
 * Q27) - rather than approving an application before the handover (B13).
 */
function acceptedAfterSubmission(movement: EquipmentMovement) {
  if (!movement.approved_at || !movement.completed_at) return false;
  return new Date(movement.approved_at).getTime() >= new Date(movement.completed_at).getTime();
}

const PHOTO_KIND = {
  EQUIPMENT: 1,
  DELIVERY_NOTE: 1,
  VEHICLE: 1,
  OTHER: 1,
} as const;

/* ------------------------------------------------------------------ */
/* 工程进度                                                             */
/* ------------------------------------------------------------------ */

/**
 * The progress records, as a list (现场照片 → 进度记录, 2026-10 B17).
 *
 * `above` is the page's tabs: the record list is one view of the progress
 * page now. The phases are managed on the 施工分类 tab, so they are no longer
 * chips here.
 */
export function SiteProgressOffice({ above }: { above?: React.ReactNode } = {}) {
  const t = useTranslations("contractorOps");
  const tRoot = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const qc = useQueryClient();
  // No category filter (2026-10 B1, X5): progress has no categories.
  const list = useListQuery(["project", "phase", "status"]);
  const project = list.filters.project ?? "";
  const rows = useQuery({
    queryKey: ["site-progress", "office", list.query],
    queryFn: () => getSiteProgressRecords(list.query),
  });
  const phases = useQuery({
    queryKey: ["construction-phases", project],
    queryFn: () =>
      getConstructionPhases({ project: project || undefined, page_size: 200 }),
  });
  const summary = useQuery({
    queryKey: ["site-progress-summary", project],
    queryFn: () => getSiteProgressSummary(project || undefined),
  });
  const searchParams = useSearchParams();
  const [addingRecord, setAddingRecord] = useState(
    searchParams.get("create") === "1",
  );
  const [viewing, setViewing] = useState<SiteProgressRecord | null>(null);
  // The open record follows the list, so a photo or a remark added to it
  // shows without closing and reopening.
  const shown = viewing
    ? (rows.data?.results.find((row) => row.id === viewing.id) ?? viewing)
    : null;
  // A06: an archived progress record takes no more photographs.
  const shownArchived = useRecordArchived("PROGRESS", shown?.id);
  const total = rows.data?.count ?? 0;
  const title = tRoot("nav.submodule.progressRecords");
  const noPhases =
    !!project && !phases.isLoading && !phases.isError && !phases.data?.count;
  const reference = (row: SiteProgressRecord) =>
    `${row.phase_name} / ${row.percent_complete}%`;

  const columns = useMemo<ColumnDef<SiteProgressRecord, unknown>[]>(
    () => [
      {
        accessorKey: "captured_at",
        meta: { label: t("progress.capturedAt") },
        header: sortable(t("progress.capturedAt")),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <span className="tabular text-muted-foreground">
              {df.dateTime(row.original.captured_at)}
            </span>
            {row.original.latitude && row.original.longitude ? (
              <MapPin
                className="h-3 w-3 text-success"
                aria-label={tRoot("moduleTable.located")}
              />
            ) : null}
          </div>
        ),
      },
      {
        id: "phase__name",
        accessorFn: (row) => row.phase_name,
        meta: { label: t("field.phase") },
        header: sortable(t("field.phase")),
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {row.original.phase_name}
          </span>
        ),
      },
      {
        id: "percent_complete",
        meta: { label: t("field.percentComplete") },
        header: () => <PlainHeader label={t("field.percentComplete")} />,
        cell: ({ row }) => (
          <div className="flex w-28 items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${Math.min(100, Number(row.original.percent_complete))}%`,
                }}
              />
            </div>
            <span className="tabular text-xs">
              {row.original.percent_complete}%
            </span>
          </div>
        ),
      },
      {
        accessorKey: "status",
        meta: { label: t("field.status") },
        header: sortable(t("field.status")),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`progressStatus.${row.original.status}`)}
            tone={tone(row.original.status)}
          />
        ),
      },
      {
        accessorKey: "submitted_by_name",
        meta: { label: t("progress.submittedBy") },
        header: () => <PlainHeader label={t("progress.submittedBy")} />,
        cell: ({ row }) => row.original.submitted_by_name || "—",
      },
      {
        accessorKey: "project_name",
        meta: { label: t("field.project") },
        header: () => <PlainHeader label={t("field.project")} />,
        cell: ({ row }) => (
          <p className="max-w-[180px] truncate">{row.original.project_name}</p>
        ),
      },
      {
        id: "photos",
        meta: { label: tRoot("moduleTable.photos") },
        header: () => <PlainHeader label={tRoot("moduleTable.photos")} />,
        cell: ({ row }) => (
          <TypeBadge label={String(row.original.photos.length)} />
        ),
      },
    ],
    [t, tRoot, df],
  );

  const runExport = (format: "xlsx" | "pdf") =>
    exportSiteProgressRecords({
      format,
      title,
      subtitle: tRoot("moduleTable.count", { count: total }),
      emptyLabel: t("state.empty"),
      query: list.query,
      columns: [
        { key: "captured_at", label: t("progress.capturedAt") },
        { key: "project_name", label: t("field.project") },
        { key: "phase_name", label: t("field.phase") },
        { key: "percent_complete", label: t("field.percentComplete") },
        { key: "description", label: t("field.description") },
        {
          key: "status",
          label: t("field.status"),
          values: Object.fromEntries(
            PROGRESS_STATES.map((state) => [
              state,
              t(`progressStatus.${state}`),
            ]),
          ),
        },
        { key: "submitted_by_name", label: t("progress.submittedBy") },
        { key: "confirmed_by_name", label: t("progress.confirmedBy") },
        { key: "confirmed_at", label: t("progress.confirmedAt") },
        { key: "latitude", label: t("field.latitude") },
        { key: "longitude", label: t("field.longitude") },
      ],
    });

  // The running totals; the phases themselves are on the 施工分类 tab (B17).
  const phaseStrip = (
    <>
      {above}
      <SummaryStrip
        items={
          summary.data || summary.isError
            ? [
                ...(["today", "month", "year", "total"] as const).map((key) => ({
                  key,
                  label: t(`progress.summary.${key}`),
                  value: summary.isError ? "—" : summary.data?.[key],
                })),
                // One project at a time: the phases and their weights belong
                // to a project (D-127).
                ...(project
                  ? [
                      {
                        key: "weighted",
                        label: t("progress.summary.weighted"),
                        value:
                          summary.isError || summary.data?.weighted_progress == null
                            ? "—"
                            : `${summary.data.weighted_progress}%`,
                      },
                    ]
                  : []),
              ]
            : []
        }
      />
      <QueryFailedNote query={summary} what={t("what.progressSummary")} />
      <QueryFailedNote query={phases} what={t("what.phases")} />
      {noPhases && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/20 px-3 py-2">
          <p className="text-sm text-muted-foreground">
            {t("progress.noPhasesHelp")}
          </p>
          {can("progress.manage") && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/progress?tab=phases&project=${encodeURIComponent(project)}`}>
                <ListTree />
                {t("progress.addFirstPhase")}
              </Link>
            </Button>
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      <ModuleRecordsTable
        title={title}
        countLabel={tRoot("moduleTable.count", { count: total })}
        headerAction={
          can("progress.manage") ? (
            <CreateButton
              label={t("progress.addRecord")}
              icon={<Camera className="h-4 w-4" />}
              onClick={() => setAddingRecord(true)}
            />
          ) : undefined
        }
        above={phaseStrip}
        list={list}
        columns={columns}
        rows={rows.data?.results ?? []}
        totalCount={total}
        isLoading={rows.isLoading}
        isError={rows.isError}
        storageKey="site-progress"
        toolbar={
          <>
            <ProjectListFilter list={list} />
            <FilterSelect
              list={list}
              param="phase"
              allLabel={tRoot("moduleTable.allPhases")}
              options={(phases.data?.results ?? []).map((phase) => ({
                value: phase.id,
                label: `${phase.code} · ${phase.name}`,
              }))}
            />
            <FilterSelect
              list={list}
              param="status"
              allLabel={tRoot("moduleTable.allStatuses")}
              options={PROGRESS_STATES.map((state) => ({
                value: state,
                label: t(`progressStatus.${state}`),
              }))}
            />
            {can("report.export") ? (
              <ExportButton onExport={runExport} disabled={total === 0} />
            ) : null}
          </>
        }
        onOpen={setViewing}
      />

      {shown && (
        <RecordDetailDialog
          title={reference(shown)}
          description={shown.project_name}
          exportRecord={{
            kind: "PROGRESS",
            recordId: shown.id,
            reference: reference(shown),
          }}
          onClose={() => setViewing(null)}
        >
          <RecordDetailShell
            reference={reference(shown)}
            facts={[
              {
                label: t("field.status"),
                value: (
                  <StatusBadge
                    label={t(`progressStatus.${shown.status}`)}
                    tone={tone(shown.status)}
                  />
                ),
              },
              { label: t("field.project"), value: shown.project_name },
              { label: t("field.phase"), value: shown.phase_name },
              {
                label: t("field.percentComplete"),
                value: `${shown.percent_complete}%`,
              },
              {
                label: t("progress.submittedBy"),
                value: shown.submitted_by_name,
              },
              {
                label: t("progress.capturedAt"),
                value: df.dateTime(shown.captured_at),
              },
              ...(shown.confirmed_by_name
                ? [
                    {
                      label: t("progress.confirmedBy"),
                      value: `${shown.confirmed_by_name}${shown.confirmed_at ? ` · ${df.dateTime(shown.confirmed_at)}` : ""}`,
                    },
                  ]
                : []),
              {
                label: t("field.description"),
                value: shown.description || t("state.noDescription"),
                wide: true,
              },
              ...(shown.review_note
                ? [
                    {
                      label: tRoot("moduleTable.reviewNote"),
                      value: shown.review_note,
                      wide: true,
                    },
                  ]
                : []),
            ]}
            photos={shown.photos.map((photo, index) => ({
              id: photo.id,
              url: photo.watermarked || photo.image,
              label: photo.caption || `${t("field.photos")} ${index + 1}`,
              takenAt: photo.captured_at,
              latitude: shown.latitude,
              longitude: shown.longitude,
            }))}
            photoActions={
              can("progress.confirm") && !shownArchived ? (
                <OfficeUpload
                  onUpload={async (files) => {
                    const fresh = await addProgressPhotos(shown.id, files);
                    setViewing(fresh);
                    void qc.invalidateQueries({ queryKey: ["site-progress"] });
                  }}
                />
              ) : null
            }
            panel={
              <section className="rounded-lg border bg-card p-3">
                {/* A record filed before 2026-10 keeps its category, shown
                    as it was; nothing new is filed (B1). */}
                {shown.category_name && (
                  <>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("field.category")}
                    </h3>
                    <p className="text-sm font-medium">{shown.category_name}</p>
                  </>
                )}
                {(shown.remarks ?? []).length > 0 && (
                  <div className="mt-3 border-t pt-2">
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {tRoot("moduleTable.remarks")}
                    </h3>
                    <ul className="space-y-1.5">
                      {(shown.remarks ?? []).map((remark) => (
                        <li key={remark.id} className="text-xs">
                          <p className="whitespace-pre-wrap">{remark.body}</p>
                          <p className="text-muted-foreground">
                            {remark.author_name ?? "—"} · {df.dateTime(remark.created_at)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            }
            actions={
              <div className="flex flex-wrap gap-2">
                {can("progress.confirm") && (
                  <ProgressRemarkBox
                    onSave={async (body) => {
                      const fresh = await addProgressRemark(shown.id, body);
                      setViewing(fresh);
                      void qc.invalidateQueries({ queryKey: ["site-progress"] });
                    }}
                  />
                )}
                <AddToPackageButton
                  kind="PROGRESS"
                  recordId={shown.id}
                  projectId={shown.project}
                  reference={reference(shown)}
                />
              </div>
            }
            conversation={{ kind: "PROGRESS", recordId: shown.id }}
            // 【确认归档】 with the record itself (C4).
            closure={{ kind: "PROGRESS", recordId: shown.id }}
          />
        </RecordDetailDialog>
      )}

      {addingRecord && (
        <ProgressDialog
          project={project}
          onClose={() => setAddingRecord(false)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["site-progress"] });
            void qc.invalidateQueries({ queryKey: ["site-progress-summary"] });
            setAddingRecord(false);
          }}
        />
      )}
    </>
  );
}

/** 【备注】: write a note, save it; it stays on the record with who and when. */
function ProgressRemarkBox({ onSave }: { onSave: (body: string) => Promise<unknown> }) {
  const tRoot = useTranslations();
  const [body, setBody] = useState("");
  const save = useMutation({ mutationFn: () => onSave(body.trim()), onSuccess: () => setBody("") });
  return (
    <div className="w-full space-y-1.5">
      <FieldWrapper label={tRoot("moduleTable.remark")} required>
        <Textarea value={body} onChange={(event) => setBody(event.target.value)} />
      </FieldWrapper>
      <Button
        size="sm"
        variant="outline"
        requires={[[body.trim(), tRoot("moduleTable.remark")]]}
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {tRoot("moduleTable.addRemark")}
      </Button>
    </div>
  );
}
