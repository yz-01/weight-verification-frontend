"use client";

/**
 * The one 「发送」 of an evidence package (JB51, JB63, JB64): 「对外分享」, a
 * round's 「发送」 and the 往来记录's.
 *
 * Its own file, importing no screen: 轮次 (`package-exchange`) uses it, and
 * the package screens import 轮次 - a dialog living beside the claim parts
 * pulled the claim engine, and through it Multi Engine and 轮次 again, into a
 * circle that left a component undefined at load time in production
 * (「Cannot access 'V' before initialization」, 2026-10-28).
 *
 * Since JB64 (客户 10-29: 「资料包的「对外分享」改用同一套，不要两套」) it is
 * the system's own 发送 (`useFileActions`): 「发给谁？」 (method, name,
 * company, phone or email), the PIN, the computer's or phone's share window
 * that hands the PDF itself to WhatsApp or the email, and 「发出去了吗？」.
 * The send is written to the one share log under the package
 * (`EVIDENCE_PACKAGE` + its id, and `part` for a round or the 往来记录), as
 * 已打开分享窗口; only a person's 「已发送」 makes it 已确认发送.
 */

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { useFileActions, type FileSource } from "@/components/shared/file-actions";
import type { EvidencePackageDetail } from "@/interfaces/contractor-ops";
import {
  correspondenceReportFile,
  evidencePackageFile,
  previewEvidencePackage,
} from "@/services/contractor-ops.service";

/** Which of the package's files goes (JB63): the latest, one round's, or the 往来记录 PDF. */
export type PackageShareWhat = { round?: number; transcript?: boolean };

/** The share log's `part` for `what`: `R2`, `TRANSCRIPT`, or empty for the latest. */
export function packageSharePart(what: PackageShareWhat): string {
  if (what.transcript) return "TRANSCRIPT";
  if (what.round) return `R${what.round}`;
  return "";
}

/** The file to send and its words, for `what`. */
export function packageShareSource(
  pkg: EvidencePackageDetail,
  what: PackageShareWhat,
  roundWord: (n: number) => string,
  reportWord: string,
): FileSource {
  const label = pkg.package_no || pkg.name;
  const named = {
    recordKind: "EVIDENCE_PACKAGE",
    recordId: pkg.id,
    part: packageSharePart(what),
    project: pkg.project,
  };
  if (what.transcript) {
    const title = `${label} · ${reportWord}`;
    return {
      ...named,
      load: () => correspondenceReportFile(pkg.id, label, true),
      loadToSend: () => correspondenceReportFile(pkg.id, label),
      title,
      subject: title,
    };
  }
  if (what.round) {
    const name = `${pkg.name}-${what.round}`;
    const title = `${label} · ${roundWord(what.round)}`;
    return {
      ...named,
      load: () => previewEvidencePackage(pkg.id, name, what.round),
      loadToSend: () => evidencePackageFile(pkg.id, name, what.round),
      title,
      subject: title,
    };
  }
  return {
    ...named,
    load: () => previewEvidencePackage(pkg.id, pkg.name),
    loadToSend: () => evidencePackageFile(pkg.id, pkg.name),
    title: pkg.name,
    subject: pkg.package_no ? `${pkg.package_no} · ${pkg.name}` : pkg.name,
  };
}

/**
 * Every 「发送」 of a confirmed package. `send(what)` starts it; render
 * `element` once. `onLogged` runs when the send is written and again when
 * 「发出去了吗？」 is answered, so 发送记录 shows it at once.
 */
export function usePackageSend(pkg: EvidencePackageDetail | undefined, onLogged: () => void) {
  const t = useTranslations("multiEngine");
  const { busy, run, element } = useFileActions();
  const send = useCallback(
    (what: PackageShareWhat = {}) => {
      if (!pkg) return;
      const source = packageShareSource(pkg, what, (n) => t("exchange.round", { n }), t("exchange.report"));
      void run("share", { ...source, onLogged }, { key: `send:${packageSharePart(what)}` });
    },
    [onLogged, pkg, run, t],
  );
  return { send, busy, element };
}
