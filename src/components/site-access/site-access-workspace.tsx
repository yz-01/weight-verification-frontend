"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Check,
  Download,
  DoorOpen,
  Eye,
  ImagePlus,
  KeyRound,
  Ban,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  QrCode,
  RadioTower,
  ScanLine,
  ShieldCheck,
  ShieldX,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { QRCodeCanvas } from "qrcode.react";
import { Suspense, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  FieldWrapper,
  ListHeader,
  LoadFailed,
  StatusBadge,
} from "@/components/shared/page-primitives";
import {
  decodeGateQrImage,
  GateQrScanner,
} from "@/components/site-access/gate-qr-scanner";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  AccessCredentialType,
  SiteAccessCredential,
  AccessDirection,
  AccessSubjectType,
  SiteAccessPass,
  SiteAccessPassPayload,
} from "@/interfaces/site-access";
import {
  createSiteAccessPass,
  getSiteAccessCredentials,
  getSiteAccessDefaults,
  getSiteAccessPass,
  getSiteAccessPasses,
  getThirdPartyAccessEvents,
  registerSiteAccessCredential,
  reviewSiteAccessPass,
  revokeSiteAccessCredential,
  revokeSiteAccessPass,
  scanSiteAccessGate,
  updateSiteAccessPass,
} from "@/services/site-access.service";
import { getUsers } from "@/services/users.service";

