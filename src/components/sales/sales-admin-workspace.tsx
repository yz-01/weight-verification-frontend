"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  Edit3,
  FileDown,
  Loader2,
  Plus,
  Save,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { AdvancedTechnicalSettings } from "@/components/shared/advanced-technical-settings";
import {
  FieldWrapper,
  ListHeader,
  LoadFailed,
  QueryFailedNote,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type {
  CommissionCalculationConfig,
  CommissionPayout,
  CommissionScheme,
  CustomerAssignment,
  PayoutState,
  Salesperson,
  SalesTerms,
} from "@/interfaces/sales";
import type { CompanyRow } from "@/interfaces/company";
import { useDateFormat } from "@/lib/dates";
import { getCompanies } from "@/services/companies.service";
import {
  acknowledgeSalesTerms,
  activateSalesTerms,
  adjustPayout,
  calculatePayout,
  createCommissionScheme,
  createCustomerAssignment,
  createSalesperson,
  createSalesTerms,
  exportSalesDataset,
  getCommissionSchemes,
  getCustomerAssignments,
  getPayouts,
  getSalespeople,
  getSalesSummary,
  getSalesTerms,
  getTeamPerformance,
  reassignCustomer,
  transitionPayout,
  updateCommissionRule,
  updateCommissionScheme,
  updateSalesperson,
  type CommissionSchemePayload,
  type SalespersonPayload,
} from "@/services/sales.service";

export type SalesAdminSection =
  | "overview"
  | "people"
  | "territories"
  | "hierarchy"
  | "assignments"
  | "rules"
  | "schemes"
  | "terms"
  | "payouts"
  | "performance"
  | "settlements"
  | "reports";

const SUBMODULES: Array<{
  section: Exclude<SalesAdminSection, "overview">;
  number: string;
}> = [
  { section: "people", number: "13.2.1" },
  { section: "territories", number: "13.2.3" },
  { section: "hierarchy", number: "13.2.4" },
  { section: "assignments", number: "13.2.5" },
  { section: "rules", number: "13.2.6" },
  { section: "schemes", number: "13.2.7" },
  { section: "terms", number: "13.2.8" },
  { section: "payouts", number: "13.2.9" },
  { section: "performance", number: "13.2.10" },
  { section: "settlements", number: "13.2.11" },
  { section: "reports", number: "13.2.12" },
];

const BASES = [
  "FIXED_PER_CUSTOMER",
  "PERCENT_OF_SAAS",
  "PERCENT_OF_PLATFORM_COMMISSION",
  "PERCENT_OF_BUSINESS_VALUE",
  "FIXED_PER_CONTRACTOR",
  "FIXED_PER_RECYCLER",
  "TARGET_BONUS",
  "CUSTOM_FORMULA",
];

export function SalesAdminWorkspace({
  section = "overview",
}: {
  section?: SalesAdminSection;
}) {
  const t = useTranslations("adminSales");
  if (section === "overview") return <Overview />;
  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t(`section.${section}.title`)}
        subtitle={t(`section.${section}.subtitle`)}
      />
      {section === "people" ? <PeoplePanel manageable /> : null}
      {section === "hierarchy" ? <HierarchyPanel /> : null}
      {section === "assignments" ? <AssignmentPanel /> : null}
      {section === "rules" ? <SchemePanel mode="rules" /> : null}
      {section === "schemes" ? <SchemePanel mode="schemes" /> : null}
      {section === "terms" ? <TermsPanel /> : null}
      {section === "payouts" || section === "settlements" ? (
        <PayoutPanel settlements={section === "settlements"} />
      ) : null}
      {section === "performance" ? <PerformancePanel /> : null}
      {section === "reports" ? <ReportsPanel /> : null}
    </div>
  );
}

