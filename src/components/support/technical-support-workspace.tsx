"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Cable,
  Check,
  CircleCheckBig,
  CircleDashed,
  FileDown,
  FlaskConical,
  HardHat,
  History,
  Loader2,
  Plus,
  RadioTower,
  Save,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  FieldWrapper,
  ListHeader,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { CompanyRow } from "@/interfaces/company";
import type {
  IntegrationConfig,
  IntegrationDevice,
} from "@/interfaces/integration";
import type {
  APIIntegration,
  BugReport,
  BugState,
  DeviceMaintenance,
  RemoteOperation,
  SupportTicket,
  TicketPriority,
  TicketState,
} from "@/interfaces/support";
import { useDateFormat } from "@/lib/dates";
import { getCompanies } from "@/services/companies.service";
import {
  getIntegrationDevices,
  getIntegrations,
} from "@/services/integration.service";
import {
  completeMaintenance,
  createAPIIntegration,
  createBug,
  createMaintenance,
  createTicket,
  exportTechnicalSupportReport,
  getAPIIntegrations,
  getBugs,
  getMaintenance,
  getTechnicalSupportSummary,
  getTickets,
  getRemoteSessions,
  remoteOperate,
  updateTicket,
  addTicketComment,
  transitionTicket,
  updateAPIIntegration,
  updateBug,
  type BugPayload,
  type DevicePayload,
  type IntegrationPayload,
  type TicketPayload,
} from "@/services/support.service";

export type TechnicalSupportSection =
  | "overview"
  | "tickets"
  | "bugs"
  | "api"
  | "installations"
  | "maintenance"
  | "reports";
const SUBMODULES: Array<{
  section: Exclude<TechnicalSupportSection, "overview">;
  number: string;
}> = [
  { section: "tickets", number: "15.2.1" },
  { section: "bugs", number: "15.2.3" },
  { section: "api", number: "15.2.4" },
  { section: "installations", number: "15.2.5" },
  { section: "maintenance", number: "15.2.6" },
  { section: "reports", number: "15.2.7" },
];
const TICKET_PRIORITIES: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const TICKET_STATES: TicketState[] = [
  "PENDING",
  "IN_PROGRESS",
  "TESTING",
  "COMPLETED",
  "CLOSED",
];

type CapabilityState =
  | "READY"
  | "CONFIG_REQUIRED"
  | "SIMULATOR"
  | "HARDWARE_REQUIRED";

function connectionMode(settings: Record<string, unknown>) {
  return String(settings.mode ?? "SIMULATED").toUpperCase() === "LIVE"
    ? "LIVE"
    : "SIMULATED";
}

function normalizeIdentity(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function apiCapability(
  row: APIIntegration,
  integrations: IntegrationConfig[],
): CapabilityState {
  const endpoint = normalizeIdentity(row.endpoint);
  const name = normalizeIdentity(row.api_name);
  const connection = integrations.find((candidate) =>
    row.linked_integration
      ? candidate.id === row.linked_integration
      : candidate.company === row.company &&
        ((endpoint && normalizeIdentity(candidate.base_url) === endpoint) ||
          normalizeIdentity(candidate.name) === name),
  );
  if (!connection) return "CONFIG_REQUIRED";
  if (connectionMode(connection.settings) === "SIMULATED") return "SIMULATOR";
  if (
    connection.is_enabled &&
    connection.status === "READY" &&
    connection.last_success_at
  ) {
    return "READY";
  }
  return "CONFIG_REQUIRED";
}

function deviceCapability(
  row: DeviceMaintenance,
  devices: IntegrationDevice[],
): CapabilityState {
  if (row.operation_mode === "SIMULATED") return "SIMULATOR";
  const device = linkedDevice(row, devices);
  if (!device) return "HARDWARE_REQUIRED";
  if (!device.is_active || !device.has_secret) return "CONFIG_REQUIRED";
  return device.is_online ? "READY" : "HARDWARE_REQUIRED";
}

function deviceTelemetry(row: DeviceMaintenance, devices: IntegrationDevice[]) {
  const device = linkedDevice(row, devices);
  const metrics =
    device?.settings.heartbeat_metrics &&
    typeof device.settings.heartbeat_metrics === "object"
      ? (device.settings.heartbeat_metrics as Record<string, unknown>)
      : {};
  return {
    online: device?.is_online ?? row.is_online,
    lastOnlineAt: device?.last_seen_at ?? row.last_online_at,
    firmware: device?.firmware_version || row.firmware_version,
    simStatus:
      typeof metrics.sim_status === "string"
        ? metrics.sim_status
        : row.sim_status,
    signal:
      typeof metrics.signal_dbm === "number"
        ? metrics.signal_dbm
        : row.signal_strength,
  };
}

function linkedDevice(row: DeviceMaintenance, devices: IntegrationDevice[]) {
  const deviceId = normalizeIdentity(row.device_id);
  return devices.find((candidate) =>
    row.linked_device
      ? candidate.id === row.linked_device
      : candidate.company === row.company &&
        (normalizeIdentity(candidate.device_id) === deviceId ||
          normalizeIdentity(candidate.gateway_device_id) === deviceId),
  );
}

function CapabilityStatus({ state }: { state: CapabilityState }) {
  const t = useTranslations("adminTechnicalSupport");
  const tone =
    state === "READY"
      ? "positive"
      : state === "SIMULATOR"
        ? "warning"
        : "neutral";
  return (
    <div className="min-w-44 space-y-1.5">
      <StatusBadge label={t(`capability.${state}.label`)} tone={tone} />
      <p className="text-xs leading-5 text-muted-foreground">
        {t(`capability.${state}.description`)}
      </p>
    </div>
  );
}

export function TechnicalSupportWorkspace({
  section = "overview",
}: {
  section?: TechnicalSupportSection;
}) {
  const t = useTranslations("adminTechnicalSupport");
  if (section === "overview") return <Overview />;
  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t(`section.${section}.title`)}
        subtitle={t(`section.${section}.subtitle`)}
      />
      {section === "tickets" && <TicketPanel createAllowed />}
      {section === "bugs" && <BugPanel />}
      {section === "api" && <APIIntegrationPanel />}
      {section === "installations" && <DevicePanel installations />}
      {section === "maintenance" && <DevicePanel installations={false} />}
      {section === "reports" && <ReportPanel />}
    </div>
  );
}

