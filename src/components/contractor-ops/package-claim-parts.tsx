"use client";

/**
 * Multi Engine after 客户 10-28 (JB51, JB52):
 *
 * - a Progress Claim is made in 「新建资料包」 like every other package, with
 *   its 期数 / Claim 类型 / 分类 / 分包商 - all optional - on the package
 *   (`ClaimInfoFields`, `ClaimInfoBlock`); the Progress Claim tab only filters,
 *   and its one button manages the Claim categories (`ClaimCategoriesDialog`,
 *   客户: 「这个应该是新增claim 分类，不是新增claim」);
 * - 「对外分享（WhatsApp / 电邮）」 is written down - who, when, how, to whom -
 *   as 已发起分享, and a person marks it 已确认发送 (`PackageShareDialog`);
 * - 「发送记录」 lists the in-system sends and the shares by time (`SendLog`).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Mail, MessageCircle, Pencil, Plus, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import {
  ClaimFieldsForm,
  EMPTY_FIELDS,
  claimFieldsComplete,
  useClaimCategories,
  type ClaimFields,
} from "@/components/contractor-ops/claim-engine";
import { CategoryDialog } from "@/components/contractor-ops/operations-workspaces";
import { Shell } from "@/components/contractor-ops/package-shell";
import { useFileActions } from "@/components/shared/file-actions";
import { FieldWrapper, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  EvidencePackageDetail,
  EvidencePackageRow,
  PackageShareChannel,
  ProjectCategory,
} from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import {
  confirmPackageShare,
  correspondenceReportFile,
  evidencePackageFile,
  logPackageShare,
  previewEvidencePackage,
  updateEvidencePackage,
  updateProjectCategory,
  type PackageClaimFieldsPayload,
} from "@/services/contractor-ops.service";

/* -- 期数 / Claim 类型 / 分类 / 分包商 ------------------------------------- */

export type ClaimKindChoice = "" | "MATERIAL_ON_SITE" | "PROGRESS";
const CLAIM_KINDS: ClaimKindChoice[] = ["", "MATERIAL_ON_SITE", "PROGRESS"];

export interface ClaimInfoValue {
  /** `YYYY-MM`, or "" for none. */
  period: string;
  kind: ClaimKindChoice;
  fields: ClaimFields;
}

export const EMPTY_CLAIM_INFO: ClaimInfoValue = { period: "", kind: "", fields: EMPTY_FIELDS };

/** The form's value from a package's own claim fields. */
export function claimInfoValue(pkg: Pick<EvidencePackageRow, "claim_info" | "claim_other_name">): ClaimInfoValue {
  const info = pkg.claim_info;
  if (!info) return EMPTY_CLAIM_INFO;
  return {
    period: info.period ? info.period.slice(0, 7) : "",
    kind: info.kind,
    fields: {
      ...EMPTY_FIELDS,
      category: info.category ?? "",
      otherName: pkg.claim_other_name ?? "",
      subcontractor: info.subcontractor ?? "",
    },
  };
}

/** What the server takes; empty strings clear a field. */
export function claimInfoPayload(value: ClaimInfoValue): Required<PackageClaimFieldsPayload> {
  return {
    claim_period: value.period,
    claim_kind: value.kind,
    claim_category: value.fields.category,
    claim_other_name: value.fields.otherName.trim(),
    claim_subcontractor: value.fields.subcontractor,
  };
}

/**
 * The fields a Progress Claim adds to 「新建资料包」 (JB52 第 1 点). None is
 * required, so none carries a star; 「其他」 asks what it is, as on a claim.
 * Returns whether the value can be saved.
 */
