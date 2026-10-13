"use client";

/**
 * 访客扫码 (batch H, HD7): scan the pass, read it, then Confirm Entry or
 * Confirm Exit.
 *
 * 「扫码后，手机自动显示访客姓名、公司、电话、访问项目、访问目的、批准人及有效
 * 期限。保安核对资料后点击 Confirm Entry」. Scanning records nothing; the guard
 * reads the whole pass first and only the button records the entry or exit,
 * with the guard's own project, so a pass for another project, an unknown
 * code, or one not approved, revoked, expired or not valid yet cannot be
 * confirmed - and the screen says which. 「Visitor 扫码不需要拍照，也不需要手动
 * 上传记录」: no photo, no upload.
 *
 * One panel for the guard's phone (bound to its project) and the office's
 * 工地门禁 › 访客扫码 tab (the page's project).
 */

import { useMutation } from "@tanstack/react-query";
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  Keyboard,
  Loader2,
  LogIn,
  LogOut,
  ScanLine,
  ShieldAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { FieldWrapper } from "@/components/shared/page-primitives";
import { GateQrScanner } from "@/components/site-access/gate-qr-scanner";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/interfaces/api";
import type { GatePassCheck, GatePassRefusal } from "@/interfaces/site-access";
import { useDateFormat } from "@/lib/dates";
import { requestLocation, type LocationFix } from "@/lib/field-location";
import { cn } from "@/lib/utils";
import { checkGatePass, confirmGatePass } from "@/services/site-access.service";

/** The bare token from a scanned link, a `MSEACCESS:` value or a typed one. */
export function passToken(value: string) {
  const scan = value.match(/[?&]scan=([^&]+)/)?.[1];
  if (scan) return decodeURIComponent(scan);
  return value.startsWith("MSEACCESS:")
    ? value.slice("MSEACCESS:".length).trim()
    : value.trim();
}

