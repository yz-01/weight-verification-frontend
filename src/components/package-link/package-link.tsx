"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  FileSearch,
  Images,
  Loader2,
  MessagesSquare,
  PackageOpen,
  PenLine,
  RotateCcw,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ThreadView } from "@/components/contractor-ops/package-exchange";
import { ReviewDialog, type ReviewRecord } from "@/components/contractor-ops/package-review-loop";
import { Shell } from "@/components/contractor-ops/package-shell";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { FileActionButtons } from "@/components/shared/file-actions";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/interfaces/api";
import type { PackageLinkPage } from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import { packageKindName } from "@/lib/package-items";
import {
  getPackageLink,
  linkAttachmentFile,
  linkItemFile,
  linkPackageFile,
  sendLinkMessage,
  submitLinkReview,
} from "@/services/package-link.service";
import { PhotoStrip, toShellPhotos } from "@/components/shared/photo-thumb";

/**
 * The package link's page (batch H, H17 八 3) - what an owner, a supplier or
 * anybody else sees after tapping the link in WhatsApp. Phone first: one
 * column, big buttons, nothing to sign in to.
 *
 * Top: the client company's logo and the project (全系统表头规则), the package
 * number and the round. Then each record - preview, print, download, and this
 * link's answer on it - then 【审核并签名】 and this link's own conversation.
 * Every answer is signed (JB252 「统一适用于所有资料包」, QA1 audit #11): each
 * record 确认通过 / 退回补充资料, the 审核意见 and a drawn signature, under the
 * typed name, which is asked once and kept by the browser.
 */

const NAME_KEY = "mse.package-link.name";

function rememberedName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberName(name: string) {
  try {
    window.localStorage.setItem(NAME_KEY, name);
  } catch {
    // A private window keeps nothing; the name is asked again next time.
  }
}

export function PackageLinkView({ token }: { token: string }) {
  const t = useTranslations("packageLink");
  const locale = useLocale();
  const queryClient = useQueryClient();
  // The first load is the open the office sees; a refresh after an action is not.
  const opened = useRef(false);
  const page = useQuery({
    queryKey: ["package-link", token, locale],
    queryFn: () => {
      const first = !opened.current;
      opened.current = true;
      return getPackageLink(token, { open: first, lang: locale });
    },
    retry: false,
  });

  if (page.isLoading) {
    return (
      <Frame>
        <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("loading")}
        </p>
      </Frame>
    );
  }
  if (page.isError || !page.data) {
    // 「找不到」, never why (H17 五 3).
    const offline = page.error instanceof ApiError && page.error.code === "network_error";
    return (
      <Frame>
        <div className="space-y-3 p-6 text-center">
          <FileSearch className="mx-auto size-10 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{offline ? t("offline") : t("notFound")}</h1>
          <p className="text-sm text-muted-foreground">{offline ? t("offlineHelp") : t("notFoundHelp")}</p>
          {offline && (
            <Button variant="outline" onClick={() => void page.refetch()}>
              <RotateCcw className="size-4" />
              {t("retry")}
            </Button>
          )}
        </div>
      </Frame>
    );
  }
  return (
    <LinkPage
      token={token}
      data={page.data}
      onData={(next) => queryClient.setQueryData(["package-link", token, locale], next)}
      onRefresh={() => void page.refetch()}
    />
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </main>
  );
}

