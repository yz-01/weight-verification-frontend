"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Circle,
  Loader2,
  LocateFixed,
  Plus,
  Scale,
  Send,
  Truck,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { FieldCamera } from "@/components/shared/field-camera";
import {
  FieldWrapper,
  ListHeader,
  StatusBadge,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type {
  MilestoneKey,
  WasteOutgoingRecord,
  WasteOutgoingStatus,
} from "@/interfaces/waste-outgoing";
import { WASTE_UNITS } from "@/interfaces/waste-outgoing";
import { useDateFormat } from "@/lib/dates";
import {
  assignWasteRecycler,
  cancelWasteOutgoingRecord,
  createWasteOutgoingRecord,
  getRecyclerOptions,
  getWasteOutgoingOptions,
  getWasteOutgoingRecords,
  getWasteOutgoingTotals,
  getWasteTracking,
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
  PENDING_RECYCLER: "warning",
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
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude),
        }),
      reject,
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

export function WasteOutgoingWorkspace() {
  const t = useTranslations("wasteOutgoing");
  const { can } = useAuth();
  const df = useDateFormat();
  const qc = useQueryClient();

  const [project, setProject] = useState("");
  const [category, setCategory] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const searchParams = useSearchParams();
  const [creating, setCreating] = useState(searchParams.get("create") === "1");
  const [assigning, setAssigning] = useState<WasteOutgoingRecord | null>(null);
  const [tracking, setTracking] = useState<WasteOutgoingRecord | null>(null);
  const [cancelling, setCancelling] = useState<WasteOutgoingRecord | null>(null);

  const options = useQuery({
    queryKey: ["waste-outgoing", "options"],
    queryFn: getWasteOutgoingOptions,
  });
  const records = useQuery({
    queryKey: ["waste-outgoing", "records", project, category, status],
    queryFn: () =>
      getWasteOutgoingRecords({
        ...(project ? { project } : {}),
        ...(category !== "ALL" ? { category } : {}),
        ...(status !== "ALL" ? { status } : {}),
        page_size: 50,
      }),
  });
  const totals = useQuery({
    queryKey: ["waste-outgoing", "totals", project],
    queryFn: () => getWasteOutgoingTotals(project || undefined),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["waste-outgoing"] });
  };

  const submit = useMutation({
    mutationFn: (id: string) => submitWasteCollectionRequest(id),
    onSuccess: refresh,
  });

  const rows = records.data?.results ?? [];
  const categories = (options.data?.categories ?? []).filter(
    (row) => row.is_active,
  );

  return (
    <div className="space-y-6">
      <ListHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          can("waste_outgoing.submit") ? (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              {t("action.record")}
            </Button>
          ) : undefined
        }
      />

      {/* 8.2.9: today, this month, this year. Counts are always comparable;
          quantities are shown per unit because tonnes and bags are not. */}
      {totals.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["today", "month", "year", "all_time"] as const).map((window) => (
            <div key={window} className="rounded-lg border bg-card p-4 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground">
                {t(`totals.${window}`)}
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {totals.data[window].records}
              </p>
              <div className="mt-1 space-y-0.5">
                {Object.entries(totals.data[window].quantity_by_unit).map(
                  ([unit, amount]) => (
                    <p key={unit} className="text-xs text-muted-foreground">
                      {amount} {t(`unit.${unit}`)}
                    </p>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <ProjectPicker
          value={project}
          onValueChange={(next) => setProject(next === "all" ? "" : next)}
          placeholder={t("filter.selectProject")}
          allowAll
          allLabel={t("filter.allProjects")}
          className="w-full sm:w-64"
        />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("filter.allCategories")}</SelectItem>
            {categories.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("filter.allStatuses")}</SelectItem>
            {(Object.keys(STATUS_TONE) as WasteOutgoingStatus[]).map((key) => (
              <SelectItem key={key} value={key}>
                {t(`status.${key}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {records.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="border-y py-12 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border bg-card p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {row.reference_no}
                    <StatusBadge
                      label={t(`status.${row.status}`)}
                      tone={STATUS_TONE[row.status]}
                    />
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {row.project_name} · {row.category_name}
                    {row.quantity
                      ? ` · ${row.quantity} ${t(`unit.${row.unit}`)}`
                      : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {df.dateTime(row.captured_at)}
                    {row.recycler_name ? ` · ${row.recycler_name}` : ""}
                    {row.dispatch_no ? ` · ${row.dispatch_no}` : ""}
                  </p>
                  {row.note && (
                    <p className="mt-1 line-clamp-2 text-xs">{row.note}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {row.status === "DRAFT" && can("waste_outgoing.submit") && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={submit.isPending}
                      onClick={() => submit.mutate(row.id)}
                    >
                      {submit.isPending ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Send />
                      )}
                      {t("action.submit")}
                    </Button>
                  )}
                  {row.status === "PENDING_RECYCLER" &&
                    can("waste_outgoing.order") && (
                      <Button size="sm" onClick={() => setAssigning(row)}>
                        <Truck />
                        {t("action.assign")}
                      </Button>
                    )}
                  {row.dispatch_no && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setTracking(row)}
                    >
                      <Scale />
                      {t("action.track")}
                    </Button>
                  )}
                  {["DRAFT", "PENDING_RECYCLER"].includes(row.status) &&
                    can("waste_outgoing.submit") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setCancelling(row)}
                      >
                        <XCircle />
                        {t("action.cancel")}
                      </Button>
                    )}
                </div>
              </div>

              {row.photos.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {row.photos.slice(0, 6).map((photo) => (
                    <div
                      key={photo.id}
                      className="relative size-16 overflow-hidden rounded border"
                    >
                      <Image
                        // The watermarked derivative when one exists: 8.2.6 wants
                        // the stamp visible wherever the photo is shown.
                        src={photo.watermarked || photo.image}
                        alt={photo.caption || row.reference_no}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <RecordDialog
          categories={categories}
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
      {tracking && (
        <TrackingDialog
          record={tracking}
          onClose={() => setTracking(null)}
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
    </div>
  );
}

function RecordDialog({
  categories,
  onClose,
  onSaved,
}: {
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("wasteOutgoing");
  const [project, setProject] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState("");
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
  const ready =
    project !== "" && category !== "" && photos.length > 0 && !quantityIncomplete;

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
            disabled={!ready || save.isPending}
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
      }),
    onSuccess: onSaved,
  });

  const rows = recyclers.data?.rows ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("assign.title")}</DialogTitle>
          <DialogDescription>
            {t("assign.help", { reference: record.reference_no })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FieldWrapper label={t("field.recycler")} required>
            {recyclers.isLoading ? (
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
            disabled={!recycler || save.isPending}
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

function TrackingDialog({
  record,
  onClose,
}: {
  record: WasteOutgoingRecord;
  onClose: () => void;
}) {
  const t = useTranslations("wasteOutgoing");
  const df = useDateFormat();
  const tracking = useQuery({
    queryKey: ["waste-outgoing", "tracking", record.id],
    queryFn: () => getWasteTracking(record.id),
    // The recycler side moves while the contractor watches, so this refreshes
    // rather than freezing at whatever was true when the dialog opened.
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

        {tracking.isLoading ? (
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

            {/* 8.2.13. Absent until the weighbridge has produced a valid pass,
                which is a normal state, not a failure. */}
            {data.weighing ? (
              <div className="rounded-lg border bg-card p-3">
                <p className="text-sm font-semibold">{t("weighing.title")}</p>
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
            disabled={!reason.trim() || save.isPending}
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
