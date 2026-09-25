"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarCheck2,
  Camera,
  CheckCircle2,
  Circle,
  ImagePlus,
  ListTree,
  Loader2,
  LocateFixed,
  Plus,
  Repeat,
  SendHorizonal,
  Scale,
  Truck,
  UserRoundCheck,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import type { ColumnDef } from "@tanstack/react-table";

import { AddToPackageButton } from "@/components/contractor-ops/add-to-package";
import { useAuth } from "@/components/providers/auth-provider";
import {
  FilterSelect,
  ModuleRecordsTable,
  PlainHeader,
  ProjectListFilter,
  sortable,
  SummaryStrip,
} from "@/components/shared/module-records-table";
import { RecordDetailDialog, RecordDetailShell } from "@/components/shared/record-detail-shell";
import { useListQuery } from "@/hooks/use-list-query";
import { FieldCamera } from "@/components/shared/field-camera";
import { PrintTicketButton } from "@/components/weighing/print-ticket-button";
import { ExportButton } from "@/components/shared/export-button";
import {
  FieldWrapper,
  LoadFailed,
  QueryFailedNote,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type {
  MilestoneKey,
  WasteCategory,
  WasteCollectionTask,
  WasteOutgoingRecord,
  WasteOutgoingStatus,
} from "@/interfaces/waste-outgoing";
import { ApiError } from "@/interfaces/api";
import { WASTE_UNITS } from "@/interfaces/waste-outgoing";
import { useDateFormat } from "@/lib/dates";
import { LocationMap } from "@/components/shared/location-map";
import { trackPaths } from "@/lib/track-paths";
import {
  addWasteOutgoingPhotos,
  assignWasteRecycler,
  createWasteCategory,
  deleteWasteCategory,
  updateWasteCategory,
  cancelWasteOutgoingRecord,
  confirmWasteCollectionPlan,
  createWasteOutgoingRecord,
  exportWasteOutgoingRecords,
  getRecyclerOptions,
  getWasteOutgoingOptions,
  getWasteOutgoingRecords,
  reassignWasteRecycler,
  getWasteOutgoingTotals,
  getWasteTracking,
  delegateWasteOutgoingReview,
  getWasteOutgoingDelegateOptions,
  reviewWasteOutgoingRequest,
  submitWasteCollectionRequest,
} from "@/services/waste-outgoing.service";

/** The eleven stages of 8.2.12, in the order the customer lists them. */
const MILESTONE_ORDER: MilestoneKey[] = [
  "ORDER_SENT",
  "RECYCLER_ACCEPTED",
  "DRIVER_ASSIGNED",
  "DRIVER_EN_ROUTE",
  "DRIVER_ARRIVED",
  "LOADED",
  "LEFT_SITE",
  "ARRIVED_AT_PLANT",
  "WEIGHED",
  "COMPLETED",
  "SETTLED",
];

const STATUS_TONE: Record<
  WasteOutgoingStatus,
  "neutral" | "info" | "warning" | "positive" | "danger"
> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  RETURNED: "danger",
  APPROVED: "positive",
  ORDERED: "info",
  IN_PROGRESS: "info",
  COMPLETED: "positive",
  CANCELLED: "danger",
};

type Coordinates = { latitude: string; longitude: string };

function getCoordinates(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      return reject(new Error("location_unavailable"));
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
        }),
      reject,
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

