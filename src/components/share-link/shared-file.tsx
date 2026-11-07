"use client";

/**
 * The page a WhatsApp / email recipient opens (`/s/<token>`, 客户 11-08).
 *
 * A website cannot put a file into a WhatsApp chat, so the message carries this
 * link. No sign-in: the token is the credential. Drawn in the browser only, so
 * WhatsApp's link-preview crawler never reaches the download - and nothing is
 * ever downloaded by itself: the file comes only from a tap on a button, which
 * is what marks the send 「对方已打开」.
 *
 * A PDF or a photo: 「打开 PDF」 / 「查看照片」 (shown in the phone's own viewer)
 * and, the same size, 「下载」 (saved). Anything else: one 「下载文件」.
 */

import { useQuery } from "@tanstack/react-query";
import { Download, FileSearch, FileText, Image as ImageIcon, Loader2, RotateCcw, TimerOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/interfaces/api";
import { useDateFormat } from "@/lib/dates";
import { getSharedFileInfo, sharedFileDownloadUrl } from "@/services/file-action.service";

export function SharedFileView({ token }: { token: string }) {
  const t = useTranslations("sharedFile");
  const formatter = useDateFormat();
  // query-failure: the page itself says 「找不到」 or 「网络连不上」 with a retry
  const info = useQuery({
    queryKey: ["shared-file", token],
    queryFn: () => getSharedFileInfo(token),
    retry: false,
  });

  if (info.isLoading) {
    return (
      <Frame>
        <p className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("loading")}
        </p>
      </Frame>
    );
  }
  const data = info.data;
  if (info.isError || !data || data.expired) {
    const offline = info.error instanceof ApiError && info.error.code === "network_error";
    const expired = Boolean(data?.expired) || (info.error instanceof ApiError && info.error.status === 410);
    const Icon = expired ? TimerOff : FileSearch;
    return (
      <Frame>
        <div className="space-y-3 p-6 text-center" data-shared-file-state={offline ? "offline" : expired ? "expired" : "missing"}>
          <Icon className="mx-auto size-10 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{offline ? t("offline") : expired ? t("expired") : t("notFound")}</h1>
          <p className="text-sm text-muted-foreground">
            {offline ? t("offlineHelp") : expired ? t("expiredHelp") : t("notFoundHelp")}
          </p>
          {offline ? (
            <Button variant="outline" onClick={() => void info.refetch()}>
              <RotateCcw className="size-4" />
              {t("retry")}
            </Button>
          ) : null}
        </div>
      </Frame>
    );
  }

  const url = sharedFileDownloadUrl(token);
  const kind = data.kind;
  const viewable = kind === "pdf" || kind === "image";
  const MainIcon = kind === "image" ? ImageIcon : kind === "pdf" ? FileText : Download;
  return (
    <Frame>
      <div className="space-y-5 p-6" data-shared-file>
        <p className="text-center text-sm text-muted-foreground">
          {data.sender_name
            ? t("from", { company: data.company_name, sender: data.sender_name })
            : t("fromCompany", { company: data.company_name })}
        </p>
        <h1 className="break-all text-center text-lg font-semibold" data-shared-file-name>
          {data.file_name}
        </h1>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button asChild size="lg" className={viewable ? "h-12 w-full text-base" : "h-12 w-full text-base sm:col-span-2"}>
            {/* No `download`: a PDF or a photo opens in the phone's own viewer. */}
            <a href={url} rel="noopener noreferrer" target="_blank" data-shared-file-open>
              <MainIcon className="size-5" />
              {t(kind === "pdf" ? "openPdf" : kind === "image" ? "openImage" : "openFile")}
            </a>
          </Button>
          {viewable ? (
            <Button asChild size="lg" variant="outline" className="h-12 w-full text-base">
              <a href={`${url}?download=1`} rel="noopener noreferrer" data-shared-file-download>
                <Download className="size-5" />
                {t("download")}
              </a>
            </Button>
          ) : null}
        </div>
        {data.expires_at ? (
          <p className="text-center text-xs text-muted-foreground">
            {t("validUntil", { date: formatter.dateTime(data.expires_at) })}
          </p>
        ) : null}
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const t = useTranslations("sharedFile");
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-lg px-4 py-6">
        <header className="mb-4 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-base font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mse-icon.svg" alt="" className="size-7" />
            {t("brand")}
          </span>
          <LanguageSwitcher />
        </header>
        <section className="surface-panel rounded-xl">{children}</section>
      </div>
    </main>
  );
}
