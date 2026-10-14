"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Download,
  Eye,
  KeyRound,
  Ban,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  RadioTower,
  ScanLine,
  ShieldCheck,
  ShieldX,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  FieldWrapper,
  ListHeader,
  LoadFailed,
  QueryFailedNote,
  StatusBadge,
} from "@/components/shared/page-primitives";
import {
  NEEDS_ACTION_PARAM,
  NeedsActionChip,
  NeedsActionMarker,
  useNeedsActionParam,
} from "@/components/shared/needs-action";
import { VisitorScanPanel } from "@/components/site-access/visitor-scan";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { usePageProject, useProjectBoxShown } from "@/components/providers/current-project-provider";
import { ExportButton } from "@/components/shared/export-button";
import { RecordExportButton } from "@/components/shared/record-export-button";
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
  AccessSubjectType,
  SiteAccessPass,
  SiteAccessPassPayload,
} from "@/interfaces/site-access";
import { openOnSamePage } from "@/lib/same-page-link";
import {
  createSiteAccessPass,
  getSiteAccessCredentials,
  getSiteAccessDefaults,
  getSiteAccessPass,
  exportSiteAccessPasses,
  getSiteAccessPasses,
  getThirdPartyAccessEvents,
  registerSiteAccessCredential,
  reviewSiteAccessPass,
  revokeSiteAccessCredential,
  revokeSiteAccessPass,
  updateSiteAccessPass, exportDeviceEvents } from "@/services/site-access.service";
import { getUsers } from "@/services/users.service";

/** The status filter's "approved, running out within the week" choice. */
const EXPIRING = "expiring";

const SITE_ACCESS_TABS = ["passes", "gate", "devices"] as const;
type SiteAccessTab = (typeof SITE_ACCESS_TABS)[number];

/**
 * Where an old 门岗拍照记录 address goes now (HD9): that tab moved to
 * EHS / Safety → 门岗记录. `?tab=gate-records` and a notification's
 * `?gate_incident=` keep working; the record and its project come along.
 */
export function movedGateRecordsHref(search: Pick<URLSearchParams, "get">): string | null {
  const incident = search.get("gate_incident");
  if (search.get("tab") !== "gate-records" && !incident) return null;
  const params = new URLSearchParams();
  if (incident) params.set("gate_incident", incident);
  const project = search.get("project");
  if (project) params.set("project", project);
  const query = params.toString();
  return query ? `/gate-records?${query}` : "/gate-records";
}

/**
 * The tab an address opens. `?tab=` names it; a scanned pass link
 * (`?scan=`) opens 访客扫码 for someone who may scan. Anything else is
 * 通行证.
 */
function siteAccessTab(
  search: Pick<URLSearchParams, "get">,
  canScan: boolean,
): SiteAccessTab {
  const asked = search.get("tab");
  if (asked === "gate" || search.get("scan")) return canScan ? "gate" : "passes";
  if (asked === "devices") return "devices";
  return "passes";
}

