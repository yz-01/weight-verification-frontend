"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArrowRight,
  Bell,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Plus,
  Search,
  Settings2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConsultantProjectPicker } from "@/components/consultant-workflow/project-scope-picker";
import {
  LoadFailed,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConsultantDashboardRow } from "@/interfaces/consultant-workflow";
import { useDateFormat } from "@/lib/dates";
import { getConsultantDashboard } from "@/services/consultant-workflow.service";
import { getNotifications } from "@/services/platform-ops.service";

export function ConsultantDashboard() {
  const t = useTranslations("consultantDashboard");
  const common = useTranslations("common");
  const router = useRouter();
  const { can, user } = useAuth();
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("");
  const needsProject = user?.account_type === "CONSULTANT";
  const dashboard = useQuery({
    queryKey: ["consultant-dashboard", project],
    queryFn: () => getConsultantDashboard(project || undefined),
    enabled: !needsProject || Boolean(project),
    refetchInterval: 30_000,
  });
  const notifications = useQuery({
    queryKey: ["consultant-dashboard", "notifications"],
    queryFn: () => getNotifications({
        page_size: 5,
        sort_by: "created_at",
        sort_order: "desc",
      }),
    refetchInterval: 30_000,
  });

  if (dashboard.isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        {t("loadError")}
      </div>
    );
  }

  const data = dashboard.data;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can("consultant.config") && (
            <Button asChild variant="outline">
              <Link href="/consultant-workflows"><Settings2 />{t("workflowSettings")}</Link>
            </Button>
          )}
          {can("approval.review") && (
            <Button asChild variant="outline">
              <Link href="/approval-credential"><ClipboardCheck />{t("credential")}</Link>
            </Button>
          )}
          {can("consultant.submit") && (
            <Button asChild>
              <Link href="/consultant-applications/create"><Plus />{t("newApplication")}</Link>
            </Button>
          )}
        </div>
      </header>

      {/*
        One row, not two (T-215). Measured at 1280x720 these were two 32px
        rows with a 24px gap - 88px of controls above the pending work, for a
        picker and a search box that fit beside each other on any laptop. They
        stack again below `sm`, where they genuinely do not.
      */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <ConsultantProjectPicker
        value={project}
        onChange={setProject}
        allowAll
      />

      <form
        className="flex w-full max-w-2xl gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const term = search.trim();
          if (term.length >= 2) {
            router.push(`/consultant-applications?search=${encodeURIComponent(term)}`);
          }
        }}
      >
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("search")}
        />
        <Button type="submit" variant="outline" disabledReason={search.trim().length < 2 ? common("searchMinLength", { count: 2 }) : undefined}
                                                disabled={search.trim().length < 2}>
          <Search />{t("search")}
        </Button>
      </form>
      </div>

      {!data ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/*
            What needs this consultant now, first on the screen (T-213).
            客户：「所有待审批和通知和重要的东西是放在最上面，确保他们可以一登录
            就直接看到」. This grid used to sit below the four-step flow, so on a
            laptop a consultant logged in and saw a diagram while three
            applications waited past the fold.
          */}
          <div data-dashboard-priority className="grid gap-6 xl:grid-cols-2">
            <ApplicationList
              title={t("pending.title")}
              description={t("pending.description")}
              rows={data.pending}
              empty={t("pending.empty")}
              showDue
            />
            <ApplicationList
              title={t("due.title")}
              description={t("due.description")}
              rows={data.due_soon}
              empty={t("due.empty")}
              showDue
            />
            <section className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3 border-b pb-3">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold"><Bell className="size-4 text-primary" />{t("notifications.title")}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{t("notifications.description")}</p>
                </div>
                <Link href="/notifications" className="text-xs font-semibold text-primary hover:underline">{t("openAll")}</Link>
              </div>
              {notifications.isError ? (
                <LoadFailed onRetry={() => void notifications.refetch()} />
              ) : notifications.isLoading ? (
                <Skeleton className="mt-3 h-36 w-full" />
              ) : (notifications.data?.results ?? []).length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("notifications.empty")}</p>
              ) : (
                <div className="divide-y">
                  {(notifications.data?.results ?? []).map((row) => (
                    <div key={row.id} className="py-3">
                      <div className="flex items-center gap-2">
                        {!row.is_read && <span className="size-2 rounded-full bg-primary" />}
                        <p className="min-w-0 flex-1 truncate text-sm font-medium">{row.title}</p>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>          {/*
            The four-step overview, now below the pending work. It explains the
            lifecycle rather than asking for anything, which is why it lost the
            first screen (T-213).
          */}
          <section
            data-dashboard-overview
            aria-labelledby="consultant-flow-title"
            className="space-y-3"
          >
            <div>
              <h2 id="consultant-flow-title" className="text-lg font-semibold">{t("flow.title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("flow.subtitle")}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <LifecycleStep
                number={1}
                label={t("flow.application")}
                help={t("flow.applicationHelp")}
                value={data.summary.draft}
                href="/consultant-applications?stage=draft"
                icon={FileText}
                tone="neutral"
              />
              <LifecycleStep
                number={2}
                label={t("flow.approval")}
                help={t("flow.approvalHelp")}
                value={data.summary.in_approval}
                href="/consultant-applications?stage=approval"
                icon={ClipboardCheck}
                tone="warning"
              />
              <LifecycleStep
                number={3}
                label={t("flow.final")}
                help={t("flow.finalHelp")}
                value={data.summary.final_reports}
                href="/consultant-applications?stage=final"
                icon={FileCheck2}
                tone="positive"
              />
              <LifecycleStep
                number={4}
                label={t("flow.archive")}
                help={t("flow.archiveHelp")}
                value={data.summary.archived}
                href="/consultant-applications?stage=archive"
                icon={Archive}
                tone="info"
              />
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <ApplicationList
              title={t("history.title")}
              description={t("history.description")}
              rows={data.recent_decisions}
              empty={t("history.empty")}
            />
          </div>

        </>
      )}
    </div>
  );
}

function LifecycleStep({
  number,
  label,
  help,
  value,
  href,
  icon: Icon,
  tone = "neutral",
}: {
  number: number;
  label: string;
  help: string;
  value: number;
  href: string;
  icon: typeof ClipboardCheck;
  tone?: "neutral" | "positive" | "warning" | "info";
}) {
  const toneClass = {
    neutral: "bg-primary/10 text-primary",
    positive: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning",
    info: "bg-info/10 text-info",
  }[tone];
  return (
    <Link
      href={href}
      className="group flex min-h-40 flex-col rounded-lg border bg-card p-4 shadow-sm transition-colors hover:border-primary/35 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full border bg-background text-sm font-bold tabular-nums">{number}</span>
          <span className={`grid size-10 place-items-center rounded-lg ${toneClass}`}><Icon className="size-5" /></span>
        </div>
        <span className="text-3xl font-semibold tabular-nums">{value}</span>
      </div>
      <p className="mt-4 text-base font-semibold">{label}</p>
      <p className="mt-1 flex-1 text-sm leading-5 text-muted-foreground">{help}</p>
      <span className="mt-3 flex items-center gap-1 text-sm font-semibold text-primary">
        <span>{label}</span><ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function ApplicationList({
  title,
  description,
  rows,
  empty,
  showDue = false,
}: {
  title: string;
  description: string;
  rows: ConsultantDashboardRow[];
  empty: string;
  showDue?: boolean;
}) {
  const t = useTranslations("consultantDashboard");
  const df = useDateFormat();
  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b pb-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <Link href="/consultant-applications" className="text-xs font-semibold text-primary hover:underline">{t("openAll")}</Link>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="divide-y">
          {rows.map((row) => (
            <Link key={row.id} href={`/consultant-applications/${row.id}`} className="flex items-start justify-between gap-3 py-3 transition-colors hover:bg-muted/30">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.application_no} - {row.application_type}</p>
                <p className="truncate text-xs text-muted-foreground">{row.project_name} · {row.applicant_name}</p>
                {row.current_step && <p className="mt-1 text-xs text-primary">{t("currentStep", { step: row.current_step })}</p>}
              </div>
              <div className="shrink-0 text-right">
                <StatusBadge label={t(`status.${row.status}`)} tone={statusTone(row.status)} />
                {showDue && row.required_at && <p className="mt-1 text-xs text-muted-foreground">{df.dateTime(row.required_at)}</p>}
                {!showDue && row.latest_decision_at && <p className="mt-1 text-xs text-muted-foreground">{df.dateTime(row.latest_decision_at)}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function statusTone(status: ConsultantDashboardRow["status"]) {
  if (["APPROVED", "APPROVED_WITH_REMEDIAL", "ARCHIVED"].includes(status)) return "positive" as const;
  if (["REJECTED", "REVISE_RESUBMIT"].includes(status)) return "danger" as const;
  if (status === "SUBMITTED") return "warning" as const;
  return "neutral" as const;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-28 w-full" />)}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-72 w-full" />)}
      </div>
    </div>
  );
}
