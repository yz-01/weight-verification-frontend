"use client";

/**
 * The one 「发送」 of an evidence package (JB51, JB63): 「对外分享（WhatsApp /
 * 电邮）」, a round's 「发送」 and the 往来记录's.
 *
 * Its own file, importing no screen: 轮次 (`package-exchange`) opens it, and
 * the package screens import 轮次 - a dialog living beside the claim parts
 * pulled the claim engine, and through it Multi Engine and 轮次 again, into a
 * circle that left a component undefined at load time in production
 * (「Cannot access 'V' before initialization」, 2026-10-28).
 */

import { Download, Mail, MessageCircle, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { Shell } from "@/components/contractor-ops/package-shell";
import { useFileActions } from "@/components/shared/file-actions";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EvidencePackageDetail, PackageShareChannel } from "@/interfaces/contractor-ops";
import {
  correspondenceReportFile,
  evidencePackageFile,
  logPackageShare,
  previewEvidencePackage,
} from "@/services/contractor-ops.service";

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