export function SiteAccessWorkspace() {
  const t = useTranslations("siteControl");
  const { can } = useAuth();
  const qc = useQueryClient();
  const search = useSearchParams();
  const requestedPassId = search.get("pass");
  const requestedGate =
    search.get("tab") === "gate" || Boolean(search.get("scan"));
  const [tab, setTab] = useState<"passes" | "gate" | "devices">(
    requestedGate && can("site_access.scan") ? "gate" : "passes",
  );
  const [project, setProject] = useState("all");
  const [status, setStatus] = useState("all");
  const [creating, setCreating] = useState(false);
  // Only a pending pass can be corrected; the backend answers 409 after that.
  const [editing, setEditing] = useState<SiteAccessPass | null>(null);
  const [viewing, setViewing] = useState<SiteAccessPass | null>(null);
  const [qr, setQr] = useState<SiteAccessPass | null>(null);
  const [review, setReview] = useState<{
    row: SiteAccessPass;
    decision: "APPROVED" | "REJECTED";
  } | null>(null);
  const [revoke, setRevoke] = useState<SiteAccessPass | null>(null);
  const [reason, setReason] = useState("");
  const openedPassRef = useRef("");
  const changeTab = (value: string) => {
    const nextTab =
      value === "gate" && can("site_access.scan")
        ? ("gate" as const)
        : value === "devices"
          ? ("devices" as const)
          : ("passes" as const);
    setTab(nextTab);

    const url = new URL(window.location.href);
    if (nextTab === "gate") url.searchParams.set("tab", "gate");
    else {
      url.searchParams.delete("tab");
      url.searchParams.delete("scan");
    }
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  };
  const defaults = useQuery({
    queryKey: ["site-access-defaults"],
    queryFn: getSiteAccessDefaults,
  });
  const rows = useQuery({
    queryKey: ["site-access-passes", project, status],
    queryFn: () =>
      getSiteAccessPasses({
        page_size: 200,
        ...(project !== "all" ? { project } : {}),
        ...(status !== "all" ? { status } : {}),
      }),
  });
  const focusedPass = useQuery({
    queryKey: ["site-access-pass", requestedPassId],
    queryFn: () => getSiteAccessPass(requestedPassId!),
    enabled: Boolean(requestedPassId),
  });
  useEffect(() => {
    if (!focusedPass.data || openedPassRef.current === focusedPass.data.id)
      return;
    openedPassRef.current = focusedPass.data.id;
    setViewing(focusedPass.data);
  }, [focusedPass.data]);
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["site-access-passes"] });
  const reviewMutation = useMutation({
    mutationFn: () =>
      reviewSiteAccessPass(review!.row.id, review!.decision, reason),
    onSuccess: async () => {
      setReview(null);
      setReason("");
      await invalidate();
    },
  });
  const revokeMutation = useMutation({
    mutationFn: () => revokeSiteAccessPass(revoke!.id, reason),
    onSuccess: async () => {
      setRevoke(null);
      setReason("");
      await invalidate();
    },
  });

  return (
    <div className="space-y-5">
      <ListHeader
        title={t("access.title")}
        subtitle={t("access.subtitle")}
        action={
          can("site_access.manage") && tab === "passes" ? (
            <Button
              size="sm"
              disabled={defaults.isLoading}
              onClick={() => setCreating(true)}
            >
              <Plus />
              {t("access.newPass")}
            </Button>
          ) : undefined
        }
      />
      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList>
          <TabsTrigger value="passes">
            <KeyRound />
            {t("access.passes")}
          </TabsTrigger>
          {can("site_access.scan") && (
            <TabsTrigger value="gate">
              <ScanLine />
              {t("access.gate")}
            </TabsTrigger>
          )}
          <TabsTrigger value="devices">
            <RadioTower />
            {t("access.deviceEvents")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="passes" className="space-y-4">
          <div className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2">
            <FieldWrapper label={t("field.project")}>
              <ProjectPicker
                value={project}
                onValueChange={setProject}
                placeholder={t("field.chooseProject")}
                allowAll
                allLabel={t("field.allProjects")}
              />
            </FieldWrapper>
            <FieldWrapper label={t("field.status")}>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("field.allStatuses")}</SelectItem>
                  {["PENDING", "APPROVED", "REJECTED", "REVOKED"].map(
                    (value) => (
                      <SelectItem key={value} value={value}>
                        {t(`passStatus.${value}`)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </FieldWrapper>
          </div>
          {rows.isLoading ? (
            <State text={t("state.loading")} />
          ) : rows.isError ? (
            <State text={t("state.loadError")} danger />
          ) : !rows.data?.count ? (
            <State text={t("access.empty")} />
          ) : (
            <div className="overflow-hidden rounded-lg border bg-card">
              <Table className="min-w-[940px]">
                <TableHeader>
                  <TableRow>
                    {[
                      "passNo",
                      "person",
                      "type",
                      "project",
                      "validity",
                      "status",
                      "direction",
                      "actions",
                    ].map((key) => (
                      <TableHead key={key}>
                        {t(`table.${key}`)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.data.results.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium tabular-nums">
                        {row.pass_no}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{row.subject_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.subject_company || row.phone}
                        </p>
                      </TableCell>
                      <TableCell>
                        {t(`subjectType.${row.subject_type}`)}
                      </TableCell>
                      <TableCell>{row.project_name}</TableCell>
                      <TableCell className="text-xs">
                        <p>{formatDate(row.valid_from)}</p>
                        <p className="text-muted-foreground">
                          {formatDate(row.valid_until)}
                        </p>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={t(`passStatus.${row.effective_status}`)}
                          tone={passTone(row.effective_status)}
                        />
                      </TableCell>
                      <TableCell>
                        {row.current_direction
                          ? t(`direction.${row.current_direction}`)
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            title={t("action.view")}
                            onClick={() => setViewing(row)}
                          >
                            <Eye />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            title={t("action.qr")}
                            onClick={() => setQr(row)}
                          >
                            <QrCode />
                          </Button>
                          {can("site_access.manage") &&
                            row.status === "PENDING" && (
                              <>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  title={t("action.edit")}
                                  onClick={() => setEditing(row)}
                                >
                                  <Pencil />
                                </Button>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  title={t("action.approve")}
                                  className="text-success"
                                  onClick={() =>
                                    setReview({ row, decision: "APPROVED" })
                                  }
                                >
                                  <Check />
                                </Button>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  title={t("action.reject")}
                                  className="text-destructive"
                                  onClick={() =>
                                    setReview({ row, decision: "REJECTED" })
                                  }
                                >
                                  <X />
                                </Button>
                              </>
                            )}
                          {can("site_access.manage") &&
                            row.status === "APPROVED" && (
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                title={t("action.revoke")}
                                className="text-destructive"
                                onClick={() => setRevoke(row)}
                              >
                                <ShieldX />
                              </Button>
                            )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="gate">
          <Suspense fallback={<State text={t("state.loading")} />}>
            <GatePanel onRecorded={invalidate} />
          </Suspense>
        </TabsContent>
        <TabsContent value="devices">
          <DeviceEventsPanel />
        </TabsContent>
      </Tabs>
      {creating && (
        <PassDialog
          defaultProject={project === "all" ? "" : project}
          visitorPassHours={defaults.data?.visitor_pass_hours ?? 12}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await invalidate();
          }}
        />
      )}
      {editing && (
        <PassDialog
          row={editing}
          defaultProject={editing.project}
          visitorPassHours={defaults.data?.visitor_pass_hours ?? 12}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await invalidate();
          }}
        />
      )}
      {viewing && <PassDetail row={viewing} onClose={() => setViewing(null)} />}
      {qr && <PassQr row={qr} onClose={() => setQr(null)} />}
      <ConfirmDialog
        open={review !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReview(null);
            setReason("");
          }
        }}
        title={t(
          review?.decision === "APPROVED"
            ? "access.approveTitle"
            : "access.rejectTitle",
        )}
        description={t(
          review?.decision === "APPROVED"
            ? "access.approveBody"
            : "access.rejectBody",
        )}
        confirmLabel={t(
          review?.decision === "APPROVED" ? "action.approve" : "action.reject",
        )}
        confirmIcon={review?.decision === "APPROVED" ? ShieldCheck : ShieldX}
        variant={review?.decision === "APPROVED" ? "default" : "destructive"}
        isPending={reviewMutation.isPending}
        reason={reason}
        onReasonChange={setReason}
        reasonRequired={review?.decision === "REJECTED"}
        onConfirm={() => reviewMutation.mutate()}
      />
      <ConfirmDialog
        open={revoke !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRevoke(null);
            setReason("");
          }
        }}
        title={t("access.revokeTitle")}
        description={t("access.revokeBody")}
        confirmLabel={t("action.revoke")}
        confirmIcon={ShieldX}
        isPending={revokeMutation.isPending}
        reason={reason}
        onReasonChange={setReason}
        reasonRequired
        onConfirm={() => revokeMutation.mutate()}
      />
    </div>
  );
}

function GatePanel({ onRecorded }: { onRecorded: () => Promise<unknown> }) {
  const t = useTranslations("siteControl");
  const search = useSearchParams();
  const [token, setToken] = useState(() => search.get("scan") ?? "");
  const [direction, setDirection] = useState<"AUTO" | AccessDirection>("AUTO");
  const [gate, setGate] = useState("");
  const [photo, setPhoto] = useState<File>();
  const [location, setLocation] = useState<{
    latitude: string;
    longitude: string;
  }>();
  const [result, setResult] = useState<SiteAccessPass | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [qrImageError, setQrImageError] = useState("");
  const [locationError, setLocationError] = useState("");
  const scan = useMutation({
    mutationFn: () =>
      scanSiteAccessGate({
        qr_value: extractToken(token),
        direction,
        client_event_id: `gate-${crypto.randomUUID()}`,
        gate_name: gate,
        photo,
        ...location,
      }),
    onSuccess: async (row) => {
      setResult(row.pass);
      setToken("");
      setPhoto(undefined);
      await onRecorded();
    },
  });
  function getGps() {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError(t("gate.locationError"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setLocation({
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
        }),
      () => setLocationError(t("gate.locationError")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
  async function readQrImage(file: File) {
    setQrImageError("");
    try {
      setToken(await decodeGateQrImage(file));
    } catch {
      setQrImageError(t("gate.imageError"));
    }
  }
  return (
    <div className="mx-auto max-w-2xl space-y-5 rounded-lg border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <DoorOpen />
        </span>
        <div>
          <h2 className="text-lg font-semibold">{t("gate.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("gate.subtitle")}
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          type="button"
          size="lg"
          className="h-14"
          onClick={() => setScannerOpen(true)}
        >
          <Camera />
          {t("gate.cameraScan")}
        </Button>
        <label className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
          <ImagePlus />
          {t("gate.uploadImage")}
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void readQrImage(file);
            }}
          />
        </label>
      </div>
      {qrImageError && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {qrImageError}
        </p>
      )}
      <FieldWrapper
        label={t("gate.usbOrPaste")}
        required
        hint={t("gate.scannerHint")}
      >
        <Input
          autoFocus
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder={t("gate.qrPlaceholder")}
        />
      </FieldWrapper>
      {token.trim() && (
        <p className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
          {t("gate.qrReady")}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldWrapper label={t("field.direction")}>
          <Select
            value={direction}
            onValueChange={(value: "AUTO" | AccessDirection) =>
              setDirection(value)
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AUTO">{t("direction.AUTO")}</SelectItem>
              <SelectItem value="ENTRY">{t("direction.ENTRY")}</SelectItem>
              <SelectItem value="EXIT">{t("direction.EXIT")}</SelectItem>
            </SelectContent>
          </Select>
        </FieldWrapper>
        <FieldWrapper label={t("field.gateName")}>
          <Input
            value={gate}
            onChange={(event) => setGate(event.target.value)}
          />
        </FieldWrapper>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted/40">
          <QrCode />
          {photo ? t("gate.photoReady") : t("gate.photo")}
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => setPhoto(event.target.files?.[0])}
          />
        </label>
        <Button variant="outline" className="min-h-12" onClick={getGps}>
          <MapPin />
          {location ? t("gate.locationReady") : t("gate.getLocation")}
        </Button>
      </div>
      {locationError && (
        <p role="alert" className="text-sm text-destructive">
          {locationError}
        </p>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        {t("gate.readyHint")}
      </p>
      <Button
        size="lg"
        className="h-12 w-full"
        requires={[[token, t("gate.usbOrPaste")]]}
        disabled={scan.isPending}
        onClick={() => scan.mutate()}
      >
        {scan.isPending ? <Loader2 className="animate-spin" /> : <ScanLine />}
        {t("gate.record")}
      </Button>
      {scan.isError && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {scan.error instanceof Error
            ? scan.error.message
            : t("gate.recordError")}
        </p>
      )}
      {result && (
        <div className="rounded-lg border border-success/30 bg-success/5 p-4 text-center">
          <ShieldCheck className="mx-auto size-8 text-success" />
          <p className="mt-2 font-semibold">{result.subject_name}</p>
          <p className="text-sm text-muted-foreground">
            {result.pass_no} ·{" "}
            {result.current_direction
              ? t(`direction.${result.current_direction}`)
              : ""}
          </p>
        </div>
      )}
      <GateQrScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(value) => {
          setToken(value);
          setQrImageError("");
        }}
      />
    </div>
  );
}

function PassDialog({
  row,
  defaultProject,
  visitorPassHours,
  onClose,
  onSaved,
}: {
  /** Passed when correcting an existing pending pass, absent when creating. */
  row?: SiteAccessPass;
  defaultProject: string;
  visitorPassHours: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("siteControl");
  const now = new Date();
  const later = new Date(now.getTime() + visitorPassHours * 3600_000);
  const [form, setForm] = useState<SiteAccessPassPayload>({
    project: row?.project ?? defaultProject,
    subject_type: row?.subject_type ?? "VISITOR",
    worker: row?.worker ?? undefined,
    subject_name: row?.subject_name ?? "",
    subject_company: row?.subject_company ?? "",
    phone: row?.phone ?? "",
    identity_no: row?.identity_no ?? "",
    vehicle_plate: row?.vehicle_plate ?? "",
    driver_name: row?.driver_name ?? "",
    purpose: row?.purpose ?? "",
    host_name: row?.host_name ?? "",
    valid_from: row ? localInput(new Date(row.valid_from)) : localInput(now),
    valid_until: row ? localInput(new Date(row.valid_until)) : localInput(later),
  });
  const users = useQuery({
    queryKey: ["users", "access-worker"],
    queryFn: () => getUsers({ page_size: 200, status: "ACTIVE" }),
  });
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        valid_from: new Date(form.valid_from).toISOString(),
        valid_until: new Date(form.valid_until).toISOString(),
      };
      if (!row) return createSiteAccessPass(payload);
      // The backend refuses a project change on an existing pass, so an edit
      // never sends one.
      const editable: Partial<SiteAccessPassPayload> = { ...payload };
      delete editable.project;
      return updateSiteAccessPass(row.id, editable);
    },
    onSuccess: onSaved,
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t(row ? "access.editTitle" : "access.createTitle")}
          </DialogTitle>
          <DialogDescription>
            {t(row ? "access.editHelp" : "access.createHelp")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("field.project")} required>
            <ProjectPicker
              value={form.project}
              onValueChange={(value) => setForm({ ...form, project: value })}
              placeholder={t("field.chooseProject")}
              disabled={Boolean(row)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.subjectType")}>
            <Select
              value={form.subject_type}
              onValueChange={(value: AccessSubjectType) =>
                setForm({
                  ...form,
                  subject_type: value,
                  worker: null,
                  ...(value === "VISITOR"
                    ? {
                        valid_until: localInput(
                          new Date(
                            new Date(form.valid_from).getTime() +
                              visitorPassHours * 3600_000,
                          ),
                        ),
                      }
                    : {}),
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["WORKER", "VISITOR", "VEHICLE"].map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`subjectType.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          {form.subject_type === "WORKER" ? (
            <FieldWrapper
              label={t("field.worker")}
              required
              className="sm:col-span-2"
            >
              <Select
                value={form.worker ?? undefined}
                onValueChange={(value) => {
                  const user = users.data?.results.find(
                    (row) => row.id === value,
                  );
                  setForm({
                    ...form,
                    worker: value,
                    subject_name: user?.full_name ?? "",
                    phone: user?.phone ?? "",
                  });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("field.chooseWorker")} />
                </SelectTrigger>
                <SelectContent>
                  {(users.data?.results ?? []).map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.full_name} · {user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
          ) : (
            <>
              <FieldWrapper label={t("field.subjectName")} required>
                <Input
                  value={form.subject_name}
                  onChange={(event) =>
                    setForm({ ...form, subject_name: event.target.value })
                  }
                />
              </FieldWrapper>
              <FieldWrapper label={t("field.subjectCompany")}>
                <Input
                  value={form.subject_company}
                  onChange={(event) =>
                    setForm({ ...form, subject_company: event.target.value })
                  }
                />
              </FieldWrapper>
            </>
          )}
          <FieldWrapper label={t("field.phone")}>
            <Input
              value={form.phone}
              onChange={(event) =>
                setForm({ ...form, phone: event.target.value })
              }
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.identityNo")}>
            <Input
              value={form.identity_no}
              onChange={(event) =>
                setForm({ ...form, identity_no: event.target.value })
              }
            />
          </FieldWrapper>
          {form.subject_type === "VEHICLE" && (
            <>
              <FieldWrapper label={t("field.vehiclePlate")} required>
                <Input
                  value={form.vehicle_plate}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      vehicle_plate: event.target.value.toUpperCase(),
                    })
                  }
                />
              </FieldWrapper>
              <FieldWrapper label={t("field.driverName")}>
                <Input
                  value={form.driver_name}
                  onChange={(event) =>
                    setForm({ ...form, driver_name: event.target.value })
                  }
                />
              </FieldWrapper>
            </>
          )}
          <FieldWrapper
            label={t("field.purpose")}
            required
            className="sm:col-span-2"
          >
            <Textarea
              value={form.purpose}
              onChange={(event) =>
                setForm({ ...form, purpose: event.target.value })
              }
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.hostName")}>
            <Input
              value={form.host_name}
              onChange={(event) =>
                setForm({ ...form, host_name: event.target.value })
              }
            />
          </FieldWrapper>
          <span />
          <FieldWrapper label={t("field.validFrom")} required>
            <Input
              type="datetime-local"
              value={form.valid_from}
              onChange={(event) => {
                const validFrom = event.target.value;
                setForm({
                  ...form,
                  valid_from: validFrom,
                  ...(form.subject_type === "VISITOR"
                    ? {
                        valid_until: localInput(
                          new Date(
                            new Date(validFrom).getTime() +
                              visitorPassHours * 3600_000,
                          ),
                        ),
                      }
                    : {}),
                });
              }}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.validUntil")} required>
            <Input
              type="datetime-local"
              value={form.valid_until}
              onChange={(event) =>
                setForm({ ...form, valid_until: event.target.value })
              }
            />
          </FieldWrapper>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [form.project, t("field.project")],
              [form.purpose, t("field.purpose")],
              [form.valid_from, t("field.validFrom")],
              [form.valid_until, t("field.validUntil")],
              [
                form.subject_type === "WORKER"
                  ? form.worker
                  : form.subject_name,
                form.subject_type === "WORKER"
                  ? t("field.worker")
                  : t("field.subjectName"),
              ],
              [
                form.subject_type !== "VEHICLE" || form.vehicle_plate,
                t("field.vehiclePlate"),
              ],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <Plus />
            {t("action.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The append-only ledger of what ANPR, RFID, face and visitor devices
 * reported at the gates. Denials are records too — an auditor asking "who
 * was turned away and why" reads this, not the device vendor's portal.
 */
function DeviceEventsPanel() {
  const t = useTranslations("siteControl");
  const [project, setProject] = useState("all");
  const [result, setResult] = useState("all");
  const rows = useQuery({
    queryKey: ["site-access-device-events", project, result],
    queryFn: () =>
      getThirdPartyAccessEvents({
        page_size: 200,
        ...(project !== "all" ? { project } : {}),
        ...(result !== "all" ? { verification_result: result } : {}),
      }),
  });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2">
        <FieldWrapper label={t("field.project")}>
          <ProjectPicker
            value={project}
            onValueChange={setProject}
            placeholder={t("field.chooseProject")}
            allowAll
            allLabel={t("field.allProjects")}
          />
        </FieldWrapper>
        <FieldWrapper label={t("deviceEvent.result")}>
          <Select value={result} onValueChange={setResult}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("field.allStatuses")}</SelectItem>
              <SelectItem value="ALLOWED">
                {t("deviceEvent.allowed")}
              </SelectItem>
              <SelectItem value="DENIED">{t("deviceEvent.denied")}</SelectItem>
            </SelectContent>
          </Select>
        </FieldWrapper>
      </div>
      {rows.isLoading ? (
        <State text={t("state.loading")} />
      ) : rows.isError ? (
        <State text={t("state.loadError")} danger />
      ) : !rows.data?.count ? (
        <State text={t("deviceEvent.empty")} />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table className="min-w-[1080px]">
            <TableHeader>
              <TableRow>
                {[
                  "occurredAt",
                  "device",
                  "gate",
                  "credential",
                  "pass",
                  "direction",
                  "result",
                  "reason",
                ].map((key) => (
                  <TableHead key={key}>
                    {t(`deviceEvent.${key}`)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.data.results.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="text-xs">
                    <p>{formatDate(event.occurred_at)}</p>
                    <p className="text-muted-foreground">
                      {event.project_name}
                    </p>
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">
                    {event.device_id}
                  </TableCell>
                  <TableCell>
                    {event.gate_name || t("access.unknownGate")}
                  </TableCell>
                  <TableCell>
                    <p>{t(`credentialType.${event.credential_type}`)}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {event.credential_hint || "-"}
                    </p>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {event.pass_no || "-"}
                  </TableCell>
                  <TableCell>
                    {t(`direction.${event.direction}`)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      label={
                        event.verification_result === "ALLOWED"
                          ? t("deviceEvent.allowed")
                          : t("deviceEvent.denied")
                      }
                      tone={
                        event.verification_result === "ALLOWED"
                          ? "positive"
                          : "danger"
                      }
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {event.reason_code || "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

const EXTERNAL_CREDENTIAL_TYPES: Exclude<AccessCredentialType, "QR">[] = [
  "ANPR",
  "RFID",
  "FACE",
  "VISITOR_ID",
];

/**
 * External credentials bound to one pass. The value itself is hashed on
 * the server and never comes back — the list shows the hint, so revoking
 * the right card is possible without ever re-exposing the card number.
 */
function PassDetail({
  row,
  onClose,
}: {
  row: SiteAccessPass;
  onClose: () => void;
}) {
  const t = useTranslations("siteControl");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{row.pass_no}</DialogTitle>
          <DialogDescription>
            {row.subject_name} · {row.project_name}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <Info
            label={t("field.status")}
            value={t(`passStatus.${row.effective_status}`)}
          />
          <Info
            label={t("field.validFrom")}
            value={formatDate(row.valid_from)}
          />
          <Info
            label={t("field.validUntil")}
            value={formatDate(row.valid_until)}
          />
        </div>
        <CredentialsPanel pass={row} />

        <h3 className="mt-2 font-semibold">{t("access.timeline")}</h3>
        {!row.events.length ? (
          <State text={t("access.noEvents")} />
        ) : (
          <div className="space-y-3 border-l-2 border-muted pl-5">
            {row.events.map((event) => (
              <div
                key={event.id}
                className="relative rounded-lg border p-3 before:absolute before:-left-[1.72rem] before:top-4 before:size-3 before:rounded-full before:bg-primary"
              >
                <div className="flex items-center justify-between gap-3">
                  <strong>{t(`direction.${event.direction}`)}</strong>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(event.occurred_at)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {event.gate_name || t("access.unknownGate")} ·{" "}
                  {event.scanned_by_name || t("access.integrationReader")}
                </p>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>{t("action.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Register what the gate hardware will actually read for this pass.
 *
 * A QR entry matches the pass's own token and needs nothing here. Every other
 * lane — plate camera, card reader, face unit — matches against a credential
 * registered in advance, and answers "unknown credential" when there is none.
 * Without this screen those lanes refuse everybody, which is why the hardware
 * integration could never be used even once a brand was chosen.
 *
 * The value is write-only by design: the server keeps a hash and a short hint,
 * so a card can be recognised in this list and revoked, but never read back.
 */
function CredentialsPanel({ pass }: { pass: SiteAccessPass }) {
  const t = useTranslations("siteControl");
  const queryClient = useQueryClient();
  const [type, setType] = useState<Exclude<AccessCredentialType, "QR">>("RFID");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [revoking, setRevoking] = useState<SiteAccessCredential | null>(null);
  // The backend writes this into the audit entry for the revocation. Asking
  // for it is the only reason a confirmation step earns its interruption.
  const [revokeReason, setRevokeReason] = useState("");

  const approved = pass.status === "APPROVED";

  const credentials = useQuery({
    queryKey: ["site-access-credentials", pass.id],
    queryFn: () => getSiteAccessCredentials(pass.id),
  });

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["site-access-credentials", pass.id],
    });

  const register = useMutation({
    mutationFn: () =>
      registerSiteAccessCredential(pass.id, {
        credential_type: type,
        credential_value: value.trim(),
        label: label.trim(),
      }),
    onSuccess: async () => {
      setValue("");
      setLabel("");
      await refresh();
    },
  });

  const revoke = useMutation({
    mutationFn: (credential: SiteAccessCredential) =>
      revokeSiteAccessCredential(pass.id, credential.id, revokeReason.trim()),
    onSuccess: async () => {
      setRevoking(null);
      setRevokeReason("");
      await refresh();
    },
  });

  const rows = credentials.data ?? [];

  return (
    <section className="mt-2 space-y-3">
      <div>
        <h3 className="font-semibold">{t("credential.title")}</h3>
        <p className="text-sm text-muted-foreground">{t("credential.help")}</p>
      </div>

      {!approved ? (
        <State text={t("credential.approveFirst")} />
      ) : (
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[10rem_1fr_1fr_auto]">
          <Select
            value={type}
            onValueChange={(next) => setType(next as Exclude<AccessCredentialType, "QR">)}
          >
            <SelectTrigger aria-label={t("credential.type")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXTERNAL_CREDENTIAL_TYPES.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {t(`credentialType.${kind}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t("credential.valuePlaceholder")}
            aria-label={t("credential.value")}
          />
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={t("credential.labelPlaceholder")}
            aria-label={t("credential.label")}
          />
          <Button
            requires={[[value, t("credential.value")]]}
            disabled={register.isPending}
            onClick={() => register.mutate()}
          >
            {register.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Plus />
            )}
            {t("credential.register")}
          </Button>
        </div>
      )}

      {credentials.isError ? (
        <LoadFailed onRetry={() => void credentials.refetch()} />
      ) : credentials.isLoading ? (
        <State text={t("credential.loading")} />
      ) : !rows.length ? (
        <State text={t("credential.none")} />
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 p-3"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {t(`credentialType.${row.credential_type}`)} ·{" "}
                  <span className="font-mono">{row.identifier_hint}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {row.label || t("credential.noLabel")}
                  {row.is_active ? "" : ` · ${t("credential.revoked")}`}
                </p>
              </div>
              {row.is_active ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRevoking(row)}
                >
                  {t("credential.revoke")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {revoking ? (
        <ConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next) {
              setRevoking(null);
              setRevokeReason("");
            }
          }}
          title={t("credential.revokeTitle")}
          description={t("credential.revokeConfirm", {
            hint: revoking.identifier_hint,
          })}
          confirmLabel={t("credential.revoke")}
          confirmIcon={Ban}
          isPending={revoke.isPending}
          reason={revokeReason}
          onReasonChange={setRevokeReason}
          onConfirm={() => revoke.mutate(revoking)}
        />
      ) : null}
    </section>
  );
}

function PassQr({
  row,
  onClose,
}: {
  row: SiteAccessPass;
  onClose: () => void;
}) {
  const t = useTranslations("siteControl");
  const ref = useRef<HTMLCanvasElement>(null);
  const token = extractToken(row.qr_value);
  const url =
    typeof window === "undefined"
      ? row.qr_value
      : `${window.location.origin}/site-access?scan=${encodeURIComponent(token)}`;
  function save() {
    const canvas = ref.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${row.pass_no}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("access.qrTitle")}</DialogTitle>
          <DialogDescription>{t("access.qrHelp")}</DialogDescription>
        </DialogHeader>
        <div className="mx-auto rounded-lg border bg-white p-4">
          <QRCodeCanvas
            ref={ref}
            value={url}
            size={220}
            level="H"
            marginSize={1}
          />
        </div>
        <p className="text-center font-semibold tabular-nums">{row.pass_no}</p>
        <DialogFooter>
          <Button variant="outline" onClick={save}>
            <Download />
            PNG
          </Button>
          <Button onClick={onClose}>{t("action.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function extractToken(value: string) {
  const scan = value.match(/[?&]scan=([^&]+)/)?.[1];
  if (scan) return decodeURIComponent(scan);
  return value.startsWith("MSEACCESS:")
    ? value.slice("MSEACCESS:".length)
    : value.trim();
}
function localInput(date: Date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}
function formatDate(value: string) {
  return new Date(value).toLocaleString();
}
function passTone(
  status: string,
): "neutral" | "positive" | "warning" | "danger" | "info" {
  if (status === "APPROVED") return "positive";
  if (status === "PENDING") return "warning";
  if (status === "REJECTED" || status === "REVOKED") return "danger";
  return "neutral";
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
function State({ text, danger = false }: { text: string; danger?: boolean }) {
  return (
    <div
      className={`grid min-h-36 place-items-center rounded-lg border border-dashed p-6 text-center text-sm ${danger ? "text-destructive" : "text-muted-foreground"}`}
    >
      {text}
    </div>
  );
}
