"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Copy,
  Download,
  Eye,
  Plus,
  Power,
  Printer,
  RefreshCw,
  RotateCw,
  ShieldX,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { QRCodeCanvas } from "qrcode.react";
import { useRef, useState } from "react";

import {
  FieldWrapper,
  ListHeader,
  StatusBadge,
  TypeBadge,
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
  IssueQRCodePayload,
  QRCode,
  QRCodeIssue,
  QRCodeStatus,
  QRScanOutcome,
  QRSubjectType,
} from "@/interfaces/qrcode";
import { useDateFormat } from "@/lib/dates";
import { getCompanies } from "@/services/companies.service";
import {
  exportQRRegister,
  getQRAnomalies,
  getQRCodes,
  getQRSubjectOptions,
  getQRSummary,
  getScanRecords,
  issueQRCode,
  reissueQRCode,
  setQRStatus,
  updateQRCode,
} from "@/services/qrcode.service";

export type AdminQRSection =
  | "overview"
  | "types"
  | "scans"
  | "anomalies";

const SUBJECT_TYPES: QRSubjectType[] = [
  "CONTRACTOR",
  "RECYCLER",
  "PROJECT",
  "SUPPLIER",
  "DRIVER",
  "VEHICLE",
  "FIELD_STAFF",
  "VISITOR",
  "DEVICE",
  "DELIVERY_NOTE",
];

const SUBMODULES: Array<{
  section: Exclude<AdminQRSection, "overview">;
  number: string;
}> = [
  { section: "types", number: "7.2.1" },
  { section: "scans", number: "7.2.5" },
  { section: "anomalies", number: "7.2.6" },
];

export function AdminQRWorkspace({
  section = "overview",
}: {
  section?: AdminQRSection;
}) {
  const t = useTranslations("adminQr");
  const content = (() => {
    if (section === "overview") return <ModuleIndex />;
    if (section === "types") {
      return (
        <div className="space-y-5">
          <QRStatistics />
          <QRTypeCatalogue />
          <QRCodeRegister
            allowIssue
            allowEdit
            allowLifecycle
            advancedFilters
          />
        </div>
      );
    }
    if (section === "scans") return <ScanLedger anomaliesOnly={false} />;
    if (section === "anomalies") return <ScanLedger anomaliesOnly />;
    return null;
  })();

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={section === "overview" ? t("title") : t(`section.${section}.title`)}
        subtitle={
          section === "overview"
            ? t("subtitle")
            : t(`section.${section}.subtitle`)
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
    </div>
  );
}

