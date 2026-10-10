"use client";

/**
 * 施工准证 on the phone: 新申请, my permits with their status, and - for the
 * safety manager - the ones waiting for their approval, decided right here.
 *
 * As simple as the phone has to be: one button, one list. Tapping a permit
 * opens the same detail the office reads (files, decision, conversation).
 */

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, FilePlus2, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { FieldDraft } from "@/components/field-staff/field-draft";
import { FieldLoadNote } from "@/components/field-staff/field-load-note";
import {
  PermitApplyForm,
  PermitDetail,
  PermitStatusBadge,
} from "@/components/permits/permit-parts";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { useClearSearchParam } from "@/hooks/use-url-selection";
import { useDateFormat } from "@/lib/dates";
import { getPermits } from "@/services/permit.service";

type View = { kind: "list" } | { kind: "new" } | { kind: "permit"; id: string };

export function FieldPermits({ initialProject }: { initialProject?: string }) {
  const t = useTranslations("permits");
  const df = useDateFormat();
  const { can } = useAuth();
  const searchParams = useSearchParams();
  // A notification opens the permit it is about (`&permit=<id>`).
  const linked = searchParams.get("permit");
  const clearLinked = useClearSearchParam("permit");
  const [view, setView] = useState<View>(
    linked ? { kind: "permit", id: linked } : { kind: "list" },
  );
  const shown: View = linked && view.kind === "list" ? { kind: "permit", id: linked } : view;
  const mine = useQuery({
    queryKey: ["permits", "mine"],
    queryFn: () => getPermits({ mine: "1", page_size: 50, sort_by: "occurred_at", sort_order: "desc" }),
    enabled: shown.kind === "list",
  });
  const back = () => {
    clearLinked();
    setView({ kind: "list" });
  };

  if (shown.kind === "new") {
    return (
      <section className="space-y-4">
        <Button variant="outline" size="sm" onClick={back}>
          <ArrowLeft className="size-4" />
          {t("myPermits")}
        </Button>
        <h3 className="text-base font-semibold">{t("newTitle")}</h3>
        <FieldDraft scope="permit:new">
          <PermitApplyForm
            initialProject={initialProject}
            onSaved={(permit) => setView({ kind: "permit", id: permit.id })}
          />
        </FieldDraft>
      </section>
    );
  }
  if (shown.kind === "permit") {
    return (
      <section className="space-y-4">
        <Button variant="outline" size="sm" onClick={back}>
          <ArrowLeft className="size-4" />
          {t("myPermits")}
        </Button>
        <PermitDetail id={shown.id} presentation="inline" />
      </section>
    );
  }

  const rows = mine.data?.results ?? [];
  return (
    <section className="space-y-4">
      {can("safety.manage") && (
        <Button className="min-h-12 w-full text-base" onClick={() => setView({ kind: "new" })}>
          <FilePlus2 className="size-5" />
          {t("new")}
        </Button>
      )}
      <div>
        <h3 className="text-base font-semibold">{t("myPermits")}</h3>
        <p className="text-xs text-muted-foreground">{t("myPermitsHelp")}</p>
      </div>
      <FieldLoadNote query={mine} what={t("what.list")} />
      {mine.isSuccess && rows.length === 0 && (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          {t("noneMine")}
        </p>
      )}
      <ul className="space-y-2">
        {rows.map((permit) => (
          <li key={permit.id}>
            <button
              type="button"
              className="surface-panel flex w-full min-w-0 items-center gap-3 rounded-xl p-3 text-left active:scale-[0.99]"
              onClick={() => setView({ kind: "permit", id: permit.id })}
            >
              <FileText className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{permit.incident_no}</span>
                  <PermitStatusBadge status={permit.status} />
                  {permit.needs_action && (
                    <span className="rounded-full bg-warning/15 px-2 py-0.5 text-2xs font-medium text-warning">
                      {t("yourApproval")}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {permit.project_name} · {df.dateTime(permit.applied_at)}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {permit.file_names || "—"}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
