"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ClipboardCheck, ClipboardList, Gauge, Package, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { FieldStaffGps } from "@/components/site-operations/field-staff-gps";
import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import type {
  DispatchState,
  MaterialReceipt,
  Project,
  Supplier,
  WasteDispatch,
} from "@/interfaces/contractor";
import type { WeighSessionRow } from "@/interfaces/weighing";
import {
  getDispatches,
  getProjects,
  getReceipts,
  getSuppliers,
} from "@/services/contractor.service";
import { getWeighSessions } from "@/services/weighing.service";

export function FieldStaffWorkspace() {
  const t = useTranslations();
  const projects = useQuery({
    queryKey: ["field-staff", "projects"],
    queryFn: () => getProjects({ page_size: 100, sort_by: "name" }),
  });
  const hasProjects = (projects.data?.count ?? 0) > 0;
  const suppliers = useQuery({
    queryKey: ["field-staff", "suppliers"],
    queryFn: () => getSuppliers({ page_size: 100, sort_by: "name" }),
    enabled: hasProjects,
  });
  const dispatches = useQuery({
    queryKey: ["field-staff", "dispatches"],
    queryFn: () => getDispatches({ page_size: 100 }),
    enabled: hasProjects,
  });
  const receipts = useQuery({
    queryKey: ["field-staff", "receipts"],
    queryFn: () => getReceipts({ page_size: 100 }),
    enabled: hasProjects,
  });
  const weighings = useQuery({
    queryKey: ["field-staff", "weighings"],
    queryFn: () => getWeighSessions({ page_size: 100 }),
    enabled: hasProjects,
  });

  return (
    <div className="space-y-7">
      <ListHeader
        title={t("fieldStaffWorkspace.title")}
        subtitle={t("fieldStaffWorkspace.subtitle")}
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard">
              {t("fieldStaffWorkspace.fullPortal")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        }
      />

      {projects.isLoading ? (
        <p className="border-y px-4 py-8 text-center text-sm text-muted-foreground">
          {t("common.loading")}
        </p>
      ) : projects.isError ? (
        <p className="border-y border-destructive/30 px-4 py-8 text-center text-sm text-destructive">
          {t("errors.generic")}
        </p>
      ) : !hasProjects ? (
        <section className="border-y border-warning/30 bg-warning/5 px-4 py-6">
          <div className="flex items-start gap-3">
            <Package className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <h2 className="text-sm font-semibold">{t("fieldStaffWorkspace.noProjectTitle")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("fieldStaffWorkspace.noProjectBody")}
              </p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <RecordSection
            icon={Package}
            title={t("projects.title")}
            count={projects.data?.count ?? 0}
            href="/projects"
            actionLabel={t("fieldStaffWorkspace.viewAll")}
          >
            <div className="divide-y">
              {(projects.data?.results ?? []).slice(0, 5).map((project) => (
                <ProjectRow key={project.id} project={project} />
              ))}
            </div>
          </RecordSection>

          <div className="grid gap-7 xl:grid-cols-2">
            <RecordSection
              icon={Truck}
              title={t("suppliers.title")}
              count={suppliers.data?.count ?? 0}
              href="/suppliers"
              actionLabel={t("fieldStaffWorkspace.viewAll")}
              loading={suppliers.isLoading}
            >
              <div className="divide-y">
                {(suppliers.data?.results ?? []).slice(0, 5).map((supplier) => (
                  <SupplierRow key={supplier.id} supplier={supplier} />
                ))}
              </div>
            </RecordSection>

            <RecordSection
              icon={ClipboardCheck}
              title={t("receipts.title")}
              count={receipts.data?.count ?? 0}
              href="/receipts"
              actionLabel={t("fieldStaffWorkspace.viewAll")}
              loading={receipts.isLoading}
            >
              <div className="divide-y">
                {(receipts.data?.results ?? []).slice(0, 5).map((receipt) => (
                  <ReceiptRow key={receipt.id} receipt={receipt} />
                ))}
              </div>
            </RecordSection>

            <RecordSection
              icon={ClipboardList}
              title={t("dispatches.title")}
              count={dispatches.data?.count ?? 0}
              href="/dispatches"
              actionLabel={t("fieldStaffWorkspace.viewAll")}
              loading={dispatches.isLoading}
            >
              <div className="divide-y">
                {(dispatches.data?.results ?? []).slice(0, 5).map((dispatch) => (
                  <DispatchRow key={dispatch.id} dispatch={dispatch} />
                ))}
              </div>
            </RecordSection>
          </div>

          <RecordSection
            icon={Gauge}
            title={t("weighing.title")}
            count={weighings.data?.count ?? 0}
            href="/weighing"
            actionLabel={t("fieldStaffWorkspace.viewAll")}
            loading={weighings.isLoading}
          >
            <div className="divide-y">
              {(weighings.data?.results ?? []).slice(0, 8).map((weighing) => (
                <WeighingRow key={weighing.id} weighing={weighing} />
              ))}
            </div>
          </RecordSection>
        </>
      )}

      <div className="border-t pt-7">
        <FieldStaffGps />
      </div>
    </div>
  );
}

