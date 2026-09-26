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
  FolderOpen,
  ImagePlus,
  ListTree,
  Loader2,
  MapPin,
  Pencil,
  Plus,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { AddToPackageButton } from "@/components/contractor-ops/add-to-package";
import { FileIntoColumnDialog } from "@/components/contractor-ops/file-into-column";
import {
  EquipmentDialog,
  MovementDialog,
  OutgoingActions,
  OutgoingDetailDialog,
  OutgoingDialog,
  PhaseDialog,
  ProgressDialog,
  RejectOutgoingDialog,
  ReturnProcessingDialog,
  tone,
} from "@/components/contractor-ops/operations-workspaces";
import { useAuth } from "@/components/providers/auth-provider";
import { ExportButton } from "@/components/shared/export-button";
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
import {
  RecordDetailDialog,
  RecordDetailShell,
} from "@/components/shared/record-detail-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import { useUrlSelection } from "@/hooks/use-url-selection";
import type {
  ConstructionPhase,
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
  fileProgressRecord,
  getConstructionPhases,
  getEquipmentMovements,
  getEquipmentSummary,
  getMaterialOutgoing,
  getSiteEquipment,
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
  const list = useListQuery(["project", "status", "category", "uncategorised"]);
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
  const searchParams = useSearchParams();
  const [creating, setCreating] = useState(searchParams.get("create") === "1");
  // A task card links here with ?record=<id>.
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
        cell: ({ row }) => (
          <span className="tabular text-foreground">
            {row.original.reference_no}
          </span>
        ),
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
            {row.original.quantity} {row.original.unit}
          </span>
        ),
      },
      {
        accessorKey: "destination",
        meta: { label: t("field.destination") },
        header: () => <PlainHeader label={t("field.destination")} />,
        cell: ({ row }) => (
          <span
            className="block max-w-[180px] truncate"
            title={row.original.destination}
          >
            {row.original.destination}
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
    [t, tRoot, df],
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
        { key: "material_name", label: t("field.material") },
        { key: "quantity", label: t("field.quantity") },
        { key: "unit", label: t("field.unit") },
        { key: "destination", label: t("field.destination") },
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
        headerAction={
          can("material_outgoing.submit") ? (
            <CreateButton
              label={t("outgoing.add")}
              onClick={() => setCreating(true)}
            />
          ) : undefined
        }
        list={list}
        columns={columns}
        rows={rows.data?.results ?? []}
        totalCount={total}
        isLoading={rows.isLoading}
        isError={rows.isError}
        storageKey="material-outgoing"
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
      {creating && (
        <OutgoingDialog
          project={list.filters.project ?? ""}
          onClose={() => setCreating(false)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["material-outgoing"] });
            setCreating(false);
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
  const [moving, setMoving] = useState<SiteEquipment | null>(null);
  const [viewingMovement, setViewingMovement] =
    useState<EquipmentMovement | null>(null);
  const [viewingMachine, setViewingMachine] = useState<SiteEquipment | null>(
    null,
  );
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["site-equipment"] });
    void qc.invalidateQueries({ queryKey: ["equipment-movements"] });
    void qc.invalidateQueries({ queryKey: ["equipment-summary"] });
  };
  const title = tRoot("nav.submodule.siteEquipment");
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
        id: "equipment",
        meta: { label: t("field.name") },
        header: () => <PlainHeader label={t("field.name")} />,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="max-w-[200px] truncate font-medium text-foreground">
              {row.original.equipment_name}
            </p>
            <p className="tabular truncate text-xs text-muted-foreground">
              {row.original.equipment_code}
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
        accessorKey: "code",
        meta: { label: t("field.code") },
        header: sortable(t("field.code")),
        cell: ({ row }) => (
          <span className="tabular text-foreground">{row.original.code}</span>
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
          <StatusBadge
            label={t(`equipmentStatus.${row.original.status}`)}
            tone={tone(row.original.status)}
          />
        ),
      },
      {
        accessorKey: "category_name",
        meta: { label: t("field.equipmentColumn") },
        header: () => <PlainHeader label={t("field.equipmentColumn")} />,
        cell: ({ row }) => <Unfiled name={row.original.category_name} />,
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
        id: "identifier",
        meta: { label: t("field.registrationNo") },
        header: () => <PlainHeader label={t("field.registrationNo")} />,
        cell: ({ row }) =>
          row.original.registration_no ||
          row.original.serial_no ||
          t("state.noIdentifier"),
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

      {viewingMovement && (
        <RecordDetailDialog
          title={`${viewingMovement.equipment_code} - ${viewingMovement.equipment_name}`}
          description={`${t(`direction.${viewingMovement.direction}`)} · ${df.dateTime(viewingMovement.occurred_at)}`}
          exportRecord={{
            kind: "EQUIPMENT_MOVEMENT",
            recordId: viewingMovement.id,
            reference: `${viewingMovement.equipment_code}-${viewingMovement.direction}`,
          }}
          onClose={() => setViewingMovement(null)}
        >
          <RecordDetailShell
            reference={`${viewingMovement.equipment_code}-${viewingMovement.direction}`}
            facts={[
              {
                label: t("equipment.directionLabel"),
                value: (
                  <StatusBadge
                    label={t(`direction.${viewingMovement.direction}`)}
                    tone={
                      viewingMovement.direction === "ENTRY"
                        ? "positive"
                        : "neutral"
                    }
                  />
                ),
              },
              {
                label: t("field.project"),
                value: viewingMovement.project_name,
              },
              {
                label: t("field.name"),
                value: `${viewingMovement.equipment_code} - ${viewingMovement.equipment_name}`,
              },
              {
                label: t("field.quantity"),
                value: `${viewingMovement.quantity} ${viewingMovement.unit}`,
              },
              {
                label: t("equipment.occurredAt"),
                value: df.dateTime(viewingMovement.occurred_at),
              },
              {
                label: t("field.operator"),
                value: viewingMovement.operator_name,
              },
              {
                label: t("field.supplier"),
                value: viewingMovement.supplier_name,
              },
              {
                label: t("field.vehiclePlate"),
                value: viewingMovement.vehicle_plate,
              },
              ...(viewingMovement.notes
                ? [
                    {
                      label: t("field.notes"),
                      value: viewingMovement.notes,
                      wide: true,
                    },
                  ]
                : []),
            ]}
            photos={viewingMovement.photos.map((photo) => ({
              id: photo.id,
              url: photo.watermarked || photo.image,
              label: tRoot(
                `moduleTable.equipmentPhoto.${photo.kind in PHOTO_KIND ? photo.kind : "OTHER"}`,
              ),
              takenAt: photo.captured_at,
              latitude: viewingMovement.latitude,
              longitude: viewingMovement.longitude,
            }))}
            photoActions={
              can("equipment.manage") ? (
                <OfficeUpload
                  onUpload={async (files) => {
                    const fresh = await addEquipmentMovementPhotos(viewingMovement.id, files);
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
                    {viewingMovement.delivery_note_no || "—"}
                  </dd>
                  <dt className="text-muted-foreground">
                    {t("field.supplier")}
                  </dt>
                  <dd className="break-words font-medium">
                    {viewingMovement.supplier_name || "—"}
                  </dd>
                  <dt className="text-muted-foreground">
                    {t("field.vehiclePlate")}
                  </dt>
                  <dd className="font-medium">
                    {viewingMovement.vehicle_plate || "—"}
                  </dd>
                </dl>
              </section>
            }
            actions={
              <AddToPackageButton
                kind="EQUIPMENT_MOVEMENT"
                recordId={viewingMovement.id}
                projectId={viewingMovement.project}
                reference={`${viewingMovement.equipment_code} - ${viewingMovement.equipment_name}`}
              />
            }
            conversation={{
              kind: "EQUIPMENT_MOVEMENT",
              recordId: viewingMovement.id,
            }}
          />
        </RecordDetailDialog>
      )}

      {viewingMachine && (
        <RecordDetailDialog
          title={`${viewingMachine.code} - ${viewingMachine.name}`}
          description={t(`equipmentStatus.${viewingMachine.status}`)}
          onClose={() => setViewingMachine(null)}
        >
          <RecordDetailShell
            reference={viewingMachine.code}
            // Its own photographs and those from every entry and exit, on
            // one page (T-298, #20).
            photos={(viewingMachine.photos ?? []).map((shot) => ({
              id: shot.id,
              url: shot.url,
              label: shot.caption || tRoot(`moduleTable.equipmentPhotoSource.${shot.source}`),
              takenAt: shot.captured_at,
            }))}
            photoActions={
              can("equipment.manage") ? (
                <OfficeUpload
                  onUpload={async (files) => {
                    const fresh = await addEquipmentPhotos(viewingMachine.id, files);
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
                    label={t(`equipmentStatus.${viewingMachine.status}`)}
                    tone={tone(viewingMachine.status)}
                  />
                ),
              },
              { label: t("field.project"), value: viewingMachine.project_name },
              {
                label: t("field.registrationNo"),
                value: viewingMachine.registration_no,
              },
              { label: t("field.serialNo"), value: viewingMachine.serial_no },
              {
                label: t("field.supplier"),
                value: viewingMachine.supplier_name,
              },
              {
                label: t("field.quantity"),
                value: viewingMachine.quantity_on_site,
              },
              {
                label: t("field.equipmentColumn"),
                value: <Unfiled name={viewingMachine.category_name} />,
              },
              {
                label: t("field.certificateExpiresOn"),
                value: viewingMachine.certificate_expires_on
                  ? df.date(viewingMachine.certificate_expires_on)
                  : "—",
              },
              {
                label: t("field.insuranceExpiresOn"),
                value: viewingMachine.insurance_expires_on
                  ? df.date(viewingMachine.insurance_expires_on)
                  : "—",
              },
              ...(viewingMachine.description
                ? [
                    {
                      label: t("field.description"),
                      value: viewingMachine.description,
                      wide: true,
                    },
                  ]
                : []),
            ]}
            actions={
              can("equipment.capture") || can("equipment.manage") ? (
                <div className="flex flex-col gap-2">
                  {can("equipment.capture") && (
                    <Button onClick={() => setMoving(viewingMachine)}>
                      <Camera />
                      {t(
                        viewingMachine.status === "ON_SITE"
                          ? "equipment.recordExit"
                          : "equipment.recordEntry",
                      )}
                    </Button>
                  )}
                  {can("equipment.manage") && (
                    <Button
                      variant="outline"
                      onClick={() => setEditing(viewingMachine)}
                    >
                      <Pencil />
                      {t("action.edit")}
                    </Button>
                  )}
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
            setViewingMachine(null);
          }}
        />
      )}
      {moving && (
        <MovementDialog
          row={moving}
          onClose={() => setMoving(null)}
          onSaved={() => {
            refresh();
            setMoving(null);
            setViewingMachine(null);
          }}
        />
      )}
    </>
  );
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

export function SiteProgressOffice() {
  const t = useTranslations("contractorOps");
  const tRoot = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const qc = useQueryClient();
  const list = useListQuery([
    "project",
    "phase",
    "status",
    "category",
    "uncategorised",
  ]);
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
  const [addingPhase, setAddingPhase] = useState(false);
  const [editingPhase, setEditingPhase] = useState<ConstructionPhase | null>(
    null,
  );
  const searchParams = useSearchParams();
  const [addingRecord, setAddingRecord] = useState(
    searchParams.get("create") === "1",
  );
  const [viewing, setViewing] = useState<SiteProgressRecord | null>(null);
  const [filing, setFiling] = useState<SiteProgressRecord | null>(null);
  // The open record follows the list, so filing it shows the new column
  // without closing and reopening.
  const shown = viewing
    ? (rows.data?.results.find((row) => row.id === viewing.id) ?? viewing)
    : null;
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
        accessorKey: "category_name",
        meta: { label: t("field.category") },
        header: () => <PlainHeader label={t("field.category")} />,
        cell: ({ row }) => <Unfiled name={row.original.category_name} />,
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

  // The phases stay editable from the page, as they were on the cards: a
  // phase is what a progress record is measured against.
  const phaseStrip = (
    <>
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
      {(phases.data?.results ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(phases.data?.results ?? []).map((phase) => {
            const className = `rounded-full border px-2.5 py-0.5 text-xs font-medium ${phase.is_active ? "bg-card" : "bg-muted/40 text-muted-foreground line-through"}`;
            return can("progress.manage") ? (
              <button
                key={phase.id}
                type="button"
                title={t("progress.editPhase")}
                className={`${className} hover:bg-muted`}
                onClick={() => setEditingPhase(phase)}
              >
                {phase.code} · {phase.name}
              </button>
            ) : (
              <span key={phase.id} className={className}>
                {phase.code} · {phase.name}
              </span>
            );
          })}
        </div>
      )}
      {noPhases && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/20 px-3 py-2">
          <p className="text-sm text-muted-foreground">
            {t("progress.noPhasesHelp")}
          </p>
          {can("progress.manage") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddingPhase(true)}
            >
              <ListTree />
              {t("progress.addFirstPhase")}
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
            <div className="flex flex-wrap gap-2">
              <CreateButton
                variant="outline"
                label={t("progress.addPhase")}
                onClick={() => setAddingPhase(true)}
              />
              <CreateButton
                label={t("progress.addRecord")}
                icon={<Camera className="h-4 w-4" />}
                onClick={() => setAddingRecord(true)}
              />
            </div>
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
            <ColumnFilter list={list} kind="PROGRESS" />
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
              can("progress.confirm") ? (
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
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("filing.fileInto")}
                </h3>
                <p className="text-sm font-medium">
                  {shown.category_name || t("filing.unfiled")}
                </p>
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
                {/* Filing is the reviewer's judgement (D-108), and allowed
                    on a record of any status (T-231). */}
                {can("progress.confirm") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setFiling(shown)}
                  >
                    <FolderOpen />
                    {t("filing.action")}
                  </Button>
                )}
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
          />
        </RecordDetailDialog>
      )}

      {filing && (
        <FileIntoColumnDialog
          projectId={filing.project}
          kind="PROGRESS"
          current={filing.category ?? null}
          reference={reference(filing)}
          onFile={(category, reason) =>
            fileProgressRecord(filing.id, { category, reason })
          }
          onFiled={() => {
            void qc.invalidateQueries({ queryKey: ["site-progress"] });
            void qc.invalidateQueries({ queryKey: ["project-categories"] });
          }}
          onClose={() => setFiling(null)}
        />
      )}
      {editingPhase && (
        <PhaseDialog
          project={project}
          phase={editingPhase}
          onClose={() => setEditingPhase(null)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["construction-phases"] });
            setEditingPhase(null);
          }}
        />
      )}
      {addingPhase && (
        <PhaseDialog
          project={project}
          onClose={() => setAddingPhase(false)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["construction-phases"] });
            setAddingPhase(false);
          }}
        />
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
