"use client";

/**
 * 操作人员资料 (JB233, 客户 11-20 事项 5, 图5、图6).
 *
 * 「目前列表只需要显示操作人员姓名，不必展开全部个人资料。点击操作人员姓名后，弹出
 * 完整资料，包括：操作人员姓名、CIDB 卡号、驾驶执照（Driving Licence）、机械操作
 * 资格证件、相关证件照片或文件、证件类别及有效期限。资料直接关联现有操作人员记录，
 * 不需要每次重复填写。证件过期应有明显提示。」
 *
 * The list shows the name and, when a paper ran out, a red 「证件过期」 (amber
 * 「即将到期」 within 30 days). The name opens this window: where the operator
 * comes from, his CIDB card, licence and machine competency certificates with
 * their validity, and the photos or PDFs of them in the in-page viewer. Those
 * who manage the equipment edit the papers here (编辑资料); everybody else
 * reads. A name typed by hand for somebody not registered has no papers: the
 * window says so and offers to register him (a driver clock-in link).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileText, Loader2, PencilLine, Plus, Trash2, Upload, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { FilePreviewDialog } from "@/components/shared/file-preview";
import { FieldWrapper, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/interfaces/api";
import type {
  OperatorCertificateCategory,
  OperatorExpiry,
  OperatorFileSection,
  OperatorPaperFile,
  OperatorPapers,
  OperatorPapersPayload,
} from "@/interfaces/equipment-hours";
import { useDateFormat } from "@/lib/dates";
import {
  downloadOperatorFile,
  getOperatorPapers,
  operatorFileObjectUrl,
  removeOperatorFile,
  saveOperatorPapers,
  uploadOperatorFile,
} from "@/services/equipment-hours.service";

export const CERTIFICATE_CATEGORIES: OperatorCertificateCategory[] = [
  "MACHINE_COMPETENCY",
  "CIDB",
  "DRIVING_LICENCE",
  "OTHER",
];

/** 登记这位操作人员: a new driver link on this project, the typed words filled in. */
export interface RegisterPrefill {
  name: string;
  cidb: string;
  project: string;
}

/** What the window is opened for: a registered operator, or a typed name. */
export type OperatorPapersTarget =
  | { profile: string; typed?: undefined }
  | { profile?: undefined; typed: { name: string; cidb: string } };

/** The window's target for a session row: its operator's papers, or the words typed. */
export function papersTargetOf(row: {
  operator_profile_id?: string | null;
  operator_name?: string;
  cidb_no?: string;
}): OperatorPapersTarget {
  return row.operator_profile_id
    ? { profile: row.operator_profile_id }
    : { typed: { name: row.operator_name ?? "", cidb: row.cidb_no ?? "" } };
}

/** The query key of one operator's papers. */
export function operatorPapersKey(by: { profile?: string | null; link?: string | null }) {
  return ["equipment-operators", "papers", by.profile ?? "", by.link ?? ""] as const;
}

/** The small tag beside a name: red 「证件过期」, amber 「即将到期」, else nothing. */
export function OperatorExpiryTag({ expiry }: { expiry: OperatorExpiry | null | undefined }) {
  const t = useTranslations("equipmentHours.papers");
  if (expiry === "expired") return <StatusBadge label={t("tagExpired")} tone="danger" />;
  if (expiry === "expiring") return <StatusBadge label={t("tagExpiring")} tone="warning" />;
  return null;
}

/**
 * The 操作人员 cell of the list: only the name, as a link that opens the
 * papers, with the expiry tag. Empty: 「填写」 for the office, as before.
 */