function Overview() {
  const t = useTranslations("adminSales");
  const summary = useQuery({
    queryKey: ["sales-summary"],
    queryFn: getSalesSummary,
  });
  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader title={t("title")} subtitle={t("subtitle")} />
      <div>
        <div className="grid overflow-hidden rounded-lg border bg-card shadow-sm sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["total", summary.data?.total ?? 0],
            ["active", summary.data?.active ?? 0],
            ["customers", summary.data?.customers_assigned ?? 0],
            ["unassigned", summary.data?.unassigned_states.length ?? 0],
          ].map(([key, value]) => (
            <div key={key} className="border-b border-r px-5 py-4">
              <p className="text-xs text-muted-foreground">
                {t(`metric.${key}`)}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {summary.isError ? "—" : value}
              </p>
            </div>
          ))}
        </div>
        <QueryFailedNote query={summary} what={t("what.summary")} className="mt-2" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card shadow-sm">
        <div className="grid md:grid-cols-2 xl:grid-cols-3">
          {SUBMODULES.map((module) => (
            <Link
              key={module.section}
              href={`/sales/${module.section}`}
              className="flex min-h-20 items-center gap-3 border-b border-r px-5 py-4 hover:bg-muted/40"
            >
              <span className="flex-1 font-medium">
                {t(`section.${module.section}.title`)}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function PanelState({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("adminSales");
  if (loading)
    return (
      <div className="flex min-h-40 flex-1 items-center justify-center rounded-lg border bg-card shadow-sm">
        <Loader2 className="mr-2 animate-spin" />
        {t("loading")}
      </div>
    );
  if (error)
    return (
      <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-5 text-destructive">{t("loadError")}</div>
    );
  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card shadow-sm">
      {children}
    </div>
  );
}

function PeoplePanel({ manageable }: { manageable: boolean }) {
  const t = useTranslations("adminSales");
  const df = useDateFormat();
  const qc = useQueryClient();
  const people = useQuery({
    queryKey: ["salespeople", "admin"],
    queryFn: () => getSalespeople({ page_size: 200 }),
  });
  const schemes = useQuery({
    queryKey: ["commission-schemes", "options"],
    queryFn: () => getCommissionSchemes({ page_size: 200 }),
  });
  const [editing, setEditing] = useState<Salesperson | null | undefined>(
    undefined,
  );
  return (
    <PanelState loading={people.isLoading} error={people.isError}>
      {manageable && (
        <div className="flex justify-end border-b p-3">
          <Button onClick={() => setEditing(null)}>
            <Plus />
            {t("action.addPerson")}
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {[
              "code",
              "name",
              "contact",
              "role",
              "territory",
              "supervisor",
              "scheme",
              "joined",
              "status",
              "actions",
            ].map((key) => (
              <TableHead key={key}>{t(`column.${key}`)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(people.data?.results ?? []).map((person) => (
            <TableRow key={person.id}>
              <TableCell className="font-medium">{person.code}</TableCell>
              <TableCell>{person.full_name}</TableCell>
              <TableCell>
                <p>{person.phone || "-"}</p>
                <p className="text-xs text-muted-foreground">
                  {person.email || "-"}
                </p>
              </TableCell>
              <TableCell>{t(`role.${person.sales_role}`)}</TableCell>
              <TableCell>
                {person.territories.flatMap((x) => x.states).join(", ") ||
                  t("scope.NATIONAL")}
              </TableCell>
              <TableCell>{person.supervisor_name || "-"}</TableCell>
              <TableCell>{person.scheme_name || "-"}</TableCell>
              <TableCell>{df.date(person.joined_on)}</TableCell>
              <TableCell>
                <StatusBadge
                  label={t(
                    person.is_active ? "status.active" : "status.inactive",
                  )}
                  tone={person.is_active ? "positive" : "neutral"}
                />
              </TableCell>
              <TableCell>
                {manageable && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setEditing(person)}
                  >
                    <Edit3 />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {editing !== undefined && (
        <PersonDialog
          initial={editing}
          people={people.data?.results ?? []}
          schemes={schemes.data?.results ?? []}
          schemesStatus={{ isError: schemes.isError, refetch: schemes.refetch }}
          onClose={() => setEditing(undefined)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["salespeople"] })}
        />
      )}
    </PanelState>
  );
}

function PersonDialog({
  initial,
  people,
  schemes,
  schemesStatus,
  onClose,
  onSaved,
}: {
  initial: Salesperson | null;
  people: Salesperson[];
  schemes: CommissionScheme[];
  schemesStatus: { isError: boolean; refetch: () => unknown };
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminSales");
  const [form, setForm] = useState<SalespersonPayload>({
    code: initial?.code ?? "",
    full_name: initial?.full_name ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    sales_role: initial?.sales_role ?? "EXECUTIVE",
    supervisor: initial?.supervisor,
    commission_scheme: initial?.commission_scheme,
    joined_on: initial?.joined_on ?? new Date().toISOString().slice(0, 10),
    left_on: initial?.left_on,
    is_active: initial?.is_active ?? true,
    notes: initial?.notes ?? "",
  });
  const save = useMutation({
    mutationFn: () =>
      initial ? updateSalesperson(initial.id, form) : createSalesperson(form),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const set = (key: keyof SalespersonPayload, value: unknown) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t(initial ? "action.editPerson" : "action.addPerson")}
          </DialogTitle>
          <DialogDescription>{t("dialog.person")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldWrapper label={t("column.code")} required>
            <Input
              value={form.code}
              disabled={Boolean(initial)}
              onChange={(e) => set("code", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("column.name")} required>
            <Input
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.phone")}>
            <Input
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.email")}>
            <Input
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("column.role")}>
            <select
              className="h-8 w-full rounded-md border bg-background px-2"
              value={form.sales_role}
              onChange={(e) => set("sales_role", e.target.value)}
            >
              {["EXECUTIVE", "SUPERVISOR", "MANAGER", "AGENT"].map((x) => (
                <option key={x} value={x}>
                  {t(`role.${x}`)}
                </option>
              ))}
            </select>
          </FieldWrapper>
          <FieldWrapper label={t("column.supervisor")}>
            <select
              className="h-8 w-full rounded-md border bg-background px-2"
              value={form.supervisor ?? ""}
              onChange={(e) => set("supervisor", e.target.value || null)}
            >
              <option value="">{t("field.noSupervisor")}</option>
              {people
                .filter((x) => x.id !== initial?.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} / {x.full_name}
                  </option>
                ))}
            </select>
          </FieldWrapper>
          <FieldWrapper label={t("column.scheme")}>
            <select
              className="h-8 w-full rounded-md border bg-background px-2"
              value={form.commission_scheme ?? ""}
              onChange={(e) => set("commission_scheme", e.target.value || null)}
            >
              <option value="">{t("field.noScheme")}</option>
              {schemes.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} / {x.name}
                </option>
              ))}
            </select>
            <QueryFailedNote query={schemesStatus} what={t("what.schemes")} />
          </FieldWrapper>
          <FieldWrapper label={t("column.joined")}>
            <Input
              type="date"
              value={form.joined_on}
              onChange={(e) => set("joined_on", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper className="sm:col-span-2" label={t("field.notes")}>
            <Textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </FieldWrapper>
          <label className="flex items-center gap-2">
            <Switch
              checked={form.is_active}
              onCheckedChange={(x) => set("is_active", x)}
            />
            {t("status.active")}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [form.code, t("column.code")],
              [form.full_name, t("column.name")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HierarchyPanel() {
  const t = useTranslations("adminSales");
  const rows = useQuery({
    queryKey: ["salespeople", "hierarchy"],
    queryFn: () => getSalespeople({ page_size: 200 }),
  });
  return (
    <PanelState loading={rows.isLoading} error={rows.isError}>
      <Table>
        <TableHeader>
          <TableRow>
            {[
              "name",
              "role",
              "supervisor",
              "team",
              "territory",
              "customers",
              "scheme",
            ].map((x) => (
              <TableHead key={x}>{t(`column.${x}`)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows.data?.results ?? []).map((x) => (
            <TableRow key={x.id}>
              <TableCell>
                {x.code} / {x.full_name}
              </TableCell>
              <TableCell>{t(`role.${x.sales_role}`)}</TableCell>
              <TableCell>{x.supervisor_name || "-"}</TableCell>
              <TableCell>{x.report_count}</TableCell>
              <TableCell>
                {x.territories.map((y) => y.name).join(", ") || "-"}
              </TableCell>
              <TableCell>{x.customer_count}</TableCell>
              <TableCell>{x.scheme_name || "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </PanelState>
  );
}

function AssignmentPanel() {
  const t = useTranslations("adminSales");
  const qc = useQueryClient();
  const [selected, setSelected] = useState<CustomerAssignment | null>(null);
  const [creating, setCreating] = useState(false);
  const rows = useQuery({
    queryKey: ["customer-assignments"],
    queryFn: () => getCustomerAssignments({ page_size: 200 }),
  });
  const people = useQuery({
    queryKey: ["salespeople", "options"],
    queryFn: () => getSalespeople({ page_size: 200, is_active: true }),
  });
  const companies = useQuery({
    queryKey: ["companies", "sales-assignment-options"],
    queryFn: () => getCompanies({ page_size: 500, sort_by: "name" }),
  });
  const assignedCompanyIds = new Set(
    (rows.data?.results ?? []).map((assignment) => assignment.company),
  );
  const availableCompanies = (companies.data?.results ?? []).filter(
    (company) => !assignedCompanyIds.has(company.id),
  );
  return (
    <PanelState
      loading={rows.isLoading || companies.isLoading}
      error={rows.isError || companies.isError}
    >
      <div className="flex justify-end border-b p-3">
        <Button
          disabled={people.isLoading}
          onClick={() => setCreating(true)}
        >
          <Plus />
          {t("action.addAssignment")}
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {[
              "company",
              "type",
              "salesperson",
              "supervisor",
              "states",
              "won",
              "actions",
            ].map((x) => (
              <TableHead key={x}>{t(`column.${x}`)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows.data?.results ?? []).map((x) => (
            <TableRow key={x.id}>
              <TableCell>
                {x.company_code} / {x.company_name}
              </TableCell>
              <TableCell>{x.company_type}</TableCell>
              <TableCell>
                {x.salesperson_code} / {x.salesperson_name}
              </TableCell>
              <TableCell>{x.supervisor_name || "-"}</TableCell>
              <TableCell>{x.state || "-"}</TableCell>
              <TableCell>{x.won_on}</TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelected(x)}
                >
                  <Edit3 />
                  {t("action.reassign")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {selected && (
        <ReassignDialog
          assignment={selected}
          people={people.data?.results ?? []}
          peopleStatus={{ isError: people.isError, refetch: people.refetch }}
          onClose={() => setSelected(null)}
          onSaved={() =>
            qc.invalidateQueries({ queryKey: ["customer-assignments"] })
          }
        />
      )}
      {creating && (
        <AssignmentDialog
          companies={availableCompanies}
          people={people.data?.results ?? []}
          peopleStatus={{ isError: people.isError, refetch: people.refetch }}
          onClose={() => setCreating(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["customer-assignments"] });
            qc.invalidateQueries({ queryKey: ["sales-summary"] });
          }}
        />
      )}
    </PanelState>
  );
}

function AssignmentDialog({
  companies,
  people,
  peopleStatus,
  onClose,
  onSaved,
}: {
  companies: CompanyRow[];
  people: Salesperson[];
  peopleStatus: { isError: boolean; refetch: () => unknown };
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminSales");
  const [form, setForm] = useState({
    company: "",
    salesperson: "",
    won_on: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const save = useMutation({
    mutationFn: () => createCustomerAssignment(form),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("action.addAssignment")}</DialogTitle>
          <DialogDescription>{t("dialog.assignment")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {companies.length === 0 && (
            <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              {t("field.noUnassignedCompanies")}
            </p>
          )}
          <FieldWrapper label={t("field.selectCompany")} required>
            <select
              className="h-9 w-full rounded-md border bg-background px-3"
              disabled={companies.length === 0}
              value={form.company}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  company: event.target.value,
                }))
              }
            >
              <option value="">{t("field.selectCompany")}</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.code} / {company.name}
                </option>
              ))}
            </select>
          </FieldWrapper>
          <FieldWrapper label={t("field.selectPerson")} required>
            <select
              className="h-9 w-full rounded-md border bg-background px-3"
              value={form.salesperson}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  salesperson: event.target.value,
                }))
              }
            >
              <option value="">{t("field.selectPerson")}</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.code} / {person.full_name}
                </option>
              ))}
            </select>
            <QueryFailedNote query={peopleStatus} what={t("what.people")} />
          </FieldWrapper>
          <FieldWrapper label={t("field.wonOn")} required>
            <Input
              type="date"
              value={form.won_on}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  won_on: event.target.value,
                }))
              }
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.notes")}>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />
          </FieldWrapper>
          {save.isError && (
            <p className="text-sm text-destructive">{t("saveError")}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [form.company, t("field.selectCompany")],
              [form.salesperson, t("field.selectPerson")],
              [form.won_on, t("field.wonOn")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReassignDialog({
  assignment,
  people,
  peopleStatus,
  onClose,
  onSaved,
}: {
  assignment: CustomerAssignment;
  people: Salesperson[];
  peopleStatus: { isError: boolean; refetch: () => unknown };
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminSales");
  const [person, setPerson] = useState("");
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: () => reassignCustomer(assignment.id, person, reason),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(x) => {
        if (!x) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("action.reassign")}</DialogTitle>
          <DialogDescription>{assignment.company_name}</DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("field.selectPerson")} required>
          <select
            className="h-8 w-full rounded-md border bg-background px-2"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
          >
            <option value="">{t("field.selectPerson")}</option>
            {people
              .filter((x) => x.id !== assignment.salesperson)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} / {x.full_name}
                </option>
              ))}
          </select>
          <QueryFailedNote query={peopleStatus} what={t("what.people")} />
        </FieldWrapper>
        <FieldWrapper label={t("field.reasonLabel")} required>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FieldWrapper>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [person, t("field.selectPerson")],
              [reason, t("field.reasonLabel")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <Save />
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SchemePanel({ mode }: { mode: "rules" | "schemes" }) {
  const t = useTranslations("adminSales");
  const qc = useQueryClient();
  const rows = useQuery({
    queryKey: ["commission-schemes"],
    queryFn: () => getCommissionSchemes({ page_size: 200 }),
  });
  const [editing, setEditing] = useState<CommissionScheme | null | undefined>(
    undefined,
  );
  return (
    <PanelState loading={rows.isLoading} error={rows.isError}>
      <div className="flex justify-end border-b p-3">
        <Button onClick={() => setEditing(null)}>
          <Plus />
          {t(mode === "rules" ? "action.addRule" : "action.addScheme")}
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {(mode === "rules"
              ? ["code", "name", "basis", "rate", "actions"]
              : [
                  "code",
                  "name",
                  "cycle",
                  "minimum",
                  "maximum",
                  "people",
                  "status",
                  "actions",
                ]
            ).map((x) => (
              <TableHead key={x}>{t(`column.${x}`)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows.data?.results ?? []).map((x) => (
            <TableRow key={x.id}>
              <TableCell>{x.code}</TableCell>
              <TableCell>{x.name}</TableCell>
              {mode === "rules" ? (
                <>
                  <TableCell>{t(`basis.${x.basis}`)}</TableCell>
                  <TableCell>
                    {x.basis === "CUSTOM_FORMULA"
                      ? t("custom.configured")
                      : x.rate}
                  </TableCell>
                </>
              ) : (
                <>
                  <TableCell>{t(`cycle.${x.payout_cycle}`)}</TableCell>
                  <TableCell>{x.minimum_payout}</TableCell>
                  <TableCell>{x.maximum_payout ?? "-"}</TableCell>
                  <TableCell>{x.salesperson_count}</TableCell>
                  <TableCell>
                    <StatusBadge
                      label={t(
                        x.is_active ? "status.active" : "status.inactive",
                      )}
                      tone={x.is_active ? "positive" : "neutral"}
                    />
                  </TableCell>
                </>
              )}
              <TableCell>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setEditing(x)}
                >
                  <Edit3 />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {editing !== undefined && (
        <SchemeDialog
          initial={editing}
          mode={mode}
          onClose={() => setEditing(undefined)}
          onSaved={() =>
            qc.invalidateQueries({ queryKey: ["commission-schemes"] })
          }
        />
      )}
    </PanelState>
  );
}

function SchemeDialog({
  initial,
  mode,
  onClose,
  onSaved,
}: {
  initial: CommissionScheme | null;
  mode: "rules" | "schemes";
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminSales");
  const [form, setForm] = useState<CommissionSchemePayload>({
    code: initial?.code ?? "",
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    basis: initial?.basis ?? "FIXED_PER_CUSTOMER",
    rate: initial?.rate ?? "0",
    currency: initial?.currency ?? "MYR",
    payout_cycle: initial?.payout_cycle ?? "MONTHLY",
    minimum_payout: initial?.minimum_payout ?? "0",
    maximum_payout: initial?.maximum_payout,
    target_amount: initial?.target_amount,
    calculation_config: initial?.calculation_config ?? {},
    accrual_months: initial?.accrual_months,
    is_active: initial?.is_active ?? true,
  });
  const set = (key: keyof CommissionSchemePayload, value: unknown) =>
    setForm((x) => ({ ...x, [key]: value }));
  const save = useMutation({
    mutationFn: () =>
      initial
        ? mode === "rules"
          ? updateCommissionRule(initial.id, {
              basis: form.basis,
              rate: form.rate,
              target_amount: form.target_amount,
              calculation_config: form.calculation_config,
            })
          : updateCommissionScheme(initial.id, {
              name: form.name,
              description: form.description,
              payout_cycle: form.payout_cycle,
              minimum_payout: form.minimum_payout,
              maximum_payout: form.maximum_payout,
              accrual_months: form.accrual_months,
              is_active: form.is_active,
            })
        : createCommissionScheme(form),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(x) => {
        if (!x) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t(mode === "rules" ? "action.addRule" : "action.addScheme")}
          </DialogTitle>
          <DialogDescription>
            {t(mode === "rules" ? "dialog.rule" : "dialog.scheme")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldWrapper label={t("column.code")} required>
            <Input
              value={form.code}
              disabled={Boolean(initial)}
              onChange={(e) => set("code", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("column.name")} required>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </FieldWrapper>
          {mode === "rules" ? (
            <RuleFields form={form} set={set} />
          ) : (
            <>
              <FieldWrapper label={t("column.cycle")}>
                <select
                  className="h-8 w-full rounded-md border bg-background px-2"
                  value={form.payout_cycle}
                  onChange={(e) => set("payout_cycle", e.target.value)}
                >
                  {["MONTHLY", "QUARTERLY", "YEARLY"].map((x) => (
                    <option key={x} value={x}>
                      {t(`cycle.${x}`)}
                    </option>
                  ))}
                </select>
              </FieldWrapper>
              <FieldWrapper label={t("column.minimum")}>
                <Input
                  type="number"
                  min="0"
                  value={form.minimum_payout}
                  onChange={(e) => set("minimum_payout", e.target.value)}
                />
              </FieldWrapper>
              <FieldWrapper label={t("column.maximum")}>
                <Input
                  type="number"
                  min="0"
                  value={form.maximum_payout ?? ""}
                  onChange={(e) => set("maximum_payout", e.target.value || null)}
                />
              </FieldWrapper>
              <FieldWrapper label={t("field.accrualMonths")}>
                <Input
                  type="number"
                  min="1"
                  value={form.accrual_months ?? ""}
                  onChange={(e) =>
                    set(
                      "accrual_months",
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                />
              </FieldWrapper>
            </>
          )}
          <FieldWrapper className="sm:col-span-2" label={t("field.description")}>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </FieldWrapper>
          {mode === "schemes" && (
            <label className="flex items-center gap-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={(x) => set("is_active", x)}
              />
              {t("status.active")}
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [form.code, t("column.code")],
              [form.name, t("column.name")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <Save />
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleFields({
  form,
  set,
}: {
  form: CommissionSchemePayload;
  set: (key: keyof CommissionSchemePayload, value: unknown) => void;
}) {
  const t = useTranslations("adminSales");
  const config = form.calculation_config ?? {};
  const setConfig = (key: keyof CommissionCalculationConfig, value: string) =>
    set("calculation_config", { ...config, [key]: value });

  return (
    <>
      <select
        className="h-8 rounded-md border bg-background px-2"
        value={form.basis}
        onChange={(e) => set("basis", e.target.value)}
      >
        {BASES.map((x) => (
          <option key={x} value={x}>
            {t(`basis.${x}`)}
          </option>
        ))}
      </select>
      {form.basis !== "CUSTOM_FORMULA" && (
        <Input
          type="number"
          min="0"
          step="0.001"
          placeholder={t("column.rate")}
          value={form.rate}
          onChange={(e) => set("rate", e.target.value)}
        />
      )}
      {form.basis === "TARGET_BONUS" && (
        <Input
          type="number"
          min="0"
          placeholder={t("field.target")}
          value={form.target_amount ?? ""}
          onChange={(e) => set("target_amount", e.target.value || null)}
        />
      )}
      {form.basis === "CUSTOM_FORMULA" && (
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
          {[
            "fixed_amount",
            "fixed_per_customer",
            "fixed_per_contractor",
            "fixed_per_recycler",
            "saas_percent",
            "platform_commission_percent",
            "business_value_percent",
            "target_threshold",
            "target_bonus",
          ].map((key) => (
            <Input
              key={key}
              type="number"
              min="0"
              step="0.001"
              placeholder={t(`custom.${key}`)}
              value={config[key as keyof CommissionCalculationConfig] ?? ""}
              onChange={(e) =>
                setConfig(
                  key as keyof CommissionCalculationConfig,
                  e.target.value,
                )
              }
            />
          ))}
          <select
            className="h-8 rounded-md border bg-background px-2"
            value={config.target_metric ?? ""}
            onChange={(e) => setConfig("target_metric", e.target.value)}
          >
            <option value="">{t("custom.noTarget")}</option>
            {[
              "combined_revenue",
              "saas_revenue",
              "platform_commission",
              "business_value",
              "customers",
              "contractors",
              "recyclers",
            ].map((metric) => (
              <option key={metric} value={metric}>
                {t(`custom.metric.${metric}`)}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}

function TermsPanel() {
  const t = useTranslations("adminSales");
  const qc = useQueryClient();
  const rows = useQuery({
    queryKey: ["sales-terms"],
    queryFn: () => getSalesTerms({ page_size: 200 }),
  });
  const people = useQuery({
    queryKey: ["salespeople", "options"],
    queryFn: () => getSalespeople({ page_size: 200, is_active: true }),
  });
  const [creating, setCreating] = useState(false);
  const [ack, setAck] = useState<SalesTerms | null>(null);
  const activate = useMutation({
    mutationFn: activateSalesTerms,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales-terms"] }),
  });
  return (
    <PanelState loading={rows.isLoading} error={rows.isError}>
      <div className="flex justify-end border-b p-3">
        <Button onClick={() => setCreating(true)}>
          <Plus />
          {t("action.addTerms")}
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {[
              "code",
              "version",
              "name",
              "effective",
              "status",
              "acknowledged",
              "actions",
            ].map((x) => (
              <TableHead key={x}>{t(`column.${x}`)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows.data?.results ?? []).map((x) => (
            <TableRow key={x.id}>
              <TableCell>{x.code}</TableCell>
              <TableCell>v{x.version}</TableCell>
              <TableCell>{x.title}</TableCell>
              <TableCell>{x.effective_from || "-"}</TableCell>
              <TableCell>{t(`termsStatus.${x.status}`)}</TableCell>
              <TableCell>{x.acknowledgement_count}</TableCell>
              <TableCell className="flex gap-1">
                {x.status === "DRAFT" && (
                  <Button size="sm" onClick={() => activate.mutate(x.id)}>
                    <Check />
                    {t("action.activate")}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setAck(x)}>
                  {t("action.acknowledge")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {creating && (
        <TermsDialog
          onClose={() => setCreating(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["sales-terms"] })}
        />
      )}
      {ack && (
        <AcknowledgeDialog
          terms={ack}
          people={people.data?.results ?? []}
          peopleStatus={{ isError: people.isError, refetch: people.refetch }}
          onClose={() => setAck(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["sales-terms"] })}
        />
      )}
    </PanelState>
  );
}

function TermsDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminSales");
  const technical = useTranslations("adminTechnicalSupport");
  const [jsonError, setJsonError] = useState("");
  const [form, setForm] = useState({
    code: "",
    title: "",
    body: "",
    clauses: "{}",
    effective_from: "",
  });
  const save = useMutation({
    mutationFn: () => {
      let clauses: Record<string, unknown>;
      try {
        clauses = JSON.parse(form.clauses || "{}") as Record<string, unknown>;
        setJsonError("");
      } catch {
        setJsonError(technical("field.invalidJson"));
        throw new Error("invalid_json");
      }
      return createSalesTerms({
        ...form,
        clauses,
        effective_from: form.effective_from || null,
      });
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(x) => {
        if (!x) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("action.addTerms")}</DialogTitle>
          <DialogDescription>{t("dialog.terms")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("column.code")} required>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </FieldWrapper>
          <FieldWrapper label={t("column.name")} required>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.effectiveFrom")}>
            <Input
              type="date"
              value={form.effective_from}
              onChange={(e) =>
                setForm({ ...form, effective_from: e.target.value })
              }
            />
          </FieldWrapper>
          <FieldWrapper
            className="sm:col-span-2"
            label={t("field.body")}
            required
          >
            <Textarea
              rows={6}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </FieldWrapper>
          <AdvancedTechnicalSettings>
            <Textarea
              className="font-mono sm:col-span-2"
              value={form.clauses}
              onChange={(e) => {
                setForm({ ...form, clauses: e.target.value });
                setJsonError("");
              }}
            />
            {jsonError && (
              <p className="text-xs text-destructive sm:col-span-2">
                {jsonError}
              </p>
            )}
          </AdvancedTechnicalSettings>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [form.code, t("column.code")],
              [form.title, t("column.name")],
              [form.body, t("field.body")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <Save />
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AcknowledgeDialog({
  terms,
  people,
  peopleStatus,
  onClose,
  onSaved,
}: {
  terms: SalesTerms;
  people: Salesperson[];
  peopleStatus: { isError: boolean; refetch: () => unknown };
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminSales");
  const [person, setPerson] = useState("");
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () => acknowledgeSalesTerms(terms.id, person, note),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(x) => {
        if (!x) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("action.acknowledge")}</DialogTitle>
          <DialogDescription>
            {terms.code} v{terms.version}
          </DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("field.selectPerson")} required>
          <select
            className="h-8 w-full rounded-md border bg-background px-2"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
          >
            <option value="">{t("field.selectPerson")}</option>
            {people.map((x) => (
              <option key={x.id} value={x.id}>
                {x.code} / {x.full_name}
              </option>
            ))}
          </select>
          <QueryFailedNote query={peopleStatus} what={t("what.people")} />
        </FieldWrapper>
        <FieldWrapper label={t("field.notes")}>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FieldWrapper>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[[person, t("field.selectPerson")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <Check />
            {t("action.acknowledge")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayoutPanel({ settlements }: { settlements: boolean }) {
  const t = useTranslations("adminSales");
  const qc = useQueryClient();
  const rows = useQuery({
    queryKey: ["commission-payouts"],
    queryFn: () => getPayouts({ page_size: 200 }),
  });
  const calculate = useMutation({
    mutationFn: () => calculatePayout({}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commission-payouts"] }),
  });
  const [selected, setSelected] = useState<CommissionPayout | null>(null);
  return (
    <PanelState loading={rows.isLoading} error={rows.isError}>
      <div className="flex justify-end border-b p-3">
        {!settlements && (
          <Button
            onClick={() => calculate.mutate()}
            disabled={calculate.isPending}
          >
            {calculate.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Plus />
            )}
            {t("action.calculate")}
          </Button>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {[
              "salesperson",
              "period",
              "scheme",
              "saas",
              "platformCommission",
              "gross",
              "adjustment",
              "net",
              "status",
              "actions",
            ].map((x) => (
              <TableHead key={x}>{t(`column.${x}`)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows.data?.results ?? []).map((x) => (
            <TableRow key={x.id}>
              <TableCell>
                {x.salesperson_code} / {x.salesperson_name}
              </TableCell>
              <TableCell>
                {x.period_start} - {x.period_end}
              </TableCell>
              <TableCell>{x.scheme_name}</TableCell>
              <TableCell>{x.saas_revenue}</TableCell>
              <TableCell>{x.platform_commission}</TableCell>
              <TableCell>{x.gross_amount}</TableCell>
              <TableCell>{x.adjustment}</TableCell>
              <TableCell className="font-medium">
                {x.currency} {x.net_amount}
              </TableCell>
              <TableCell>
                <StatusBadge
                  label={t(`payoutState.${x.state}`)}
                  tone={
                    x.state === "PAID"
                      ? "positive"
                      : x.state === "REJECTED" || x.state === "CANCELLED"
                        ? "danger"
                        : "warning"
                  }
                />
              </TableCell>
              <TableCell>
                {settlements && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelected(x)}
                  >
                    <Edit3 />
                    {t("action.process")}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {selected && (
        <PayoutDialog
          payout={selected}
          onClose={() => setSelected(null)}
          onSaved={() =>
            qc.invalidateQueries({ queryKey: ["commission-payouts"] })
          }
        />
      )}
    </PanelState>
  );
}

function PayoutDialog({
  payout,
  onClose,
  onSaved,
}: {
  payout: CommissionPayout;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminSales");
  const targets: Partial<Record<PayoutState, PayoutState[]>> = {
    DRAFT: ["SUPERVISOR_APPROVED", "REJECTED", "CANCELLED"],
    SUPERVISOR_APPROVED: ["FINANCE_APPROVED", "REJECTED", "CANCELLED"],
    FINANCE_APPROVED: ["PAID", "CANCELLED"],
    REJECTED: ["SUPERVISOR_APPROVED", "CANCELLED"],
  };
  const [target, setTarget] = useState<PayoutState | "">("");
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [adjustment, setAdjustment] = useState(payout.adjustment);
  const transition = useMutation({
    mutationFn: () =>
      transitionPayout(payout.id, {
        state: target as PayoutState,
        note,
        payment_reference: reference,
      }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const adjust = useMutation({
    mutationFn: () => adjustPayout(payout.id, adjustment, note),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(x) => {
        if (!x) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("action.process")}</DialogTitle>
          <DialogDescription>
            {payout.salesperson_name} / {payout.currency} {payout.net_amount}
          </DialogDescription>
        </DialogHeader>
        {["DRAFT", "REJECTED"].includes(payout.state) && (
          <FieldWrapper label={t("column.adjustment")} required>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                type="number"
                step="0.01"
                value={adjustment}
                onChange={(e) => setAdjustment(e.target.value)}
              />
              <Button
                variant="outline"
                requires={[
                  [adjustment, t("column.adjustment")],
                  [note, t("field.reasonLabel")],
                ]}
                disabled={adjust.isPending}
                onClick={() => adjust.mutate()}
              >
                <Save />
                {t("action.adjust")}
              </Button>
            </div>
          </FieldWrapper>
        )}
        <FieldWrapper label={t("field.selectStatus")} required>
          <select
            className="h-8 w-full rounded-md border bg-background px-2"
            value={target}
            onChange={(e) => setTarget(e.target.value as PayoutState)}
          >
            <option value="">{t("field.selectStatus")}</option>
            {(targets[payout.state] ?? []).map((x) => (
              <option key={x} value={x}>
                {t(`payoutState.${x}`)}
              </option>
            ))}
          </select>
        </FieldWrapper>
        <FieldWrapper
          label={t("field.reasonLabel")}
          required={
            target === "REJECTED" ||
            target === "CANCELLED" ||
            adjustment !== payout.adjustment
          }
        >
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FieldWrapper>
        {target === "PAID" && (
          <FieldWrapper label={t("field.paymentReference")}>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </FieldWrapper>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [target, t("field.selectStatus")],
              [
                (target !== "REJECTED" && target !== "CANCELLED") || note,
                t("field.reasonLabel"),
              ],
            ]}
            disabled={transition.isPending}
            onClick={() => transition.mutate()}
          >
            <Check />
            {t("action.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PerformancePanel() {
  const t = useTranslations("adminSales");
  const [id, setId] = useState("");
  const people = useQuery({
    queryKey: ["salespeople", "performance-options"],
    queryFn: () => getSalespeople({ page_size: 200 }),
  });
  const perf = useQuery({
    queryKey: ["team-performance", id],
    queryFn: () => getTeamPerformance(id),
    enabled: Boolean(id),
  });
  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card p-4 shadow-sm">
      <select
        className="h-8 w-full max-w-md rounded-md border bg-background px-2"
        value={id}
        onChange={(e) => setId(e.target.value)}
      >
        <option value="">{t("field.selectSupervisor")}</option>
        {(people.data?.results ?? []).map((x) => (
          <option key={x.id} value={x.id}>
            {x.code} / {x.full_name}
          </option>
        ))}
      </select>
      <QueryFailedNote query={people} what={t("what.people")} className="mt-1" />
      {id && perf.isError && (
        <LoadFailed
          className="mt-4"
          what={t("what.performance")}
          onRetry={() => perf.refetch()}
        />
      )}
      {perf.data && (
        <div className="mt-4 grid border sm:grid-cols-2 xl:grid-cols-4">
          {[
            "team_size",
            "total_customers",
            "contractors_won",
            "recyclers_won",
            "saas_revenue",
            "platform_commission",
            "business_value",
            "commission_payable",
          ].map((key) => (
            <div key={key} className="border-b border-r p-4">
              <p className="text-xs text-muted-foreground">
                {t(`performance.${key}`)}
              </p>
              <p className="mt-1 text-xl font-semibold">
                {String(perf.data[key as keyof typeof perf.data])}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportsPanel() {
  const t = useTranslations("adminSales");
  const exports = useMutation({
    mutationFn: ({
      endpoint,
      format,
    }: {
      endpoint: "salespeople" | "assignments" | "payouts";
      format: "pdf" | "xlsx";
    }) =>
      exportSalesDataset(
        endpoint,
        format,
        t(`report.${endpoint}`),
        t("section.reports.subtitle"),
        endpoint === "salespeople"
          ? [
              { key: "code", label: t("column.code") },
              { key: "full_name", label: t("column.name") },
              { key: "supervisor_name", label: t("column.supervisor") },
              { key: "customer_count", label: t("column.customers") },
            ]
          : endpoint === "assignments"
            ? [
                { key: "company_name", label: t("column.company") },
                { key: "company_type", label: t("column.type") },
                { key: "salesperson_name", label: t("column.salesperson") },
                { key: "supervisor_name", label: t("column.supervisor") },
                { key: "state", label: t("column.states") },
              ]
            : [
                { key: "salesperson_name", label: t("column.salesperson") },
                { key: "period_start", label: t("column.period") },
                { key: "state", label: t("column.status") },
                { key: "saas_revenue", label: t("column.saas") },
                {
                  key: "platform_commission",
                  label: t("column.platformCommission"),
                },
                { key: "net_amount", label: t("column.net") },
              ],
      ),
  });
  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card shadow-sm">
      <div className="divide-y">
        {(["salespeople", "assignments", "payouts"] as const).map(
          (endpoint) => (
            <div
              key={endpoint}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
            >
              <div>
                <p className="font-medium">{t(`report.${endpoint}`)}</p>
                <p className="text-xs text-muted-foreground">
                  {t(`report.${endpoint}Subtitle`)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={exports.isPending}
                  onClick={() => exports.mutate({ endpoint, format: "pdf" })}
                >
                  <FileDown />
                  PDF
                </Button>
                <Button
                  disabled={exports.isPending}
                  onClick={() => exports.mutate({ endpoint, format: "xlsx" })}
                >
                  <FileDown />
                  Excel
                </Button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