function LinkPage({
  token,
  data,
  onData,
  onRefresh,
}: {
  token: string;
  data: PackageLinkPage;
  onData: (next: PackageLinkPage) => void;
  onRefresh: () => void;
}) {
  const t = useTranslations("packageLink");
  const kinds = useTranslations("multiEngine");
  const labels = useTranslations("mySubmissions");
  const errors = useTranslations("errors.api");
  const locale = useLocale();
  const formatter = useDateFormat();
  const [name, setName] = useState(rememberedName);
  // The name dialog, open while a button waits for it; resolves with the
  // name, or null when it was closed.
  const [asking, setAsking] = useState<((who: string | null) => void) | null>(null);
  // 【审核并签名】: the signed review window, under this name.
  const [reviewer, setReviewer] = useState<string | null>(null);
  // JB189 「沟通」: this link's own thread with the office, further down.
  const chat = useRef<HTMLElement | null>(null);

  const say = (error: unknown) => {
    const code = error instanceof ApiError ? error.code : "";
    toast.error(code && errors.has(code) ? errors(code) : t("failed"));
    if (error instanceof ApiError && error.status === 404) onRefresh();
  };
  const ensureName = (): Promise<string | null> =>
    name.trim()
      ? Promise.resolve(name.trim())
      : new Promise((resolve) => setAsking(() => resolve));
  const pending = data.items.filter((item) => item.review_state === "PENDING").length;
  const startReview = async () => {
    const who = await ensureName();
    if (who) setReviewer(who);
  };
  const records: ReviewRecord[] = data.items.map((item) => ({
    id: item.id,
    label: item.reference || packageKindName(kinds, item),
    detail: packageKindName(kinds, item),
    mine: item.review_state,
    reason: item.returned_reason,
  }));

  const load = (fetcher: () => Promise<File>) => async () => {
    try {
      return await fetcher();
    } catch (error) {
      say(error);
      throw error;
    }
  };

  return (
    <Frame>
      <header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          {data.company_logo ? (
            <Image
              src={data.company_logo}
              alt={data.company_name}
              width={96}
              height={32}
              unoptimized
              className="h-8 w-auto max-w-24 object-contain"
            />
          ) : (
            <PackageOpen className="size-7 text-primary" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{data.company_name}</p>
            <p className="truncate text-xs text-muted-foreground">{data.project_name}</p>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      <div className="space-y-4 p-4 pb-16">
        <section className="space-y-1">
          <p className="text-xs text-muted-foreground tabular">
            {data.package_no} · {t("round", { n: data.round })}
          </p>
          <h1 className="text-lg font-semibold leading-snug">{data.package_name}</h1>
          {data.remarks && <p className="text-sm text-muted-foreground">{data.remarks}</p>}
          <p className="text-xs text-muted-foreground">
            {t("for", { name: data.recipient.display_name })}
            {data.recipient.expires_at && <> · {t("validUntil", { date: formatter.date(data.recipient.expires_at) })}</>}
          </p>
        </section>

        <div className="flex flex-wrap gap-2">
          <FileActionButtons
            label={t("wholePackage")}
            source={{
              load: load(() => linkPackageFile(token, data.package_no, { who: name, lang: locale, inline: true })),
              loadToSend: load(() => linkPackageFile(token, data.package_no, { who: name, lang: locale })),
              title: data.package_no || data.package_name,
            }}
          />
          {/* JB189 (客户 11-13: 「顾问及业主点击后…进入该资料包对应的沟通事项」;
              Lucas chose A): an owner has no account and no 「沟通记录」 -
              this goes to their own thread on this package, below. */}
          <Button
            variant="outline"
            className="h-11"
            onClick={() => chat.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            data-package-talk
          >
            <MessagesSquare className="size-4" />
            {t("talk")}
          </Button>
        </div>

        {data.recipient.signed_at && (
          <p className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <CheckCircle2 className="size-4 text-primary" />
            {t("signedBy", { name: data.recipient.signed_name, when: formatter.dateTime(data.recipient.signed_at) })}
          </p>
        )}
        {data.exported && !data.recipient.signed_at && (
          <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-sm">{t("exported")}</p>
        )}

        <section className="space-y-3" aria-label={t("records")}>
          <h2 className="text-sm font-semibold">{t("recordCount", { count: data.items.length })}</h2>
          <ul className="space-y-3">
            {data.items.map((item, index) => (
              <li key={item.id} className="space-y-3 rounded-xl border bg-card p-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {index + 1}. {packageKindName(kinds, item)}
                    {item.round_no > 1 && <> · {t("newInRound", { n: item.round_no })}</>}
                  </p>
                  <p className="font-medium">{item.reference}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("parts", { photos: item.photo_count, documents: item.document_count, files: item.file_count })}
                  </p>
                  {/* The pictures themselves (J34-11), each opening the viewer. */}
                  {(item.pictures ?? []).length > 0 && (
                    <PhotoStrip
                      className="mt-2"
                      thumbs={(item.pictures ?? []).map((picture) => picture.thumbnail_url)}
                      count={item.photo_count + item.document_count}
                      icon={Images}
                      reference={item.reference}
                      photos={toShellPhotos(item.pictures ?? [], item.reference)}
                    />
                  )}
                </div>
                {item.fields.length > 0 && (
                  /* The record's words as they were frozen - never an amount (六 7). */
                  <dl className="divide-y rounded-lg border text-sm">
                    {item.fields.map((field) => (
                      <div key={field.key} className="grid grid-cols-[7.5rem_1fr] gap-2 px-2.5 py-1.5">
                        <dt className="text-xs text-muted-foreground">
                          {labels.has(`field.${field.key}`) ? labels(`field.${field.key}`) : field.key}
                        </dt>
                        <dd className="break-words">{field.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <div className="flex flex-wrap gap-2">
                  <FileActionButtons
                    source={{
                      load: load(() => linkItemFile(token, item.id, item.reference, { who: name, lang: locale, inline: true })),
                      title: item.reference,
                    }}
                  />
                </div>
                {item.review_state !== "PENDING" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p
                      className={`min-w-0 flex-1 rounded-lg p-2 text-sm ${
                        item.review_state === "RETURNED"
                          ? "border border-destructive/30 bg-destructive/5 text-destructive"
                          : "border border-primary/30 bg-primary/5 text-primary"
                      }`}
                    >
                      {item.review_state === "RETURNED"
                        ? t("youReturned", { reason: item.returned_reason })
                        : t("youConfirmed")}
                      <span className="block text-xs opacity-80">
                        {item.answered_by} · {formatter.dateTime(item.answered_at)}
                      </span>
                    </p>
                  </div>
                ) : data.can_decide ? (
                  <p className="rounded-lg border border-dashed p-2 text-xs text-muted-foreground" data-link-waiting>
                    {t("waitingForYou")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {data.can_decide && (
          <section
            className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3"
            aria-label={t("reviewButton")}
            data-link-review
          >
            {pending > 0 ? (
              <>
                <p className="text-sm">{t("reviewWaiting", { count: pending })}</p>
                <Button className="h-11 w-full" onClick={() => void startReview()} data-link-review-open>
                  <PenLine className="size-4" />
                  {t("reviewButton")}
                </Button>
              </>
            ) : (
              <p className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-4 text-primary" />
                {t("reviewAllDone")}
              </p>
            )}
          </section>
        )}

        <section ref={chat} className="scroll-mt-20 space-y-2" aria-label={t("chat")} data-package-chat>
          <h2 className="text-sm font-semibold">{t("chat")}</h2>
          <ThreadView
            messages={data.messages}
            items={data.items.map((item) => ({ id: item.id, label: item.reference }))}
            ownSide="RECIPIENT"
            otherName={data.company_name}
            canWrite
            onSend={async (payload) => {
              const who = await ensureName();
              // Closing the name box keeps the text for another try.
              if (!who) throw new Error("name");
              try {
                const message = await sendLinkMessage(token, { ...payload, name: who });
                onData({ ...data, messages: [...data.messages, message] });
              } catch (error) {
                say(error);
                throw error;
              }
            }}
            openAttachment={(message) => linkAttachmentFile(message.attachment_url, message.attachment_name)}
          />
        </section>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <UserRound className="size-3.5" />
          {name ? t("actingAs", { name }) : t("noNameYet")}
          {name && (
            <button type="button" className="text-primary underline" onClick={() => setAsking(() => () => undefined)}>
              {t("changeName")}
            </button>
          )}
        </p>
      </div>

      {reviewer && (
        <ReviewDialog
          pkg={null}
          records={records}
          help={t("reviewHelp", { name: reviewer })}
          onClose={() => setReviewer(null)}
          submit={async (payload) => {
            try {
              onData(
                await submitLinkReview(token, {
                  name: reviewer,
                  decisions: payload.decisions,
                  opinion: payload.opinion,
                  signature: payload.signature,
                }),
              );
              toast.success(t("reviewedToast"));
            } catch (error) {
              say(error);
              throw error;
            }
          }}
          onDone={() => undefined}
        />
      )}

      {asking && (
        <NameDialog
          initial={name}
          onClose={() => {
            asking(null);
            setAsking(null);
          }}
          onSave={(who) => {
            setName(who);
            rememberName(who);
            asking(who);
            setAsking(null);
          }}
        />
      )}
    </Frame>
  );
}

/** Asked once; the browser keeps it (H17 八 3). */
function NameDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const t = useTranslations("packageLink");
  const [value, setValue] = useState(initial);
  return (
    <Shell title={t("nameTitle")} onClose={onClose}>
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">{t("nameHelp")}</p>
        <FieldWrapper label={t("name")} required>
          <Input
            value={value}
            autoFocus
            autoComplete="name"
            maxLength={200}
            onChange={(event) => setValue(event.target.value)}
          />
        </FieldWrapper>
      </div>
      <footer className="grid grid-cols-2 gap-2 border-t border-panel-border bg-muted p-4">
        <Button variant="outline" className="h-11" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button className="h-11" requires={[[value.trim(), t("name")]]} onClick={() => onSave(value.trim())}>
          {t("continue")}
        </Button>
      </footer>
    </Shell>
  );
}