function ModuleIndex() {
  const t = useTranslations("adminQr");
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="grid md:grid-cols-2 xl:grid-cols-3">
        {SUBMODULES.map((module) => (
          <Link
            key={module.section}
            href={`/qr-codes/${module.section}`}
            className="flex min-h-20 items-center gap-3 border-b border-r px-5 py-4 transition-colors hover:bg-muted/40"
          >
            
            <span className="min-w-0 flex-1 font-medium">
              {t(`section.${module.section}.title`)}
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function QRTypeCatalogue() {
  const t = useTranslations("adminQr");
  const summary = useQuery({
    queryKey: ["admin-qr", "summary"],
    queryFn: getQRSummary,
  });

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4">
        {SUBJECT_TYPES.map((type) => (
          <div
            key={type}
            className="flex min-h-20 items-center justify-between gap-3 border-b border-r px-5 py-4"
          >
            <TypeBadge label={t(`subjectType.${type}`)} />
            <span className="tabular-nums text-lg font-semibold">
              {summary.isLoading
                ? "..."
                : (summary.data?.by_subject_type[type] ?? 0)}
            </span>
          </div>
        ))}
      </div>
      {summary.isError && (
        <p className="px-5 py-4 text-sm text-destructive">{t("loadError")}</p>
      )}
    </div>
  );
}

function QRCodeRegister({
  allowIssue,
  allowEdit,
  allowLifecycle,
  advancedFilters,
}: {
  allowIssue: boolean;
  allowEdit: boolean;
  allowLifecycle: boolean;
  advancedFilters: boolean;
}) {
  const t = useTranslations("adminQr");
  const common = useTranslations("common");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [subjectType, setSubjectType] = useState("");
  const [company, setCompany] = useState("");
  const [issuedFrom, setIssuedFrom] = useState("");
  const [issuedTo, setIssuedTo] = useState("");
  const [showIssue, setShowIssue] = useState(false);
  const [viewing, setViewing] = useState<QRCode | null>(null);
  const [editing, setEditing] = useState<QRCode | null>(null);
  const [lifecycle, setLifecycle] = useState<{
    code: QRCode;
    status?: "ACTIVE" | "DISABLED" | "VOIDED";
    reissue?: boolean;
  } | null>(null);
  const [note, setNote] = useState("");
  const [issued, setIssued] = useState<QRCodeIssue | null>(null);

  const companies = useQuery({
    queryKey: ["companies", "qr-options"],
    queryFn: () => getCompanies({ page_size: 250, sort_by: "name", sort_order: "asc" }),
  });
  const codes = useQuery({
    queryKey: ["admin-qr", "codes", page, search, status, subjectType, company, issuedFrom, issuedTo],
    queryFn: () => getQRCodes({
      page,
      page_size: 25,
      search,
      status,
      subject_type: subjectType,
      company,
      issued_from: issuedFrom,
      issued_to: issuedTo,
      sort_by: "created_at",
      sort_order: "desc",
    }),
  });
  const changeStatus = useMutation({
    mutationFn: () => lifecycle?.reissue
      ? reissueQRCode(lifecycle.code.id, note.trim())
      : setQRStatus(lifecycle!.code.id, lifecycle!.status!, note.trim()),
    onSuccess: (result) => {
      if ("token" in result && typeof result.token === "string") {
        setIssued(result as QRCodeIssue);
      }
      setLifecycle(null);
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["admin-qr"] });
    },
  });

  const resetPage = () => setPage(1);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Input className="min-w-56 flex-1" value={search} onChange={(event) => { setSearch(event.target.value); resetPage(); }} placeholder={t("searchPlaceholder")} />
        <SelectControl ariaLabel={t("field.status")} value={status} onChange={(value) => { setStatus(value); resetPage(); }} options={[{ value: "", label: common("all") }, ...(["ACTIVE", "DISABLED", "VOIDED", "EXPIRED", "SUPERSEDED"] as QRCodeStatus[]).map((value) => ({ value, label: t(`status.${value}`) }))]} />
        <SelectControl ariaLabel={t("field.subjectType")} value={subjectType} onChange={(value) => { setSubjectType(value); resetPage(); }} options={[{ value: "", label: common("all") }, ...SUBJECT_TYPES.map((value) => ({ value, label: t(`subjectType.${value}`) }))]} />
        <SelectControl ariaLabel={t("field.company")} value={company} onChange={(value) => { setCompany(value); resetPage(); }} options={[{ value: "", label: common("all") }, ...(companies.data?.results ?? []).map((row) => ({ value: row.id, label: `${row.code} - ${row.name}` }))]} />
        {allowIssue && <Button onClick={() => setShowIssue(true)}><Plus />{t("action.issue")}</Button>}
        <ExportButtons kind="codes" query={{ search, status, subject_type: subjectType, company, issued_from: issuedFrom, issued_to: issuedTo }} />
      </div>
      {advancedFilters && <div className="grid gap-2 sm:grid-cols-2"><FieldWrapper label={t("field.issuedFrom")}><Input type="date" value={issuedFrom} onChange={(event) => { setIssuedFrom(event.target.value); resetPage(); }} /></FieldWrapper><FieldWrapper label={t("field.issuedTo")}><Input type="date" value={issuedTo} onChange={(event) => { setIssuedTo(event.target.value); resetPage(); }} /></FieldWrapper></div>}
      <Table>
        <TableHeader><TableRow><TableHead>{t("field.qrId")}</TableHead><TableHead>{t("field.subjectType")}</TableHead><TableHead>{t("field.subject")}</TableHead><TableHead>{t("field.company")}</TableHead><TableHead>{t("field.projectSite")}</TableHead><TableHead>{t("field.status")}</TableHead><TableHead>{t("field.issuedOn")}</TableHead><TableHead>{t("field.scanCount")}</TableHead><TableHead className="text-right">{t("field.action")}</TableHead></TableRow></TableHeader>
        <TableBody>
          {codes.data?.results.map((code) => <TableRow key={code.id}><TableCell className="font-medium tabular-nums">{code.serial}</TableCell><TableCell><TypeBadge label={t(`subjectType.${code.subject_type}`)} /></TableCell><TableCell>{code.subject_label || "-"}</TableCell><TableCell><p>{code.company_name ?? "-"}</p><p className="text-xs text-muted-foreground">{code.company_code}</p></TableCell><TableCell>{code.project_name ?? code.site_name ?? "-"}</TableCell><TableCell><StatusBadge label={t(`status.${code.effective_status}`)} tone={statusTone(code.effective_status)} /></TableCell><TableCell>{df.date(code.issued_on)}</TableCell><TableCell className="tabular-nums">{code.scan_count}</TableCell><TableCell><div className="flex items-center justify-end gap-0.5"><Button size="icon-sm" variant="ghost" title={common("view")} onClick={() => setViewing(code)}><Eye /></Button>{allowEdit && <Button size="icon-sm" variant="ghost" title={common("edit")} onClick={() => setEditing(code)}><RefreshCw /></Button>}{allowLifecycle && <LifecycleButtons code={code} onSelect={(selection) => { setLifecycle(selection); setNote(""); }} />}</div></TableCell></TableRow>)}
          {!codes.isLoading && (codes.data?.results.length ?? 0) === 0 && <EmptyRow columns={9} />}
        </TableBody>
      </Table>
      <Pagination page={page} totalPages={codes.data?.total_pages ?? 0} count={codes.data?.count} onPage={setPage} />
      <IssueDialog open={showIssue} companies={companies.data?.results ?? []} onClose={() => setShowIssue(false)} onIssued={(code) => { setShowIssue(false); setIssued(code); void queryClient.invalidateQueries({ queryKey: ["admin-qr"] }); }} />
      <CodeDialog code={viewing} onClose={() => setViewing(null)} />
      <EditDialog code={editing} onClose={() => setEditing(null)} onSaved={() => void queryClient.invalidateQueries({ queryKey: ["admin-qr"] })} />
      <LifecycleDialog selection={lifecycle} note={note} setNote={setNote} pending={changeStatus.isPending} onClose={() => setLifecycle(null)} onSave={() => changeStatus.mutate()} />
      <IssuedTokenDialog code={issued} onClose={() => setIssued(null)} />
    </div>
  );
}

