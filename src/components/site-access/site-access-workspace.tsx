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
  Loader2,
  MapPin,
  Plus,
  QrCode,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  AccessDirection,
  AccessSubjectType,
  SiteAccessPass,
  SiteAccessPassPayload,
} from "@/interfaces/site-access";
import {
  createSiteAccessPass,
  getSiteAccessDefaults,
  getSiteAccessPass,
  getSiteAccessPasses,
  reviewSiteAccessPass,
  revokeSiteAccessPass,
  scanSiteAccessGate,
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
  const [tab, setTab] = useState<"passes" | "gate">(
    requestedGate && can("site_access.scan") ? "gate" : "passes",
  );
  const [project, setProject] = useState("all");
  const [status, setStatus] = useState("all");
  const [creating, setCreating] = useState(false);
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
      value === "gate" && can("site_access.scan") ? "gate" : "passes";
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
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[940px] text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
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
                      <th key={key} className="px-4 py-3 font-medium">
                        {t(`table.${key}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.data.results.map((row) => (
                    <tr key={row.id} className="bg-card hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium tabular-nums">
                        {row.pass_no}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{row.subject_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.subject_company || row.phone}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {t(`subjectType.${row.subject_type}`)}
                      </td>
                      <td className="px-4 py-3">{row.project_name}</td>
                      <td className="px-4 py-3 text-xs">
                        <p>{formatDate(row.valid_from)}</p>
                        <p className="text-muted-foreground">
                          {formatDate(row.valid_until)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          label={t(`passStatus.${row.effective_status}`)}
                          tone={passTone(row.effective_status)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {row.current_direction
                          ? t(`direction.${row.current_direction}`)
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center">
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="gate">
          <Suspense fallback={<State text={t("state.loading")} />}>
            <GatePanel onRecorded={invalidate} />
          </Suspense>
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
        disabled={!token.trim() || scan.isPending}
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
  defaultProject,
  visitorPassHours,
  onClose,
  onSaved,
}: {
  defaultProject: string;
  visitorPassHours: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("siteControl");
  const now = new Date();
  const later = new Date(now.getTime() + visitorPassHours * 3600_000);
  const [form, setForm] = useState<SiteAccessPassPayload>({
    project: defaultProject,
    subject_type: "VISITOR",
    subject_name: "",
    subject_company: "",
    phone: "",
    identity_no: "",
    vehicle_plate: "",
    driver_name: "",
    purpose: "",
    host_name: "",
    valid_from: localInput(now),
    valid_until: localInput(later),
  });
  const users = useQuery({
    queryKey: ["users", "access-worker"],
    queryFn: () => getUsers({ page_size: 200, status: "ACTIVE" }),
  });
  const save = useMutation({
    mutationFn: () =>
      createSiteAccessPass({
        ...form,
        valid_from: new Date(form.valid_from).toISOString(),
        valid_until: new Date(form.valid_until).toISOString(),
      }),
    onSuccess: onSaved,
  });
  const valid =
    form.project &&
    form.purpose.trim() &&
    form.valid_from &&
    form.valid_until &&
    (form.subject_type === "WORKER" ? form.worker : form.subject_name.trim()) &&
    (form.subject_type !== "VEHICLE" || form.vehicle_plate.trim());
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("access.createTitle")}</DialogTitle>
          <DialogDescription>{t("access.createHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("field.project")} required>
            <ProjectPicker
              value={form.project}
              onValueChange={(value) => setForm({ ...form, project: value })}
              placeholder={t("field.chooseProject")}
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
            disabled={!valid || save.isPending}
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
