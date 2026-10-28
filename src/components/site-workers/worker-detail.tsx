"use client";

/**
 * 「查看」 on 人员名单 (I20): 人员完整资料、历史进出场记录、最后一次 GPS 位置
 * （地图）、最后定位更新时间 - and the location link.
 *
 * The last position follows ID54: inside the fence it is drawn on the map;
 * outside, the server sends no point at all, only 「在工地外，距离围栏约 x
 * 公里」 and the time.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FileText, Link2, Loader2, MapPin, MessageCircle, Pencil, RotateCcw } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  LocationMap,
  type LocationMapMarker,
  type LocationMapZone,
} from "@/components/shared/location-map";
import { ArmRow, QueryBoundary, StatusBadge } from "@/components/shared/page-primitives";
import { VisitExit } from "@/components/site-workers/visit-exit";
import { WorkerFormDialog } from "@/components/site-workers/worker-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { SiteWorkerDetail, WorkerFence } from "@/interfaces/site-workers";
import { useDateFormat } from "@/lib/dates";
import { nationalityLabel, passportExpired, workerStatusTone, workerWhatsappUrl } from "@/lib/site-workers";
import {
  deactivateSiteWorker,
  getSiteWorker,
  issueWorkerLink,
  reactivateSiteWorker,
} from "@/services/site-workers.service";

function fenceZones(fences: WorkerFence[]): LocationMapZone[] {
  return fences.flatMap((fence): LocationMapZone[] => {
    if (fence.shape === "POLYGON") {
      const points = fence.polygon.filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
      return points.length >= 3 ? [{ id: fence.id, label: fence.name, points }] : [];
    }
    const latitude = Number(fence.latitude);
    const longitude = Number(fence.longitude);
    const radiusM = Number(fence.radius_m);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !(radiusM > 0)) return [];
    return [{ id: fence.id, label: fence.name, center: [latitude, longitude], radiusM }];
  });
}

function Value({ label, value, warn }: { label: string; value: string; warn?: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-muted/20 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-medium text-foreground">{value || "—"}</div>
      {warn && <div className="mt-0.5 text-xs font-medium text-destructive">{warn}</div>}
    </div>
  );
}

/**
 * 护照照片 (JB61-2): a 64 px thumbnail that opens the photo, or a PDF tile.
 * Only readers of the roster ever get the address (PDPA).
 */
function PassportPhoto({ url, isPdf, label, openLabel }: {
  url: string | null;
  isPdf: boolean;
  label: string;
  openLabel: string;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-muted/20 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-primary"
          aria-label={openLabel}
        >
          {isPdf ? (
            <span className="flex size-16 items-center justify-center rounded-md border bg-muted">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </span>
          ) : (
            <span className="relative block size-16 overflow-hidden rounded-md border bg-muted">
              <Image src={url} alt={label} fill sizes="64px" className="object-cover" unoptimized />
            </span>
          )}
          {openLabel}
        </a>
      ) : (
        <div className="mt-1 font-medium text-foreground">—</div>
      )}
    </div>
  );
}