export function OperatorNameCell({
  name,
  expiry,
  canFill,
  onOpen,
  onFill,
}: {
  name: string | null | undefined;
  expiry: OperatorExpiry | null | undefined;
  canFill: boolean;
  onOpen: () => void;
  onFill: () => void;
}) {
  const t = useTranslations("equipmentHours");
  if (!name) {
    return canFill ? (
      <Button
        size="sm"
        variant="ghost"
        className="h-auto px-1.5 py-1 font-normal"
        onClick={(event) => {
          event.stopPropagation();
          onFill();
        }}
      >
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <UserRound />
          {t("operator.fill")}
        </span>
      </Button>
    ) : null;
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        className="text-left font-medium text-primary underline-offset-2 hover:underline"
        aria-label={t("papers.openName", { name })}
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        {name}
      </button>
      <OperatorExpiryTag expiry={expiry} />
    </span>
  );
}

/** One validity, in the four ways the client asked to tell them apart. */
export function ExpiryLine({ date, expiry }: { date: string | null; expiry: OperatorExpiry }) {
  const t = useTranslations("equipmentHours.papers");
  const df = useDateFormat();
  if (!date || expiry === "none") return <StatusBadge label={t("noDate")} tone="neutral" />;
  const shown = df.date(date);
  if (expiry === "expired") return <StatusBadge label={t("expiredOn", { date: shown })} tone="danger" />;
  if (expiry === "expiring") return <StatusBadge label={t("expiresOn", { date: shown })} tone="warning" />;
  return <StatusBadge label={t("validTo", { date: shown })} tone="positive" />;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-lg border p-3">
      <h3 className="panel-title">{title}</h3>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/** A PDF, an iPhone HEIC or a photo not loaded (yet): its type on a tile. */
function FileTile({ name }: { name: string }) {
  return (
    <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
      <FileText className="size-6" />
      {name.split(".").pop()?.toUpperCase()}
    </span>
  );
}

/**
 * A photo's thumbnail, fetched with the session through `certificate_file`
 * - the same permission check as the viewer, never a bare storage address.
 * Until it arrives, or when it cannot be read, the file tile.
 */
function PaperThumb({ file }: { file: OperatorPaperFile }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    operatorFileObjectUrl(file, { silent: true })
      .then((objectUrl) => {
        made = objectUrl;
        if (live) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {
        // The tile stays: the viewer still offers the file and says why.
      });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [file]);
  if (!url) return <FileTile name={file.original_name} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={file.original_name} className="size-full object-cover" />;
}

/** The photos or PDFs of one card; a tap opens the in-page viewer. */
export function PaperFiles({
  files,
  canRemove,
  onRemove,
}: {
  files: OperatorPaperFile[];
  canRemove?: boolean;
  onRemove?: (file: OperatorPaperFile) => void;
}) {
  const t = useTranslations("equipmentHours.papers");
  const df = useDateFormat();
  const [open, setOpen] = useState<OperatorPaperFile | null>(null);
  if (files.length === 0) return null;
  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {files.map((file) => (
          <li key={file.id} className="relative">
            <button
              type="button"
              className="grid size-20 place-items-center overflow-hidden rounded-md border bg-muted/40"
              title={file.original_name}
              aria-label={file.original_name}
              onClick={() => setOpen(file)}
            >
              {file.is_image ? <PaperThumb file={file} /> : <FileTile name={file.original_name} />}
            </button>
            {canRemove && onRemove ? (
              <Button
                size="icon"
                variant="destructive"
                className="absolute -right-1.5 -top-1.5 size-6"
                aria-label={t("removeFile", { name: file.original_name })}
                title={t("removeFile", { name: file.original_name })}
                onClick={() => onRemove(file)}
              >
                <Trash2 className="size-3" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {open && (
        <FilePreviewDialog
          title={open.original_name}
          description={[open.uploaded_by_name, open.uploaded_at ? df.dateTime(open.uploaded_at) : ""]
            .filter(Boolean)
            .join(" · ")}
          load={() => operatorFileObjectUrl(open)}
          previewType={open.preview_type}
          filename={open.original_name}
          onDownload={() => downloadOperatorFile(open)}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/**
 * The 操作人员资料 window. Opened by a registered operator (`profile`, or his
 * driver `link`), or - for a name typed by hand - with only that name.
 */
export function OperatorProfileWindow({
  profile,
  link,
  typed,
  onClose,
  onRegister,
}: {
  profile?: string | null;
  link?: string | null;
  /** A name the office typed for somebody not registered. */
  typed?: { name: string; cidb: string };
  onClose: () => void;
  /** 登记这位操作人员: opens the driver links with the name filled in. */
  onRegister?: (typed: { name: string; cidb: string }) => void;
}) {
  const t = useTranslations("equipmentHours.papers");
  const { can } = useAuth();
  const by = { profile: profile ?? undefined, link: link ?? undefined };
  const registered = Boolean(profile || link);
  const papers = useQuery({
    queryKey: operatorPapersKey(by),
    queryFn: () => getOperatorPapers(by),
    enabled: registered,
  });
  const [editing, setEditing] = useState(false);
  const data = papers.data;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" data-testid="operator-profile-window">
        <DialogHeader>
          <DialogTitle>{data?.name ?? typed?.name ?? t("title")}</DialogTitle>
          <DialogDescription>
            {data
              ? [
                  t("title"),
                  data.kind === "link" ? t("fromLink") : t("fromAccount"),
                  data.is_active ? "" : t("stopped"),
                ]
                  .filter(Boolean)
                  .join(" · ")
              : t("title")}
          </DialogDescription>
        </DialogHeader>

        {!registered && typed ? (
          <div className="space-y-3">
            <Section title={t("cidbSection")}>
              <p className="text-sm font-medium">{typed.cidb || "-"}</p>
            </Section>
            <p className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm" role="status">
              {t("notRegistered")}
            </p>
            {can("equipment.manage") && onRegister ? (
              <div className="space-y-1">
                <Button variant="outline" onClick={() => onRegister(typed)}>
                  <Plus />
                  {t("register")}
                </Button>
                <p className="text-xs text-muted-foreground">{t("registerHelp")}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {registered ? <QueryFailedNote query={papers} what={t("title")} /> : null}
        {registered && papers.isLoading ? (
          <div className="grid h-24 place-items-center">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : null}

        {data && !editing ? <PapersRead papers={data} /> : null}
        {data && editing ? <PapersEdit papers={data} onDone={() => setEditing(false)} /> : null}

        <DialogFooter>
          {data?.can_edit && !editing ? (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <PencilLine />
              {t("edit")}
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The papers, to read. */
export function PapersRead({ papers }: { papers: OperatorPapers }) {
  const t = useTranslations("equipmentHours.papers");
  const allFiles = [
    ...papers.cidb_files,
    ...papers.licence_files,
    ...papers.certificates.flatMap((row) => row.files),
  ];
  return (
    <div className="space-y-3">
      {papers.expiry === "expired" ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm font-semibold text-destructive"
        >
          <AlertTriangle className="size-4 shrink-0" />
          {t("expiredBanner")}
        </p>
      ) : null}
      <Section title={t("title")}>
        <Fact label={t("company")} value={papers.company_name || "-"} />
        {papers.project_name ? <Fact label={t("projectLabel")} value={papers.project_name} /> : null}
        {papers.phone ? <Fact label={t("phoneLabel")} value={papers.phone} /> : null}
      </Section>
      <Section title={t("cidbSection")}>
        <Fact label={t("cidbSection")} value={papers.cidb_no || "-"} />
        <Fact label={t("validUntil")} value={<ExpiryLine date={papers.cidb_expires_on} expiry={papers.cidb_expiry} />} />
        <PaperFiles files={papers.cidb_files} />
      </Section>
      <Section title={t("licenceSection")}>
        <Fact label={t("licenceNumber")} value={papers.licence_no || "-"} />
        <Fact label={t("licenceClass")} value={papers.licence_class || "-"} />
        <Fact
          label={t("validUntil")}
          value={<ExpiryLine date={papers.licence_expires_on} expiry={papers.licence_expiry} />}
        />
        <PaperFiles files={papers.licence_files} />
      </Section>
      <Section title={t("certSection")}>
        {papers.certificates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noCerts")}</p>
        ) : (
          <ul className="space-y-2">
            {papers.certificates.map((row) => (
              <li key={row.id} className="space-y-1 rounded-md border p-2" data-testid="operator-certificate">
                <p className="text-sm font-medium">
                  {[t(`cat${row.category}`), row.title].filter(Boolean).join(" · ")}
                </p>
                <Fact label={t("certNo")} value={row.number || "-"} />
                <Fact label={t("validUntil")} value={<ExpiryLine date={row.expires_on} expiry={row.expiry} />} />
                <PaperFiles files={row.files} />
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={t("filesSection")}>
        {allFiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noFiles")}</p>
        ) : (
          <PaperFiles files={allFiles} />
        )}
      </Section>
    </div>
  );
}

type DraftCertificate = OperatorPapersPayload["certificates"][number] & { key: string };

/** The form a manager edits the papers in, inside the window. */
export function PapersEdit({ papers, onDone }: { papers: OperatorPapers; onDone: () => void }) {
  const t = useTranslations("equipmentHours.papers");
  const queryClient = useQueryClient();
  const [cidb, setCidb] = useState(papers.cidb_no);
  const [cidbUntil, setCidbUntil] = useState(papers.cidb_expires_on ?? "");
  const [licenceNo, setLicenceNo] = useState(papers.licence_no);
  const [licenceClass, setLicenceClass] = useState(papers.licence_class);
  const [licenceUntil, setLicenceUntil] = useState(papers.licence_expires_on ?? "");
  const [certificates, setCertificates] = useState<DraftCertificate[]>(() =>
    papers.certificates.map((row) => ({
      key: row.id,
      id: row.id,
      category: row.category,
      title: row.title,
      number: row.number,
      issued_on: row.issued_on,
      expires_on: row.expires_on,
    })),
  );
  const [error, setError] = useState("");
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["equipment-operators"] });
    void queryClient.invalidateQueries({ queryKey: ["equipment-hours"] });
    void queryClient.invalidateQueries({ queryKey: ["driver-clock-links"] });
  };
  const failed = (reason: unknown) => setError(reason instanceof ApiError ? reason.message : t("saveFailed"));

  const save = useMutation({
    mutationFn: () =>
      saveOperatorPapers({
        profile: papers.id,
        cidb_no: cidb.trim(),
        cidb_expires_on: cidbUntil || null,
        licence_no: licenceNo.trim(),
        licence_class: licenceClass.trim(),
        licence_expires_on: licenceUntil || null,
        certificates: certificates.map(({ key: _key, ...row }) => ({
          ...row,
          title: row.title.trim(),
          number: row.number.trim(),
          issued_on: row.issued_on || null,
          expires_on: row.expires_on || null,
        })),
      }),
    onSuccess: () => {
      setError("");
      refresh();
      onDone();
    },
    onError: failed,
  });
  const upload = useMutation({ mutationFn: uploadOperatorFile, onSuccess: refresh, onError: failed });
  const remove = useMutation({ mutationFn: (file: OperatorPaperFile) => removeOperatorFile(file.id), onSuccess: refresh, onError: failed });

  const change = (key: string, values: Partial<DraftCertificate>) =>
    setCertificates((rows) => rows.map((row) => (row.key === key ? { ...row, ...values } : row)));
  const filesOf = (id: string | undefined) => papers.certificates.find((row) => row.id === id)?.files ?? [];

  return (
    <form
      className="space-y-3"
      data-testid="operator-papers-edit"
      onSubmit={(event) => {
        event.preventDefault();
        if (!save.isPending) save.mutate();
      }}
    >
      <Section title={t("cidbSection")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldWrapper label={t("cidbSection")}>
            <Input value={cidb} maxLength={50} onChange={(event) => setCidb(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("validUntil")}>
            <Input type="date" value={cidbUntil} onChange={(event) => setCidbUntil(event.target.value)} />
          </FieldWrapper>
        </div>
        <PaperFiles files={papers.cidb_files} canRemove onRemove={(file) => remove.mutate(file)} />
        <UploadButton profile={papers.id} section="CIDB" pending={upload.isPending} onUpload={upload.mutate} />
      </Section>
      <Section title={t("licenceSection")}>
        <div className="grid gap-3 sm:grid-cols-3">
          <FieldWrapper label={t("licenceNumber")}>
            <Input value={licenceNo} maxLength={50} onChange={(event) => setLicenceNo(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("licenceClass")}>
            <Input value={licenceClass} maxLength={50} onChange={(event) => setLicenceClass(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("validUntil")}>
            <Input type="date" value={licenceUntil} onChange={(event) => setLicenceUntil(event.target.value)} />
          </FieldWrapper>
        </div>
        <PaperFiles files={papers.licence_files} canRemove onRemove={(file) => remove.mutate(file)} />
        <UploadButton
          profile={papers.id}
          section="DRIVING_LICENCE"
          pending={upload.isPending}
          onUpload={upload.mutate}
        />
      </Section>
      <Section title={t("certSection")}>
        <ul className="space-y-3">
          {certificates.map((row) => (
            <li key={row.key} className="space-y-2 rounded-md border p-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldWrapper label={t("certCategory")}>
                  <Select
                    value={row.category}
                    onValueChange={(value) => change(row.key, { category: value as OperatorCertificateCategory })}
                  >
                    <SelectTrigger aria-label={t("certCategory")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CERTIFICATE_CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {t(`cat${category}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrapper>
                <FieldWrapper label={t("certName")}>
                  <Input
                    value={row.title}
                    maxLength={150}
                    onChange={(event) => change(row.key, { title: event.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label={t("certNo")}>
                  <Input
                    value={row.number}
                    maxLength={80}
                    onChange={(event) => change(row.key, { number: event.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label={t("issuedOn")}>
                  <Input
                    type="date"
                    value={row.issued_on ?? ""}
                    onChange={(event) => change(row.key, { issued_on: event.target.value || null })}
                  />
                </FieldWrapper>
                <FieldWrapper label={t("validUntil")}>
                  <Input
                    type="date"
                    value={row.expires_on ?? ""}
                    onChange={(event) => change(row.key, { expires_on: event.target.value || null })}
                  />
                </FieldWrapper>
              </div>
              <PaperFiles files={filesOf(row.id)} canRemove onRemove={(file) => remove.mutate(file)} />
              <div className="flex flex-wrap items-center gap-2">
                <UploadButton
                  profile={papers.id}
                  section="CERTIFICATE"
                  certificate={row.id}
                  pending={upload.isPending}
                  onUpload={upload.mutate}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setCertificates((rows) => rows.filter((item) => item.key !== row.key))}
                >
                  <Trash2 />
                  {t("removeCert")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            setCertificates((rows) => [
              ...rows,
              {
                key: `new-${rows.length}-${Date.now()}`,
                category: "MACHINE_COMPETENCY",
                title: "",
                number: "",
                issued_on: null,
                expires_on: null,
              },
            ])
          }
        >
          <Plus />
          {t("addCert")}
        </Button>
      </Section>
      <p className="text-xs text-muted-foreground">{t("uploadHelp")}</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={save.isPending} disabledReason={t("uploading")}>
          {save.isPending && <Loader2 className="animate-spin" />}
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

/** A file chooser for one card; a certificate not saved yet cannot take files. */
function UploadButton({
  profile,
  section,
  certificate,
  pending,
  onUpload,
}: {
  profile: string;
  section: OperatorFileSection;
  certificate?: string;
  pending: boolean;
  onUpload: (payload: { profile: string; section: OperatorFileSection; certificate?: string; file: File }) => void;
}) {
  const t = useTranslations("equipmentHours.papers");
  const input = useRef<HTMLInputElement>(null);
  const unsaved = section === "CERTIFICATE" && !certificate;
  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onUpload({ profile, section, certificate, file });
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending || unsaved}
        disabledReason={unsaved ? t("saveFirst") : t("uploading")}
        onClick={() => input.current?.click()}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Upload />}
        {t("upload")}
      </Button>
    </>
  );
}
