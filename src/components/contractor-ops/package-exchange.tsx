"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Copy,
  FileUp,
  History,
  Link2,
  MessageCircle,
  Paperclip,
  RefreshCw,
  Send,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/contractor-ops/package-shell";
import { OptionCombobox } from "@/components/material-requests/option-combobox";
import { useAuth } from "@/components/providers/auth-provider";
import { FileActionButtons, useFileActions } from "@/components/shared/file-actions";
import { ArmRow, FieldWrapper, LoadFailed, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useDateFormat } from "@/lib/dates";
import type {
  EvidencePackageDetail,
  PackageAnswer,
  PackageMessage,
  PackageRecipient,
  RecipientKind,
} from "@/interfaces/contractor-ops";
import {
  addPackageRecipient,
  correspondenceReportFile,
  evidencePackageFile,
  extendPackageRecipient,
  getPackageConsultantChoices,
  getPackageMessages,
  getPackageTimeline,
  packageAttachmentFile,
  previewEvidencePackage,
  regeneratePackageLink,
  resubmitPackage,
  revokePackageRecipient,
  sendPackageMessage,
} from "@/services/contractor-ops.service";

/**
 * Multi Engine across organisations, the office's side (batch H, H17 八 1).
 *
 * The five blocks the guide asks for on a confirmed package: who it went to
 * (status, opens, copy / regenerate / revoke / extend), the conversation with
 * each of them (pick on the left, their thread on the right), the timeline,
 * the rounds with their own PDFs, and 「重新提交」 once something came back.
 * The office reads every thread and every answer (六 3); a consultant or a
 * link never reaches this file.
 */

const RECIPIENT_KINDS: RecipientKind[] = ["CONSULTANT", "OWNER", "SUPPLIER", "OTHER"];