export function WorkerDetailDialog({
  workerId,
  onClose,
  onAllVisits,
}: {
  workerId: string | null;
  onClose: () => void;
  onAllVisits: (workerId: string) => void;
}) {
  const t = useTranslations("siteWorkers");
  const common = useTranslations("common");
  const df = useDateFormat();
  const locale = useLocale();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState(false);
  const [issued, setIssued] = useState<{ url: string; worker: SiteWorkerDetail } | null>(null);
  const mayManage = can("site_worker.manage");

  const detail = useQuery({
    queryKey: ["site-workers", "detail", workerId],
    queryFn: () => getSiteWorker(workerId ?? ""),
    enabled: Boolean(workerId),
    refetchInterval: 60_000,
  });
  const worker = detail.data;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["site-workers"] });

  const issue = useMutation({
    mutationFn: () => issueWorkerLink(workerId ?? ""),
    onSuccess: (result) => {
      refresh();
      if (worker) setIssued({ url: result.link_url, worker });
    },
  });
  const deactivate = useMutation({
    mutationFn: () => deactivateSiteWorker(workerId ?? ""),
    onSuccess: () => {
      setArmed(false);
      refresh();
    },
  });
  const reactivate = useMutation({
    mutationFn: () => reactivateSiteWorker(workerId ?? ""),
    onSuccess: refresh,
  });

  const last = worker?.last_position ?? null;
  const zones = useMemo(() => fenceZones(worker?.fences ?? []), [worker?.fences]);
  const markers = useMemo<LocationMapMarker[]>(() => {
    if (!worker || !last || last.geofence_result !== "INSIDE" || !last.latitude || !last.longitude) return [];
    return [
      {
        id: worker.id,
        latitude: Number(last.latitude),
        longitude: Number(last.longitude),
        label: worker.name,
        detail: t("detail.lastAt", { at: df.dateTime(last.received_at) }),
        tone: worker.status === "ON_SITE" ? "positive" : "warning",
        stale: worker.status === "STALE",
        icon: "person",
      },
    ];
  }, [df, last, t, worker]);

  const linkStatus = worker?.link.status ?? "NONE";
  const hasLink = linkStatus !== "NONE" && linkStatus !== "REVOKED";

  return (
    <>
      <Dialog
        open={Boolean(workerId) && !editing && !issued}
        onOpenChange={(value) => {
          if (!value) {
            setArmed(false);
            onClose();
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{worker?.name ?? t("detail.title")}</DialogTitle>
            <DialogDescription>
              {worker ? [worker.project_name, worker.phone].filter(Boolean).join(" · ") : ""}
            </DialogDescription>
          </DialogHeader>
          <QueryBoundary query={detail} what={t("what.worker")}>
            {worker ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge label={t(`status.${worker.status}`)} tone={workerStatusTone(worker.status)} />
                  {!worker.is_active && <StatusBadge label={t("filter.inactive")} tone="neutral" />}
                  <span className="text-sm text-muted-foreground">
                    {/* Outside the fence nothing of where is kept (J25): the
                        time here is then the last one on site, and says so,
                        so it does not argue with 「在工地外 · 12:25」 below. */}
                    {worker.last_position_at
                      ? t(last?.geofence_result === "OUTSIDE" ? "detail.lastInsideAt" : "detail.lastAt", {
                          at: df.dateTime(worker.last_position_at),
                        })
                      : t("status.NOT_STARTED")}
                  </span>
                </div>

                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="panel-title">{t("detail.profile")}</h3>
                    {mayManage && (
                      <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                        <Pencil className="h-4 w-4" />
                        {t("action.edit")}
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    <Value label={t("field.name")} value={worker.name} />
                    <Value label={t("field.phone")} value={worker.phone} />
                    <Value label={t("field.passportNo")} value={worker.passport_no} />
                    <Value label={t("field.nationality")} value={nationalityLabel(worker.nationality, locale)} />
                    <Value
                      label={t("field.dateOfBirth")}
                      value={worker.date_of_birth ? df.date(worker.date_of_birth) : ""}
                    />
                    <Value
                      label={t("field.passportExpiry")}
                      value={worker.passport_expiry ? df.date(worker.passport_expiry) : ""}
                      warn={passportExpired(worker.passport_expiry) ? t("detail.passportExpired") : undefined}
                    />
                    <PassportPhoto
                      url={worker.passport_photo_url}
                      isPdf={worker.passport_photo_is_pdf}
                      label={t("field.passportPhoto")}
                      openLabel={t("detail.openPassportPhoto")}
                    />
                    <Value label={t("field.cidb")} value={worker.cidb_no} />
                    <Value label={t("field.company")} value={worker.company_name} />
                    <Value label={t("field.project")} value={worker.project_name} />
                    <Value
                      label={t("field.documents")}
                      value={worker.documents.map((row) => `${row.name} ${row.number}`).join("; ")}
                    />
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="panel-title">{t("detail.lastPosition")}</h3>
                  {!last ? (
                    <p className="text-sm text-muted-foreground">{t("detail.noPosition")}</p>
                  ) : last.geofence_result === "OUTSIDE" ? (
                    <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                      {last.fence_distance_km
                        ? t("detail.outside", { km: last.fence_distance_km, at: df.dateTime(last.received_at) })
                        : t("detail.outsideNoDistance", { at: df.dateTime(last.received_at) })}
                    </p>
                  ) : last.geofence_result === "NOT_EVALUATED" ? (
                    <p className="text-sm text-muted-foreground">
                      {t("detail.noFenceAt", { at: df.dateTime(last.received_at) })}
                    </p>
                  ) : (
                    <p className="flex items-center gap-1.5 text-sm">
                      <MapPin className="h-4 w-4 text-primary" />
                      {t("detail.inside", { at: df.dateTime(last.received_at) })}
                    </p>
                  )}
                  {(markers.length > 0 || zones.length > 0) && (
                    <LocationMap
                      markers={markers}
                      zones={zones}
                      fitBoundsKey={`worker:${worker.id}`}
                      ariaLabel={t("detail.mapLabel")}
                      className="h-64 min-h-64 rounded-md"
                    />
                  )}
                  <p className="text-xs text-muted-foreground">{t("detail.privacyNote")}</p>
                </section>

                <section className="space-y-2">
                  <h3 className="panel-title">{t("detail.link")}</h3>
                  <p className="text-sm">
                    {t(`link.status.${linkStatus}`)}
                    {hasLink && worker.link.last6 ? ` · …${worker.link.last6}` : ""}
                    {worker.link.issued_at ? ` · ${t("link.issuedAt", { at: df.dateTime(worker.link.issued_at) })}` : ""}
                  </p>
                  {mayManage && worker.is_active && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => issue.mutate()}
                        disabled={!worker.phone || issue.isPending}
                        disabledReason={!worker.phone ? t("link.needPhone") : undefined}
                      >
                        {issue.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                        {hasLink ? t("link.resend") : t("link.send")}
                      </Button>
                      {/* JB61-3: 「先补电话号码才能发定位链接」, beside the button. */}
                      {!worker.phone && <span className="text-sm text-warning">{t("link.needPhone")}</span>}
                    </div>
                  )}
                  {mayManage && hasLink && <p className="text-xs text-muted-foreground">{t("link.resendHint")}</p>}
                  {mayManage && hasLink && <p className="text-xs text-muted-foreground">{t("link.otherBrowser")}</p>}
                </section>

                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="panel-title">{t("detail.visits", { count: worker.visit_count })}</h3>
                    {worker.visit_count > 0 && (
                      <Button size="sm" variant="outline" onClick={() => onAllVisits(worker.id)}>
                        {t("detail.allVisits")}
                      </Button>
                    )}
                  </div>
                  {worker.visits.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("detail.noVisits")}</p>
                  ) : (
                    <div className="divide-y rounded-lg border">
                      {worker.visits.map((visit) => (
                        <div key={visit.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                          <span className="tabular">
                            {t("visit.in")} {df.dateTime(visit.entered_at)}
                          </span>
                          <span className="flex items-center gap-1.5">
                            {t("visit.out")} <VisitExit visit={visit} />
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {mayManage &&
                  (worker.is_active ? (
                    <ArmRow>
                      <label className="flex min-w-0 flex-1 items-start gap-3">
                        <Switch
                          tone="danger"
                          className="mt-0.5"
                          checked={armed}
                          onCheckedChange={setArmed}
                          aria-label={t("action.deactivate")}
                        />
                        <span className="text-xs leading-5 text-muted-foreground">{t("detail.deactivateHelp")}</span>
                      </label>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!armed || deactivate.isPending}
                        disabledReason={t("detail.armFirst")}
                        onClick={() => deactivate.mutate()}
                      >
                        {t("action.deactivate")}
                      </Button>
                    </ArmRow>
                  ) : (
                    <Button variant="outline" onClick={() => reactivate.mutate()} disabled={reactivate.isPending}>
                      <RotateCcw className="h-4 w-4" />
                      {t("action.reactivate")}
                    </Button>
                  ))}
              </div>
            ) : null}
          </QueryBoundary>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {common("close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WorkerFormDialog
        open={editing}
        worker={worker}
        onClose={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />

      <LinkSentDialog issued={issued} onClose={() => setIssued(null)} />
    </>
  );
}

/**
 * The link, once: 「用 WhatsApp 发送」 opens a chat with the worker, message
 * filled in, or 「复制链接」. The system sends no SMS (ID52).
 */
function LinkSentDialog({
  issued,
  onClose,
}: {
  issued: { url: string; worker: SiteWorkerDetail } | null;
  onClose: () => void;
}) {
  const t = useTranslations("siteWorkers");
  const common = useTranslations("common");
  const [copied, setCopied] = useState(false);
  const message = issued
    ? t("link.message", { name: issued.worker.name, project: issued.worker.project_name, link: issued.url })
    : "";
  return (
    <Dialog
      open={Boolean(issued)}
      onOpenChange={(value) => {
        if (!value) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("link.sentTitle")}</DialogTitle>
          <DialogDescription>{t("link.sentBody")}</DialogDescription>
        </DialogHeader>
        {/* One phone is one browser (P-phonefix): the link binds where it is first opened. */}
        <p className="text-xs text-muted-foreground">{t("link.otherBrowser")}</p>
        {issued && (
          <div className="space-y-3">
            <p className="break-all rounded-md border bg-muted/30 p-2 text-xs">{issued.url}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild>
                <a href={workerWhatsappUrl(issued.worker.phone, message)} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-4 w-4" />
                  {t("link.whatsapp")}
                </a>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(message)
                    .then(() => setCopied(true))
                    .catch(() => setCopied(false));
                }}
              >
                <Copy className="h-4 w-4" />
                {copied ? common("copied") : t("link.copy")}
              </Button>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {common("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
