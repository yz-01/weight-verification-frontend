"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface ExternalPortalData {
  grant: {
    name: string;
    expires_at: string;
    company_name: string;
  };
  project: {
    code: string;
    name: string;
    status: string;
    city: string;
    state: string;
  } | null;
  progress: Array<{
    title: string;
    description: string;
    percent_complete: string;
    reported_at: string;
  }>;
  weighing: Array<{
    session_no: string;
    vehicle_plate: string;
    direction: string;
    net_weight_kg: string | null;
    started_at: string | null;
    ended_at: string | null;
  }>;
  documents: Array<{
    document_no: string;
    title: string;
    reference_no: string;
    created_at: string;
  }>;
  evidence: Array<{
    kind: string;
    original_filename: string;
    captured_at: string;
    sha256: string;
  }>;
}

export function ExternalPortal({ token }: { token: string }) {
  const t = useTranslations();
  const [data, setData] = useState<ExternalPortalData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const base = (
      process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"
    ).replace(/\/$/, "");
    void fetch(`${base}/api/external-portal/${encodeURIComponent(token)}/`)
      .then(async (response) => {
        if (!response.ok) throw new Error("external_portal_failed");
        const body = (await response.json()) as {
          success: boolean;
          data?: ExternalPortalData;
        };
        if (!body.success || !body.data) throw new Error("external_portal_failed");
        setData(body.data);
      })
      .catch(() => setError(true));
  }, [token]);

  if (error) {
    return <main className="mx-auto max-w-3xl px-5 py-16"><h1 className="text-xl font-semibold">{t("externalPortal.invalid")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("externalPortal.invalidBody")}</p></main>;
  }
  if (!data) {
    return <main className="mx-auto max-w-3xl px-5 py-16 text-sm text-muted-foreground">{t("common.loading")}</main>;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-5 py-8">
      <header className="border-b pb-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{data.grant.company_name}</p>
        <h1 className="mt-2 text-2xl font-semibold">{data.grant.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("externalPortal.expiry", { date: new Date(data.grant.expires_at).toLocaleString() })}</p>
      </header>

      {data.project && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">{t("externalPortal.project")}</h2>
          <div className="grid gap-3 border-y py-4 sm:grid-cols-2 lg:grid-cols-4">
            <Value label={t("externalPortal.field.code")} value={data.project.code} />
            <Value label={t("externalPortal.field.name")} value={data.project.name} />
            <Value label={t("externalPortal.field.status")} value={data.project.status} />
            <Value label={t("externalPortal.field.location")} value={[data.project.city, data.project.state].filter(Boolean).join(", ")} />
          </div>
        </section>
      )}

      <ExternalSection title={t("externalPortal.progress")} empty={data.progress.length === 0}>
        {data.progress.map((item) => (
          <li key={`${item.title}-${item.reported_at}`} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-b-0">
            <span className="font-medium">{item.title}</span>
            <span className="tabular-nums">{item.percent_complete}%</span>
          </li>
        ))}
      </ExternalSection>
      <ExternalSection title={t("externalPortal.weighing")} empty={data.weighing.length === 0}>
        {data.weighing.map((item) => (
          <li key={item.session_no} className="grid gap-1 border-b py-3 last:border-b-0 sm:grid-cols-4">
            <span className="font-mono">{item.session_no}</span>
            <span>{item.vehicle_plate || t("common.emptyValue")}</span>
            <span>{item.direction}</span>
            <span className="tabular-nums">{item.net_weight_kg ?? t("common.emptyValue")}</span>
          </li>
        ))}
      </ExternalSection>
      <ExternalSection title={t("externalPortal.documents")} empty={data.documents.length === 0}>
        {data.documents.map((item) => (
          <li key={item.document_no} className="flex flex-wrap justify-between gap-3 border-b py-3 last:border-b-0">
            <span><span className="mr-2 font-mono text-xs">{item.document_no}</span>{item.title}</span>
            <span className="text-sm text-muted-foreground">{item.reference_no}</span>
          </li>
        ))}
      </ExternalSection>
      <ExternalSection title={t("externalPortal.evidence")} empty={data.evidence.length === 0}>
        {data.evidence.map((item) => (
          <li key={`${item.sha256}-${item.captured_at}`} className="flex flex-wrap justify-between gap-3 border-b py-3 last:border-b-0">
            <span>{item.original_filename}</span>
            <span className="font-mono text-xs text-muted-foreground">{item.sha256.slice(0, 16)}...</span>
          </li>
        ))}
      </ExternalSection>
    </main>
  );
}

function ExternalSection({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  const t = useTranslations();
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {empty ? <p className="border-y py-8 text-center text-sm text-muted-foreground">{t("common.emptyValue")}</p> : <ul className="border-y">{children}</ul>}
    </section>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value || "—"}</p></div>;
}
