"use client";

/**
 * 公司设置 → 「正式文件样板预览」 (JB162, 客户 11-10 第十一批 第 4、6 点).
 *
 * 「在「公司设置」清楚显示客户正式公司名称。包括 SSM 注册号码、公司地址、联系电话
 * 及 Email」 and 「让客户直接看到 Logo、公司名称及公司资料在 A4 文件上的实际排列
 * 效果。客户修改 Logo 或公司资料后，预览同步更新。预览效果必须与实际导出的 PDF
 * 文件抬头一致。」
 *
 * Two things side by side:
 *
 * - 公司正式资料 - the five details every formal document prints under the
 *   company's name, as saved, each one the client's own word; one not filled
 *   says so (it is then not printed);
 * - the A4 sample - page 1 of the PDF the server draws with the same
 *   letterhead code as every export, shown as a picture (an in-page PDF does
 *   not show on an iPhone), with 「打开 PDF」 for the file itself.
 *
 * Both are keyed on the saved profile: saving the logo or the details on the
 * 公司资料 block above updates the profile, and with it this preview. Nothing
 * here writes anything, and there is no company to choose - it is always the
 * signed-in company's own.
 */

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";

import { QueryFailedNote } from "@/components/shared/page-primitives";
import { SectionTitle } from "@/components/site-access/settings-fields";
import { Button } from "@/components/ui/button";
import type { ContractorCompanyProfile } from "@/interfaces/site-access";
import { getContractorCompanyProfile, letterheadPreviewObjectUrl } from "@/services/site-access.service";

/** The address as the letterhead prints it: lines, then postcode and city, then state. */
export function letterheadAddress(profile: Pick<ContractorCompanyProfile, "address_line_1" | "address_line_2" | "postcode" | "city" | "state">): string {
  return [
    profile.address_line_1,
    profile.address_line_2,
    [profile.postcode, profile.city].filter(Boolean).join(" "),
    profile.state,
  ]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/** A blob URL held by a query, let go when the query moves on to a new one. */
function useReleased(url: string | undefined) {
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
}

export function LetterheadPreviewSection() {
  const t = useTranslations("siteControl.letterhead");
  const language = useLocale();
  const profile = useQuery({ queryKey: ["contractor-company-profile"], queryFn: getContractorCompanyProfile });
  // Every save - the details, a new logo - changes `updated_at`: a new key, a
  // new sample. (Not the logo's address: a signed link changes on every read.)
  const version = profile.data?.updated_at ?? "";
  const picture = useQuery({
    queryKey: ["letterhead-preview", "png", language, version],
    queryFn: () => letterheadPreviewObjectUrl("png", language),
    enabled: Boolean(profile.data),
    gcTime: 0,
    staleTime: Infinity,
  });
  // Fetched ahead, so 「打开 PDF」 opens it straight from the tap: a phone
  // blocks a window opened after waiting for the network.
  const pdf = useQuery({
    queryKey: ["letterhead-preview", "pdf", language, version],
    queryFn: () => letterheadPreviewObjectUrl("pdf", language),
    enabled: Boolean(profile.data),
    gcTime: 0,
    staleTime: Infinity,
  });
  useReleased(picture.data);
  useReleased(pdf.data);

  const row = profile.data;
  const details: Array<[string, string]> = row
    ? [
        [t("officialName"), row.name],
        [t("ssm"), row.registration_no],
        [t("address"), letterheadAddress(row)],
        [t("phone"), row.contact_phone],
        [t("email"), row.contact_email],
      ]
    : [];

  return (
    <section id="letterhead-preview" className="scroll-mt-20 space-y-4 rounded-xl">
      <SectionTitle
        icon={FileText}
        title={t("title")}
        description={t("subtitle")}
        action={
          // Offered once the file is here: a button that could only wait would
          // say nothing the sample's own 「正在生成」 does not.
          pdf.data ? (
            <Button variant="outline" onClick={() => window.open(pdf.data, "_blank", "noopener,noreferrer")}>
              <ExternalLink />
              {t("openPdf")}
            </Button>
          ) : undefined
        }
      />
      <div className="surface-panel grid gap-6 rounded-xl p-4 sm:p-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3" data-testid="letterhead-details">
          <h3 className="text-sm font-semibold text-foreground">{t("detailsTitle")}</h3>
          <QueryFailedNote query={profile} what={t("detailsWhat")} />
          {row ? (
            <dl className="divide-y rounded-lg border bg-card">
              {details.map(([label, value]) => (
                <div key={label} className="grid gap-0.5 px-3 py-2 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className={value ? "break-words text-sm font-medium text-foreground" : "text-sm text-muted-foreground"}>
                    {value || t("notFilled")}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          <p className="text-xs text-muted-foreground">{t("detailsHint")}</p>
        </div>
        <figure className="min-w-0 space-y-2">
          <div className="mx-auto aspect-[210/297] w-full max-w-xl overflow-hidden rounded-md border bg-paper shadow-sm">
            {picture.data ? (
              // A blob URL of the server's own drawing: shown as it is.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={picture.data} alt={t("previewAlt")} className="size-full object-contain" data-testid="letterhead-preview-image" />
            ) : picture.isError ? (
              <div className="grid size-full place-items-center p-6 text-center">
                <QueryFailedNote query={picture} what={t("title")} />
              </div>
            ) : (
              <div className="grid size-full place-items-center text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Loader2 className="size-5 animate-spin text-primary" />
                  {t("loading")}
                </span>
              </div>
            )}
          </div>
          <figcaption className="text-center text-xs text-muted-foreground">{t("caption")}</figcaption>
          <QueryFailedNote query={pdf} what={t("pdfWhat")} className="justify-center" />
        </figure>
      </div>
    </section>
  );
}