function LifecycleButtons({ code, onSelect }: { code: QRCode; onSelect: (selection: { code: QRCode; status?: "ACTIVE" | "DISABLED" | "VOIDED"; reissue?: boolean }) => void }) {
  const t = useTranslations("adminQr.action");
  if (["VOIDED", "SUPERSEDED"].includes(code.effective_status)) return null;
  return <>{code.effective_status === "DISABLED" ? <Button size="icon-sm" variant="ghost" title={t("enable")} onClick={() => onSelect({ code, status: "ACTIVE" })}><Power /></Button> : <Button size="icon-sm" variant="ghost" title={t("disable")} onClick={() => onSelect({ code, status: "DISABLED" })}><Power /></Button>}<Button size="icon-sm" variant="ghost" title={t("void")} onClick={() => onSelect({ code, status: "VOIDED" })}><ShieldX /></Button><Button size="icon-sm" variant="ghost" title={t("reissue")} onClick={() => onSelect({ code, reissue: true })}><RotateCw /></Button></>;
}

function IssueDialog({ open, companies, onClose, onIssued }: { open: boolean; companies: CompanyRow[]; onClose: () => void; onIssued: (code: QRCodeIssue) => void }) {
  const t = useTranslations("adminQr");
  const common = useTranslations("common");
  const [form, setForm] = useState<IssueQRCodePayload>({ subject_type: "CONTRACTOR", subject_label: "" });
  const options = useQuery({
    queryKey: ["admin-qr", "subject-options", form.subject_type, form.company],
    queryFn: () => getQRSubjectOptions(form.subject_type, form.company),
    enabled: open && (form.subject_type === "VISITOR" || Boolean(form.company)),
  });
  const issue = useMutation({ mutationFn: () => issueQRCode(form), onSuccess: onIssued });
  const isVisitor = form.subject_type === "VISITOR";
  const isCompanySubject = ["CONTRACTOR", "RECYCLER"].includes(form.subject_type);
  const availableCompanies = isCompanySubject
    ? companies.filter((company) => company.type === form.subject_type)
    : companies;
  const chooseSubject = (subjectId: string) => {
    const selected = options.data?.subjects.find((row) => row.id === subjectId);
    setForm((current) => ({ ...current, subject_id: subjectId, subject_label: selected?.label ?? "" }));
  };
  return <Dialog open={open} onOpenChange={(next) => !next && onClose()}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{t("issue.title")}</DialogTitle><DialogDescription>{t("issue.description")}</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><FieldWrapper label={t("field.subjectType")} required><SelectControl className="w-full" ariaLabel={t("field.subjectType")} value={form.subject_type} onChange={(value) => setForm({ subject_type: value as QRSubjectType, subject_label: "" })} options={SUBJECT_TYPES.map((value) => ({ value, label: t(`subjectType.${value}`) }))} /></FieldWrapper><FieldWrapper label={t("field.company")} required={!isVisitor}><SelectControl className="w-full" ariaLabel={t("field.company")} value={form.company ?? ""} onChange={(value) => { const selected = companies.find((row) => row.id === value); setForm((current) => ({ ...current, company: value || undefined, subject_id: isCompanySubject ? (value || undefined) : undefined, subject_label: isCompanySubject ? (selected?.name ?? "") : "", project: undefined, site: undefined })); }} options={[{ value: "", label: common("selectPlaceholder") }, ...availableCompanies.map((row) => ({ value: row.id, label: `${row.code} - ${row.name}` }))]} /></FieldWrapper>{isVisitor ? <FieldWrapper label={t("field.subject")} required className="sm:col-span-2"><Input value={form.subject_label} placeholder={t("issue.visitorPlaceholder")} onChange={(event) => setForm((current) => ({ ...current, subject_label: event.target.value }))} /><p className="text-xs leading-5 text-muted-foreground">{t("issue.visitorHint")}</p></FieldWrapper> : isCompanySubject ? <FieldWrapper label={t("field.subject")} required className="sm:col-span-2"><div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium">{form.subject_label || t("issue.companyAutoBind")}</div><p className="text-xs leading-5 text-muted-foreground">{t("issue.companyAutoBindHint")}</p></FieldWrapper> : <FieldWrapper label={t("field.subject")} required className="sm:col-span-2"><SelectControl className="w-full" ariaLabel={t("field.subject")} value={form.subject_id ?? ""} onChange={chooseSubject} options={[{ value: "", label: options.isLoading ? common("loading") : common("selectPlaceholder") }, ...(options.data?.subjects ?? []).map((row) => ({ value: row.id, label: row.label }))]} /><p className="text-xs leading-5 text-muted-foreground">{form.company && !options.isLoading && (options.data?.subjects.length ?? 0) === 0 ? t("issue.noSubjects") : t("issue.subjectHint")}</p></FieldWrapper>}<FieldWrapper label={t("field.project")}><SelectControl className="w-full" ariaLabel={t("field.project")} value={form.project ?? ""} onChange={(value) => setForm((current) => ({ ...current, project: value || undefined }))} options={[{ value: "", label: common("selectPlaceholder") }, ...(options.data?.projects ?? []).map((row) => ({ value: row.id, label: row.label }))]} /></FieldWrapper><FieldWrapper label={t("field.site")}><SelectControl className="w-full" ariaLabel={t("field.site")} value={form.site ?? ""} onChange={(value) => setForm((current) => ({ ...current, site: value || undefined }))} options={[{ value: "", label: common("selectPlaceholder") }, ...(options.data?.sites ?? []).map((row) => ({ value: row.id, label: row.label }))]} /></FieldWrapper><FieldWrapper label={t("field.expiresOn")}><Input type="date" value={form.expires_on ?? ""} onChange={(event) => setForm((current) => ({ ...current, expires_on: event.target.value || undefined }))} /></FieldWrapper><FieldWrapper label={t("field.notes")} className="sm:col-span-2"><Textarea value={form.notes ?? ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></FieldWrapper></div><DialogFooter><Button variant="outline" onClick={onClose}>{common("cancel")}</Button><Button requires={isVisitor ? [[form.subject_label, t("field.subject")]] : [[form.company, t("field.company")], [form.subject_id, t("field.subject")]]} disabled={issue.isPending} onClick={() => issue.mutate()}>{t("action.issue")}</Button></DialogFooter></DialogContent></Dialog>;
}

function CodeDialog({ code, onClose }: { code: QRCode | null; onClose: () => void }) {
  const t = useTranslations("adminQr");
  const df = useDateFormat();
  return <Dialog open={code !== null} onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>{code?.serial}</DialogTitle><DialogDescription>{code ? t(`subjectType.${code.subject_type}`) : ""}</DialogDescription></DialogHeader>{code && <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">{[["subject", code.subject_label], ["company", code.company_name], ["project", code.project_name], ["site", code.site_name], ["status", t(`status.${code.effective_status}`)], ["issuedOn", df.date(code.issued_on)], ["expiresOn", code.expires_on ? df.date(code.expires_on) : "-"], ["lastScanned", code.last_scanned_at ? df.dateTime(code.last_scanned_at) : "-"], ["scanCount", code.scan_count], ["notes", code.notes || "-"]].map(([key, value]) => <div key={key as string}><p className="text-xs text-muted-foreground">{t(`field.${key}`)}</p><p className="mt-1 break-words font-medium">{value}</p></div>)}</div>}</DialogContent></Dialog>;
}

function EditDialog({ code, onClose, onSaved }: { code: QRCode | null; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("adminQr");
  const common = useTranslations("common");
  const [expiry, setExpiry] = useState("");
  const [notes, setNotes] = useState("");
  const save = useMutation({ mutationFn: () => updateQRCode(code!.id, { expires_on: expiry || null, notes }), onSuccess: () => { onSaved(); onClose(); } });
  const initialise = () => { if (code) { setExpiry(code.expires_on ?? ""); setNotes(code.notes); } };
  return <Dialog open={code !== null} onOpenChange={(open) => { if (open) initialise(); else onClose(); }}><DialogContent><DialogHeader><DialogTitle>{t("edit.title")}</DialogTitle><DialogDescription>{code?.serial}</DialogDescription></DialogHeader><FieldWrapper label={t("field.subject")} required><div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium">{code?.subject_label || "-"}</div><p className="text-xs leading-5 text-muted-foreground">{t("edit.bindingLocked")}</p></FieldWrapper><FieldWrapper label={t("field.expiresOn")}><Input type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} /></FieldWrapper><FieldWrapper label={t("field.notes")}><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></FieldWrapper><DialogFooter><Button variant="outline" onClick={onClose}>{common("cancel")}</Button><Button disabled={save.isPending} onClick={() => save.mutate()}>{common("save")}</Button></DialogFooter></DialogContent></Dialog>;
}

function LifecycleDialog({ selection, note, setNote, pending, onClose, onSave }: { selection: { code: QRCode; status?: "ACTIVE" | "DISABLED" | "VOIDED"; reissue?: boolean } | null; note: string; setNote: (value: string) => void; pending: boolean; onClose: () => void; onSave: () => void }) {
  const t = useTranslations("adminQr");
  const common = useTranslations("common");
  const action = selection?.reissue ? "reissue" : selection?.status === "VOIDED" ? "void" : selection?.status === "ACTIVE" ? "enable" : "disable";
  return <Dialog open={selection !== null} onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>{t(`action.${action}`)}</DialogTitle><DialogDescription>{selection?.code.serial}</DialogDescription></DialogHeader><FieldWrapper label={t("field.reason")} required={action === "void" || action === "reissue"}><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></FieldWrapper><DialogFooter><Button variant="outline" onClick={onClose}>{common("cancel")}</Button><Button variant={action === "void" ? "destructive" : "default"} requires={[[(action !== "void" && action !== "reissue") || note, t("field.reason")]]} disabled={pending} onClick={onSave}>{common("confirm")}</Button></DialogFooter></DialogContent></Dialog>;
}

function IssuedTokenDialog({ code, onClose }: { code: QRCodeIssue | null; onClose: () => void }) {
  const t = useTranslations("adminQr");
  const common = useTranslations("common");
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLCanvasElement>(null);
  const scanUrl = code && typeof window !== "undefined"
    ? `${window.location.origin}/scan/qr#token=${encodeURIComponent(code.token)}`
    : "";
  const downloadQr = (format: "png" | "jpg") => {
    if (!code) return;
    const canvas = qrRef.current;
    if (!canvas) return;
    const mime = format === "jpg" ? "image/jpeg" : "image/png";
    const link = document.createElement("a");
    link.href = canvas.toDataURL(mime, 0.96);
    link.download = `${code.serial}.${format}`;
    link.click();
  };
  const printQr = () => {
    if (!code) return;
    const canvas = qrRef.current;
    if (!canvas) return;
    const image = canvas.toDataURL("image/png");
    const printWindow = window.open("", "_blank", "width=520,height=680");
    if (!printWindow) return;
    printWindow.opener = null;
    printWindow.document.write(
      `<!doctype html><html><head><title>${code.serial}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:32px}img{width:320px;height:320px}.serial{font-size:20px;font-weight:700;margin-top:20px}</style></head><body><img src="${image}" alt="${code.serial}"><div class="serial">${code.serial}</div><script>window.onload=()=>{window.print();window.close()}</script></body></html>`,
    );
    printWindow.document.close();
  };
  return <Dialog open={code !== null} onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>{t("issued.title")}</DialogTitle><DialogDescription>{t("issued.description")}</DialogDescription></DialogHeader>{code && <div className="space-y-4"><div className="mx-auto grid w-fit place-items-center rounded-lg border bg-white p-4 shadow-sm"><QRCodeCanvas ref={qrRef} value={scanUrl} size={220} level="H" marginSize={1} bgColor="#ffffff" fgColor="#111827" title={code.serial} /></div><p className="text-center text-sm font-semibold tabular-nums">{code.serial}</p><div className="flex flex-wrap justify-center gap-2"><Button variant="outline" onClick={() => downloadQr("png")}><Download />{t("action.downloadPng")}</Button><Button variant="outline" onClick={() => downloadQr("jpg")}><Download />{t("action.downloadJpg")}</Button><Button variant="outline" onClick={printQr}><Printer />{t("action.printQr")}</Button></div><div className="space-y-2 rounded-md border bg-muted/40 p-3"><p className="text-xs font-medium">{t("issued.scanLink")}</p><div className="flex items-center gap-2"><code className="min-w-0 flex-1 break-all text-xs">{scanUrl}</code><Button size="icon-sm" variant="outline" title={common("copy")} onClick={() => { void navigator.clipboard.writeText(scanUrl); setCopied(true); }}><Copy /></Button></div></div>{copied && <p className="text-center text-xs text-success">{t("issued.copied")}</p>}</div>}<DialogFooter><Button onClick={onClose}>{common("close")}</Button></DialogFooter></DialogContent></Dialog>;
}

function ScanLedger({ anomaliesOnly }: { anomaliesOnly: boolean }) {
  const t = useTranslations("adminQr");
  const common = useTranslations("common");
  const df = useDateFormat();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const scans = useQuery({ queryKey: ["admin-qr", anomaliesOnly ? "anomalies" : "scans", page, search, outcome, from, to], queryFn: () => (anomaliesOnly ? getQRAnomalies : getScanRecords)({ page, page_size: 25, search, outcome, date_from: from, date_to: to, sort_by: "scanned_at", sort_order: "desc" }) });
  const outcomes: QRScanOutcome[] = ["SUCCESS", "DUPLICATE_WARNING", "UNKNOWN_CODE", "DISABLED", "VOIDED", "EXPIRED", "WRONG_LOCATION", "DUPLICATE"];
  return <div className="space-y-4"><div className="flex flex-wrap items-end gap-2"><Input className="min-w-56 flex-1" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("scanSearchPlaceholder")} /><SelectControl ariaLabel={t("field.outcome")} value={outcome} onChange={(value) => { setOutcome(value); setPage(1); }} options={[{ value: "", label: common("all") }, ...outcomes.map((value) => ({ value, label: t(`outcome.${value}`) }))]} /><ExportButtons kind={anomaliesOnly ? "anomalies" : "scans"} query={{ search, outcome, date_from: from, date_to: to }} /></div><div className="grid gap-2 sm:grid-cols-2"><FieldWrapper label={t("field.dateFrom")}><Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></FieldWrapper><FieldWrapper label={t("field.dateTo")}><Input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></FieldWrapper></div><Table><TableHeader><TableRow><TableHead>{t("field.scannedAt")}</TableHead><TableHead>{t("field.qrId")}</TableHead><TableHead>{t("field.subject")}</TableHead><TableHead>{t("field.company")}</TableHead><TableHead>{t("field.location")}</TableHead><TableHead>{t("field.scannedBy")}</TableHead><TableHead>{t("field.outcome")}</TableHead></TableRow></TableHeader><TableBody>{scans.data?.results.map((scan) => <TableRow key={scan.id}><TableCell>{df.dateTime(scan.scanned_at)}</TableCell><TableCell>{scan.serial || "-"}</TableCell><TableCell>{scan.subject_label ?? "-"}</TableCell><TableCell>{scan.company_name ?? "-"}</TableCell><TableCell><p>{scan.project_name ?? scan.site_name ?? scan.location_label ?? "-"}</p>{scan.latitude && <p className="text-xs text-muted-foreground tabular-nums">{scan.latitude}, {scan.longitude}</p>}</TableCell><TableCell>{scan.scanned_by_name ?? "-"}</TableCell><TableCell><StatusBadge label={t(`outcome.${scan.outcome}`)} tone={scanOutcomeTone(scan.outcome)} /></TableCell></TableRow>)}{!scans.isLoading && (scans.data?.results.length ?? 0) === 0 && <EmptyRow columns={7} />}</TableBody></Table><Pagination page={page} totalPages={scans.data?.total_pages ?? 0} count={scans.data?.count} onPage={setPage} /></div>;
}

function QRStatistics() {
  const t = useTranslations("adminQr");
  const summary = useQuery({ queryKey: ["admin-qr", "summary"], queryFn: getQRSummary });
  const data = summary.data;
  return <div className="space-y-5"><div className="grid border-l border-t sm:grid-cols-2 lg:grid-cols-4">{[["total", data?.total ?? 0], ["active", data?.by_status.ACTIVE ?? 0], ["scansToday", data?.scans_today ?? 0], ["failedScansToday", data?.failed_scans_today ?? 0]].map(([key, value]) => <div key={key} className="min-h-24 border-b border-r p-4"><p className="text-xs text-muted-foreground">{t(`metric.${key}`)}</p><p className="mt-3 text-xl font-semibold tabular-nums">{value}</p></div>)}</div><div className="grid gap-5 lg:grid-cols-2"><div><h3 className="mb-3 text-sm font-semibold">{t("statistics.byType")}</h3><div className="divide-y border-y">{SUBJECT_TYPES.map((type) => <div key={type} className="flex items-center justify-between py-3"><span>{t(`subjectType.${type}`)}</span><span className="tabular-nums font-medium">{data?.by_subject_type[type] ?? 0}</span></div>)}</div></div><div><h3 className="mb-3 text-sm font-semibold">{t("statistics.byStatus")}</h3><div className="divide-y border-y">{(["ACTIVE", "DISABLED", "VOIDED", "EXPIRED", "SUPERSEDED"] as QRCodeStatus[]).map((status) => <div key={status} className="flex items-center justify-between py-3"><StatusBadge label={t(`status.${status}`)} tone={statusTone(status)} /><span className="tabular-nums font-medium">{data?.by_status[status] ?? 0}</span></div>)}</div></div></div></div>;
}

function ExportButtons({ kind, query }: { kind: "codes" | "scans" | "anomalies"; query: Record<string, string> }) {
  const t = useTranslations("adminQr.action");
  const [busy, setBusy] = useState(false);
  const run = async (format: "pdf" | "xlsx") => { setBusy(true); try { await exportQRRegister(kind, format, query); } finally { setBusy(false); } };
  return <div className="flex gap-1"><Button size="sm" variant="outline" disabled={busy} onClick={() => void run("xlsx")}><Download />{t("excel")}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void run("pdf")}><Download />{t("pdf")}</Button></div>;
}

function Pagination({ page, totalPages, count, onPage }: { page: number; totalPages: number; count?: number; onPage: (page: number) => void }) {
  const t = useTranslations("adminQr");
  const common = useTranslations("common");
  const table = useTranslations("table");
  return <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{t("count", { count: count ?? 0 })}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabledReason={page <= 1 ? common("alreadyFirstPage") : undefined} disabled={page <= 1} onClick={() => onPage(page - 1)}>{table("previous")}</Button><Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>{table("next")}</Button></div></div>;
}

function SelectControl({ value, onChange, options, ariaLabel, className = "min-w-40" }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; ariaLabel: string; className?: string }) {
  return <select aria-label={ariaLabel} className={`h-9 rounded-md border bg-background px-3 text-sm ${className}`} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value || "EMPTY"} value={option.value}>{option.label}</option>)}</select>;
}

function EmptyRow({ columns }: { columns: number }) {
  const t = useTranslations("adminQr");
  return <TableRow><TableCell colSpan={columns} className="h-28 text-center text-muted-foreground">{t("empty")}</TableCell></TableRow>;
}

function statusTone(status: QRCodeStatus) {
  if (status === "ACTIVE") return "positive" as const;
  if (status === "DISABLED") return "warning" as const;
  if (status === "VOIDED" || status === "EXPIRED") return "danger" as const;
  return "neutral" as const;
}

function scanOutcomeTone(outcome: QRScanOutcome) {
  if (outcome === "SUCCESS") return "positive" as const;
  if (outcome === "DUPLICATE_WARNING") return "warning" as const;
  return "danger" as const;
}