function RecordSection({
  icon: Icon,
  title,
  count,
  href,
  actionLabel,
  loading = false,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  href: string;
  actionLabel: string;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="border-y bg-card/60">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-primary" />
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <span className="tabular text-xs text-muted-foreground">{loading ? "..." : count}</span>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href={href}>
            {actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
      {loading ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">...</p>
      ) : children}
    </section>
  );
}

function ProjectRow({ project }: { project: Project }) {
  return (
    <Link href={`/projects/${project.id}`} className="block px-4 py-3 hover:bg-muted/40">
      <p className="truncate text-sm font-medium">{project.code} - {project.name}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{project.city || project.address_line_1}</p>
    </Link>
  );
}

function SupplierRow({ supplier }: { supplier: Supplier }) {
  return (
    <div className="px-4 py-3">
      <p className="truncate text-sm font-medium">{supplier.code} - {supplier.name}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{supplier.contact_person || supplier.contact_phone || "-"}</p>
    </div>
  );
}

function ReceiptRow({ receipt }: { receipt: MaterialReceipt }) {
  return (
    <Link
      href={`/receipts/${receipt.id}`}
      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{receipt.receipt_no}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {receipt.material_name} - {receipt.supplier_name}
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {receipt.project_code}
      </span>
    </Link>
  );
}

function DispatchRow({ dispatch }: { dispatch: WasteDispatch }) {
  const t = useTranslations();
  return (
    <Link href={`/dispatches/${dispatch.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{dispatch.dispatch_no}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{dispatch.project_code} - {dispatch.recycler_name}</p>
      </div>
      <StatusBadge label={t(`dispatches.state.${dispatch.state}`)} tone={dispatchTone(dispatch.state)} />
    </Link>
  );
}

function WeighingRow({ weighing }: { weighing: WeighSessionRow }) {
  const t = useTranslations();
  return (
    <Link href={`/weighing/${weighing.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{weighing.dispatch_no ?? t("weighing.noDispatch")}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {weighing.recycler_name ?? t("common.emptyValue")} {weighing.project_code ? `- ${weighing.project_code}` : ""}
        </p>
      </div>
      <StatusBadge label={t(`weighing.verdict.${weighing.verdict}`)} tone={weighing.verdict === "VALID" ? "positive" : weighing.verdict === "INVALID" ? "danger" : "warning"} />
    </Link>
  );
}

function dispatchTone(state: DispatchState): "neutral" | "info" | "warning" | "positive" | "danger" {
  if (state === "SETTLED") return "positive";
  if (state === "CANCELLED") return "danger";
  if (state === "COLLECTED" || state === "WEIGHED") return "warning";
  if (state === "RELEASED") return "info";
  return "neutral";
}