export function SiteAccessWorkspace() {
  const t = useTranslations("siteControl");
  const tRoot = useTranslations();
  const { can } = useAuth();
  // 「待处理 N」 (2026-10-09): only the passes waiting for this reader's
  // approval - the sidebar's number for 门禁.
  const [waitingOnly, setWaitingOnly] = useNeedsActionParam();
  const qc = useQueryClient();
  const search = useSearchParams();
  const router = useRouter();
  const moved = movedGateRecordsHref(search);
  useEffect(() => {
    if (moved) router.replace(moved);
  }, [moved, router]);
  const requestedPassId = search.get("pass");
  // The address says which tab, every render - not once when the page
  // mounted. The sidebar's 「通行证」 and 「门岗扫码」 are this one page with
  // a different `?tab=`, so moving between them keeps the page mounted and
  // only the address changes (Lucas 2026-10-10, 图4: 「点了另一个不会切换」).
  const addressTab = siteAccessTab(search, can("site_access.scan"));
  // A tab pressed here shows at once; the address follows. Should the
  // address move on its own (the sidebar, a notification), it wins again.
  const [shown, setShown] = useState({ address: addressTab, tab: addressTab });
  if (shown.address !== addressTab) setShown({ address: addressTab, tab: addressTab });
  const tab = shown.tab;
  // The dashboard's 通行证即将到期 figure opens `?expiring=1` (C15).
  // The top bar's 「当前项目」 when it is in force (B13).
  const [project, setProject] = usePageProject(search.get("project") ?? "", { all: "all" });
  const projectBoxShown = useProjectBoxShown("filter");
  const [status, setStatus] = useState(
    search.get("expiring") === "1" ? EXPIRING : "all",
  );
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
  // A pressed tab shows at once and is written to the address. The state
  // passed is `null`: handing Next.js its own router state back made it
  // ignore the change, so the page only switched after a refresh (Lucas
  // 2026-10-10: 「url换了可是页面没有换」).
  const changeTab = (value: string) => {
    const nextTab = SITE_ACCESS_TABS.find((key) => key === value) ?? "passes";
    const url = new URL(window.location.href);
    if (nextTab === "passes") url.searchParams.delete("tab");
    else url.searchParams.set("tab", nextTab);
    if (nextTab !== "gate") url.searchParams.delete("scan");
    setShown((current) => ({ ...current, tab: nextTab }));
    openOnSamePage(`${url.pathname}${url.search}${url.hash}`, true);
  };
  const defaults = useQuery({
    queryKey: ["site-access-defaults"],
    queryFn: getSiteAccessDefaults,
  });
  const rows = useQuery({
    queryKey: ["site-access-passes", project, status, waitingOnly],
    queryFn: () =>
      getSiteAccessPasses({
        page_size: 200,
        ...(project !== "all" ? { project } : {}),
        ...(waitingOnly ? { [NEEDS_ACTION_PARAM]: "1" } : {}),
        ...(status === EXPIRING
          ? { expiring: "1" }
          : status !== "all"
            ? { status }
            : {}),
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
    <div className="flex flex-col gap-4">
      <ListHeader
        title={t("access.title")}
        subtitle={t("access.subtitle")}
        action={
          tab === "passes" ? (
            <>
              <NeedsActionChip
                count={rows.data?.needs_action_count}
                active={waitingOnly}
                onToggle={setWaitingOnly}
              />
              {/* The passes listed, as a file (H16, HD13). */}
              <ExportButton
                disabled={!rows.data?.count}
                disabledReason={t("access.empty")}
                title={t("access.title")}
                onExport={(format) =>
                  exportSiteAccessPasses({
                    format,
                    title: t("access.title"),
                    query: {
                      ...(project !== "all" ? { project } : {}),
                      ...(waitingOnly ? { [NEEDS_ACTION_PARAM]: "1" } : {}),
                      ...(status === EXPIRING ? { expiring: "1" } : status !== "all" ? { status } : {}),
                    },
                    columns: [
                      { key: "pass_no", label: t("visitorRecords.field.pass") },
                      {
                        key: "subject_type",
                        label: t("field.subjectType"),
                        values: {
                          WORKER: t("subjectType.WORKER"),
                          VISITOR: t("subjectType.VISITOR"),
                          VEHICLE: t("subjectType.VEHICLE"),
                        },
                      },
                      { key: "subject_name", label: t("field.subjectName") },
                      { key: "subject_company", label: t("field.subjectCompany") },
                      { key: "phone", label: t("field.phone") },
                      { key: "vehicle_plate", label: t("field.vehiclePlate") },
                      { key: "purpose", label: t("field.purpose") },
                      { key: "project_name", label: t("field.project") },
                      { key: "valid_from", label: t("field.validFrom") },
                      { key: "valid_until", label: t("field.validUntil") },
                      {
                        key: "effective_status",
                        label: t("field.status"),
                        values: Object.fromEntries(
                          (["PENDING", "APPROVED", "REJECTED", "REVOKED", "EXPIRED"] as const).map(
                            (code) => [code, t(`passStatus.${code}`)],
                          ),
                        ),
                      },
                      { key: "approved_by_name", label: t("visitorRecords.field.approvedBy") },
                    ],
                  })
                }
              />
              {can("site_access.manage") ? (
                <Button
                  disabledReason={defaults.isError ? t("access.defaultsFailed") : defaults.isLoading ? t("state.loading") : undefined}
                  disabled={defaults.isLoading || defaults.isError}
                  onClick={() => setCreating(true)}
                >
                  <Plus />
                  {t("access.newPass")}
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      />
      <QueryFailedNote query={defaults} what={t("what.defaults")} />
      <QueryFailedNote query={focusedPass} what={t("what.requestedPass")} />
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
        {/* What the open tab is for, in one line (Lucas 2026-10-10, 图6:
            「我也是不明白」). */}
        <p className="text-sm text-muted-foreground" data-tab-help={tab}>
          {t(`access.tabHelp.${tab}`)}
        </p>
        <TabsContent value="passes" className="space-y-4">
          <div className="surface-panel grid gap-3 rounded-xl px-4 py-3 sm:grid-cols-2 sm:px-6 sm:py-4">
            {projectBoxShown && (
            <FieldWrapper label={t("field.project")}>
              <ProjectPicker
                value={project}
                onValueChange={setProject}
                placeholder={t("field.chooseProject")}
                allowAll
                allLabel={t("field.allProjects")}
              />
            </FieldWrapper>
            )}
            <FieldWrapper label={t("field.status")}>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("field.allStatuses")}</SelectItem>
                  <SelectItem value={EXPIRING}>{t("field.expiringSoon")}</SelectItem>
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
            <div className="surface-panel overflow-hidden rounded-xl">
              <Table className="min-w-235">
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
                    ].map((key) => (
                      <TableHead key={key}>
                        {t(`table.${key}`)}
                      </TableHead>
                    ))}
                    <TableHead>
                      <span className="sr-only">{tRoot("needsAction.column")}</span>
                    </TableHead>
                    <TableHead>{t("table.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.data.results.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium tabular">
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
                        <NeedsActionMarker show={row.needs_action} />
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
          <VisitorScanPanel
            project={project === "all" ? "" : project}
            lockProject={false}
            initialToken={search.get("scan") ?? ""}
            onRecorded={() => void invalidate()}
          />
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
              <QueryFailedNote query={users} what={t("what.workers")} />
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
  // Why a machine let someone in or turned them away, in words; a code this
  // screen has no words for yet still shows as sent.
  const reasonText = (code: string) =>
    !code
      ? "-"
      : t.has(`deviceEvent.reasonCode.${code}`)
        ? t(`deviceEvent.reasonCode.${code}`)
        : code;
  const [project, setProject] = usePageProject("", { all: "all" });
  const projectBoxShown = useProjectBoxShown("filter");
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
      <div className="surface-panel grid gap-3 rounded-xl px-4 py-3 sm:grid-cols-2 sm:px-6 sm:py-4">
        {projectBoxShown && (
        <FieldWrapper label={t("field.project")}>
          <ProjectPicker
            value={project}
            onValueChange={setProject}
            placeholder={t("field.chooseProject")}
            allowAll
            allLabel={t("field.allProjects")}
          />
        </FieldWrapper>
        )}
        <div className="flex items-end sm:col-span-2">
          {/* The device events listed, as a file (H16, HD13). */}
          <ExportButton
            disabled={!rows.data?.count}
            disabledReason={t("deviceEvent.empty")}
            title={t("access.deviceEvents")}
            onExport={(format) =>
              exportDeviceEvents({
                format,
                title: t("access.deviceEvents"),
                query: {
                  ...(project !== "all" ? { project } : {}),
                  ...(result !== "all" ? { verification_result: result } : {}),
                },
                columns: [
                  { key: "occurred_at", label: t("deviceEvent.occurredAt") },
                  { key: "project_name", label: t("field.project") },
                  { key: "device_id", label: t("deviceEvent.device") },
                  { key: "gate_name", label: t("deviceEvent.gate") },
                  {
                    key: "credential_type",
                    label: t("deviceEvent.credential"),
                    values: t.raw("credentialType") as Record<string, string>,
                  },
                  { key: "pass_no", label: t("deviceEvent.pass") },
                  {
                    key: "direction",
                    label: t("deviceEvent.direction"),
                    values: { ENTRY: t("direction.ENTRY"), EXIT: t("direction.EXIT") },
                  },
                  {
                    key: "verification_result",
                    label: t("deviceEvent.result"),
                    values: { ALLOWED: t("deviceEvent.allowed"), DENIED: t("deviceEvent.denied") },
                  },
                  {
                    key: "reason_code",
                    label: t("deviceEvent.reason"),
                    values: t.raw("deviceEvent.reasonCode") as Record<string, string>,
                  },
                ],
              })
            }
          />
        </div>
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
        <div className="surface-panel overflow-hidden rounded-xl">
          <Table className="min-w-270">
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
                  <TableCell className="font-medium tabular">
                    {event.device_id}
                  </TableCell>
                  <TableCell>
                    {event.gate_name || t("access.unknownGate")}
                  </TableCell>
                  <TableCell>
                    <p>{t(`credentialType.${event.credential_type}`)}</p>
                    <p className="text-xs text-muted-foreground tabular">
                      {event.credential_hint || "-"}
                    </p>
                  </TableCell>
                  <TableCell className="tabular">
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
                    {reasonText(event.reason_code)}
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
        {/* 预览 · 打印 · 导出 · 发送 on this one pass and its entries and exits (H16, HD13). */}
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <RecordExportButton
            kind="ACCESS_PASS"
            recordId={row.id}
            reference={row.pass_no}
            href={`/site-access?pass=${row.id}&project=${row.project}`}
          />
        </div>
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
        <div className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-[10rem_1fr_1fr_auto]">
          <FieldWrapper label={t("credential.type")}>
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
          </FieldWrapper>
          <FieldWrapper label={t("credential.value")} required>
            <Input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-label={t("credential.value")}
            />
          </FieldWrapper>
          <FieldWrapper label={t("credential.label")}>
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={t("credential.labelPlaceholder")}
              aria-label={t("credential.label")}
            />
          </FieldWrapper>
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
        <LoadFailed what={t("what.credentials")} onRetry={() => void credentials.refetch()} />
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
        <div className="mx-auto rounded-lg border bg-paper p-4">
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
      className={`grid min-h-36 place-items-center rounded-xl border border-dashed border-panel-border p-6 text-center text-sm ${danger ? "text-destructive" : "text-muted-foreground"}`}
    >
      {text}
    </div>
  );
}
