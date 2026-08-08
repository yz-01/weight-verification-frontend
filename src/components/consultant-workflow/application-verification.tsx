"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, FileCheck2, Loader2, ShieldX } from "lucide-react";
import { useTranslations } from "next-intl";

import { verifyConsultantApplication } from "@/services/consultant-workflow.service";

export function ApplicationVerification({ code }: { code: string }) {
  const t = useTranslations("consultantWorkflow.verification");
  const query = useQuery({
    queryKey: ["public-application-verification", code],
    queryFn: () => verifyConsultantApplication(code),
    retry: false,
  });

  return (
    <main className="min-h-dvh bg-muted/30 px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-2xl overflow-hidden rounded-lg border bg-background shadow-lg">
        <header className="border-b bg-primary px-5 py-5 text-primary-foreground sm:px-7">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-lg bg-white/15"><FileCheck2 className="size-6" /></span>
            <div><p className="text-xs font-semibold uppercase">MSE Trace</p><h1 className="text-xl font-semibold">{t("title")}</h1></div>
          </div>
        </header>
        {query.isLoading ? (
          <div className="grid min-h-80 place-items-center"><Loader2 className="size-7 animate-spin text-primary" /></div>
        ) : query.isError || !query.data ? (
          <div className="grid min-h-80 place-items-center p-8 text-center">
            <div><ShieldX className="mx-auto size-12 text-destructive" /><h2 className="mt-4 text-lg font-semibold">{t("notFoundTitle")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("notFoundHelp")}</p></div>
          </div>
        ) : (
          <div className="p-5 sm:p-7">
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-4">
              <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" />
              <div><h2 className="font-semibold text-success">{t("verifiedTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("verifiedHelp")}</p></div>
            </div>
            <dl className="divide-y rounded-lg border">
              <VerificationRow label={t("applicationNo")} value={query.data.application_no} />
              <VerificationRow label={t("revision")} value={String(query.data.revision)} />
              <VerificationRow label={t("company")} value={query.data.company_name} />
              <VerificationRow label={t("project")} value={query.data.project_name} />
              <VerificationRow label={t("applicationType")} value={query.data.application_type} />
              <VerificationRow label={t("consultantCompany")} value={query.data.consultant_company} />
              <VerificationRow label={t("consultant")} value={query.data.consultant_name} />
              <VerificationRow label={t("decision")} value={query.data.decision} strong />
              <VerificationRow label={t("finalizedAt")} value={new Date(query.data.finalized_at).toLocaleString()} />
            </dl>
            <div className="mt-5 rounded-lg bg-muted/40 p-4">
              <p className="text-xs font-medium text-muted-foreground">{t("sha256")}</p>
              <p className="mt-1 break-all font-mono text-xs">{query.data.sha256}</p>
              <p className="mt-3 text-xs font-medium text-muted-foreground">{t("reference")}</p>
              <p className="mt-1 break-all font-mono text-xs">{query.data.verification_code}</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function VerificationRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr]"><dt className="text-sm text-muted-foreground">{label}</dt><dd className={strong ? "text-sm font-semibold text-success" : "text-sm font-medium"}>{value}</dd></div>;
}