export function WasteOutgoingWorkspace() {
  const t = useTranslations("wasteOutgoing");
  // The cumulative-totals labels are shared across every module that has a
  // quantity, so they live at the root rather than in one module's namespace.
  const tRoot = useTranslations();
  const { can, user } = useAuth();
  const df = useDateFormat();
  const qc = useQueryClient();

  // Filters live in the address, as on the receipt list (图 4, T-370), so a
  // filtered view is a link somebody can send.
  const list = useListQuery(["project", "category", "status"]);
  const project = list.filters.project ?? "";
  const [viewing, setViewing] = useState<WasteOutgoingRecord | null>(null);
  const searchParams = useSearchParams();
  const [creating, setCreating] = useState(searchParams.get("create") === "1");
  const [assigning, setAssigning] = useState<WasteOutgoingRecord | null>(null);
  const [reassigning, setReassigning] = useState<WasteOutgoingRecord | null>(
    null,
  );
  const [reviewing, setReviewing] = useState<WasteOutgoingRecord | null>(null);
  const [handingOver, setHandingOver] = useState<WasteOutgoingRecord | null>(
    null,
  );
  // Head office decides everything by default and keeps that authority over
  // what it has handed on; everybody else decides exactly what was handed to
  // them. The API enforces this — showing the button to somebody who would be
  // refused is the part this line prevents.
  const mayDecide = (row: WasteOutgoingRecord) =>
    can("waste_outgoing.delegate") || row.delegated_to === user?.id;
  const [tracking, setTracking] = useState<WasteOutgoingRecord | null>(null);
  const [confirming, setConfirming] = useState<WasteOutgoingRecord | null>(null);
  const [cancelling, setCancelling] = useState<WasteOutgoingRecord | null>(null);
  const [addingPhotos, setAddingPhotos] = useState<WasteOutgoingRecord | null>(
    null,
  );
  const [managingCategories, setManagingCategories] = useState(false);

  /*
    Raising the collection request. 8.2.2 makes this the moment the office is
    told there is waste to collect - until now the record could be filed and
    then sat there, because nothing on any screen called this (F-101).
  */
  const submitRequest = useMutation({
    mutationFn: (id: string) => submitWasteCollectionRequest(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["waste-outgoing"] });
    },
  });

  const options = useQuery({
    queryKey: ["waste-outgoing", "options"],
    queryFn: getWasteOutgoingOptions,
  });
  const records = useQuery({
    queryKey: ["waste-outgoing", "records", list.query],
    queryFn: () => getWasteOutgoingRecords(list.query),
  });
  const totals = useQuery({
    queryKey: ["waste-outgoing", "totals", project],
    queryFn: () => getWasteOutgoingTotals(project || undefined),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["waste-outgoing"] });
  };

  const rows = records.data?.results ?? [];
  // Same three filters the list is using. The API exports the filtered
  // queryset, so the file matches what the person was looking at.
  const runExport = (format: "xlsx" | "pdf") =>
    exportWasteOutgoingRecords({
      format,
      title: t("title"),
      subtitle: t("subtitle"),
      emptyLabel: t("empty"),
      query: list.query,
      // Quantity *and* the number of collections, because D-219 asks waste to
      // accumulate 数量、车次、吨数 as the base data for ESG reporting later.
      summary: {
        groupBy: "unit",
        title: tRoot("exportTotals.title"),
        unitLabel: t("field.unit"),
        quantityLabel: tRoot("exportTotals.quantity"),
        countLabel: tRoot("exportTotals.collections"),
        note: tRoot("exportTotals.note"),
      },
      columns: [
        { key: "reference_no", label: t("field.dispatchNo") },
        { key: "captured_at", label: t("export.capturedAt") },
        { key: "project_name", label: t("field.project") },
        { key: "category_name", label: t("field.category") },
        { key: "quantity", label: t("field.quantity") },
        { key: "unit", label: t("field.unit") },
        {
          key: "status",
          label: t("export.status"),
          values: {
            DRAFT: t("status.DRAFT"),
            PENDING_APPROVAL: t("status.PENDING_APPROVAL"),
            RETURNED: t("status.RETURNED"),
            APPROVED: t("status.APPROVED"),
            ORDERED: t("status.ORDERED"),
            IN_PROGRESS: t("status.IN_PROGRESS"),
            COMPLETED: t("status.COMPLETED"),
            CANCELLED: t("status.CANCELLED"),
          },
        },
        { key: "recycler_name", label: t("field.recycler") },
        { key: "dispatch_no", label: t("export.dispatchNo") },
        { key: "recorded_by_name", label: t("export.recordedBy") },
      ],
    });
  const categories = (options.data?.categories ?? []).filter(
    (row) => row.is_active,
  );

  /*
    The buttons for one application, in the detail's right column (C-020:
    「那些按钮放在图 2 的圈起来的位置」). They used to sit on each card of the
    list; the list is a table now (图 4, T-370) and the record opens on the
    shared shell, so this is where they moved - not a second copy.
  */
  const renderActions = (row: WasteOutgoingRecord) => (
    <div className="flex flex-wrap gap-2">
      {row.status === "PENDING_APPROVAL" &&
        can("waste_outgoing.approve") &&
        mayDecide(row) && (
          <Button size="sm" variant="outline" onClick={() => setReviewing(row)}>
            <CheckCircle2 />
            {t("action.review")}
          </Button>
        )}
      {row.status === "PENDING_APPROVAL" && can("waste_outgoing.delegate") && (
        <Button size="sm" variant="outline" onClick={() => setHandingOver(row)}>
          <UserRoundCheck />
          {row.delegated_to_name ? t("action.handOverAgain") : t("action.handOver")}
        </Button>
      )}
      {row.status === "APPROVED" && can("waste_outgoing.order") && (
        <Button size="sm" onClick={() => setAssigning(row)}>
          <Truck />
          {t("action.sendOrder")}
        </Button>
      )}
      {/*
        Hand the load to somebody else without killing the application
        (T-319). The server refuses once collection is under way, so the
        button is offered on an ordered record and the refusal is the
        authority - restating the state rules here would give two answers to
        drift apart.
      */}
      {row.status === "ORDERED" && can("waste_outgoing.order") && (
        <Button size="sm" variant="outline" onClick={() => setReassigning(row)}>
          <Repeat />
          {t("action.reassign")}
        </Button>
      )}
      {row.dispatch_no && (
        <Button size="sm" variant="outline" onClick={() => setTracking(row)}>
          <Scale />
          {t("action.track")}
        </Button>
      )}
      {row.dispatch &&
        row.dispatch_state === "ACCEPTED" &&
        row.proposed_collection_at &&
        !row.confirmed_collection_at &&
        can("waste_outgoing.order") && (
          <Button size="sm" onClick={() => setConfirming(row)}>
            <CalendarCheck2 />
            {t("action.confirmSchedule")}
          </Button>
        )}
      {["DRAFT", "RETURNED"].includes(row.status) && can("waste_outgoing.submit") && (
        <>
          <Button size="sm" variant="outline" onClick={() => setAddingPhotos(row)}>
            <ImagePlus />
            {t("action.upload")}
          </Button>
          {/*
            Disabled with nothing attached rather than left to fail: 8.2.1
            makes the photograph the substance of the record, so the backend
            refuses a submission without them. How many it wants depends on
            the company, so the exact number comes back in its message.
          */}
          <Button
            size="sm"
            disabledReason={row.photos.length === 0 ? t("submit.needPhotos") : undefined}
            disabled={row.photos.length === 0 || submitRequest.isPending}
            onClick={() => submitRequest.mutate(row.id)}
          >
            <SendHorizonal />
            {t("action.submit")}
          </Button>
        </>
      )}
      {["DRAFT", "PENDING_APPROVAL", "RETURNED", "APPROVED"].includes(row.status) &&
        can("waste_outgoing.submit") && (
          <Button size="sm" variant="ghost" onClick={() => setCancelling(row)}>
            <XCircle />
            {t("action.cancel")}
          </Button>
        )}
      <AddToPackageButton
        kind="WASTE_OUTGOING"
        recordId={row.id}
        projectId={row.project}
        reference={row.reference_no}
      />
    </div>
  );

  const columns: ColumnDef<WasteOutgoingRecord, unknown>[] = [
    {
      accessorKey: "reference_no",
      meta: { label: t("field.dispatchNo") },
      header: sortable(t("field.dispatchNo")),
      cell: ({ row }) => <span className="tabular text-foreground">{row.original.reference_no}</span>,
    },
    {
      accessorKey: "status",
      meta: { label: t("export.status") },
      header: sortable(t("export.status")),
      cell: ({ row }) => (
        <div className="min-w-0">
          <StatusBadge label={t(`status.${row.original.status}`)} tone={STATUS_TONE[row.original.status]} />
          {row.original.status === "RETURNED" && row.original.review_note ? (
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
    },
    {
      accessorKey: "captured_at",
      meta: { label: t("export.capturedAt") },
      header: sortable(t("export.capturedAt")),
      cell: ({ row }) => (
        <span className="tabular text-muted-foreground">
          {row.original.captured_at ? df.dateTime(row.original.captured_at) : "—"}
        </span>
      ),
    },
    {
      id: "quantity",
      meta: { label: t("field.quantity") },
      header: () => <PlainHeader label={t("field.quantity")} />,
      cell: ({ row }) =>
        row.original.quantity ? (
          <span className="tabular">
            {row.original.quantity} {t(`unit.${row.original.unit}`)}
          </span>
        ) : (
          "—"
        ),
    },
    {
      accessorKey: "recycler_name",
      meta: { label: t("field.recycler") },
      header: () => <PlainHeader label={t("field.recycler")} />,
      cell: ({ row }) => row.original.recycler_name || "—",
    },
    {
      accessorKey: "dispatch_no",
      meta: { label: t("export.dispatchNo") },
      header: () => <PlainHeader label={t("export.dispatchNo")} />,
      cell: ({ row }) => row.original.dispatch_no || "—",
    },
    {
      accessorKey: "project_name",
      meta: { label: t("field.project") },
      header: () => <PlainHeader label={t("field.project")} />,
      cell: ({ row }) => <p className="max-w-[180px] truncate">{row.original.project_name}</p>,
    },
    {
      id: "photos",
      meta: { label: tRoot("moduleTable.photos") },
      header: () => <PlainHeader label={tRoot("moduleTable.photos")} />,
      cell: ({ row }) => <TypeBadge label={String(row.original.photos.length)} />,
    },
  ];

  const total = records.data?.count ?? 0;
  // The open record follows the list, so a step taken from the detail shows
  // its result without closing and reopening.
  const shown = viewing ? (rows.find((row) => row.id === viewing.id) ?? viewing) : null;

  return (
    <>
      <ModuleRecordsTable
        title={tRoot("nav.submodule.wasteOutgoing")}
        countLabel={tRoot("moduleTable.count", { count: total })}
        headerAction={
          <div className="flex flex-wrap gap-2">
            {/* 8.2.7 gives the tenant its own category list. */}
            {can("waste_outgoing.config") && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-full px-4 shadow-sm"
                onClick={() => setManagingCategories(true)}
              >
                <ListTree className="h-4 w-4" />
                {t("category.manage")}
              </Button>
            )}
            {can("waste_outgoing.submit") && (
              <Button size="sm" className="rounded-full px-4 shadow-sm" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" />
                {t("action.record")}
              </Button>
            )}
          </div>
        }
        above={
          /* 8.2.9: today, this month, this year. Counts are always
             comparable; quantities are shown per unit because tonnes and
             bags are not. */
          <div className="space-y-1">
            <SummaryStrip
              items={
                totals.isError
                  ? (["today", "month", "year", "all_time"] as const).map((window) => ({
                      key: window,
                      label: t(`totals.${window}`),
                      value: "—",
                    }))
                  : totals.data
                    ? (["today", "month", "year", "all_time"] as const).map((window) => ({
                        key: window,
                        label: t(`totals.${window}`),
                        value: totals.data[window].records,
                        detail: Object.entries(totals.data[window].quantity_by_unit)
                          .map(([unit, amount]) => `${amount} ${t(`unit.${unit}`)}`)
                          .join(" · "),
                      }))
                    : []
              }
            />
            <QueryFailedNote query={totals} what={t("what.totals")} />
            {/* The category filter and the new-record form both choose from it. */}
            <QueryFailedNote query={options} what={t("what.categories")} />
          </div>
        }
        list={list}
        columns={columns}
        rows={rows}
        totalCount={total}
        isLoading={records.isLoading}
        isError={records.isError}
        storageKey="waste-outgoing"
        toolbar={
          <>
            <ProjectListFilter list={list} />
            <FilterSelect
              list={list}
              param="category"
              allLabel={t("filter.allCategories")}
              options={categories.map((row) => ({ value: row.id, label: row.name }))}
            />
            <FilterSelect
              list={list}
              param="status"
              allLabel={t("filter.allStatuses")}
              options={(Object.keys(STATUS_TONE) as WasteOutgoingStatus[]).map((key) => ({
                value: key,
                label: t(`status.${key}`),
              }))}
            />
            {can("report.export") && <ExportButton onExport={runExport} disabled={!rows.length} />}
          </>
        }
        onOpen={setViewing}
      />

      {shown && (
        <RecordDetailDialog
          title={shown.reference_no}
          description={`${shown.project_name} · ${shown.category_name}`}
          onClose={() => setViewing(null)}
        >
          <RecordDetailShell
            reference={shown.reference_no}
            notices={
              shown.review_note ? (
                <p
                  className={`rounded-md border px-3 py-2 text-xs ${shown.status === "RETURNED" ? "border-destructive/30 bg-destructive/5 text-destructive" : "bg-muted/30 text-muted-foreground"}`}
                >
                  {t("review.noteLabel")}: {shown.review_note}
                </p>
              ) : null
            }
            facts={[
              {
                label: t("export.status"),
                value: <StatusBadge label={t(`status.${shown.status}`)} tone={STATUS_TONE[shown.status]} />,
              },
              { label: t("field.project"), value: shown.project_name },
              { label: t("field.category"), value: shown.category_name },
              {
                label: t("field.quantity"),
                value: shown.quantity ? `${shown.quantity} ${t(`unit.${shown.unit}`)}` : "—",
              },
              {
                label: t("export.capturedAt"),
                value: shown.captured_at ? df.dateTime(shown.captured_at) : "—",
              },
              { label: t("export.recordedBy"), value: shown.recorded_by_name },
              ...(shown.pickup_address
                ? [
                    {
                      label: tRoot("moduleTable.pickupAddress"),
                      value:
                        shown.pickup_address_source === "MANUAL"
                          ? `${shown.pickup_address} · ${t("field.pickupAddressTyped")}`
                          : shown.pickup_address,
                      wide: true,
                    },
                  ]
                : []),
              ...(shown.delegated_to_name
                ? [
                    {
                      label: tRoot("moduleTable.handover"),
                      value: t("handover.trail", {
                        from: shown.delegated_by_name ?? "",
                        to: shown.delegated_to_name,
                        when: df.dateTime(shown.delegated_at),
                      }),
                      wide: true,
                    },
                  ]
                : []),
              ...(shown.note ? [{ label: tRoot("moduleTable.note"), value: shown.note, wide: true }] : []),
            ]}
            photos={shown.photos.map((photo, index) => ({
              id: photo.id,
              // The stamped copy: 8.2.6 wants the stamp wherever it is shown.
              url: photo.watermarked || photo.image,
              label: photo.caption || `${tRoot("moduleTable.photos")} ${index + 1}`,
              takenAt: photo.captured_at,
              latitude: photo.latitude,
              longitude: photo.longitude,
            }))}
            panel={
              <section className="rounded-lg border bg-card p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {tRoot("moduleTable.collectionPanel")}
                </h3>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">{t("field.recycler")}</dt>
                  <dd className="break-words font-medium">{shown.recycler_name || "—"}</dd>
                  <dt className="text-muted-foreground">{t("export.dispatchNo")}</dt>
                  <dd className="font-medium">{shown.dispatch_no || "—"}</dd>
                  {/* D-222: what the recycler has done so far, on the record. */}
                  <dt className="text-muted-foreground">{tRoot("moduleTable.orderState")}</dt>
                  <dd className="font-medium">
                    {shown.dispatch_state && tRoot.has(`dispatches.state.${shown.dispatch_state}`)
                      ? tRoot(`dispatches.state.${shown.dispatch_state}`)
                      : "—"}
                  </dd>
                  <dt className="text-muted-foreground">{tRoot("moduleTable.driver")}</dt>
                  <dd className="font-medium">{shown.driver_name || "—"}</dd>
                  <dt className="text-muted-foreground">{tRoot("moduleTable.proposedCollection")}</dt>
                  <dd className="font-medium">
                    {shown.proposed_collection_at ? df.dateTime(shown.proposed_collection_at) : "—"}
                  </dd>
                  <dt className="text-muted-foreground">{tRoot("moduleTable.confirmedCollection")}</dt>
                  <dd className="font-medium">
                    {shown.confirmed_collection_at ? df.dateTime(shown.confirmed_collection_at) : "—"}
                  </dd>
                </dl>
              </section>
            }
            actions={renderActions(shown)}
            conversation={{ kind: "WASTE_OUTGOING", recordId: shown.id }}
          />
        </RecordDetailDialog>
      )}

      {creating && (
        <RecordDialog
          categories={categories}
          categoriesState={{ isError: options.isError, refetch: options.refetch }}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}
      {assigning && (
        <AssignDialog
          record={assigning}
          onClose={() => setAssigning(null)}
          onSaved={() => {
            setAssigning(null);
            refresh();
          }}
        />
      )}
      {reassigning && (
        <ReassignDialog
          record={reassigning}
          onClose={() => setReassigning(null)}
          onSaved={() => {
            setReassigning(null);
            refresh();
          }}
        />
      )}
      {handingOver && (
        <HandOverDialog
          record={handingOver}
          onClose={() => setHandingOver(null)}
          onSaved={() => {
            setHandingOver(null);
            refresh();
          }}
        />
      )}
      {reviewing && (
        <ReviewDialog
          record={reviewing}
          onClose={() => setReviewing(null)}
          onSaved={() => {
            setReviewing(null);
            refresh();
          }}
        />
      )}
      {tracking && (
        <TrackingDialog
          record={tracking}
          onClose={() => setTracking(null)}
        />
      )}
      {confirming && confirming.dispatch && (
        <ConfirmCollectionDialog
          record={confirming}
          onClose={() => setConfirming(null)}
          onSaved={() => {
            setConfirming(null);
            refresh();
          }}
        />
      )}
      {managingCategories && (
        <WasteCategoryDialog
          categories={options.data?.categories ?? []}
          categoriesState={{ isError: options.isError, refetch: options.refetch }}
          dispatchTypes={options.data?.dispatch_types ?? []}
          onClose={() => setManagingCategories(false)}
          onChanged={() =>
            void qc.invalidateQueries({
              queryKey: ["waste-outgoing", "options"],
            })
          }
        />
      )}

      {addingPhotos && (
        <AddPhotosDialog
          record={addingPhotos}
          onClose={() => setAddingPhotos(null)}
          onSaved={() => {
            setAddingPhotos(null);
            refresh();
          }}
        />
      )}

      {cancelling && (
        <CancelDialog
          record={cancelling}
          onClose={() => setCancelling(null)}
          onSaved={() => {
            setCancelling(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function localDateTimeInput(value: string) {
  const date = new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/**
 * Head office hands one application to somebody else to decide.
 *
 * One application at a time on purpose: the customer was offered a switch that
 * would delegate a whole category and turned it down, so there is no such
 * switch to build here.
 */
function HandOverDialog({
  record,
  onClose,
  onSaved,
}: {
  record: WasteOutgoingRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("wasteOutgoing");
  const [person, setPerson] = useState(record.delegated_to ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const people = useQuery({
    queryKey: ["waste-outgoing", "delegate-options"],
    queryFn: getWasteOutgoingDelegateOptions,
  });
  const save = useMutation({
    mutationFn: () =>
      delegateWasteOutgoingReview(record.id, person, note.trim()),
    onSuccess: onSaved,
    onError: (failure) => {
      if (failure instanceof ApiError) {
        setError(Object.values(failure.errors)[0] || failure.message);
        return;
      }
      setError(t("handover.failed"));
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("handover.title")}</DialogTitle>
          <DialogDescription>
            {t("handover.help", { reference: record.reference_no })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FieldWrapper label={t("handover.person")} required>
            <Select value={person} onValueChange={setPerson}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue
                  placeholder={
                    people.isLoading ? t("handover.loading") : t("handover.choose")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(people.data?.results ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.role ? `${row.name} · ${row.role}` : row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <QueryFailedNote query={people} what={t("what.delegates")} />
          </FieldWrapper>
          <FieldWrapper label={t("handover.note")} optional={t("field.optional")}>
            <Textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </FieldWrapper>
          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.close")}
          </Button>
          <Button
            requires={[[person, t("handover.person")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <UserRoundCheck />
            )}
            {t("action.handOver")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({
  record,
  onClose,
  onSaved,
}: {
  record: WasteOutgoingRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("wasteOutgoing");
  const [decision, setDecision] = useState<"APPROVED" | "RETURNED">("APPROVED");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () => reviewWasteOutgoingRequest(record.id, decision, note.trim()),
    onSuccess: onSaved,
    onError: (failure) => {
      if (failure instanceof ApiError) {
        setError(Object.values(failure.errors)[0] || failure.message);
        return;
      }
      setError(t("review.failed"));
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("review.title")}</DialogTitle>
          <DialogDescription>{t("review.help", { reference: record.reference_no })}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={decision === "APPROVED" ? "default" : "outline"} onClick={() => setDecision("APPROVED")}>
              <CheckCircle2 />{t("action.approve")}
            </Button>
            <Button type="button" variant={decision === "RETURNED" ? "destructive" : "outline"} onClick={() => setDecision("RETURNED")}>
              <XCircle />{t("action.return")}
            </Button>
          </div>
          <FieldWrapper label={t("review.note")} optional={decision === "APPROVED" ? t("field.optional") : undefined} required={decision === "RETURNED"}>
            <Textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} />
          </FieldWrapper>
          {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("action.close")}</Button>
          <Button requires={[[decision !== "RETURNED" || note, t("review.note")]]} disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="animate-spin" /> : decision === "APPROVED" ? <CheckCircle2 /> : <XCircle />}
            {decision === "APPROVED" ? t("action.approve") : t("action.return")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmCollectionDialog({
  record,
  onClose,
  onSaved,
}: {
  record: WasteOutgoingRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("wasteOutgoing");
  const [collectionAt, setCollectionAt] = useState(
    localDateTimeInput(record.proposed_collection_at!),
  );
  const [note, setNote] = useState(record.proposed_collection_note || "");
  const save = useMutation({
    mutationFn: () =>
      confirmWasteCollectionPlan(record.dispatch!, {
        confirmedCollectionAt: new Date(collectionAt).toISOString(),
        note: note.trim(),
      }),
    onSuccess: onSaved,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("schedule.title")}</DialogTitle>
          <DialogDescription>
            {t("schedule.help", {
              recycler: record.recycler_name || "",
              reference: record.dispatch_no || record.reference_no,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <p className="font-semibold">{t("schedule.proposed")}</p>
            <p className="mt-1 text-muted-foreground">
              {record.proposed_collection_at
                ? new Date(record.proposed_collection_at).toLocaleString()
                : "-"}
            </p>
            {record.proposed_collection_note && (
              <p className="mt-2">{record.proposed_collection_note}</p>
            )}
          </div>
          <FieldWrapper label={t("schedule.confirmedAt")} required>
            <Input
              type="datetime-local"
              value={collectionAt}
              onChange={(event) => setCollectionAt(event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("schedule.note")} optional={t("field.optional")}>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </FieldWrapper>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("action.close")}</Button>
          <Button requires={[[collectionAt, t("schedule.confirmedAt")]]} disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <CalendarCheck2 />}
            {t("action.confirmSchedule")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordDialog({
  categories,
  categoriesState,
  onClose,
  onSaved,
}: {
  categories: { id: string; name: string }[];
  /** Whether `categories` actually arrived, so a failed load is not an empty list. */
  categoriesState: { isError: boolean; refetch?: () => unknown };
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("wasteOutgoing");
  const [project, setProject] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");

  const save = useMutation({
    mutationFn: () =>
      createWasteOutgoingRecord({
        project,
        category,
        quantity: quantity || undefined,
        unit: unit || undefined,
        note: note || undefined,
        pickup_address: pickupAddress.trim() || undefined,
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude,
        // Makes the upload idempotent: a phone retrying on a flaky site
        // connection must not file the same waste twice.
        client_event_id: `waste-${Date.now()}`,
        photos,
      }),
    onSuccess: onSaved,
  });

  const locate = async () => {
    setLocating(true);
    setLocationError("");
    try {
      setCoordinates(await getCoordinates());
    } catch {
      setLocationError(t("form.locationFailed"));
    } finally {
      setLocating(false);
    }
  };

  // A quantity with no unit is not a measurement, and the server rejects it.
  const quantityIncomplete = quantity.trim() !== "" && unit === "";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("form.title")}</DialogTitle>
          <DialogDescription>{t("form.help")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FieldWrapper label={t("field.project")} required>
            <ProjectPicker
              value={project}
              onValueChange={setProject}
              placeholder={t("filter.selectProject")}
              className="w-full"
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.category")} required>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("field.selectCategory")} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <QueryFailedNote query={categoriesState} what={t("what.categories")} />
          </FieldWrapper>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldWrapper
              label={t("field.quantity")}
              optional={t("field.optional")}
              hint={t("field.quantityHint")}
            >
              <Input
                type="number"
                min="0"
                step="0.001"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </FieldWrapper>
            <FieldWrapper
              label={t("field.unit")}
              required={quantity.trim() !== ""}
              optional={t("field.optional")}
              error={quantityIncomplete ? t("field.unitRequired") : undefined}
            >
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("field.selectUnit")} />
                </SelectTrigger>
                <SelectContent>
                  {WASTE_UNITS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`unit.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
          </div>
          <FieldWrapper
            label={t("field.pickupAddress")}
            optional={t("field.optional")}
            hint={t("field.pickupAddressHint")}
          >
            <Textarea
              rows={2}
              value={pickupAddress}
              onChange={(event) => setPickupAddress(event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.note")} optional={t("field.optional")}>
            <Textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("field.photos")}
            required
            hint={t("field.photosHint")}
          >
            <FieldCamera
              label={t("field.photos")}
              fileCount={photos.length}
              onCapture={(file) => setPhotos((current) => [...current, file])}
              onClear={() => setPhotos([])}
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("field.location")}
            hint={t("field.locationHint")}
            error={locationError || undefined}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={locating}
                onClick={() => void locate()}
              >
                {locating ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <LocateFixed />
                )}
                {t("action.locate")}
              </Button>
              {coordinates && (
                <span className="text-xs text-muted-foreground">
                  {Number(coordinates.latitude).toFixed(5)},{" "}
                  {Number(coordinates.longitude).toFixed(5)}
                </span>
              )}
            </div>
          </FieldWrapper>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.close")}
          </Button>
          <Button
            requires={[
              [project, t("field.project")],
              [category, t("field.category")],
              [!quantityIncomplete, t("field.unit")],
              [photos.length > 0, t("field.photos")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Camera />}
            {t("action.upload")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({
  record,
  onClose,
  onSaved,
}: {
  record: WasteOutgoingRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("wasteOutgoing");
  const [recycler, setRecycler] = useState("");
  const [weight, setWeight] = useState("");
  const [description, setDescription] = useState("");
  // Prefilled with whatever the record already carries, so the office edits an
  // address rather than retyping one - and so leaving it alone changes nothing.
  const [pickupAddress, setPickupAddress] = useState(record.pickup_address);
  // When the site wants it collected (T-226, D-111). Blank on purpose: the
  // order is accepted on arrival, so this is a wish rather than a negotiation,
  // and a default date would be a commitment nobody made.
  const [collectionAt, setCollectionAt] = useState("");

  // Only the recyclers this project is bound to. Listing every partner would
  // offer choices the server's partnership gate is going to refuse.
  const recyclers = useQuery({
    queryKey: ["waste-outgoing", "recyclers", record.id],
    queryFn: () => getRecyclerOptions(record.id),
  });

  const save = useMutation({
    mutationFn: () =>
      assignWasteRecycler(record.id, {
        recycler,
        estimated_weight_kg: weight || undefined,
        description: description.trim() || undefined,
        pickup_address: pickupAddress.trim() || undefined,
        collection_at: collectionAt
          ? new Date(collectionAt).toISOString()
          : undefined,
      }),
    onSuccess: onSaved,
  });

  const rows = recyclers.data?.rows ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("assign.title")}</DialogTitle>
          <DialogDescription>
            {t("assign.help", { reference: record.reference_no })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FieldWrapper label={t("field.recycler")} required>
            {recyclers.isError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                {t("assign.partnersFailed")}
              </p>
            ) : recyclers.isLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : rows.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
                {t("assign.noPartners")}
              </p>
            ) : (
              <Select value={recycler} onValueChange={setRecycler}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("field.selectRecycler")} />
                </SelectTrigger>
                <SelectContent>
                  {rows.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FieldWrapper>
          <FieldWrapper
            label={t("field.estimatedWeight")}
            optional={t("field.optional")}
          >
            <Input
              type="number"
              min="0"
              step="0.01"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("field.pickupAddress")}
            hint={
              record.pickup_address_source === "MANUAL"
                ? t("field.pickupAddressTyped")
                : t("field.pickupAddressFromProject")
            }
          >
            <Textarea
              rows={2}
              value={pickupAddress}
              onChange={(event) => setPickupAddress(event.target.value)}
            />
          </FieldWrapper>
          {/*
            When the site wants it collected (T-226, D-111).
            客户：「建筑商发送订单的时候是自动接受的，不存在他们可以拒绝订单的
            情况。」 An order nobody can refuse has nothing to negotiate, so the
            time moved from the recycler's acceptance step to here. The yard
            can still propose a different one from their own order book.
          */}
          <FieldWrapper
            label={t("field.collectionAt")}
            optional={t("field.optional")}
            hint={t("field.collectionAtHint")}
          >
            <Input
              type="datetime-local"
              value={collectionAt}
              onChange={(event) => setCollectionAt(event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("field.note")}
            optional={t("field.optional")}
          >
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </FieldWrapper>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.close")}
          </Button>
          <Button
            requires={[[recycler, t("field.recycler")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Truck />}
            {t("action.sendOrder")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The lorry's track, on the producer's screen.
 *
 * Read-only and deliberately plain: the contractor needs to see where their
 * waste went, not to operate a fleet console. Every task on the order is drawn,
 * because a load that needed two trips is one order with two tracks.
 */
function TrackingRouteMap({ tasks }: { tasks: WasteCollectionTask[] }) {
  const t = useTranslations("wasteOutgoing");
  const paths = tasks.flatMap((task, index) =>
    trackPaths({
      id: task.id,
      points: task.route.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
        occurredAt: point.occurred_at,
      })),
      color: ["#2563eb", "#7c3aed", "#15803d", "#a16207"][index % 4],
      label: `${task.driver_name} · ${task.vehicle_plate}`,
      gapLabel: (minutes) => t("tracking.routeGap", { minutes }),
    }),
  );
  const markers = tasks.flatMap((task) => {
    const last = task.latest_position;
    if (!last) return [];
    const latitude = Number(last.latitude);
    const longitude = Number(last.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [
      {
        id: `driver-${task.id}`,
        latitude,
        longitude,
        label: task.driver_name || task.task_no,
        detail: task.vehicle_plate,
        icon: "truck" as const,
      },
    ];
  });

  if (paths.length === 0 && markers.length === 0) return null;
  return (
    <LocationMap
      markers={markers}
      paths={paths}
      // `LocationMap` already sets its own min-height, width and border.
      className="rounded-lg"
      ariaLabel={t("tracking.driverRoute")}
    />
  );
}

function TrackingDialog({
  record,
  onClose,
}: {
  record: WasteOutgoingRecord;
  onClose: () => void;
}) {
  const t = useTranslations("wasteOutgoing");
  const df = useDateFormat();
  // This dialog is the contractor's half of "all three parties see the same
  // order". The recycler and driver portals already subscribe; without this the
  // contractor was the only party still waiting on a thirty-second timer, which
  // is what kept the five-second promise from being true.
  //
  const tracking = useQuery({
    queryKey: ["waste-outgoing", "tracking", record.id],
    queryFn: () => getWasteTracking(record.id),
    // Kept as a floor under the subscription, not as the primary path. The hook
    // polls at 15s only while the stream is down; this covers the rarer case of
    // a stream that stays open but delivers nothing.
    refetchInterval: 30_000,
  });

  const data = tracking.data;
  const byKey = new Map(
    (data?.milestones ?? []).map((milestone) => [milestone.key, milestone]),
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("tracking.title")}</DialogTitle>
          <DialogDescription>
            {t("tracking.help", { reference: record.reference_no })}
          </DialogDescription>
        </DialogHeader>

        {tracking.isError ? (
          <LoadFailed onRetry={() => void tracking.refetch()} />
        ) : tracking.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !data?.ordered ? (
          <div className="rounded-lg border border-dashed bg-muted/20 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="size-4 shrink-0 text-muted-foreground" />
              {t("tracking.notOrdered")}
            </p>
            {Object.values(data?.unavailable ?? {}).map((reason) => (
              <p key={reason} className="mt-1 text-xs text-muted-foreground">
                {reason}
              </p>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">{t("field.recycler")}</dt>
                <dd className="font-medium">{data.recycler}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {t("field.dispatchNo")}
                </dt>
                <dd className="font-medium">{data.dispatch_no}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {t("field.driverName")}
                </dt>
                <dd className="font-medium">
                  {data.driver_name || t("tracking.notYetAssigned")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {t("field.vehiclePlate")}
                </dt>
                <dd className="font-medium">
                  {data.vehicle_plate || t("tracking.notYetAssigned")}
                </dd>
              </div>
            </dl>

            <ol className="space-y-2 border-l pl-5">
              {MILESTONE_ORDER.map((key) => {
                const milestone = byKey.get(key);
                const done = milestone?.done ?? false;
                return (
                  <li key={key} className="relative">
                    <span
                      aria-hidden
                      className="absolute -left-[1.65rem] top-0.5"
                    >
                      {done ? (
                        <CheckCircle2 className="size-4 text-success" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground/40" />
                      )}
                    </span>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p
                        className={
                          done
                            ? "text-sm font-medium"
                            : "text-sm text-muted-foreground"
                        }
                      >
                        {t(`milestone.${key}`)}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {milestone?.at ? df.dateTime(milestone.at) : ""}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>

            {/*
              The producer's own view of where the lorry went.

              The endpoint has always sent `route` and `latest_position` on
              every task; nothing on this screen ever read them, so the
              contractor could see a driver's name and a milestone list and
              never the lorry. That is half of the three-party promise missing
              on the party who raised the order. Unrecorded stretches are drawn
              broken here for the same reason as on the other two screens.
            */}
            {(data.tasks ?? []).some((task) => task.route.length > 1) && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">{t("tracking.driverRoute")}</h3>
                <TrackingRouteMap tasks={data.tasks ?? []} />
                <p className="text-xs text-muted-foreground">
                  {t("tracking.driverRouteNote")}
                </p>
              </section>
            )}

            {(data.tasks ?? []).some((task) => task.photos.length > 0) && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">{t("tracking.executionPhotos")}</h3>
                {(data.tasks ?? []).map((task) => task.photos.length > 0 && (
                  <div key={task.id} className="space-y-2">
                    <p className="text-xs text-muted-foreground">{task.task_no} · {task.driver_name} · {task.vehicle_plate}</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {task.photos.map((photo) => (
                        <a key={photo.id} href={photo.watermarked || photo.image} target="_blank" rel="noreferrer" className="overflow-hidden rounded-md border bg-muted/20">
                          <Image src={photo.watermarked || photo.image} alt={photo.caption || photo.kind} width={360} height={270} unoptimized className="aspect-[4/3] w-full object-cover" />
                          <p className="truncate px-2 py-1.5 text-xs">{photo.caption || photo.kind}</p>
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {/* 8.2.13. Absent until the weighbridge has produced a valid pass,
                which is a normal state, not a failure. */}
            {data.weighing ? (
              <div className="rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{t("weighing.title")}</p>
                    <p className="text-xs text-muted-foreground">{data.weighing.session_no}</p>
                  </div>
                  <PrintTicketButton sessionId={data.weighing.session_id} sessionNo={data.weighing.session_no} />
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  {(
                    [
                      ["firstWeight", data.weighing.first_weight_kg],
                      ["secondWeight", data.weighing.second_weight_kg],
                      ["netWeight", data.weighing.net_weight_kg],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-muted-foreground">
                        {t(`weighing.${label}`)}
                      </dt>
                      <dd className="font-medium tabular-nums">
                        {value ? `${value} kg` : "—"}
                      </dd>
                    </div>
                  ))}
                  <div>
                    <dt className="text-muted-foreground">
                      {t("weighing.verdict")}
                    </dt>
                    <dd className="font-medium">{data.weighing.verdict}</dd>
                  </div>
                </dl>
                {data.weighing.anomalies.length > 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-warning">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    {t("weighing.anomalies", {
                      codes: data.weighing.anomalies.join(", "),
                    })}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("weighing.pending")}
              </p>
            )}
            {data.settlement && (
              <div className="rounded-lg border bg-card p-3">
                <p className="text-sm font-semibold">{t("settlement.title")}</p>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <div><dt className="text-muted-foreground">{t("settlement.number")}</dt><dd className="font-medium">{data.settlement.settlement_no}</dd></div>
                  <div><dt className="text-muted-foreground">{t("settlement.state")}</dt><dd className="font-medium">{data.settlement.state}</dd></div>
                  <div><dt className="text-muted-foreground">{t("settlement.weight")}</dt><dd className="font-medium tabular-nums">{data.settlement.settled_weight_kg} kg</dd></div>
                  <div><dt className="text-muted-foreground">{t("settlement.amount")}</dt><dd className="font-medium tabular-nums">{data.settlement.total_amount ? `${data.settlement.currency} ${data.settlement.total_amount}` : "-"}</dd></div>
                </dl>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * More photographs onto a record that is already filed.
 *
 * One record, several trips to the skip: the requirement makes the photograph
 * the substance of the entry, and a submission is refused until enough of them
 * are attached. The backend has taken them one batch at a time since the
 * module was written and no screen ever offered it, so the refusal had no
 * remedy on the page it appeared on (F-101).
 */
/**
 * The tenant's own waste category list.
 *
 * Deleting is offered only where the backend will allow it - the seven
 * standard categories and any category records already cite are retired by
 * turning them off instead. Showing a bin that always answers 409 is worse
 * than showing no bin (F-129), so the button is absent with the reason in its
 * place.
 */
function WasteCategoryDialog({
  categories,
  categoriesState,
  dispatchTypes,
  onClose,
  onChanged,
}: {
  categories: WasteCategory[];
  /** Whether the list actually arrived: a failed load must not read as no categories. */
  categoriesState: { isError: boolean; refetch?: () => unknown };
  dispatchTypes: string[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations("wasteOutgoing");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [dispatchType, setDispatchType] = useState(dispatchTypes[0] ?? "");

  const create = useMutation({
    mutationFn: () =>
      createWasteCategory({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        dispatch_type: dispatchType,
      }),
    onSuccess: () => {
      setCode("");
      setName("");
      onChanged();
    },
  });
  const toggle = useMutation({
    mutationFn: (row: WasteCategory) =>
      updateWasteCategory(row.id, { is_active: !row.is_active }),
    onSuccess: onChanged,
  });
  const remove = useMutation({
    mutationFn: (row: WasteCategory) => deleteWasteCategory(row.id),
    onSuccess: onChanged,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("category.title")}</DialogTitle>
          <DialogDescription>{t("category.help")}</DialogDescription>
        </DialogHeader>

        <QueryFailedNote query={categoriesState} what={t("what.categories")} />
        <ul className="divide-y rounded-md border empty:hidden">
          {categories.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
            >
              <span className="tabular font-medium">{row.code}</span>
              <span className={row.is_active ? "" : "text-muted-foreground line-through"}>
                {row.name}
              </span>
              {row.is_system && (
                <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                  {t("category.standard")}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate(row)}
                >
                  {row.is_active ? t("category.deactivate") : t("category.activate")}
                </Button>
                {row.is_system ? (
                  <span className="text-xs text-muted-foreground">
                    {t("category.standardHelp")}
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(row)}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="grid gap-2 sm:grid-cols-4">
          <FieldWrapper label={t("category.code")} required>
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          </FieldWrapper>
          <FieldWrapper label={t("category.name")} required className="sm:col-span-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("category.dispatchType")}>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={dispatchType}
              onChange={(event) => setDispatchType(event.target.value)}
            >
              {dispatchTypes.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </FieldWrapper>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.close")}
          </Button>
          <Button
            requires={[
              [code, t("category.code")],
              [name, t("category.name")],
            ]}
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            <Plus className="h-4 w-4" />
            {t("category.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddPhotosDialog({
  record,
  onClose,
  onSaved,
}: {
  record: WasteOutgoingRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("wasteOutgoing");
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");

  const save = useMutation({
    mutationFn: () => addWasteOutgoingPhotos(record.id, files, caption.trim()),
    onSuccess: onSaved,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("action.upload")}</DialogTitle>
          <DialogDescription>{t("submit.needPhotos")}</DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("field.photos")} required>
          <Input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
        </FieldWrapper>
        <FieldWrapper label={t("photos.caption")}>
          <Input
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
          />
        </FieldWrapper>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.close")}
          </Button>
          <Button
            requires={[[files.length > 0, t("field.photos")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            {t("action.upload")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  record,
  onClose,
  onSaved,
}: {
  record: WasteOutgoingRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("wasteOutgoing");
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: () => cancelWasteOutgoingRecord(record.id, reason.trim()),
    onSuccess: onSaved,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("cancel.title")}</DialogTitle>
          <DialogDescription>
            {t("cancel.help", { reference: record.reference_no })}
          </DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("field.reason")} required>
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </FieldWrapper>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.close")}
          </Button>
          <Button
            variant="destructive"
            requires={[[reason, t("field.reason")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <XCircle />}
            {t("action.confirmCancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Take an order back from one recycler so it can go to the next (T-319).
 *
 * Two things carry the customer's requirement and both are visible here: the
 * application does not die (the server returns it to APPROVED), and every
 * attempt leaves a row saying who it was with and why it came back - which is
 * why the reason is compulsory rather than a nicety.
 *
 * A switch arms the button rather than a second dialog confirming it (C-018).
 * The recycler's own order is cancelled by this press and their yard stops
 * seeing the load, so it is not a press to make by accident.
 */
function ReassignDialog({
  record,
  onClose,
  onSaved,
}: {
  record: WasteOutgoingRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("wasteOutgoing");
  const [reason, setReason] = useState("");
  const [armed, setArmed] = useState(false);

  const save = useMutation({
    mutationFn: () => reassignWasteRecycler(record.id, reason.trim()),
    onSuccess: onSaved,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("reassign.title")}</DialogTitle>
          <DialogDescription>
            {t("reassign.help", {
              reference: record.reference_no,
              recycler: record.recycler_name || t("reassign.thisRecycler"),
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FieldWrapper label={t("reassign.reason")} required>
            <Textarea
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("reassign.arm")} required>
            <Switch
              checked={armed}
              onCheckedChange={setArmed}
              aria-label={t("reassign.arm")}
            />
          </FieldWrapper>
          {save.isError && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {save.error instanceof ApiError
                ? save.error.message
                : t("reassign.failed")}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [reason.trim(), t("reassign.reason")],
              [armed, t("reassign.arm")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Repeat />}
            {t("action.reassign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
