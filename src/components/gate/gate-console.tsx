"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DoorOpen,
  Hand,
  Info,
  Loader2,
  ScanLine,
  TriangleAlert,
  Truck,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  FieldWrapper,
  LoadFailed,
  QueryFailedNote,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/interfaces/api";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { GateBinding, ReleaseCommand } from "@/interfaces/recycler";
import {
  clearGateBinding,
  getGateBinding,
  manualRelease,
  scanDispatch,
} from "@/services/recycler.service";
import { getScales } from "@/services/weighing.service";

/**
 * What the yard's LED board, voice unit and barrier were told, and answered.
 *
 * The loud line is the barrier, and it is loud because the operator is being
 * asked to trust it from a few feet away. It says the gate is open only when a
 * barrier reported that it opened — never because two other devices worked,
 * never because a command was sent, and never on a weighbridge that has no
 * barrier registered at all.
 */
function ReleasePanel({
  binding,
  onManualRelease,
}: {
  binding: GateBinding;
  onManualRelease: () => void;
}) {
  const t = useTranslations();
  const release = binding.release;
  const commands = release?.commands ?? [];

  // A yard that bought no controllers is a normal yard. Showing it an empty
  // "release" panel every vehicle would be noise it can do nothing about.
  if (!release || (commands.length === 0 && !release.released_manually)) {
    return null;
  }

  const tone = release.gate_open
    ? "positive"
    : release.needs_operator
      ? "danger"
      : release.waiting
        ? "info"
        : "warning";
  const headline = release.gate_open
    ? t("gate.release.gateOpen")
    : release.released_manually
      ? t("gate.release.releasedByHand")
      : release.waiting
        ? t("gate.release.waiting")
        : release.barrier_configured
          ? t("gate.release.gateClosed")
          : t("gate.release.noBarrier");

  return (
    <div className="space-y-2 rounded-lg border bg-card/60 p-3">
      <div className="flex items-center gap-2">
        <DoorOpen className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("gate.release.title")}
        </span>
        <span className="ml-auto">
          <StatusBadge label={headline} tone={tone} />
        </span>
      </div>

      <ul className="space-y-1.5">
        {commands.map((command: ReleaseCommand) => (
          <li
            key={command.id}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
          >
            <span className="w-24 shrink-0 text-muted-foreground">
              {t(`gate.release.deviceType.${command.device_type}`)}
            </span>
            <StatusBadge
              label={t(`gate.release.state.${command.state}`)}
              tone={
                command.acted
                  ? "positive"
                  : command.is_open
                    ? "info"
                    : command.state === "CLOSED_MANUALLY"
                      ? "neutral"
                      : "danger"
              }
            />
            {command.text !== "" && (
              <span className="tabular text-xs text-muted-foreground">
                “{command.text}”
              </span>
            )}
            {command.detail !== "" && (
              <span className="text-xs text-muted-foreground">
                {command.detail}
              </span>
            )}
          </li>
        ))}
      </ul>

      {release.released_manually ? (
        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {t("gate.release.manualNote", {
            name: release.manual_release_by_name,
            reason: binding.manual_release_reason,
          })}
        </p>
      ) : release.needs_operator ? (
        <div className="space-y-2 rounded-md bg-destructive/10 px-3 py-2">
          <p className="flex items-start gap-2 text-xs font-medium text-destructive">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("gate.release.needsOperator")}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-full px-3 text-xs"
            onClick={onManualRelease}
          >
            <Hand className="h-3.5 w-3.5" />
            {t("gate.release.manualRelease")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The screen an operator leaves open at the barrier.
 *
 * It exists because of one property of the engine: a weighing starts by itself
 * when weight lands on the deck, with no operator button. That was chosen so
 * nobody can delay the start past the part they would rather not have on
 * record — and it means the paperwork has to be attached *before* the vehicle
 * moves. There is no later moment.
 *
 * So the whole screen answers one question: is this weighbridge ready for the
 * lorry sitting in front of me. Everything else is secondary to making that
 * legible from a few feet away, which is why the waiting load is a large
 * panel rather than a row in a table.
 */
export function GateConsole() {
  const t = useTranslations();
  const df = useDateFormat();
  const queryClient = useQueryClient();

  const [chosenScale, setChosenScale] = useState("");
  const [dispatchNo, setDispatchNo] = useState("");
  const [plate, setPlate] = useState("");
  const [scannedBy, setScannedBy] = useState("");
  const [clearing, setClearing] = useState(false);
  const [releasingByHand, setReleasingByHand] = useState(false);
  const [releaseReason, setReleaseReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const scaleQuery = useQuery({
    queryKey: ["scales", "options"],
    queryFn: () => getScales({ page_size: 100 }),
  });
  const scalePage = scaleQuery.data;
  const scales = useMemo(() => scalePage?.results ?? [], [scalePage]);

  // Most yards run one weighbridge, so it is selected for the operator rather
  // than made a click on every vehicle. Derived rather than pushed into state
  // by an effect: an effect would fire a second render on every load, and the
  // value is a pure function of what has been chosen and what exists.
  const scaleId = chosenScale || scales[0]?.id || "";

  const binding = useQuery({
    queryKey: ["gate-binding", scaleId],
    queryFn: () => getGateBinding(scaleId),
    enabled: scaleId !== "",
    // The binding is consumed by the engine, not by this screen, so the only
    // way it learns the vehicle drove on is to look again.
    refetchInterval: 5000,
  });

  const scan = useMutation({
    mutationFn: () =>
      scanDispatch({
        scale: scaleId,
        dispatch_no: dispatchNo.trim(),
        vehicle_plate: plate.trim(),
        scanned_by_name: scannedBy.trim(),
      }),
    onSuccess: () => {
      setDispatchNo("");
      setPlate("");
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["gate-binding"] });
    },
    onError: (error) => {
      if (error instanceof ApiError) setFormError(error.message);
    },
  });

  const clear = useMutation({
    mutationFn: () => clearGateBinding(scaleId),
    onSuccess: () => {
      setClearing(false);
      void queryClient.invalidateQueries({ queryKey: ["gate-binding"] });
    },
  });

  const releaseByHand = useMutation({
    mutationFn: () => manualRelease(scaleId, releaseReason.trim()),
    onSuccess: () => {
      setReleasingByHand(false);
      setReleaseReason("");
      void queryClient.invalidateQueries({ queryKey: ["gate-binding"] });
    },
  });

  const waiting = binding.data ?? null;
  const expired = waiting !== null && !waiting.is_live;
  const plateMismatch =
    waiting !== null &&
    plate.trim() !== "" &&
    waiting.expected_plate !== "" &&
    waiting.expected_plate.replace(/\s/g, "").toUpperCase() !==
      plate.trim().replace(/\s/g, "").toUpperCase();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {t("gate.title")}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t("gate.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* What the bridge is expecting. Deliberately the loudest thing on
            the page: the operator reads it from the barrier, not the desk. */}
        <div
          className={cn(
            "rounded-xl border shadow-sm",
            waiting && !expired
              ? "border-primary/30 bg-primary/5"
              : "bg-card",
          )}
        >
          <div className="flex items-center gap-2 border-b px-6 py-4">
            <Truck className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("gate.waiting")}
            </h3>
            {waiting && !expired && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 rounded-full px-3 text-xs text-destructive hover:bg-destructive/10"
                onClick={() => setClearing(true)}
              >
                <X className="h-3.5 w-3.5" />
                {t("gate.clear")}
              </Button>
            )}
          </div>

          <div className="px-6 py-6">
            {binding.isError ? (
              <LoadFailed onRetry={() => void binding.refetch()} />
            ) : binding.isLoading ? (
              <p className="text-sm text-muted-foreground">
                {t("common.loading")}
              </p>
            ) : waiting === null ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("gate.nothingQueued")}
              </p>
            ) : (
              <div className="space-y-3">
                <p className="tabular text-2xl font-semibold text-foreground">
                  {waiting.dispatch_no}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <TypeBadge
                    label={t(`dispatches.wasteType.${waiting.waste_type}`)}
                  />
                  <StatusBadge
                    label={t(`gate.direction.${waiting.direction}`)}
                    tone={waiting.direction === "GROSS" ? "info" : "neutral"}
                  />
                </div>
                <dl className="space-y-1 text-sm">
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 text-muted-foreground">
                      {t("incoming.field.contractor")}
                    </dt>
                    <dd className="text-foreground">
                      {waiting.contractor_name}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 text-muted-foreground">
                      {t("gate.field.vehiclePlate")}
                    </dt>
                    <dd className="tabular text-foreground">
                      {waiting.expected_plate || t("common.emptyValue")}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 text-muted-foreground">
                      {t("gate.expiresAt")}
                    </dt>
                    <dd className="tabular text-foreground">
                      {df.dateTime(waiting.expires_at)}
                    </dd>
                  </div>
                </dl>

                <ReleasePanel
                  binding={waiting}
                  onManualRelease={() => setReleasingByHand(true)}
                />

                {expired && (
                  <p className="flex items-start gap-2 rounded-md bg-warning/12 px-3 py-2 text-xs font-medium text-warning">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {t("gate.expired")}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b px-6 py-4">
            <ScanLine className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("gate.scan")}
            </h3>
          </div>

          <form
            className="space-y-4 px-6 py-5"
            onSubmit={(event) => {
              event.preventDefault();
              scan.mutate();
            }}
          >
            <FieldWrapper label={t("gate.selectScale")} required>
              <Select value={scaleId} onValueChange={setChosenScale}>
                <SelectTrigger className="w-full bg-card">
                  <SelectValue placeholder={t("common.selectPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {scales.length === 0 ? (
                    scaleQuery.isError ? null : (
                      <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                        {t("gate.noScales")}
                      </div>
                    )
                  ) : (
                    scales.map((scale) => (
                      <SelectItem key={scale.id} value={scale.id}>
                        {scale.code} — {scale.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <QueryFailedNote query={scaleQuery} what={t("gate.what.scales")} />
            </FieldWrapper>

            <FieldWrapper label={t("gate.field.dispatchNo")} required>
              <Input
                value={dispatchNo}
                onChange={(event) => setDispatchNo(event.target.value)}
                // The note is usually scanned, and a scanner types fast into
                // whichever field has focus. Giving it focus on load means the
                // operator does not have to click first every single vehicle.
                autoFocus
                className="tabular"
              />
            </FieldWrapper>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("gate.sequenceTitle")}
              </Label>
              <div className="grid grid-cols-1 divide-y rounded-md border bg-muted/20 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    1
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {t("gate.firstPass")}
                  </span>
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    2
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {t("gate.secondPass")}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("gate.sequenceHelp")}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {t("gate.field.vehiclePlate")}
              </Label>
              <Input
                value={plate}
                onChange={(event) => setPlate(event.target.value)}
                className="tabular"
              />
              {plateMismatch && (
                <p className="text-xs font-medium text-warning">
                  {t("gate.plateMismatch", {
                    expected: waiting?.expected_plate ?? "",
                  })}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {t("gate.field.scannedBy")}
              </Label>
              <Input
                value={scannedBy}
                onChange={(event) => setScannedBy(event.target.value)}
              />
            </div>

            {formError && (
              <p className="text-sm font-medium text-destructive">
                {formError}
              </p>
            )}

            <Button
              type="submit"
              size="sm"
              requires={[[scaleId, t("gate.selectScale")], [dispatchNo, t("gate.field.dispatchNo")]]}
              disabled={scan.isPending}
              className="rounded-full px-4 shadow-sm"
            >
              {scan.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ScanLine className="h-4 w-4" />
              )}
              {t("gate.scan")}
            </Button>
          </form>
        </div>
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t("gate.whyFirst")}
      </p>

      <Dialog
        open={releasingByHand}
        onOpenChange={(open) => !open && setReleasingByHand(false)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("gate.release.manualTitle")}</DialogTitle>
            <DialogDescription>
              {t("gate.release.manualDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              {t("gate.release.manualReason")}
              <span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Textarea
              value={releaseReason}
              onChange={(event) => setReleaseReason(event.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReleasingByHand(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabledReason={releaseReason.trim().length < 4 ? t("common.minLength", { field: t("common.reason"), count: 4 }) : undefined}
              disabled={releaseReason.trim().length < 4 || releaseByHand.isPending}
              onClick={() => releaseByHand.mutate()}
            >
              {releaseByHand.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Hand className="h-4 w-4" />
              )}
              {t("gate.release.manualConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {clearing && (
        <ConfirmDialog
          open
          onOpenChange={() => setClearing(false)}
          title={t("gate.clearTitle")}
          description={t("gate.clearDescription")}
          confirmLabel={t("gate.clearConfirm")}
          confirmIcon={X}
          isPending={clear.isPending}
          onConfirm={() => clear.mutate()}
        />
      )}
    </div>
  );
}