/** The page an outside recipient opens. The token is the whole credential. */
export function packageLinkAddress(token: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/package/${token}`;
}

/**
 * WhatsApp with the text ready. A number in international form goes straight
 * to that chat; anything else opens WhatsApp to pick the contact - guessing a
 * country code would send a package to a stranger.
 */
export function whatsappHref(text: string, contact = "") {
  const digits = contact.replace(/[^\d+]/g, "");
  const international = digits.startsWith("+") ? digits.slice(1) : digits.startsWith("60") ? digits : "";
  const base = international.length >= 9 ? `https://wa.me/${international}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

export function ExchangePanel({
  data,
  onChanged,
}: {
  data: EvidencePackageDetail;
  onChanged: () => void;
}) {
  const t = useTranslations("multiEngine");
  const { can } = useAuth();
  const [resubmitting, setResubmitting] = useState(false);
  const recipients = data.recipients ?? [];

  return (
    <section className="space-y-3" aria-label={t("exchange.title")}>
      {data.can_resubmit && can("package.manage") && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="min-w-0 flex-1 text-sm">
            {t("exchange.returnedNotice", { count: data.returned_item_ids?.length ?? 0 })}
          </p>
          <Button size="sm" onClick={() => setResubmitting(true)}>
            <RefreshCw className="size-4" />
            {t("exchange.resubmit")}
          </Button>
        </div>
      )}
      <Tabs defaultValue="recipients">
        <TabsList>
          <TabsTrigger value="recipients">
            <Users className="size-4" />
            {t("exchange.tab.recipients")}
          </TabsTrigger>
          <TabsTrigger value="chat">
            <MessageCircle className="size-4" />
            {t("exchange.tab.chat")}
          </TabsTrigger>
          <TabsTrigger value="timeline">
            <Clock className="size-4" />
            {t("exchange.tab.timeline")}
          </TabsTrigger>
          <TabsTrigger value="rounds">
            <History className="size-4" />
            {t("exchange.tab.rounds")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="recipients">
          <RecipientsBlock pkg={data} recipients={recipients} onChanged={onChanged} />
        </TabsContent>
        <TabsContent value="chat">
          <OfficeChat pkg={data} recipients={recipients} />
        </TabsContent>
        <TabsContent value="timeline">
          <TimelineBlock pkg={data} />
        </TabsContent>
        <TabsContent value="rounds">
          <RoundsBlock pkg={data} />
        </TabsContent>
      </Tabs>
      {resubmitting && (
        <ResubmitDialog
          pkg={data}
          onClose={() => setResubmitting(false)}
          onDone={() => {
            onChanged();
          }}
        />
      )}
    </section>
  );
}

/* -- 收件方 --------------------------------------------------------------- */

function RecipientsBlock({
  pkg,
  recipients,
  onChanged,
}: {
  pkg: EvidencePackageDetail;
  recipients: PackageRecipient[];
  onChanged: () => void;
}) {
  const t = useTranslations("multiEngine");
  const formatter = useDateFormat();
  const { can } = useAuth();
  const manage = can("package.manage");
  const [sending, setSending] = useState(false);
  // A link in full, the one time the server hands it over (五 1).
  const [revealed, setRevealed] = useState<PackageRecipient | null>(null);
  const [armed, setArmed] = useState<string | null>(null);

  const act = useMutation({
    mutationFn: (input: { recipient: PackageRecipient; action: "regenerate" | "extend" | "revoke" }) => {
      if (input.action === "regenerate") return regeneratePackageLink(pkg.id, input.recipient.id);
      if (input.action === "extend") return extendPackageRecipient(pkg.id, input.recipient.id, 30);
      return revokePackageRecipient(pkg.id, input.recipient.id);
    },
    onSuccess: (row) => {
      setArmed(null);
      if (row.token) setRevealed(row);
      onChanged();
    },
  });

  return (
    <div className="space-y-3">
      {manage && (
        <Button variant="outline" className="w-full" onClick={() => setSending(true)}>
          <Send className="size-4" />
          {t("exchange.send")}
        </Button>
      )}
      {revealed?.token && (
        <LinkReady recipient={revealed} pkg={pkg} onDismiss={() => setRevealed(null)} />
      )}
      {recipients.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
          {t("exchange.noRecipients")}
        </p>
      ) : (
        <ul className="space-y-2">
          {recipients.map((row) => {
            const closed = Boolean(row.revoked_at);
            return (
              <li key={row.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-medium">
                    {row.display_name}
                    {row.organization && row.organization !== row.display_name && (
                      <span className="text-xs font-normal text-muted-foreground"> · {row.organization}</span>
                    )}
                  </p>
                  <StatusBadge label={t(`exchange.kind.${row.kind}`)} tone="neutral" />
                  <StatusBadge
                    label={
                      row.is_expired && !closed ? t("exchange.expired") : t(`exchange.status.${row.status}`)
                    }
                    tone={
                      row.status === "SIGNED"
                        ? "positive"
                        : closed || row.is_expired
                          ? "danger"
                          : row.status === "VIEWED"
                            ? "info"
                            : "warning"
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {row.open_count > 0
                    ? t("exchange.opens", {
                        count: row.open_count,
                        when: formatter.dateTime(row.last_opened_at),
                      })
                    : t("exchange.neverOpened")}
                  {" · "}
                  {t("exchange.counts", {
                    accepted: row.accepted_count,
                    returned: row.returned_count,
                    pending: row.pending_count,
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("exchange.sentBy", {
                    name: row.created_by_name || "—",
                    when: formatter.dateTime(row.created_at),
                  })}
                  {row.kind !== "CONSULTANT" && row.token_hint && (
                    <>
                      {" · "}
                      {t("exchange.linkHint", {
                        hint: row.token_hint,
                        date: formatter.date(row.expires_at),
                      })}
                    </>
                  )}
                </p>
                {row.signed_at && (
                  <p className="text-xs text-primary">
                    {t("exchange.signedBy", { name: row.signed_name, when: formatter.dateTime(row.signed_at) })}
                  </p>
                )}
                {manage && !closed && (
                  <div className="flex flex-wrap gap-2">
                    {row.kind !== "CONSULTANT" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={act.isPending}
                          onClick={() => act.mutate({ recipient: row, action: "regenerate" })}
                        >
                          <Link2 className="size-4" />
                          {t("exchange.regenerate")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={act.isPending}
                          onClick={() => act.mutate({ recipient: row, action: "extend" })}
                        >
                          {t("exchange.extend")}
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setArmed(armed === row.id ? null : row.id)}
                    >
                      {t("exchange.revoke")}
                    </Button>
                  </div>
                )}
                {armed === row.id && (
                  /* 防误触用开关 (规矩 8): the switch first, then the button acts. */
                  <RevokeRow
                    pending={act.isPending}
                    onRevoke={() => act.mutate({ recipient: row, action: "revoke" })}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {sending && (
        <SendDialog
          pkg={pkg}
          onClose={() => setSending(false)}
          onSent={(row) => {
            onChanged();
            if (row.token) setRevealed(row);
            setSending(false);
          }}
        />
      )}
    </div>
  );
}

function RevokeRow({ pending, onRevoke }: { pending: boolean; onRevoke: () => void }) {
  const t = useTranslations("multiEngine");
  const [on, setOn] = useState(false);
  return (
    <ArmRow>
      <label className="flex min-w-0 flex-1 items-start gap-3">
        <Switch tone="danger" className="mt-0.5" checked={on} onCheckedChange={setOn} aria-label={t("exchange.revoke")} />
        <span className="text-xs leading-5 text-muted-foreground">{t("exchange.revokeHelp")}</span>
      </label>
      <Button
        size="sm"
        variant="destructive"
        disabled={!on || pending}
        disabledReason={t("exchange.armFirst")}
        onClick={onRevoke}
      >
        {t("exchange.revoke")}
      </Button>
    </ArmRow>
  );
}

/** The link, in full, this once - with copy, WhatsApp and the warning (六 6). */
function LinkReady({
  recipient,
  pkg,
  onDismiss,
}: {
  recipient: PackageRecipient;
  pkg: EvidencePackageDetail;
  onDismiss: () => void;
}) {
  const t = useTranslations("multiEngine");
  const address = packageLinkAddress(recipient.token ?? "");
  const text = t("exchange.whatsappText", {
    package: pkg.package_no || pkg.name,
    name: pkg.name,
    link: address,
  });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast.success(t("exchange.copied"));
    } catch {
      toast.error(t("exchange.copyFailed"));
    }
  };
  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3" data-link-ready>
      <p className="text-sm font-medium">{t("exchange.linkReady", { name: recipient.display_name })}</p>
      <p className="break-all rounded border bg-background p-2 font-mono text-xs">{address}</p>
      <p className="text-xs text-destructive">{t("exchange.warning")}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void copy()}>
          <Copy className="size-4" />
          {t("exchange.copy")}
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a href={whatsappHref(text, recipient.contact)} target="_blank" rel="noreferrer noopener">
            <MessageCircle className="size-4" />
            {t("exchange.whatsapp")}
          </a>
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          {t("exchange.linkDone")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("exchange.linkOnce")}</p>
    </div>
  );
}

/** 「发送」 (H17 八 2): a consultant from the list, or anybody else typed in. */
export function SendDialog({
  pkg,
  onClose,
  onSent,
  initialKind = "OWNER",
}: {
  pkg: EvidencePackageDetail;
  onClose: () => void;
  onSent: (row: PackageRecipient) => void;
  initialKind?: RecipientKind;
}) {
  const t = useTranslations("multiEngine");
  const common = useTranslations("common");
  const [kind, setKind] = useState<RecipientKind>(initialKind);
  const [consultant, setConsultant] = useState("");
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [contact, setContact] = useState("");
  const [days, setDays] = useState("90");

  const consultants = useQuery({
    queryKey: ["evidence-packages", "consultant-choices", pkg.id],
    queryFn: () => getPackageConsultantChoices(pkg.id),
    enabled: kind === "CONSULTANT",
  });
  const options = (consultants.data ?? []).map((row) => ({
    value: row.consultant,
    label: row.organization ? `${row.name} · ${row.organization}` : row.name,
  }));
  const send = useMutation({
    mutationFn: () =>
      addPackageRecipient(
        pkg.id,
        kind === "CONSULTANT"
          ? { kind, consultant }
          : { kind, name, organization, contact, days: Number(days) || 90 },
      ),
    onSuccess: onSent,
  });
  const link = kind !== "CONSULTANT";

  return (
    <Shell title={t("exchange.sendTitle")} onClose={onClose}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <FieldWrapper label={t("exchange.field.kind")} required>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RECIPIENT_KINDS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
                className={`h-10 rounded-lg border px-3 text-sm font-medium transition-colors ${
                  kind === value
                    ? "border-primary/40 bg-primary/12 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(`exchange.kind.${value}`)}
              </button>
            ))}
          </div>
        </FieldWrapper>
        {kind === "CONSULTANT" ? (
          <FieldWrapper label={t("field.consultant")} required hint={t("exchange.consultantHelp")}>
            <OptionCombobox
              value={consultant}
              onChange={setConsultant}
              options={options}
              placeholder={consultants.isLoading ? t("loading") : t("field.consultantPlaceholder")}
              searchPlaceholder={t("consultantSearch")}
              emptyLabel={t("noConsultantMatch")}
              ariaLabel={t("field.consultant")}
              disabled={consultants.isLoading || consultants.isError || !options.length}
            />
            {consultants.isSuccess && !options.length && (
              <p className="text-xs text-muted-foreground">{t("noConsultants")}</p>
            )}
            <QueryFailedNote query={consultants} what={t("consultantsWhat")} />
          </FieldWrapper>
        ) : (
          <>
            {/* A person, an organisation, or both - one of them is required. */}
            <FieldWrapper label={t("exchange.field.who")} required>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={name}
                  placeholder={t("exchange.field.personName")}
                  aria-label={t("exchange.field.personName")}
                  onChange={(event) => setName(event.target.value)}
                />
                <Input
                  value={organization}
                  placeholder={t("exchange.field.organization")}
                  aria-label={t("exchange.field.organization")}
                  onChange={(event) => setOrganization(event.target.value)}
                />
              </div>
            </FieldWrapper>
            <FieldWrapper label={t("exchange.field.contact")} hint={t("exchange.contactHelp")}>
              <Input value={contact} onChange={(event) => setContact(event.target.value)} inputMode="email" />
            </FieldWrapper>
            <FieldWrapper label={t("exchange.field.days")}>
              <Input
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(event) => setDays(event.target.value)}
                className="w-28"
              />
            </FieldWrapper>
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {t("exchange.warning")}
            </p>
          </>
        )}
      </div>
      <footer className="flex flex-col-reverse gap-2 border-t border-panel-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          {common("cancel")}
        </Button>
        <Button
          requires={
            link
              ? [[(name.trim() || organization.trim()), t("exchange.field.who")]]
              : [[consultant, t("field.consultant")]]
          }
          disabled={send.isPending}
          onClick={() => send.mutate()}
        >
          <Send className="size-4" />
          {link ? t("exchange.makeLink") : t("exchange.sendToConsultant")}
        </Button>
      </footer>
    </Shell>
  );
}

/* -- 往来聊天 ------------------------------------------------------------- */

function OfficeChat({ pkg, recipients }: { pkg: EvidencePackageDetail; recipients: PackageRecipient[] }) {
  const t = useTranslations("multiEngine");
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<string | null>(null);
  const current = recipients.find((row) => row.id === picked) ?? recipients[0];
  const thread = useQuery({
    queryKey: ["evidence-packages", "messages", pkg.id, current?.id],
    queryFn: () => getPackageMessages(pkg.id, current!.id),
    enabled: Boolean(current),
  });

  if (!current) {
    return (
      <p className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
        {t("exchange.noRecipients")}
      </p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
      <nav aria-label={t("exchange.chatPick")} className="flex gap-1.5 overflow-x-auto sm:flex-col">
        {recipients.map((row) => (
          <button
            key={row.id}
            type="button"
            aria-current={row.id === current.id ? "true" : undefined}
            onClick={() => setPicked(row.id)}
            className={`shrink-0 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
              row.id === current.id
                ? "border-primary/40 bg-primary/12 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="block truncate font-medium">{row.display_name}</span>
            <span className="block text-xs">{t(`exchange.kind.${row.kind}`)}</span>
          </button>
        ))}
      </nav>
      <div className="min-w-0">
        {thread.isError ? (
          <LoadFailed what={t("exchange.tab.chat")} onRetry={() => void thread.refetch()} />
        ) : (
          <ThreadView
            messages={thread.data ?? []}
            loading={thread.isLoading}
            items={pkg.items.map((item) => ({ id: item.id, label: item.reference || t(`kind.${item.record_kind}`) }))}
            ownSide="OFFICE"
            otherName={current.display_name}
            canWrite={can("package.manage")}
            onSend={async (payload) => {
              await sendPackageMessage(pkg.id, current.id, payload);
              await queryClient.invalidateQueries({ queryKey: ["evidence-packages", "messages", pkg.id] });
            }}
            openAttachment={(message) => packageAttachmentFile(message.attachment_url, message.attachment_name)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * One thread, oldest first, and the box to add to it. Shared by the office,
 * the consultant and the link page: the three must read alike.
 */
export function ThreadView({
  messages,
  loading = false,
  items,
  ownSide,
  otherName,
  canWrite,
  onSend,
  openAttachment,
}: {
  messages: PackageMessage[];
  loading?: boolean;
  items: { id: string; label: string }[];
  ownSide: "OFFICE" | "RECIPIENT";
  otherName: string;
  canWrite: boolean;
  onSend: (payload: { body: string; item?: string; attachment?: File | null }) => Promise<unknown>;
  openAttachment: (message: PackageMessage) => Promise<File>;
}) {
  const t = useTranslations("multiEngine");
  const formatter = useDateFormat();
  const [body, setBody] = useState("");
  const [item, setItem] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const files = useFileActions();
  const label = (id: string | null) => items.find((row) => row.id === id)?.label;

  const send = async () => {
    setBusy(true);
    try {
      await onSend({ body: body.trim(), item: item || undefined, attachment });
      setBody("");
      setAttachment(null);
    } catch {
      // The refusal has been said already (toast); the text stays to retry.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : messages.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
          {t("exchange.chatEmpty")}
        </p>
      ) : (
        <ol className="space-y-2">
          {messages.map((message) => {
            const mine = message.side === ownSide;
            return (
              <li key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] space-y-1 rounded-xl border px-3 py-2 text-sm ${
                    mine ? "border-primary/30 bg-primary/8" : "bg-card"
                  }`}
                >
                  <p className="text-xs text-muted-foreground">
                    {message.author_name ||
                      (message.side === "OFFICE" ? t("exchange.office") : otherName)}
                    {" · "}
                    {formatter.dateTime(message.created_at)}
                  </p>
                  {message.item && label(message.item) && (
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("exchange.aboutItem", { item: label(message.item) ?? "" })}
                    </p>
                  )}
                  {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
                  {message.attachment_name && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-primary underline"
                      onClick={() =>
                        void files.run("preview", {
                          load: () => openAttachment(message),
                          title: message.attachment_name,
                        })
                      }
                    >
                      <Paperclip className="size-3.5" />
                      {message.attachment_name}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {canWrite && (
        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
          <Textarea
            rows={2}
            value={body}
            maxLength={4000}
            placeholder={t("exchange.chatPlaceholder")}
            aria-label={t("exchange.chatPlaceholder")}
            onChange={(event) => setBody(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={item}
              onChange={(event) => setItem(event.target.value)}
              aria-label={t("exchange.about")}
              className="h-9 min-w-0 max-w-full basis-full rounded-md border bg-background px-2 text-sm sm:basis-auto sm:flex-1 pointer-coarse:h-11"
            >
              <option value="">{t("exchange.aboutPackage")}</option>
              {items.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
            <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border bg-background px-3 text-sm pointer-coarse:h-11">
              <FileUp className="size-4" />
              <span className="max-w-40 truncate">{attachment ? attachment.name : t("exchange.attach")}</span>
              <input
                type="file"
                className="sr-only"
                onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
              />
            </label>
            <Button
              size="sm"
              disabled={busy || (!body.trim() && !attachment)}
              disabledReason={t("exchange.writeFirst")}
              onClick={() => void send()}
            >
              <Send className="size-4" />
              {t("exchange.sendMessage")}
            </Button>
          </div>
        </div>
      )}
      {files.element}
    </div>
  );
}

/* -- 时间线 --------------------------------------------------------------- */

function TimelineBlock({ pkg }: { pkg: EvidencePackageDetail }) {
  const t = useTranslations("multiEngine");
  const formatter = useDateFormat();
  const timeline = useQuery({
    queryKey: ["evidence-packages", "timeline", pkg.id],
    queryFn: () => getPackageTimeline(pkg.id),
  });
  if (timeline.isLoading) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  if (timeline.isError) return <LoadFailed what={t("exchange.tab.timeline")} onRetry={() => void timeline.refetch()} />;
  const events = timeline.data ?? [];
  return (
    <ol className="space-y-1.5">
      {events.map((event) => (
        <li key={event.id} className="grid gap-0.5 rounded-lg border px-3 py-2 text-sm sm:grid-cols-[9.5rem_1fr]">
          <span className="text-xs text-muted-foreground tabular">{formatter.dateTime(event.created_at)}</span>
          <span className="min-w-0">
            <span className="font-medium">{t(`exchange.event.${event.kind}`)}</span>
            {event.round_no > 1 && (
              <span className="text-xs text-muted-foreground"> · {t("exchange.round", { n: event.round_no })}</span>
            )}
            {event.recipient_name && <span className="text-muted-foreground"> · {event.recipient_name}</span>}
            {event.actor_name && <span className="text-muted-foreground"> · {event.actor_name}</span>}
            {event.note && event.kind !== "REPORT" && event.note !== "export" && event.note !== "preview" && (
              <span className="block break-words text-xs text-muted-foreground">{event.note}</span>
            )}
            {event.note === "export" && (
              <span className="block text-xs text-muted-foreground">{t("exchange.exportNote")}</span>
            )}
            {event.kind === "REPORT" && (
              <span className="block break-all font-mono text-2xs text-muted-foreground">
                {t("digest", { digest: event.note })}
              </span>
            )}
            {event.ip_address && (
              <span className="block text-2xs text-muted-foreground">{t("exchange.ip", { ip: event.ip_address })}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* -- 轮次 ----------------------------------------------------------------- */

function RoundsBlock({ pkg }: { pkg: EvidencePackageDetail }) {
  const t = useTranslations("multiEngine");
  const formatter = useDateFormat();
  const queryClient = useQueryClient();
  const rounds = [...(pkg.rounds ?? [])].reverse();
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {rounds.map((round) => (
          <li key={round.number} className="space-y-2 rounded-lg border p-3">
            <p className="font-medium">
              {t("exchange.round", { n: round.number })}
              <span className="text-xs font-normal text-muted-foreground">
                {" · "}
                {t("exchange.lockedBy", {
                  name: round.confirmed_by_name || "—",
                  when: formatter.dateTime(round.confirmed_at),
                })}
              </span>
            </p>
            {round.reason && (
              <p className="text-xs text-muted-foreground">{t("exchange.roundReason", { reason: round.reason })}</p>
            )}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">{t("technicalDetails")}</summary>
              <p className="mt-1 break-all font-mono text-2xs">{t("digest", { digest: round.pdf_sha256 })}</p>
            </details>
            <div className="flex flex-wrap gap-2">
              <FileActionButtons
                source={{
                  load: () => previewEvidencePackage(pkg.id, `${pkg.name}-${round.number}`, round.number),
                  loadToSend: () => evidencePackageFile(pkg.id, `${pkg.name}-${round.number}`, round.number),
                  title: `${pkg.package_no || pkg.name} · ${t("exchange.round", { n: round.number })}`,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      {/* 往来记录 (H17 九, HD19): its own report with its own digest. */}
      <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
        <p className="text-sm font-medium">{t("exchange.report")}</p>
        <p className="text-xs text-muted-foreground">{t("exchange.reportHelp")}</p>
        <div className="flex flex-wrap gap-2">
          <FileActionButtons
            source={{
              load: async () => {
                const file = await correspondenceReportFile(pkg.id, pkg.package_no || pkg.name, true);
                void queryClient.invalidateQueries({ queryKey: ["evidence-packages", "timeline", pkg.id] });
                return file;
              },
              title: `${pkg.package_no || pkg.name} · ${t("exchange.report")}`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* -- 重新提交 ------------------------------------------------------------- */

function ResubmitDialog({
  pkg,
  onClose,
  onDone,
}: {
  pkg: EvidencePackageDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("multiEngine");
  const common = useTranslations("common");
  const returned = pkg.items.filter((item) => (pkg.returned_item_ids ?? []).includes(item.id));
  const [picked, setPicked] = useState<string[]>(returned.map((item) => item.id));
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<EvidencePackageDetail | null>(null);
  const resubmit = useMutation({
    mutationFn: () => resubmitPackage(pkg.id, picked, reason),
    onSuccess: (row) => {
      setResult(row);
      onDone();
    },
  });
  // Links have nothing the platform can ring: the office tells them (七).
  const toTell = (result?.recipients ?? []).filter(
    (row) => row.kind !== "CONSULTANT" && !row.revoked_at && !row.signed_at,
  );

  return (
    <Shell title={t("exchange.resubmitTitle")} onClose={onClose}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {result ? (
          <>
            <p className="text-sm">
              {t("exchange.resubmitted", { n: result.current_round ?? 0 })}
            </p>
            {toTell.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t("exchange.tellLinks")}</p>
                <ul className="space-y-2">
                  {toTell.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-sm">
                      <span className="min-w-0 flex-1 truncate">{row.display_name}</span>
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href={whatsappHref(
                            t("exchange.whatsappRound", {
                              package: pkg.package_no || pkg.name,
                              n: result.current_round ?? 0,
                            }),
                            row.contact,
                          )}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          <MessageCircle className="size-4" />
                          {t("exchange.whatsapp")}
                        </a>
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {t("exchange.resubmitHelp", { n: (pkg.current_round ?? 1) + 1 })}
            </p>
            <FieldWrapper label={t("exchange.field.returnedItems")} required>
              <ul className="divide-y rounded-lg border">
                {returned.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 p-2.5">
                    <Checkbox
                      checked={picked.includes(item.id)}
                      aria-label={item.reference}
                      onCheckedChange={(next) =>
                        setPicked((current) =>
                          next ? [...current, item.id] : current.filter((value) => value !== item.id),
                        )
                      }
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.reference || t(`kind.${item.record_kind}`)}</p>
                      <p className="text-xs text-destructive">{item.returned_reason}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </FieldWrapper>
            <FieldWrapper label={t("exchange.field.whatChanged")} required>
              <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
            </FieldWrapper>
          </>
        )}
      </div>
      <footer className="flex flex-col-reverse gap-2 border-t border-panel-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          {result ? common("close") : common("cancel")}
        </Button>
        {!result && (
          <Button
            requires={[
              [picked.length > 0, t("exchange.field.returnedItems")],
              [reason.trim(), t("exchange.field.whatChanged")],
            ]}
            disabled={resubmit.isPending}
            onClick={() => resubmit.mutate()}
          >
            <RefreshCw className="size-4" />
            {t("exchange.resubmit")}
          </Button>
        )}
      </footer>
    </Shell>
  );
}

/* -- 逐条意见 ------------------------------------------------------------- */

/** Under a record on the office's list: each recipient's answer (六 3). */
export function AnswerLines({ answers }: { answers: PackageAnswer[] }) {
  const t = useTranslations("multiEngine");
  if (!answers.length) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs">
      {answers.map((answer) => (
        <li
          key={answer.recipient}
          className={
            answer.decision === "RETURNED"
              ? "text-destructive"
              : answer.decision === "ACCEPTED" || answer.signed
                ? "text-primary"
                : "text-muted-foreground"
          }
        >
          {answer.decision === "RETURNED"
            ? t("exchange.answerReturned", { name: answer.recipient_name, reason: answer.reason })
            : t("exchange.answerLine", {
                name: answer.recipient_name,
                state: t(
                  answer.decision === "PENDING" && answer.signed
                    ? "exchange.answer.SIGNED"
                    : `exchange.answer.${answer.decision}`,
                ),
              })}
        </li>
      ))}
    </ul>
  );
}