export function VisitorScanPanel({
  project: givenProject,
  lockProject,
  initialToken = "",
  onRecorded,
}: {
  /** The guard's project (the phone's bound one, or the page's). */
  project: string;
  /** The phone is bound to its project; the office may choose. */
  lockProject: boolean;
  /** A pass link opened on this page (`?scan=`). */
  initialToken?: string;
  onRecorded?: () => void;
}) {
  const t = useTranslations("siteControl.visitorScan");
  const tType = useTranslations("siteControl.subjectType");
  const df = useDateFormat();
  const [project, setProject] = useState(givenProject);
  const [seenProject, setSeenProject] = useState(givenProject);
  if (seenProject !== givenProject) {
    setSeenProject(givenProject);
    setProject(givenProject);
  }
  const [scannerOpen, setScannerOpen] = useState(false);
  const [otherWays, setOtherWays] = useState(false);
  const [typed, setTyped] = useState("");
  const [token, setToken] = useState("");
  const [recorded, setRecorded] = useState<{ name: string; direction: "ENTRY" | "EXIT"; at: string } | null>(null);
  const [fix, setFix] = useState<LocationFix | null>(null);
  const eventId = useRef("");

  // Where the gate is, when the phone can say; the record keeps it.
  useEffect(() => {
    requestLocation().then(setFix).catch(() => setFix(null));
  }, []);

  const check = useMutation({
    mutationFn: (value: string) => checkGatePass(project, value),
  });
  const confirm = useMutation({
    mutationFn: (direction: "ENTRY" | "EXIT") =>
      confirmGatePass({
        project,
        qr_value: token,
        direction,
        client_event_id: eventId.current,
        ...(fix ? { latitude: fix.latitude, longitude: fix.longitude } : {}),
      }),
    onSuccess: (row) => {
      setRecorded({
        name: row.pass.subject_name,
        direction: row.event.direction,
        at: row.event.occurred_at,
      });
      setToken("");
      check.reset();
      onRecorded?.();
    },
  });

  const read = (value: string) => {
    const bare = passToken(value);
    if (!bare || !project) return;
    setToken(bare);
    setRecorded(null);
    confirm.reset();
    // A new id per pass read: confirming twice after one read is one record.
    eventId.current = `visitor-${crypto.randomUUID()}`;
    check.mutate(bare);
  };

  // A pass link opened here (`?scan=`) reads that pass once.
  const opened = useRef("");
  useEffect(() => {
    if (!initialToken || !project || opened.current === initialToken) return;
    opened.current = initialToken;
    read(initialToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialToken, project]);

  const result: GatePassCheck | undefined = check.data;
  const refusal: GatePassRefusal | null =
    result?.refusal ??
    (confirm.error instanceof ApiError && confirm.error.code?.startsWith("gate_pass_")
      ? (confirm.error.code.slice("gate_pass_".length) as GatePassRefusal)
      : null);

  return (
    <div className="surface-panel mx-auto w-full max-w-2xl space-y-4 rounded-xl p-4 sm:p-6" data-visitor-scan>
      <p className="text-sm text-muted-foreground">{t("help")}</p>
      {!lockProject && (
        <FieldWrapper label={t("project")} required>
          <ProjectPicker
            value={project}
            onValueChange={(value) => {
              setProject(value);
              setToken("");
              check.reset();
            }}
            placeholder={t("chooseProject")}
          />
        </FieldWrapper>
      )}
      <div className="grid gap-2">
        <Button
          type="button"
          size="lg"
          className="h-14 w-full text-base"
          disabled={!project}
          disabledReason={!project ? t("chooseProjectFirst") : undefined}
          onClick={() => setScannerOpen(true)}
          data-gate-camera
        >
          <Camera />
          {t("scan")}
        </Button>
        <div className="rounded-lg border border-dashed">
          <button
            type="button"
            aria-expanded={otherWays}
            onClick={() => setOtherWays((value) => !value)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground hover:text-foreground"
          >
            <Keyboard className="size-4 shrink-0" />
            <span className="flex-1">{t("otherWays")}</span>
            <ChevronDown className={cn("size-4 shrink-0 transition-transform", otherWays && "rotate-180")} />
          </button>
          {otherWays && (
            <div className="flex gap-2 px-3 pb-3">
              <Input
                autoFocus
                aria-label={t("otherWays")}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && typed.trim()) {
                    read(typed);
                    setTyped("");
                  }
                }}
                placeholder={t("typePlaceholder")}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!typed.trim() || !project}
                disabledReason={
                  !project ? t("chooseProjectFirst") : !typed.trim() ? t("typePlaceholder") : undefined
                }
                onClick={() => {
                  read(typed);
                  setTyped("");
                }}
              >
                <ScanLine />
                {t("read")}
              </Button>
            </div>
          )}
        </div>
      </div>

      {check.isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("reading")}
        </p>
      )}
      {check.isError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {check.error instanceof Error ? check.error.message : t("readFailed")}
        </p>
      )}

      {result?.pass && (
        <section className="space-y-3 rounded-lg border p-4" data-visitor-pass>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-lg font-semibold">{result.pass.subject_name ?? result.pass.pass_no}</p>
            <p className="text-sm tabular text-muted-foreground">{result.pass.pass_no}</p>
          </div>
          {result.refusal !== "other_project" && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {result.pass.subject_type && (
                <Fact label={t("field.type")} value={tType(result.pass.subject_type)} />
              )}
              <Fact label={t("field.company")} value={result.pass.subject_company ?? ""} />
              <Fact label={t("field.phone")} value={result.pass.phone ?? ""} />
              <Fact label={t("field.project")} value={result.pass.project_name} />
              <Fact label={t("field.purpose")} value={result.pass.purpose ?? ""} />
              {result.pass.vehicle_plate ? (
                <Fact label={t("field.vehicle")} value={result.pass.vehicle_plate} />
              ) : null}
              {result.pass.host_name ? (
                <Fact label={t("field.host")} value={result.pass.host_name} />
              ) : null}
              <Fact label={t("field.approvedBy")} value={result.pass.approved_by_name ?? ""} />
              <Fact
                label={t("field.validity")}
                value={
                  result.pass.valid_from && result.pass.valid_until
                    ? `${df.dateTime(result.pass.valid_from)} – ${df.dateTime(result.pass.valid_until)}`
                    : ""
                }
              />
              {result.last_direction && result.last_at ? (
                <Fact
                  label={t("field.last")}
                  value={t(`last.${result.last_direction}`, { time: df.dateTime(result.last_at) })}
                />
              ) : null}
            </dl>
          )}
          {result.refusal === "other_project" && (
            <p className="text-sm text-muted-foreground">
              {t("field.project")}: {result.pass.project_name}
            </p>
          )}
        </section>
      )}

      {refusal && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
          data-visitor-refusal={refusal}
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          {t(`refusal.${refusal}`)}
        </p>
      )}

      {result && !result.refusal && (
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            className="h-14 text-base"
            disabled={!result.can_enter || confirm.isPending}
            disabledReason={!result.can_enter ? t("refusal.already_inside") : undefined}
            onClick={() => confirm.mutate("ENTRY")}
          >
            {confirm.isPending && confirm.variables === "ENTRY" ? <Loader2 className="animate-spin" /> : <LogIn />}
            {t("confirmEntry")}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-14 text-base"
            disabled={!result.can_exit || confirm.isPending}
            disabledReason={!result.can_exit ? t("refusal.already_outside") : undefined}
            onClick={() => confirm.mutate("EXIT")}
          >
            {confirm.isPending && confirm.variables === "EXIT" ? <Loader2 className="animate-spin" /> : <LogOut />}
            {t("confirmExit")}
          </Button>
        </div>
      )}
      {confirm.isError && !refusal && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {confirm.error instanceof Error ? confirm.error.message : t("recordFailed")}
        </p>
      )}

      {recorded && (
        <div className="rounded-lg border border-success/30 bg-success/5 p-4 text-center" role="status">
          <CheckCircle2 className="mx-auto size-8 text-success" />
          <p className="mt-2 font-semibold">{recorded.name}</p>
          <p className="text-sm text-muted-foreground">
            {t(`recorded.${recorded.direction}`, { time: df.dateTime(recorded.at) })}
          </p>
        </div>
      )}

      <GateQrScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(value) => {
          setScannerOpen(false);
          read(value);
        }}
      />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{value || "—"}</dd>
    </>
  );
}