export function ClaimInfoFields({
  project,
  value,
  onChange,
}: {
  project: string;
  value: ClaimInfoValue;
  onChange: (next: ClaimInfoValue) => void;
}) {
  const t = useTranslations("multiEngine");
  const claims = useTranslations("claims");
  // query-failure: passed to ClaimFieldsForm, which shows QueryFailedNote under the picker.
  const categories = useClaimCategories(project, { offered: true });
  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-3" data-claim-info-fields>
      <p className="text-sm font-medium">{t("claimInfo.title")}</p>
      <p className="text-xs text-muted-foreground">{t("claimInfo.optional")}</p>
      <FieldWrapper label={t("claimInfo.period")}>
        <Input
          type="month"
          value={value.period}
          onChange={(event) => onChange({ ...value, period: event.target.value })}
          className="w-48"
        />
      </FieldWrapper>
      <FieldWrapper label={t("claimInfo.kind")}>
        <div className="grid grid-cols-3 gap-2">
          {CLAIM_KINDS.map((option) => (
            <button
              key={option || "none"}
              type="button"
              aria-pressed={value.kind === option}
              onClick={() => onChange({ ...value, kind: option })}
              className={`min-h-10 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                value.kind === option
                  ? "border-primary/40 bg-primary/12 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {option ? claims(`kind.${option}`) : t("claimInfo.noKind")}
            </button>
          ))}
        </div>
      </FieldWrapper>
      <ClaimFieldsForm
        project={project}
        general={false}
        withAmount={false}
        value={value.fields}
        onChange={(fields) => onChange({ ...value, fields })}
        categories={categories}
      />
    </div>
  );
}

/** Whether the claim fields can be saved: 「其他」 needs its name. */
export function useClaimInfoComplete(project: string, value: ClaimInfoValue) {
  // query-failure: the same query ClaimInfoFields draws, with its own note there.
  const categories = useClaimCategories(project, { offered: true });
  const chosen = (categories.data?.results ?? []).find((row) => row.id === value.fields.category);
  return claimFieldsComplete(value.fields, false, chosen?.is_other);
}

/** `2026-10-01` as `2026-10`: the month a claim is for. */
export function periodLabel(period: string | null | undefined) {
  return period ? period.slice(0, 7) : "";
}

/** The facts of a Progress Claim package (JB52), and 「修改」 while it is a draft. */
export function ClaimInfoBlock({
  pkg,
  canEdit,
  onChanged,
}: {
  pkg: EvidencePackageDetail;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("multiEngine");
  const claims = useTranslations("claims");
  const [editing, setEditing] = useState(false);
  const info = pkg.claim_info;
  if (!info) return null;
  const none = t("claimInfo.none");
  // An old CLM- claim keeps its own fields; only a package's own are edited here.
  const editable = canEdit && !info.claim_id;
  return (
    <section className="space-y-2 rounded-lg border bg-muted/20 p-3" aria-label={t("claimInfo.title")}>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium">{t("claimInfo.title")}</p>
        {editable && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
            {t("claimInfo.edit")}
          </Button>
        )}
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {info.claim_no && <Fact label={t("claimInfo.claimNo")} value={info.claim_no} />}
        <Fact label={t("claimInfo.period")} value={periodLabel(info.period) || none} />
        <Fact label={t("claimInfo.kind")} value={info.kind ? claims(`kind.${info.kind}`) : none} />
        <Fact label={t("claimInfo.category")} value={info.category_name || none} />
        <Fact label={t("claimInfo.subcontractor")} value={info.subcontractor_name || none} />
      </dl>
      {editing && (
        <EditClaimInfoDialog
          pkg={pkg}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function EditClaimInfoDialog({
  pkg,
  onClose,
  onSaved,
}: {
  pkg: EvidencePackageDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("multiEngine");
  const claims = useTranslations("claims");
  const common = useTranslations("common");
  const [value, setValue] = useState<ClaimInfoValue>(() => claimInfoValue(pkg));
  const complete = useClaimInfoComplete(pkg.project, value);
  const save = useMutation({
    mutationFn: () => updateEvidencePackage(pkg.id, claimInfoPayload(value)),
    onSuccess: onSaved,
  });
  return (
    <Shell title={t("claimInfo.editTitle")} onClose={onClose}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <ClaimInfoFields project={pkg.project} value={value} onChange={setValue} />
      </div>
      <footer className="flex flex-col-reverse gap-2 border-t border-panel-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          {common("cancel")}
        </Button>
        <Button disabled={save.isPending || !complete} disabledReason={claims("completeClaimFields")} onClick={() => save.mutate()}>
          {t("claimInfo.save")}
        </Button>
      </footer>
    </Shell>
  );
}

/* -- 新增 Claim 分类 ------------------------------------------------------- */

/**
 * The Progress Claim tab's one button (客户 10-28: 「这个应该是新增claim 分类，
 * 不是新增claim」): this project's Claim categories - add, rename, switch off.
 * No claim and no period is made here; that is 「新建资料包」.
 */
export function ClaimCategoriesDialog({
  project: initialProject,
  onClose,
}: {
  project: string;
  onClose: () => void;
}) {
  const t = useTranslations("multiEngine");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const [project, setProject] = useState(initialProject);
  const [editing, setEditing] = useState<ProjectCategory | "new" | null>(null);
  const categories = useClaimCategories(project, { offered: false });
  const rows = categories.data?.results ?? [];
  const toggle = useMutation({
    mutationFn: (row: ProjectCategory) => updateProjectCategory(row.id, { is_active: !row.is_active }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["project-categories"] }),
  });
  return (
    <Shell title={t("claimCategories.title")} onClose={onClose}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <p className="rounded-lg border border-dashed border-panel-border bg-muted/30 p-3 text-sm text-muted-foreground">
          {t("claimCategories.hint")}
        </p>
        <FieldWrapper label={t("claimCategories.project")}>
          <ProjectPicker value={project} onValueChange={setProject} placeholder={t("field.selectProject")} />
        </FieldWrapper>
        {project && (
          <>
            <Button className="w-full" onClick={() => setEditing("new")}>
              <Plus className="size-4" />
              {t("claimCategories.add")}
            </Button>
            <QueryFailedNote query={categories} what={t("claimCategories.title")} />
            {categories.isSuccess && rows.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                {t("claimCategories.empty")}
              </p>
            ) : (
              <ul className="divide-y rounded-lg border" data-claim-categories>
                {rows.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center gap-2 p-3">
                    <p className="min-w-0 flex-1 text-sm font-medium">
                      {row.parent_name ? `${row.parent_name} › ` : ""}
                      {row.name}
                    </p>
                    {!row.is_active && <StatusBadge label={t("claimCategories.off")} tone="neutral" />}
                    <Button size="sm" variant="outline" onClick={() => setEditing(row)}>
                      <Pencil className="size-4" />
                      {t("claimCategories.rename")}
                    </Button>
                    {!row.is_fixed && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={toggle.isPending}
                        disabledReason={common("saving")}
                        onClick={() => toggle.mutate(row)}
                      >
                        {row.is_active ? t("claimCategories.disable") : t("claimCategories.enable")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <footer className="flex justify-end border-t border-panel-border bg-muted p-4">
        <Button variant="outline" onClick={onClose}>
          {common("close")}
        </Button>
      </footer>
      {editing && project && (
        <CategoryDialog
          project={project}
          defaultKind="CLAIM"
          row={editing === "new" ? null : editing}
          nextSortOrder={rows.length}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void queryClient.invalidateQueries({ queryKey: ["project-categories"] });
          }}
        />
      )}
    </Shell>
  );
}

/* -- 发送状态 -------------------------------------------------------------- */

/**
 * The list's and the header's words for how far a package went out (JB51 第
 * 4 点): 未发送 / 已发送系统内 / 已发起分享 / 已对外发送. 「已确认」 is the
 * lock and is not one of them.
 */
export function sendStatusKeys(row: Pick<EvidencePackageRow, "send_status" | "recipient_count">) {
  const status = row.send_status ?? {
    internal: (row.recipient_count ?? 0) > 0,
    external: "NONE" as const,
  };
  const keys: ("NOT_SENT" | "INTERNAL" | "STARTED" | "SENT")[] = [];
  if (status.internal) keys.push("INTERNAL");
  if (status.external !== "NONE") keys.push(status.external);
  return keys.length ? keys : (["NOT_SENT"] as const);
}

/* -- 对外分享 -------------------------------------------------------------- */

const SHARE_CHANNELS: PackageShareChannel[] = ["WHATSAPP", "EMAIL", "DOWNLOAD"];
const CHANNEL_ICONS = { WHATSAPP: MessageCircle, EMAIL: Mail, DOWNLOAD: Download } as const;

/** Which of the package's files goes (JB63): the latest, one round's, or the 往来记录 PDF. */
export type PackageShareWhat = { round?: number; transcript?: boolean };

/** The file to send and its words, for `what`. */
function shareSource(pkg: EvidencePackageDetail, what: PackageShareWhat, roundWord: (n: number) => string, reportWord: string) {
  const label = pkg.package_no || pkg.name;
  if (what.transcript) {
    return {
      load: () => correspondenceReportFile(pkg.id, label, true),
      loadToSend: () => correspondenceReportFile(pkg.id, label),
      title: `${label} · ${reportWord}`,
    };
  }
  if (what.round) {
    const name = `${pkg.name}-${what.round}`;
    return {
      load: () => previewEvidencePackage(pkg.id, name, what.round),
      loadToSend: () => evidencePackageFile(pkg.id, name, what.round),
      title: `${label} · ${roundWord(what.round)}`,
    };
  }
  return {
    load: () => previewEvidencePackage(pkg.id, pkg.name),
    loadToSend: () => evidencePackageFile(pkg.id, pkg.name),
    title: pkg.name,
  };
}

/**
 * Every 「发送」 of a confirmed package - 「对外分享（WhatsApp / 电邮）」 at the
 * bottom, a round's 「发送」, the 往来记录 PDF's (JB51, JB63).
 *
 * 客户 10-28: 「对外分享…对方只收到一条文字信息，没有收到完整资料包」 while
 * 「从「轮次」点击「发送」，可以正常通过 WhatsApp 发送文件」 - so this sends
 * the way 轮次 always did: the PIN, then the computer's (or phone's) own
 * share window, which hands the PDF itself to WhatsApp or the email. A WhatsApp
 * link can only carry text, so it is used only where that window does not
 * exist, after the file is downloaded to attach.
 *
 * Written down - who, when, how, to whom, which file - once the file was
 * really handed over (an app was picked), as 已发起分享; never on a cancelled
 * window. 已确认发送 stays a person's 「标记为已发送」: the system cannot see
 * whether a WhatsApp message arrived.
 */
export function PackageShareDialog({
  pkg,
  what = {},
  onClose,
  onLogged,
}: {
  pkg: EvidencePackageDetail;
  what?: PackageShareWhat;
  onClose: () => void;
  onLogged: () => void;
}) {
  const t = useTranslations("multiEngine");
  const common = useTranslations("common");
  const [channel, setChannel] = useState<PackageShareChannel>("WHATSAPP");
  const [target, setTarget] = useState("");
  const [step, setStep] = useState<"choose" | "next" | "notLogged">("choose");
  const [working, setWorking] = useState(false);
  const fetched = useRef(false);
  const { run, element } = useFileActions();
  const source = shareSource(pkg, what, (n) => t("exchange.round", { n }), t("exchange.report"));
  const subject = pkg.package_no ? `${pkg.package_no} · ${source.title}` : source.title;

  const log = async () => {
    try {
      await logPackageShare(pkg.id, {
        channel,
        target: channel === "DOWNLOAD" ? "" : target.trim(),
        ...(what.round ? { round: what.round } : {}),
        ...(what.transcript ? { document: "TRANSCRIPT" as const } : {}),
      });
      setStep("next");
      onLogged();
    } catch {
      setStep("notLogged");
    }
  };

  const go = async () => {
    setWorking(true);
    fetched.current = false;
    try {
      if (channel === "DOWNLOAD") {
        await run("save", {
          load: source.load,
          // Fetched only once the PIN is through: that is what says the file
          // really left, and only then is it written down.
          loadToSend: async () => {
            const file = await source.loadToSend();
            fetched.current = true;
            return file;
          },
          title: source.title,
          subject,
        });
        if (fetched.current) await log();
        return;
      }
      // The share window: written down when an app took the file.
      await run("share", { ...source, subject, onShared: () => void log() });
    } finally {
      setWorking(false);
    }
  };

  return (
    <Shell title={what.round || what.transcript ? `${t("share.sendTitle")} · ${source.title}` : t("share.title")} onClose={onClose}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4" data-package-share>
        {step === "choose" ? (
          <>
            <FieldWrapper label={t("share.channel")}>
              <div className="grid grid-cols-3 gap-2">
                {SHARE_CHANNELS.map((option) => {
                  const Icon = CHANNEL_ICONS[option];
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={channel === option}
                      onClick={() => setChannel(option)}
                      className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${
                        channel === option
                          ? "border-primary/40 bg-primary/12 text-primary"
                          : "border-border bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="size-4" />
                      {t(`share.${option}`)}
                    </button>
                  );
                })}
              </div>
            </FieldWrapper>
            {channel !== "DOWNLOAD" && (
              <>
                <FieldWrapper label={t("share.target")} hint={t("share.targetHint")}>
                  <Input
                    value={target}
                    inputMode={channel === "EMAIL" ? "email" : "text"}
                    onChange={(event) => setTarget(event.target.value)}
                  />
                </FieldWrapper>
                <p className="rounded-lg border bg-muted/30 p-3 text-sm">{t(`share.how.${channel}`)}</p>
              </>
            )}
          </>
        ) : step === "next" ? (
          <div className="space-y-3">
            <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm font-medium">
              {t(`share.handed.${channel}`)}
            </p>
            <p className="text-sm text-muted-foreground">{t("share.afterSent")}</p>
          </div>
        ) : (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {t("share.notLogged")}
          </p>
        )}
      </div>
      <footer className="flex flex-col-reverse gap-2 border-t border-panel-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-end">
        {step === "choose" ? (
          <>
            <Button variant="outline" onClick={onClose}>
              {common("cancel")}
            </Button>
            <Button disabled={working} disabledReason={common("loading")} onClick={() => void go()}>
              {channel === "DOWNLOAD" ? <Download className="size-4" /> : <Share2 className="size-4" />}
              {t(`share.go.${channel}`)}
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>{t("share.done")}</Button>
        )}
      </footer>
      {element}
    </Shell>
  );
}

/* -- 发送记录 -------------------------------------------------------------- */

interface LogEntry {
  key: string;
  at: string;
  node: React.ReactNode;
}

/**
 * 「发送记录」 (JB51 第 3 点): every send, newest first - in the system (head
 * office, a consultant, a link: opened or not) and by hand (WhatsApp, email,
 * download: 已发起分享 / 已确认发送, with 「标记为已发送」).
 */
export function SendLog({ pkg, onChanged }: { pkg: EvidencePackageDetail; onChanged: () => void }) {
  const t = useTranslations("multiEngine");
  const common = useTranslations("common");
  const formatter = useDateFormat();
  const mark = useMutation({
    mutationFn: (share: string) => confirmPackageShare(pkg.id, share),
    onSuccess: onChanged,
  });

  const entries: LogEntry[] = [
    ...(pkg.recipients ?? []).map((row) => ({
      key: `r:${row.id}`,
      at: row.created_at,
      node: (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={t("sendLog.internal")} tone="info" />
            <span className="text-sm font-medium">
              {t(`exchange.kind.${row.kind}`)}
              {row.display_name ? ` · ${row.display_name}` : ""}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("sendLog.by", { name: row.created_by_name || "—", when: formatter.dateTime(row.created_at) })}
          </p>
          <p className="text-xs">
            {row.revoked_at
              ? t("sendLog.revoked")
              : row.first_opened_at
                ? t("sendLog.opened", { when: formatter.dateTime(row.first_opened_at) })
                : t("sendLog.notOpened")}
          </p>
        </>
      ),
    })),
    ...(pkg.shares ?? []).map((row) => ({
      key: `s:${row.id}`,
      at: row.created_at,
      node: (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={t("sendLog.external")} tone="neutral" />
            <span className="text-sm font-medium">{t(`share.${row.channel}`)}</span>
            {/* JB63: which file went. */}
            {(row.round_no || row.document === "TRANSCRIPT") && (
              <span className="text-xs text-muted-foreground">
                {row.document === "TRANSCRIPT" ? t("exchange.report") : t("exchange.round", { n: row.round_no ?? 1 })}
              </span>
            )}
            <StatusBadge
              label={t(`sendLog.${row.status}`)}
              tone={row.status === "CONFIRMED" ? "positive" : "warning"}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("sendLog.by", { name: row.created_by_name || "—", when: formatter.dateTime(row.created_at) })}
            {" · "}
            {t("sendLog.to", { target: row.target || t("sendLog.unspecified") })}
          </p>
          {row.status === "CONFIRMED" ? (
            <p className="text-xs text-primary">
              {t("sendLog.confirmedBy", {
                name: row.confirmed_by_name || "—",
                when: formatter.dateTime(row.confirmed_at),
              })}
            </p>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="mt-1"
              data-mark-sent
              disabled={mark.isPending}
              disabledReason={common("saving")}
              onClick={() => mark.mutate(row.id)}
            >
              {t("share.markSent")}
            </Button>
          )}
        </>
      ),
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return (
    <section className="space-y-2" aria-label={t("sendLog.title")} data-send-log>
      <h3 className="text-sm font-semibold">{t("sendLog.title")}</h3>
      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
          {t("sendLog.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.key} className="space-y-1 rounded-lg border p-3">
              {entry.node}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

