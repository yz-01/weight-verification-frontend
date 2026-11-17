"use client";

import { Building2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { ContactMse } from "@/components/platform-status/contact-mse";
import { usePlatformStatus } from "@/hooks/use-platform-status";
import { issuerLines, type PlatformContact } from "@/lib/platform-status";

/**
 * 开票方 on a SaaS / commission bill: who issued it (JB211, Lucas 11-16
 * 「把它们真的做出来」; 11.2.1 「公司名称、公司注册资料、公司地址、联络电话、
 * 官方Email」). The customer sees whom the bill is from and whom to call about
 * it. With nothing filled in on 11.2.1, nothing is shown.
 */
export function InvoiceIssuerBlock({ contact }: { contact?: PlatformContact | null }) {
  const t = useTranslations("platformStatus.issuer");
  const issuer = issuerLines(contact);
  if (!issuer) return null;
  return (
    <div data-testid="invoice-issuer" className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
      <div className="flex items-start gap-2">
        <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs text-muted-foreground">{t("title")}</p>
          {issuer.name ? <p className="font-medium [overflow-wrap:anywhere]">{issuer.name}</p> : null}
          {issuer.registrationNo ? (
            <p>{t("registrationNo", { number: issuer.registrationNo })}</p>
          ) : null}
          {issuer.address ? (
            <p className="whitespace-pre-line [overflow-wrap:anywhere]">{issuer.address}</p>
          ) : null}
        </div>
      </div>
      <ContactMse contact={contact} />
    </div>
  );
}

/** The block, with MSE's details read live. */
export function InvoiceIssuer() {
  // query-failure: without an answer the bill is shown without its issuer block; its amounts and lines are unaffected.
  const status = usePlatformStatus();
  return <InvoiceIssuerBlock contact={status.data?.contact} />;
}