function Overview() {
  const t = useTranslations("adminTechnicalSupport");
  const summary = useQuery({
    queryKey: ["technical-support-summary"],
    queryFn: getTechnicalSupportSummary,
  });
  const common = useTranslations("common");
  const none = common("emptyValue");
  const d = summary.data;
  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader title={t("title")} subtitle={t("subtitle")} />
      <QueryFailedNote query={summary} what={t("what.summary")} />
      <div className="grid gap-px overflow-hidden rounded-lg border bg-border shadow-sm sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["tickets", d ? d.tickets : none],
          ["bugs", d ? d.bugs : none],
          ["installations", d ? d.installations : none],
          ["completion", d ? `${d.completion_rate}%` : none],
        ].map(([key, value]) => (
          <div key={key} className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">
              {t(`metric.${key}`)}
            </p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <section className="rounded-lg border border-warning/30 bg-warning/5 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning-foreground">
            <Cable className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t("readiness.title")}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t("readiness.description")}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {([
                ["register", "/integrations"],
                ["connect", "/integrations"],
                ["commission", "/monitoring/live-platform"],
              ] as const).map(
                ([step, href], index) => (
                  <Link
                    key={step}
                    href={href}
                    className="rounded-lg border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <p className="text-xs font-semibold text-primary">
                      {t("readiness.step", { number: index + 1 })}
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {t(`readiness.${step}`)}
                    </p>
                  </Link>
                ),
              )}
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="hidden shrink-0 lg:inline-flex">
            <Link href="/integrations">
              {t("guide.action.integrations")}
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SUBMODULES.map((item) => (
            <Link
              key={item.section}
              href={`/support-tickets/${item.section}`}
              className="group flex min-h-24 items-center gap-3 rounded-lg border bg-card px-5 py-4 shadow-sm transition hover:border-primary/35 hover:shadow-md"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {t(`section.${item.section}.title`)}
                </span>
                <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                  {t(`section.${item.section}.subtitle`)}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
function Panel({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("adminTechnicalSupport");
  if (loading)
    return (
      <div className="flex min-h-48 flex-1 items-center justify-center rounded-lg border bg-card shadow-sm">
        <Loader2 className="mr-2 animate-spin" />
        {t("loading")}
      </div>
    );
  if (error)
    return (
      <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-5 text-destructive">
        {t("loadError")}
      </div>
    );
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card shadow-sm">
      {children}
    </div>
  );
}
function useCompanies() {
  return useQuery({
    queryKey: ["companies", "support-options"],
    queryFn: () => getCompanies({ page_size: 200, sort_by: "name" }),
  });
}
/**
 * The company picker. The caller wraps it in the labelled FieldWrapper (so the
 * star sits in the form that demands it); the options query lives here so a
 * failed load is said right under the select instead of reading as "no companies".
 */
function CompanySelect({
  value,
  onChange,
  optional = false,
}: {
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
}) {
  const t = useTranslations("adminTechnicalSupport");
  const companyOptions = useCompanies();
  const companies: CompanyRow[] = companyOptions.data?.results ?? [];
  return (
    <>
      <Select
        value={value || (optional ? "__platform__" : undefined)}
        onValueChange={(next) => onChange(next === "__platform__" ? "" : next)}
      >
        <SelectTrigger className="h-10 w-full">
          <SelectValue
            placeholder={t(
              optional ? "field.platformIssue" : "field.selectCompany",
            )}
          />
        </SelectTrigger>
        <SelectContent>
          {optional && (
            <SelectItem value="__platform__">
              {t("field.platformIssue")}
            </SelectItem>
          )}
          {companies.map((x) => (
            <SelectItem key={x.id} value={x.id}>
              {x.code} / {x.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <QueryFailedNote query={companyOptions} what={t("what.companies")} />
    </>
  );
}

function TechnicalSetupGuide({
  kind,
}: {
  kind: "api" | "installations" | "maintenance";
}) {
  const t = useTranslations("adminTechnicalSupport");
  const links = {
    api: [
      ["/integrations", "guide.action.integrations"],
      ["/system-settings/api-gateway", "guide.action.gatewaySettings"],
    ],
    installations: [
      ["/scales", "guide.action.scales"],
      ["/integrations", "guide.action.integrations"],
    ],
    maintenance: [
      ["/monitoring/live-platform", "guide.action.monitoring"],
      ["/integrations", "guide.action.integrations"],
    ],
  } as const;
  const capabilityIcons = {
    READY: CircleCheckBig,
    CONFIG_REQUIRED: CircleDashed,
    SIMULATOR: FlaskConical,
    HARDWARE_REQUIRED: HardHat,
  } as const;

  return (
    <section className="grid gap-4 rounded-lg border border-info/25 bg-info/5 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="flex min-w-0 gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-info/10 text-info">
          {kind === "maintenance" ? <RadioTower /> : <Settings2 />}
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{t(`guide.${kind}.title`)}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {t(`guide.${kind}.description`)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 lg:justify-end">
        {links[kind].map(([href, label]) => (
          <Button key={href} asChild size="sm" variant="outline">
            <Link href={href}>
              {t(label)}
              <ArrowRight />
            </Link>
          </Button>
        ))}
      </div>
      <div className="grid overflow-hidden rounded-lg border bg-card sm:grid-cols-2 lg:col-span-2 xl:grid-cols-4">
        {(Object.keys(capabilityIcons) as CapabilityState[]).map((state) => {
          const Icon = capabilityIcons[state];
          return (
            <div
              key={state}
              className="flex gap-3 border-b border-r p-3 last:border-b-0"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {t(`capability.${state}.label`)}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {t(`capability.${state}.description`)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TicketPanel({ createAllowed }: { createAllowed: boolean }) {
  const t = useTranslations("adminTechnicalSupport");
  const df = useDateFormat();
  const qc = useQueryClient();
  const rows = useQuery({
    queryKey: ["support-tickets", createAllowed],
    queryFn: () => getTickets({ page_size: 200 }),
  });
  const [creating, setCreating] = useState(false);
  const [processing, setProcessing] = useState<SupportTicket | null>(null);
  return (
    <Panel loading={rows.isLoading} error={rows.isError}>
      {createAllowed && (
        <div className="flex justify-end border-b p-3">
          <Button onClick={() => setCreating(true)}>
            <Plus />
            {t("action.addTicket")}
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {[
              "code",
              "type",
              "company",
              "subject",
              "priority",
              "handler",
              "date",
              "status",
              "actions",
            ].map((x) => (
              <TableHead key={x}>{t(`column.${x}`)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows.data?.results ?? []).map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.code}</TableCell>
              <TableCell>{t(`ticketType.${row.type}`)}</TableCell>
              <TableCell>
                {row.company_name || t("field.platformIssue")}
              </TableCell>
              <TableCell>{row.title}</TableCell>
              <TableCell>{t(`priority.${row.priority}`)}</TableCell>
              <TableCell>{row.assigned_to_name || "-"}</TableCell>
              <TableCell>{df.date(row.created_at)}</TableCell>
              <TableCell>
                <StatusBadge
                  label={t(`ticketState.${row.state}`)}
                  tone={
                    row.state === "COMPLETED"
                      ? "positive"
                      : row.state === "CLOSED"
                        ? "neutral"
                        : "warning"
                  }
                />
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setProcessing(row)}
                >
                  <Settings2 />
                  {t("action.process")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {creating && (
        <TicketDialog
          onClose={() => setCreating(false)}
          onSaved={() =>
            qc.invalidateQueries({ queryKey: ["support-tickets"] })
          }
        />
      )}
      {processing && (
        <TicketStateDialog
          row={processing}
          onClose={() => setProcessing(null)}
          onSaved={() =>
            qc.invalidateQueries({ queryKey: ["support-tickets"] })
          }
        />
      )}
    </Panel>
  );
}

function TicketDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminTechnicalSupport");
  const [form, setForm] = useState<TicketPayload>({
    type: "SYSTEM_ISSUE",
    priority: "MEDIUM",
    title: "",
    description: "",
    company: null,
    expected_result: "",
    actual_result: "",
    due_date: "",
    estimated_hours: "",
  });
  const set = (key: keyof TicketPayload, value: unknown) =>
    setForm((x) => ({ ...x, [key]: value }));
  const save = useMutation({
    mutationFn: () =>
      createTicket({
        ...form,
        due_date: form.due_date || null,
        estimated_hours: form.estimated_hours || null,
      }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("action.addTicket")}</DialogTitle>
          <DialogDescription>{t("dialog.ticket")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldWrapper
            className="sm:col-span-2"
            label={t("field.company")}
            hint={t("field.companyOptionalHelp")}
          >
            <CompanySelect
              optional
              value={form.company ?? ""}
              onChange={(x) => set("company", x || null)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("column.type")}>
            <select
              className="h-8 w-full rounded-md border bg-background px-2"
              value={form.type}
              onChange={(e) => set("type", e.target.value)}
            >
              {[
                "BUG",
                "SYSTEM_ISSUE",
                "API_INTEGRATION",
                "WEIGHBRIDGE_INSTALL",
                "AI_CCTV",
                "ANPR",
                "DEVICE_MAINTENANCE",
                "OTHER",
              ].map((x) => (
                <option key={x} value={x}>
                  {t(`ticketType.${x}`)}
                </option>
              ))}
            </select>
          </FieldWrapper>
          <FieldWrapper label={t("column.priority")}>
            <select
              className="h-8 w-full rounded-md border bg-background px-2"
              value={form.priority}
              onChange={(e) => set("priority", e.target.value)}
            >
              {["LOW", "MEDIUM", "HIGH", "URGENT"].map((x) => (
                <option key={x} value={x}>
                  {t(`priority.${x}`)}
                </option>
              ))}
            </select>
          </FieldWrapper>
          <FieldWrapper className="sm:col-span-2" label={t("field.subject")} required>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper className="sm:col-span-2" label={t("field.description")} required>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.environment")}>
            <Textarea
              value={form.environment ?? ""}
              onChange={(e) => set("environment", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.steps")}>
            <Textarea
              value={form.steps_to_reproduce ?? ""}
              onChange={(e) => set("steps_to_reproduce", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.expectedResult")}>
            <Textarea
              value={form.expected_result ?? ""}
              onChange={(e) => set("expected_result", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.actualResult")}>
            <Textarea
              value={form.actual_result ?? ""}
              onChange={(e) => set("actual_result", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.dueDate")}>
            <Input
              type="date"
              value={form.due_date ?? ""}
              onChange={(e) => set("due_date", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.estimatedHours")}>
            <Input
              type="number"
              min="0"
              step="0.25"
              value={form.estimated_hours ?? ""}
              onChange={(e) => set("estimated_hours", e.target.value)}
            />
          </FieldWrapper>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [form.title, t("field.subject")],
              [form.description, t("field.description")],
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
/**
 * Working one ticket: move it, correct it, and talk on it.
 *
 * It used to do only the first of those. The backend has accepted an edit and
 * a comment since the module was written, and no screen ever called either, so
 * a ticket raised with the wrong priority stayed wrong for its whole life and
 * nobody could reply on it at all (F-101). For a support system, a ticket you
 * cannot comment on is most of the product missing.
 */
function TicketStateDialog({
  row,
  onClose,
  onSaved,
}: {
  row: SupportTicket;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminTechnicalSupport");
  const common = useTranslations("common");
  const df = useDateFormat();
  const [state, setState] = useState<TicketState>(row.state);
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState<TicketPriority>(row.priority);
  const [title, setTitle] = useState(row.title);
  const [description, setDescription] = useState(row.description);
  // The rest of the ticket the backend keeps and nobody could fill (T-382):
  // what should have happened, what did, when it is due, the effort planned and
  // spent, and how it was resolved. Prefilled so a correction never blanks them.
  const [details, setDetails] = useState({
    expected_result: row.expected_result ?? "",
    actual_result: row.actual_result ?? "",
    due_date: row.due_date ?? "",
    estimated_hours: row.estimated_hours ?? "",
    actual_hours: row.actual_hours ?? "",
    resolution_notes: row.resolution_notes ?? "",
  });
  const setDetail = (key: keyof typeof details, value: string) =>
    setDetails((current) => ({ ...current, [key]: value }));
  const [comment, setComment] = useState("");
  const [internal, setInternal] = useState(false);

  const save = useMutation({
    mutationFn: () => transitionTicket(row.id, state, note),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const edit = useMutation({
    mutationFn: () =>
      updateTicket(row.id, {
        priority,
        title,
        description,
        expected_result: details.expected_result,
        actual_result: details.actual_result,
        resolution_notes: details.resolution_notes,
        due_date: details.due_date || null,
        estimated_hours: details.estimated_hours || null,
        actual_hours: details.actual_hours || null,
      }),
    onSuccess: onSaved,
  });
  const speak = useMutation({
    mutationFn: () => addTicketComment(row.id, comment.trim(), internal),
    onSuccess: () => {
      setComment("");
      onSaved();
    },
  });

  const edited =
    priority !== row.priority ||
    title !== row.title ||
    description !== row.description ||
    details.expected_result !== (row.expected_result ?? "") ||
    details.actual_result !== (row.actual_result ?? "") ||
    details.due_date !== (row.due_date ?? "") ||
    details.estimated_hours !== (row.estimated_hours ?? "") ||
    details.actual_hours !== (row.actual_hours ?? "") ||
    details.resolution_notes !== (row.resolution_notes ?? "");
  const comments = row.comments ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("action.process")}</DialogTitle>
          <DialogDescription>
            {row.code} / {row.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("ticketEdit.title")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldWrapper label={t("field.subject")} required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </FieldWrapper>
            <FieldWrapper label={t("column.priority")}>
              <select
                className="h-8 w-full rounded-md border bg-background px-2"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
              >
                {TICKET_PRIORITIES.map((x) => (
                  <option key={x} value={x}>
                    {t(`priority.${x}`)}
                  </option>
                ))}
              </select>
            </FieldWrapper>
            <FieldWrapper className="sm:col-span-2" label={t("field.description")}>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </FieldWrapper>
            <FieldWrapper label={t("field.expectedResult")}>
              <Textarea
                value={details.expected_result}
                onChange={(e) => setDetail("expected_result", e.target.value)}
                rows={2}
              />
            </FieldWrapper>
            <FieldWrapper label={t("field.actualResult")}>
              <Textarea
                value={details.actual_result}
                onChange={(e) => setDetail("actual_result", e.target.value)}
                rows={2}
              />
            </FieldWrapper>
            <FieldWrapper label={t("field.dueDate")}>
              <Input
                type="date"
                value={details.due_date}
                onChange={(e) => setDetail("due_date", e.target.value)}
              />
            </FieldWrapper>
            <div className="grid grid-cols-2 gap-3">
              <FieldWrapper label={t("field.estimatedHours")}>
                <Input
                  type="number"
                  min="0"
                  step="0.25"
                  value={details.estimated_hours}
                  onChange={(e) => setDetail("estimated_hours", e.target.value)}
                />
              </FieldWrapper>
              <FieldWrapper label={t("field.actualHours")}>
                <Input
                  type="number"
                  min="0"
                  step="0.25"
                  value={details.actual_hours}
                  onChange={(e) => setDetail("actual_hours", e.target.value)}
                />
              </FieldWrapper>
            </div>
            <FieldWrapper
              className="sm:col-span-2"
              label={t("field.resolutionNotes")}
              hint={t("field.resolutionNotesHelp")}
            >
              <Textarea
                value={details.resolution_notes}
                onChange={(e) => setDetail("resolution_notes", e.target.value)}
                rows={2}
              />
            </FieldWrapper>
          </div>
          <Button
            size="sm"
            variant="outline"
            requires={[[title, t("field.subject")]]}
            disabledReason={!edited ? common("noChanges") : undefined}
            disabled={!edited || edit.isPending}
            onClick={() => edit.mutate()}
          >
            <Check className="h-4 w-4" />
            {t("ticketEdit.save")}
          </Button>
        </div>

        <div className="space-y-2 border-t pt-3">
          <p className="text-sm font-medium">{t("ticketComment.title")}</p>
          {comments.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("ticketComment.empty")}
            </p>
          ) : (
            <ul className="space-y-2">
              {comments.map((item) => (
                <li key={item.id} className="rounded-md border px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {item.author_name ?? t("ticketComment.unknownAuthor")}
                    </span>
                    <span>{df.dateTime(item.created_at)}</span>
                    {item.is_internal && (
                      <StatusBadge
                        label={t("ticketComment.internal")}
                        tone="warning"
                      />
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{item.body}</p>
                </li>
              ))}
            </ul>
          )}
          <FieldWrapper label={t("ticketComment.reply")} required>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
            />
          </FieldWrapper>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border"
              checked={internal}
              onChange={(e) => setInternal(e.target.checked)}
            />
            {t("ticketComment.internalHelp")}
          </label>
          <Button
            size="sm"
            variant="outline"
            requires={[[comment, t("ticketComment.reply")]]}
            disabled={speak.isPending}
            onClick={() => speak.mutate()}
          >
            {t("ticketComment.send")}
          </Button>
        </div>

        <div className="space-y-2 border-t pt-3">
          <p className="text-sm font-medium">{t("ticketEdit.moveOn")}</p>
          <select
            className="h-8 w-full rounded-md border bg-background px-2"
            aria-label={t("action.process")}
            value={state}
            onChange={(e) => setState(e.target.value as TicketState)}
          >
            {TICKET_STATES.map((x) => (
              <option key={x} value={x}>
                {t(`ticketState.${x}`)}
              </option>
            ))}
          </select>
          <FieldWrapper label={t("field.result")}>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </FieldWrapper>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            disabledReason={
              state === row.state ? common("noChanges") : undefined
            }
            disabled={state === row.state || save.isPending}
            onClick={() => save.mutate()}
          >
            <Check />
            {t("action.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BugPanel() {
  const t = useTranslations("adminTechnicalSupport");
  const df = useDateFormat();
  const qc = useQueryClient();
  const rows = useQuery({
    queryKey: ["bug-reports"],
    queryFn: () => getBugs({ page_size: 200 }),
  });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BugReport | null>(null);
  return (
    <Panel loading={rows.isLoading} error={rows.isError}>
      <div className="flex justify-end border-b p-3">
        <Button onClick={() => setCreating(true)}>
          <Plus />
          {t("action.addBug")}
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {[
              "code",
              "module",
              "subject",
              "severity",
              "handler",
              "date",
              "status",
              "actions",
            ].map((x) => (
              <TableHead key={x}>{t(`column.${x}`)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows.data?.results ?? []).map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.bug_code}</TableCell>
              <TableCell>{row.module || "-"}</TableCell>
              <TableCell>{row.title}</TableCell>
              <TableCell>{t(`severity.${row.severity}`)}</TableCell>
              <TableCell>{row.assigned_to_name || "-"}</TableCell>
              <TableCell>{df.date(row.created_at)}</TableCell>
              <TableCell>{t(`bugState.${row.state}`)}</TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(row)}
                >
                  {t("action.process")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {creating && (
        <BugDialog
          onClose={() => setCreating(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["bug-reports"] })}
        />
      )}
      {editing && (
        <BugUpdateDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["bug-reports"] })}
        />
      )}
    </Panel>
  );
}
function BugDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminTechnicalSupport");
  const [form, setForm] = useState<BugPayload>({
    title: "",
    description: "",
    severity: "NORMAL",
    module: "",
    company: null,
    expected_result: "",
    actual_result: "",
  });
  const set = (key: keyof BugPayload, value: string | null) =>
    setForm((x) => ({ ...x, [key]: value }));
  const save = useMutation({
    mutationFn: () => createBug(form),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("action.addBug")}</DialogTitle>
          <DialogDescription>{t("dialog.bug")}</DialogDescription>
        </DialogHeader>
        <FieldWrapper
          label={t("field.company")}
          hint={t("field.companyOptionalHelp")}
        >
          <CompanySelect
            optional
            value={form.company ?? ""}
            onChange={(x) => set("company", x || null)}
          />
        </FieldWrapper>
        <FieldWrapper label={t("column.severity")}>
          <select
            className="h-8 w-full rounded-md border bg-background px-2"
            value={form.severity}
            onChange={(e) => set("severity", e.target.value)}
          >
            {["MINOR", "NORMAL", "MAJOR", "CRITICAL"].map((x) => (
              <option key={x} value={x}>
                {t(`severity.${x}`)}
              </option>
            ))}
          </select>
        </FieldWrapper>
        <FieldWrapper label={t("field.module")}>
          <Input
            value={form.module}
            onChange={(e) => set("module", e.target.value)}
          />
        </FieldWrapper>
        <FieldWrapper label={t("field.subject")} required>
          <Input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </FieldWrapper>
        <FieldWrapper label={t("field.description")} required>
          <Textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </FieldWrapper>
        <FieldWrapper label={t("field.expectedResult")}>
          <Textarea
            value={form.expected_result ?? ""}
            onChange={(e) => set("expected_result", e.target.value)}
          />
        </FieldWrapper>
        <FieldWrapper label={t("field.actualResult")}>
          <Textarea
            value={form.actual_result ?? ""}
            onChange={(e) => set("actual_result", e.target.value)}
          />
        </FieldWrapper>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [form.title, t("field.subject")],
              [form.description, t("field.description")],
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
function BugUpdateDialog({
  row,
  onClose,
  onSaved,
}: {
  row: BugReport;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminTechnicalSupport");
  const [state, setState] = useState<BugState>(row.state);
  const [root, setRoot] = useState(row.root_cause);
  const [fix, setFix] = useState(row.fix_description);
  const [version, setVersion] = useState(row.fixed_in_version);
  const save = useMutation({
    mutationFn: () =>
      updateBug(row.id, {
        state,
        root_cause: root,
        fix_description: fix,
        fixed_in_version: version,
      }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row.bug_code}</DialogTitle>
          <DialogDescription>{row.title}</DialogDescription>
        </DialogHeader>
        <select
          className="h-8 rounded-md border bg-background px-2"
          value={state}
          onChange={(e) => setState(e.target.value as BugState)}
        >
          {[
            "OPEN",
            "CONFIRMED",
            "IN_PROGRESS",
            "FIXED",
            "VERIFIED",
            "CLOSED",
            "WONT_FIX",
          ].map((x) => (
            <option key={x} value={x}>
              {t(`bugState.${x}`)}
            </option>
          ))}
        </select>
        <Textarea
          placeholder={t("field.rootCause")}
          value={root}
          onChange={(e) => setRoot(e.target.value)}
        />
        <Textarea
          placeholder={t("field.fix")}
          value={fix}
          onChange={(e) => setFix(e.target.value)}
        />
        <Input
          placeholder={t("field.firmware")}
          value={version}
          onChange={(e) => setVersion(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            <Save />
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function APIIntegrationPanel() {
  const t = useTranslations("adminTechnicalSupport");
  const qc = useQueryClient();
  const rows = useQuery({
    queryKey: ["support-api-integrations"],
    queryFn: () => getAPIIntegrations({ page_size: 200 }),
  });
  const liveConnections = useQuery({
    queryKey: ["integrations", "support-capability"],
    queryFn: () => getIntegrations({ page_size: 500 }),
  });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<APIIntegration | null>(null);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <TechnicalSetupGuide kind="api" />
      <Panel
        loading={rows.isLoading || liveConnections.isLoading}
        error={rows.isError || liveConnections.isError}
      >
      <div className="flex justify-end border-b p-3">
        <Button onClick={() => setCreating(true)}>
          <Plus />
          {t("action.addIntegration")}
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {[
              "code",
              "company",
              "apiName",
              "date",
              "handler",
              "testStatus",
              "liveStatus",
              "capability",
              "actions",
            ].map((x) => (
              <TableHead key={x}>{t(`column.${x}`)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows.data?.results ?? []).map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.code}</TableCell>
              <TableCell>{row.company_name}</TableCell>
              <TableCell>{row.api_name}</TableCell>
              <TableCell>{row.integration_date}</TableCell>
              <TableCell>{row.owner_name || "-"}</TableCell>
              <TableCell>{t(`testStatus.${row.test_status}`)}</TableCell>
              <TableCell>{t(`activationStatus.${row.live_status}`)}</TableCell>
              <TableCell>
                <CapabilityStatus
                  state={apiCapability(
                    row,
                    liveConnections.data?.results ?? [],
                  )}
                />
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(row)}
                  >
                    {t("action.process")}
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/integrations?company=${row.company}`}>
                      <Cable />
                      {t("action.openConfiguration")}
                    </Link>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {creating && (
        <IntegrationDialog
          connections={liveConnections.data?.results ?? []}
          onClose={() => setCreating(false)}
          onSaved={() =>
            qc.invalidateQueries({ queryKey: ["support-api-integrations"] })
          }
        />
      )}
      {editing && (
        <IntegrationUpdateDialog
          row={editing}
          connections={liveConnections.data?.results ?? []}
          onClose={() => setEditing(null)}
          onSaved={() =>
            qc.invalidateQueries({ queryKey: ["support-api-integrations"] })
          }
        />
      )}
      </Panel>
    </div>
  );
}
function IntegrationDialog({
  connections,
  onClose,
  onSaved,
}: {
  connections: IntegrationConfig[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminTechnicalSupport");
  const [form, setForm] = useState<IntegrationPayload>({
    company: "",
    api_name: "",
    endpoint: "",
    linked_integration: null,
    integration_date: "",
  });
  const set = (key: keyof IntegrationPayload, value: string | null) =>
    setForm((x) => ({ ...x, [key]: value }));
  const availableConnections = connections.filter(
    (connection) => connection.company === form.company,
  );
  const save = useMutation({
    mutationFn: () => createAPIIntegration(form),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("action.addIntegration")}</DialogTitle>
          <DialogDescription>{t("dialog.api")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FieldWrapper label={t("field.company")} required>
            <CompanySelect
              value={form.company}
              onChange={(x) =>
                setForm((current) => ({
                  ...current,
                  company: x,
                  linked_integration: null,
                }))
              }
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("field.linkedIntegration")}
            hint={t("field.linkedIntegrationHelp")}
          >
            <Select
              value={form.linked_integration || "unlinked"}
              onValueChange={(value) => {
                const selected = availableConnections.find(
                  (connection) => connection.id === value,
                );
                setForm((current) => ({
                  ...current,
                  linked_integration: value === "unlinked" ? null : value,
                  api_name: selected?.name || current.api_name,
                  endpoint: selected?.base_url || current.endpoint,
                }));
              }}
            >
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unlinked">{t("field.notLinked")}</SelectItem>
                {availableConnections.map((connection) => (
                  <SelectItem key={connection.id} value={connection.id}>
                    {connection.name} / {t(`integrationKind.${connection.kind}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("field.apiName")} required>
            <Input
              value={form.api_name}
              onChange={(e) => set("api_name", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("field.endpoint")}
            hint={t("field.endpointHelp")}
          >
            <Input
              type="url"
              placeholder="https://vendor.example/api"
              value={form.endpoint}
              onChange={(e) => set("endpoint", e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.integrationDate")} required>
            <Input
              type="date"
              value={form.integration_date}
              onChange={(e) => set("integration_date", e.target.value)}
            />
          </FieldWrapper>
        </div>
        {save.isError && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {t("state.saveError")}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [form.company, t("field.company")],
              [form.api_name, t("field.apiName")],
              [form.integration_date, t("field.integrationDate")],
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
function IntegrationUpdateDialog({
  row,
  connections,
  onClose,
  onSaved,
}: {
  row: APIIntegration;
  connections: IntegrationConfig[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminTechnicalSupport");
  const [test, setTest] = useState(row.test_status);
  const [live, setLive] = useState(row.live_status);
  const [result, setResult] = useState(row.test_result);
  const [linkedIntegration, setLinkedIntegration] = useState(
    row.linked_integration ?? "unlinked",
  );
  const save = useMutation({
    mutationFn: () =>
      updateAPIIntegration(row.id, {
        test_status: test,
        live_status: live,
        test_result: result,
        linked_integration:
          linkedIntegration === "unlinked" ? null : linkedIntegration,
      }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row.code}</DialogTitle>
          <DialogDescription>
            {row.company_name} / {row.api_name}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FieldWrapper
            label={t("field.linkedIntegration")}
            hint={t("field.linkedIntegrationHelp")}
          >
            <Select value={linkedIntegration} onValueChange={setLinkedIntegration}>
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unlinked">{t("field.notLinked")}</SelectItem>
                {connections
                  .filter((connection) => connection.company === row.company)
                  .map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      {connection.name} / {t(`integrationKind.${connection.kind}`)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("field.testStatus")}>
            <Select value={test} onValueChange={(value) => setTest(value as typeof test)}>
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["PENDING", "PASSED", "FAILED"].map((x) => (
                  <SelectItem key={x} value={x}>{t(`testStatus.${x}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("field.liveStatus")} hint={t("field.liveStatusHelp")}>
            <Select value={live} onValueChange={(value) => setLive(value as typeof live)}>
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["INACTIVE", "ACTIVE", "SUSPENDED"].map((x) => (
                  <SelectItem key={x} value={x}>{t(`activationStatus.${x}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("field.testResult")}>
            <Textarea value={result} onChange={(e) => setResult(e.target.value)} />
          </FieldWrapper>
        </div>
        {save.isError && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {t("state.saveError")}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            <Save />
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DevicePanel({ installations }: { installations: boolean }) {
  const t = useTranslations("adminTechnicalSupport");
  const system = useTranslations("adminSystemSettings");
  const df = useDateFormat();
  const qc = useQueryClient();
  const { can } = useAuth();
  const rows = useQuery({
    queryKey: ["device-maintenance", installations],
    queryFn: () =>
      getMaintenance({
        page_size: 200,
        ...(installations ? { installation: true } : {}),
      }),
  });
  const registeredDevices = useQuery({
    queryKey: ["integration-devices", "support-capability"],
    queryFn: () => getIntegrationDevices({ page_size: 500 }),
  });
  const [creating, setCreating] = useState(false);
  const [completing, setCompleting] = useState<DeviceMaintenance | null>(null);
  const [remote, setRemote] = useState<DeviceMaintenance | null>(null);
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["device-maintenance"] });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <TechnicalSetupGuide kind={installations ? "installations" : "maintenance"} />
      <Panel
        loading={rows.isLoading || registeredDevices.isLoading}
        error={rows.isError || registeredDevices.isError}
      >
      <div className="flex justify-end border-b p-3">
        <Button onClick={() => setCreating(true)}>
          <Plus />
          {t(
            installations ? "action.addInstallation" : "action.addMaintenance",
          )}
        </Button>
      </div>
      <Table className="min-w-[1880px]">
        <TableHeader>
          <TableRow>
            {[
              "code",
              "company",
              "device",
              "location",
              "installDate",
              "firmware",
              "testStatus",
              "liveStatus",
              "online",
              "lastOnline",
              "sim",
              "signal",
              "mode",
              "capability",
              "actions",
            ].map((x) => (
              <TableHead
                key={x}
                className={
                  x === "capability"
                    ? "min-w-72"
                    : x === "actions"
                      ? "min-w-64"
                      : ["code", "company", "device", "location"].includes(x)
                        ? "min-w-32"
                        : undefined
                }
              >
                {t(`column.${x}`)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows.data?.results ?? [])
            .filter((x) => installations || x.type !== "INSTALLATION")
            .map((row) => {
              const telemetry = deviceTelemetry(
                row,
                registeredDevices.data?.results ?? [],
              );
              return (
              <TableRow key={row.id}>
                <TableCell className="font-mono">{row.code}</TableCell>
                <TableCell>{row.company_name}</TableCell>
                <TableCell className="min-w-32">
                  {row.device_type}
                  <p className="text-xs text-muted-foreground">
                    {row.device_id}
                  </p>
                </TableCell>
                <TableCell>{row.installation_location || "-"}</TableCell>
                <TableCell>
                  {df.date(row.installed_on || row.scheduled_date)}
                </TableCell>
                <TableCell>{telemetry.firmware || "-"}</TableCell>
                <TableCell>{t(`testStatus.${row.test_status}`)}</TableCell>
                <TableCell>
                  {t(`activationStatus.${row.activation_status}`)}
                </TableCell>
                <TableCell>
                  <StatusBadge
                    label={t(
                      telemetry.online ? "status.online" : "status.offline",
                    )}
                    tone={telemetry.online ? "positive" : "neutral"}
                  />
                </TableCell>
                <TableCell>{df.dateTime(telemetry.lastOnlineAt) || "-"}</TableCell>
                <TableCell>{telemetry.simStatus || "-"}</TableCell>
                <TableCell>{telemetry.signal ?? "-"}</TableCell>
                <TableCell>
                  <StatusBadge
                    label={system(`mode.${row.operation_mode}`)}
                    tone={
                      row.operation_mode === "LIVE" ? "positive" : "warning"
                    }
                  />
                </TableCell>
                <TableCell className="min-w-72 max-w-80 whitespace-normal">
                  <CapabilityStatus
                    state={deviceCapability(
                      row,
                      registeredDevices.data?.results ?? [],
                    )}
                  />
                </TableCell>
                <TableCell className="min-w-64">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCompleting(row)}
                    >
                      {t("action.complete")}
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/integrations?company=${row.company}`}>
                        <Cable />
                        {t("action.openConfiguration")}
                      </Link>
                    </Button>
                    {!installations && can("support.remote_operate") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRemote(row)}
                      >
                        <RadioTower />
                        {t("action.remote")}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
              );
            })}
        </TableBody>
      </Table>
      {creating && (
        <DeviceDialog
          installations={installations}
          devices={registeredDevices.data?.results ?? []}
          onClose={() => setCreating(false)}
          onSaved={refresh}
        />
      )}
      {completing && (
        <MaintenanceCompleteDialog
          row={completing}
          onClose={() => setCompleting(null)}
          onSaved={refresh}
        />
      )}
      {remote && (
        <RemoteOperationDialog
          row={remote}
          onClose={() => setRemote(null)}
          onSaved={refresh}
        />
      )}
      </Panel>
      {/* 15.2.8 keeps the maintenance record permanently, so it has to be
          readable. Every remote operation writes a session; nothing read them
          back until now. */}
      {!installations && <RemoteSessionHistory />}
    </div>
  );
}

function RemoteSessionHistory() {
  const t = useTranslations("support");
  const df = useDateFormat();
  const sessions = useQuery({
    queryKey: ["remote-sessions"],
    queryFn: () => getRemoteSessions({
        page_size: 100,
        sort_by: "started_at",
        sort_order: "desc",
      }),
  });
  const rows = sessions.data?.results ?? [];
  return (
    <section className="rounded-lg border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <History className="size-4 text-muted-foreground" />
        <p className="text-sm font-semibold">{t("remoteHistory.title")}</p>
        <p className="text-xs text-muted-foreground">{t("remoteHistory.help")}</p>
      </div>
      {sessions.isLoading ? (
        <p className="p-4 text-sm text-muted-foreground">
          {t("remoteHistory.loading")}
        </p>
      ) : sessions.isError ? (
        <div className="m-4 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{t("remoteHistory.loadError")}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void sessions.refetch()}
          >
            {t("action.retry")}
          </Button>
        </div>
      ) : !rows.length ? (
        <p className="m-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {t("remoteHistory.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {["when", "company", "operation", "operator", "reason", "result"].map((key) => (
                  <TableHead key={key}>{t(`remoteHistory.column.${key}`)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {df.dateTime(row.started_at)}
                  </TableCell>
                  <TableCell>{row.company_name}</TableCell>
                  <TableCell>{row.session_type}</TableCell>
                  <TableCell>{row.operator_name || "-"}</TableCell>
                  <TableCell className="max-w-64 truncate">{row.description}</TableCell>
                  <TableCell>
                    <StatusBadge
                      label={
                        row.result === "SIMULATED_SUCCESS"
                          ? t("remoteHistory.simulated")
                          : row.result
                      }
                      tone={row.result === "SIMULATED_SUCCESS" ? "warning" : "positive"}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
function DeviceDialog({
  installations,
  devices,
  onClose,
  onSaved,
}: {
  installations: boolean;
  devices: IntegrationDevice[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminTechnicalSupport");
  const [form, setForm] = useState<DevicePayload>({
    company: "",
    type: installations ? "INSTALLATION" : "INSPECTION",
    device_type: installations ? "WEIGHBRIDGE" : "AI_CCTV",
    device_id: "",
    linked_device: null,
    installed_on: "",
    installation_location: "",
    firmware_version: "",
    sim_status: "",
    signal_strength: null,
    operation_mode: "SIMULATED",
    scheduled_date: "",
    description: "",
  });
  const set = (key: keyof DevicePayload, value: unknown) =>
    setForm((x) => ({ ...x, [key]: value }));
  const availableDevices = devices.filter(
    (device) => device.company === form.company,
  );
  const save = useMutation({
    mutationFn: () => createMaintenance(form),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t(
              installations
                ? "action.addInstallation"
                : "action.addMaintenance",
            )}
          </DialogTitle>
          <DialogDescription>{t("dialog.device")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("field.company")} required>
            <CompanySelect
              value={form.company}
              onChange={(x) =>
                setForm((current) => ({
                  ...current,
                  company: x,
                  linked_device: null,
                }))
              }
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("field.linkedDevice")}
            hint={t("field.linkedDeviceHelp")}
          >
            <Select
              value={form.linked_device || "unlinked"}
              onValueChange={(value) => {
                const selected = availableDevices.find(
                  (device) => device.id === value,
                );
                setForm((current) => ({
                  ...current,
                  linked_device: value === "unlinked" ? null : value,
                  device_id:
                    selected?.gateway_device_id ||
                    selected?.device_id ||
                    current.device_id,
                  device_type: selected?.device_type || current.device_type,
                  firmware_version:
                    selected?.firmware_version || current.firmware_version,
                  operation_mode: selected ? "LIVE" : current.operation_mode,
                }));
              }}
            >
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unlinked">{t("field.notLinked")}</SelectItem>
                {availableDevices.map((device) => (
                  <SelectItem key={device.id} value={device.id}>
                    {device.device_id} / {device.device_type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          {!installations && (
            <FieldWrapper label={t("field.maintenanceType")} required>
              <Select value={form.type} onValueChange={(value) => set("type", value)}>
                <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["INSPECTION", "REPAIR", "CALIBRATION", "UPGRADE", "REPLACEMENT"].map((x) => (
                    <SelectItem key={x} value={x}>{t(`maintenanceType.${x}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
          )}
          <FieldWrapper label={t("field.deviceType")} required>
            <Select value={form.device_type} onValueChange={(value) => set("device_type", value)}>
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["WEIGHBRIDGE", "GATEWAY", "AI_CCTV", "ANPR", "CWE", "OTHER"].map((x) => (
                  <SelectItem key={x} value={x}>{t(`deviceType.${x}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("field.deviceId")} required>
            <Input value={form.device_id} onChange={(e) => set("device_id", e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.scheduledDate")} required>
            <Input
              type="date"
              value={form.scheduled_date}
              onChange={(e) => {
                set("scheduled_date", e.target.value);
                if (installations) set("installed_on", e.target.value);
              }}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.location")}>
            <Input value={form.installation_location} onChange={(e) => set("installation_location", e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.firmware")}>
            <Input value={form.firmware_version} onChange={(e) => set("firmware_version", e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.sim")}>
            <Input value={form.sim_status} onChange={(e) => set("sim_status", e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.signal")}>
            <Input
              type="number"
              min="-120"
              max="0"
              value={form.signal_strength ?? ""}
              onChange={(e) => set("signal_strength", e.target.value ? Number(e.target.value) : null)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.operationMode")} hint={t("field.operationModeHelp")}>
            <Select
              value={form.operation_mode ?? "SIMULATED"}
              onValueChange={(value) => set("operation_mode", value)}
            >
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SIMULATED">{t("operationMode.SIMULATED")}</SelectItem>
                <SelectItem value="LIVE">{t("operationMode.LIVE")}</SelectItem>
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("field.description")} required className="sm:col-span-2">
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} />
          </FieldWrapper>
        </div>
        {save.isError && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {t("state.saveError")}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [form.company, t("field.company")],
              [form.device_type, t("field.deviceType")],
              [form.device_id, t("field.deviceId")],
              [form.scheduled_date, t("field.scheduledDate")],
              [form.description, t("field.description")],
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
function MaintenanceCompleteDialog({
  row,
  onClose,
  onSaved,
}: {
  row: DeviceMaintenance;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminTechnicalSupport");
  const [work, setWork] = useState("");
  const [result, setResult] = useState("");
  const [laborHours, setLaborHours] = useState(row.labor_hours ?? "");
  const [test, setTest] = useState(row.test_status);
  const [active, setActive] = useState(row.activation_status);
  const save = useMutation({
    mutationFn: () =>
      completeMaintenance(row.id, {
        work_performed: work,
        labor_hours: laborHours || null,
        result_notes: result,
        test_status: test,
        activation_status: active,
      }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("action.complete")}</DialogTitle>
          <DialogDescription>
            {row.code} / {row.device_id}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FieldWrapper label={t("field.work")} required>
            <Textarea value={work} onChange={(e) => setWork(e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.laborHours")}>
            <Input
              type="number"
              min="0"
              step="0.25"
              value={laborHours}
              onChange={(e) => setLaborHours(e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.result")}>
            <Textarea value={result} onChange={(e) => setResult(e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.testStatus")}>
            <Select value={test} onValueChange={(value) => setTest(value as typeof test)}>
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["PENDING", "PASSED", "FAILED"].map((x) => (
                  <SelectItem key={x} value={x}>{t(`testStatus.${x}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("field.liveStatus")} hint={t("field.liveStatusHelp")}>
            <Select value={active} onValueChange={(value) => setActive(value as typeof active)}>
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["INACTIVE", "ACTIVE", "SUSPENDED"].map((x) => (
                  <SelectItem key={x} value={x}>{t(`activationStatus.${x}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
        </div>
        {save.isError && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {t("state.saveError")}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[[work, t("field.work")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <Check />
            {t("action.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoteOperationDialog({
  row,
  onClose,
  onSaved,
}: {
  row: DeviceMaintenance;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminTechnicalSupport");
  const [operation, setOperation] = useState<RemoteOperation>("TEST");
  const [reason, setReason] = useState("");
  const [configuration, setConfiguration] = useState("{}");
  const [firmware, setFirmware] = useState("");
  const [jsonError, setJsonError] = useState(false);
  const save = useMutation({
    mutationFn: () => {
      const parsed = operation === "CONFIGURE" ? JSON.parse(configuration) : {};
      return remoteOperate(
        row.id,
        operation,
        row.operation_mode,
        reason.trim(),
        parsed,
        firmware.trim(),
      );
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const errorMessage = save.error instanceof Error ? save.error.message : "";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("action.remote")}</DialogTitle>
          <DialogDescription>
            {row.code} / {row.device_id}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm leading-6">
          {t(
            row.operation_mode === "LIVE"
              ? "mode.live"
              : "mode.simulatedOnly",
          )}
        </div>
        <div className="grid gap-4">
          <FieldWrapper label={t("action.remote")} required>
            <Select
              value={operation}
              onValueChange={(value) => setOperation(value as RemoteOperation)}
            >
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["TEST", "CONFIGURE", "RESTART", "FIRMWARE_UPGRADE"] as const).map((item) => (
                  <SelectItem key={item} value={item}>
                    {t(`remoteOperation.${item}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          {operation === "CONFIGURE" && (
            <FieldWrapper
              label={t("field.advancedConfig")}
              hint={t("field.advancedConfigHelp")}
            >
              <Textarea
                className="min-h-28 font-mono text-xs"
                value={configuration}
                onChange={(event) => {
                  setConfiguration(event.target.value);
                  setJsonError(false);
                }}
              />
              {jsonError && (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  {t("field.invalidJson")}
                </p>
              )}
            </FieldWrapper>
          )}
          {operation === "FIRMWARE_UPGRADE" && (
            <FieldWrapper label={t("field.firmware")} required>
              <Input
                value={firmware}
                onChange={(event) => setFirmware(event.target.value)}
              />
            </FieldWrapper>
          )}
          <FieldWrapper label={t("field.reason")} required>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </FieldWrapper>
        </div>
        {save.isError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {errorMessage || t("state.saveError")}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button>
          <Button
            requires={[
              [reason, t("field.reason")],
              [
                operation !== "FIRMWARE_UPGRADE" || firmware,
                t("field.firmware"),
              ],
            ]}
            disabled={save.isPending}
            onClick={() => {
              try {
                if (operation === "CONFIGURE") JSON.parse(configuration);
                save.mutate();
              } catch {
                setJsonError(true);
              }
            }}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <RadioTower />}
            {t(row.operation_mode === "LIVE" ? "action.confirm" : "action.simulate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportPanel() {
  const t = useTranslations("adminTechnicalSupport");
  const summary = useQuery({
    queryKey: ["technical-support-summary"],
    queryFn: getTechnicalSupportSummary,
  });
  const reports = [
    [
      "tickets",
      [
        "code",
        "type",
        "state",
        "priority",
        "company_name",
        "title",
        "assigned_to_name",
        "created_at",
      ],
    ],
    [
      "bugs",
      [
        "bug_code",
        "severity",
        "state",
        "module",
        "title",
        "description",
        "assigned_to_name",
        "created_at",
      ],
    ],
    [
      "api",
      [
        "code",
        "company_name",
        "api_name",
        "integration_date",
        "test_status",
        "live_status",
        "owner_name",
        "test_result",
      ],
    ],
    [
      "installations",
      [
        "code",
        "company_name",
        "device_type",
        "device_id",
        "installed_on",
        "installed_by_name",
        "installation_location",
        "test_status",
        "activation_status",
      ],
    ],
    [
      "maintenance",
      [
        "code",
        "company_name",
        "device_type",
        "device_id",
        "scheduled_date",
        "completed_date",
        "technician_name",
        "firmware_version",
        "is_online",
        "last_online_at",
        "sim_status",
        "signal_strength",
      ],
    ],
  ] as const;
  const exporting = useMutation({
    mutationFn: ({
      dataset,
      format,
      fields,
    }: {
      dataset: string;
      format: "pdf" | "xlsx";
      fields: readonly string[];
    }) =>
      exportTechnicalSupportReport(
        dataset,
        format,
        t(`report.${dataset}`),
        fields.map((key) => ({ key, label: t(`exportColumn.${key}`) })),
      ),
  });
  const common = useTranslations("common");
  const none = common("emptyValue");
  const d = summary.data;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card shadow-sm">
      <QueryFailedNote
        query={summary}
        what={t("what.summary")}
        className="border-b px-5 py-2"
      />
      <div className="grid gap-px border-b bg-border sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["tickets", d ? d.tickets : none],
          ["bugs", d ? d.bugs : none],
          ["installations", d ? d.installations : none],
          ["completion", d ? `${d.completion_rate}%` : none],
        ].map(([key, value]) => (
          <div key={key} className="bg-card p-4">
            <p className="text-xs text-muted-foreground">
              {t(`metric.${key}`)}
            </p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div className="divide-y">
        {reports.map(([dataset, fields]) => (
          <div
            key={dataset}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
          >
            <div>
              <p className="font-medium">{t(`report.${dataset}`)}</p>
              <p className="text-xs text-muted-foreground">
                {t(`report.${dataset}Subtitle`)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={exporting.isPending}
                onClick={() =>
                  exporting.mutate({ dataset, format: "pdf", fields })
                }
              >
                <FileDown />
                PDF
              </Button>
              <Button
                disabled={exporting.isPending}
                onClick={() =>
                  exporting.mutate({ dataset, format: "xlsx", fields })
                }
              >
                <FileDown />
                Excel
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
