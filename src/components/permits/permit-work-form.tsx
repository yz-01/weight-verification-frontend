"use client";

/**
 * 电子准证 (JB216, 客户 11-18 事项 1, 图 1 图 2).
 *
 * 「在左侧「准证文件」标题右边设置「填写电子准证」按钮，仅后台获授权审批人员可操作，
 * 申请人不能修改。点击后直接填写电子准证，自动带入本笔申请的资料、照片及附件，补填
 * 施工内容、地点、起止时间、安全措施及批准条件。保存后，使用右侧原有的审批意见、签名
 * 位置及「签名批准」按钮完成审批，不另建申请。」
 *
 * The form is 图 2, row by row. What the application already holds is shown,
 * not typed (编号, 项目, 日期, 申请人, the photos and files); 联系电话, 施工负责人
 * and 施工内容 start from the application and may be changed; the rest is the
 * approver's to fill. The approval part is never typed here: 审批意见 is the
 * right-hand box, and 结果 / 姓名 / 时间 / 签名 are written by 「签名批准」.
 *
 * 施工类别 is the company's own list (分类管理 → 施工准证 · 施工类别), plus
 * 「其他（写明）」, always offered. What is saved is the words chosen, so a
 * later rename or removal changes no e-permit.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSignature, Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

import { FieldDraft, useClearDraft, useDraftState } from "@/components/field-staff/field-draft";
import { useAuth } from "@/components/providers/auth-provider";
import { FileThumbs } from "@/components/shared/file-thumbs";
import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
import { recordAttachmentsKey } from "@/components/shared/record-attachments";
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
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import type { Permit, PermitWorkFormInput } from "@/interfaces/permit";
import { useDateFormat } from "@/lib/dates";
import { fromLocalInput, toLocalInput } from "@/lib/record-correction";
import { PERMIT_WORK_TYPES_KEY, getPermitWorkTypes, saveWorkForm } from "@/services/permit.service";
import { getRecordAttachments } from "@/services/record-attachment.service";

/** Where 「管理施工类别」 opens: 分类管理, 公司通用分类, at the list. */
export const MANAGE_WORK_TYPES_HREF = "/category-management?company=permitWorkType";

/** The value of 「其他（写明）」 in the drop-down (a Select has no empty value). */
export const OTHER_WORK_TYPE = "__other__";

/** This submission's photographed pages: 图 2's 照片 1, 照片 2 … */
export function applicationPhotos(permit: Permit) {
  return permit.files.filter((file) => file.is_current && Boolean(file.photo?.url));
}

/** 图 2's 「其他附件名称」: this submission's Word / Excel / PDF files, then the 附件. */
export function otherFileNames(permit: Permit, attachmentNames: readonly string[]) {
  return [
    ...permit.files.filter((file) => file.is_current && !file.photo?.url).map((file) => file.original_name),
    ...attachmentNames,
  ];
}

interface Draft {
  subcontractor: string;
  work_lead: string;
  contact_phone: string;
  work_type: string;
  /** 「其他（写明）」 chosen: ``work_type`` is what was written. */
  type_other: boolean;
  location: string;
  work_content: string;
  work_start: string;
  work_end: string;
  safety_measures: string;
  approval_conditions: string;
  valid_from: string;
  valid_until: string;
}

/** Where the form starts: what was saved, else what the application holds. */
export function startingDraft(permit: Permit): Draft {
  const form = permit.work_form;
  return {
    subcontractor: form?.subcontractor ?? "",
    work_lead: form ? form.work_lead : permit.applicant_name ?? "",
    contact_phone: form ? form.contact_phone : permit.created_by_phone ?? "",
    work_type: form?.work_type ?? "",
    type_other: false,
    location: form?.location ?? "",
    work_content: form ? form.work_content : permit.note ?? "",
    work_start: toLocalInput(form?.work_start ?? ""),
    work_end: toLocalInput(form?.work_end ?? ""),
    safety_measures: form?.safety_measures ?? "",
    approval_conditions: form?.approval_conditions ?? "",
    valid_from: toLocalInput(form?.valid_from ?? ""),
    valid_until: toLocalInput(form?.valid_until ?? ""),
  };
}

/**
 * What 【保存】 sends. Times go as the moment they name; ``seenSavedAt`` is the
 * save this screen opened, so somebody else's later save is not overwritten.
 */
export function formInput(draft: Draft, seenSavedAt: string | null = null): PermitWorkFormInput {
  return {
    seen_saved_at: seenSavedAt,
    subcontractor: draft.subcontractor.trim(),
    work_lead: draft.work_lead.trim(),
    contact_phone: draft.contact_phone.trim(),
    work_type: draft.work_type.trim(),
    location: draft.location.trim(),
    work_content: draft.work_content.trim(),
    work_start: fromLocalInput(draft.work_start) || null,
    work_end: fromLocalInput(draft.work_end) || null,
    safety_measures: draft.safety_measures.trim(),
    approval_conditions: draft.approval_conditions.trim(),
    valid_from: fromLocalInput(draft.valid_from) || null,
    valid_until: fromLocalInput(draft.valid_until) || null,
  };
}

/** The drop-down's value: a name on the list, 「其他」, or nothing yet. */
export function typeChoice(draft: Pick<Draft, "work_type" | "type_other">, names: readonly string[]) {
  if (draft.type_other) return OTHER_WORK_TYPE;
  if (!draft.work_type) return "";
  // Saved words no longer on the list (renamed or removed since) read as
  // 「其他」 with those words, so nothing is lost or silently swapped.
  return names.includes(draft.work_type) ? draft.work_type : OTHER_WORK_TYPE;
}

/** One read-only line of the form: a label and what the record says. */
function Shown({ label, value, wide = false }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "min-w-0 sm:col-span-2" : "min-w-0"}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}

function SectionBand({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="rounded-md bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary">{children}</h3>
  );
}

/** What the record's own approval says, for 图 2's 「安全经理审批」 rows. */
function useApprovalWords(permit: Permit) {
  const t = useTranslations("permits");
  const df = useDateFormat();
  const approved = permit.status === "VERIFIED" || permit.status === "RESOLVED";
  const returned = permit.status === "RETURNED";
  const decided = (approved || returned) && Boolean(permit.decided_by_name);
  return {
    approved,
    returned,
    decided,
    manager: decided ? [permit.decided_by_name, permit.decided_by_title].filter(Boolean).join(" · ") : "",
    decidedAt: decided && permit.decided_at ? df.dateTime(permit.decided_at) : "",
    result: t(`status.${permit.status}`),
  };
}

/** The photos and files the application brought (图 2 「现场照片及附件」). */
function BroughtIn({ permit }: { permit: Permit }) {
  const t = useTranslations("permits.eForm");
  const common = useTranslations("common");
  const attachments = useQuery({
    queryKey: recordAttachmentsKey("HAZARD", permit.id),
    queryFn: () => getRecordAttachments("HAZARD", permit.id),
  });
  const photos = applicationPhotos(permit);
  const names = otherFileNames(
    permit,
    (attachments.data?.attachments ?? []).map((row) => row.original_name),
  );
  return (
    <div className="space-y-3" data-slot="permit-form-brought-in">
      <SectionBand>{t("photos")}</SectionBand>
      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noPhotos")}</p>
      ) : (
        <ul className="flex flex-wrap gap-3">
          {photos.map((file, index) => (
            <li key={file.id} className="space-y-1 text-center text-xs text-muted-foreground">
              <FileThumbs
                files={[{ id: file.id, name: file.original_name, thumbnail_url: file.thumbnail_url, href: file.photo?.url }]}
              />
              <span className="block">{t("photoN", { n: index + 1 })}</span>
            </li>
          ))}
        </ul>
      )}
      <dl>
        <Shown label={t("otherFiles")} value={names.length ? names.join(common("listSeparator")) : t("none")} wide />
      </dl>
      <QueryFailedNote query={attachments} what={t("what.attachments")} />
    </div>
  );
}

/** 图 2's top rows: what the application already holds. */
function ApplicationFacts({ permit }: { permit: Permit }) {
  const t = useTranslations("permits.eForm");
  const df = useDateFormat();
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border p-3 sm:grid-cols-2">
      <Shown label={t("permitNo")} value={permit.work_form?.permit_no || t("autoNumber")} />
      <Shown label={t("applicationNo")} value={permit.incident_no} />
      <Shown label={t("project")} value={permit.project_name} />
      <Shown label={t("appliedOn")} value={df.date(permit.applied_at)} />
      <Shown
        label={t("applicant")}
        value={[permit.applicant_name, permit.applicant_title].filter(Boolean).join(" · ")}
        wide
      />
    </dl>
  );
}

/** The approval rows, read from the permit (never typed in the form). */
function ApprovalFacts({ permit }: { permit: Permit }) {
  const t = useTranslations("permits.eForm");
  const words = useApprovalWords(permit);
  const later = t("afterSigning");
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border p-3 sm:grid-cols-2">
      {/* S2: a returned permit's reason is a 退回原因, and back in 待审批 it is
          the 上次退回原因 - never this round's 审批意见. */}
      {words.returned ? (
        <Shown label={t("returnReason")} value={permit.review_note} wide />
      ) : words.approved ? (
        <Shown label={t("opinion")} value={permit.review_note} wide />
      ) : (
        <>
          {permit.review_note && <Shown label={t("lastReturnReason")} value={permit.review_note} wide />}
          <Shown label={t("opinion")} value={t("opinionWhere")} wide />
        </>
      )}
      <Shown label={t("result")} value={words.result} wide />
      <Shown label={t("manager")} value={words.manager || later} />
      <Shown label={t("decidedAt")} value={words.decidedAt || later} />
      <div className="min-w-0 sm:col-span-2">
        <dt className="text-xs text-muted-foreground">{t("signature")}</dt>
        <dd className="mt-1">
          {words.approved && permit.signature ? (
            <span className="relative block aspect-3/1 w-48 overflow-hidden rounded-md border bg-switch-thumb">
              <Image src={permit.signature} alt={t("signature")} fill sizes="192px" className="object-contain" unoptimized />
            </span>
          ) : (
            <span className="text-sm font-medium">{later}</span>
          )}
        </dd>
      </div>
    </dl>
  );
}

/**
 * 「填写电子准证」: the form, over the permit window. Kept on this computer
 * while it is open (a dialog closed by mistake keeps the typing); cleared once
 * saved.
 */
export function PermitWorkFormDialog({ permit, onClose }: { permit: Permit; onClose: () => void }) {
  const t = useTranslations("permits.eForm");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl" data-slot="permit-work-form">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("intro")}</DialogDescription>
        </DialogHeader>
        <FieldDraft scope={`permit-form:${permit.id}`}>
          <PermitWorkFormFields permit={permit} onClose={onClose} />
        </FieldDraft>
      </DialogContent>
    </Dialog>
  );
}

export function PermitWorkFormFields({ permit, onClose }: { permit: Permit; onClose: () => void }) {
  const t = useTranslations("permits.eForm");
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const clearDraft = useClearDraft();
  const [draft, setDraft] = useDraftState<Draft>("form", () => startingDraft(permit));
  const [error, setError] = useState("");
  const types = useQuery({ queryKey: PERMIT_WORK_TYPES_KEY, queryFn: getPermitWorkTypes });
  const names = (types.data ?? []).map((row) => row.name);
  const choice = typeChoice(draft, names);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  // The list is head office's page (公司通用分类): offered to whoever keeps it.
  const mayManageTypes = can("category.manage") && can("project.view_all");
  const backwards =
    Boolean(draft.work_start && draft.work_end && draft.work_end < draft.work_start) ||
    Boolean(draft.valid_from && draft.valid_until && draft.valid_until < draft.valid_from);
  const save = useMutation({
    mutationFn: () => saveWorkForm(permit.id, formInput(draft, permit.work_form?.filled_at ?? null)),
    onSuccess: () => {
      setError("");
      clearDraft();
      void queryClient.invalidateQueries({ queryKey: ["permits"] });
      onClose();
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t("failed")),
  });

  return (
    <div className="space-y-4">
      <ApplicationFacts permit={permit} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldWrapper label={t("subcontractor")}>
          <Input value={draft.subcontractor} maxLength={200} onChange={(event) => set("subcontractor", event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("workLead")}>
          <Input value={draft.work_lead} maxLength={150} onChange={(event) => set("work_lead", event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("contactPhone")}>
          <Input value={draft.contact_phone} maxLength={50} inputMode="tel" onChange={(event) => set("contact_phone", event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("workType")}>
          <Select
            value={choice || undefined}
            onValueChange={(value) =>
              setDraft((current) =>
                value === OTHER_WORK_TYPE
                  ? { ...current, type_other: true, work_type: names.includes(current.work_type) ? "" : current.work_type }
                  : { ...current, type_other: false, work_type: value },
              )
            }
          >
            <SelectTrigger className="w-full" aria-label={t("workType")}>
              <SelectValue placeholder={t("chooseType")} />
            </SelectTrigger>
            <SelectContent>
              {names.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
              <SelectItem value={OTHER_WORK_TYPE}>{t("other")}</SelectItem>
            </SelectContent>
          </Select>
          {types.isSuccess && names.length === 0 && (
            <p className="mt-1.5 text-xs text-muted-foreground">{t("typesEmpty")}</p>
          )}
          <QueryFailedNote className="mt-2" query={types} what={t("what.workTypes")} />
          {mayManageTypes && (
            <Link
              href={MANAGE_WORK_TYPES_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-block text-xs text-primary underline underline-offset-2"
            >
              {t("manageTypes")}
            </Link>
          )}
        </FieldWrapper>
      </div>
      {choice === OTHER_WORK_TYPE && (
        <FieldWrapper label={t("workTypeOther")} required>
          <Input value={draft.work_type} maxLength={100} onChange={(event) => set("work_type", event.target.value)} />
        </FieldWrapper>
      )}
      <FieldWrapper label={t("location")} required>
        <Input value={draft.location} maxLength={300} onChange={(event) => set("location", event.target.value)} />
      </FieldWrapper>
      <FieldWrapper label={t("workContent")} required>
        <Textarea rows={3} value={draft.work_content} onChange={(event) => set("work_content", event.target.value)} />
      </FieldWrapper>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldWrapper label={t("workStart")} required>
          <Input type="datetime-local" value={draft.work_start} onChange={(event) => set("work_start", event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("workEnd")} required>
          <Input
            type="datetime-local"
            min={draft.work_start || undefined}
            value={draft.work_end}
            onChange={(event) => set("work_end", event.target.value)}
          />
        </FieldWrapper>
      </div>
      <BroughtIn permit={permit} />
      <FieldWrapper label={t("measures")}>
        <Textarea rows={3} value={draft.safety_measures} onChange={(event) => set("safety_measures", event.target.value)} />
      </FieldWrapper>
      <SectionBand>{t("approvalSection")}</SectionBand>
      <FieldWrapper label={t("conditions")}>
        <Textarea rows={2} value={draft.approval_conditions} onChange={(event) => set("approval_conditions", event.target.value)} />
      </FieldWrapper>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldWrapper label={t("validFrom")} hint={t("validHint")}>
          <Input type="datetime-local" value={draft.valid_from} onChange={(event) => set("valid_from", event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("validUntil")} hint={t("validHint")}>
          <Input
            type="datetime-local"
            min={draft.valid_from || undefined}
            value={draft.valid_until}
            onChange={(event) => set("valid_until", event.target.value)}
          />
        </FieldWrapper>
      </div>
      <ApprovalFacts permit={permit} />
      {backwards && (
        <p role="alert" className="rounded-md bg-warning/10 px-3 py-2 text-sm">
          {t("endBeforeStart")}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button
          className="min-h-11"
          requires={[
            // Only asked once 「其他（写明）」 is chosen; its field shows then.
            [choice !== OTHER_WORK_TYPE || draft.work_type.trim(), t("workTypeOther")],
            [draft.location.trim(), t("location")],
            [draft.work_content.trim(), t("workContent")],
            [draft.work_start, t("workStart")],
            [draft.work_end, t("workEnd")],
          ]}
          disabled={save.isPending || backwards}
          disabledReason={backwards ? t("endBeforeStart") : undefined}
          onClick={() => save.mutate()}
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {t("save")}
        </Button>
      </DialogFooter>
    </div>
  );
}

/**
 * 【查看电子准证】: the same rows as text - for the applicant (「申请人不能修
 * 改」), anybody else who can open the permit, and everyone once it is signed.
 */
export function PermitWorkFormView({ permit, onClose }: { permit: Permit; onClose: () => void }) {
  const t = useTranslations("permits.eForm");
  const df = useDateFormat();
  const form = permit.work_form;
  const when = (value: string | null | undefined) => (value ? df.dateTime(value) : "");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl" data-slot="permit-work-form-view">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("viewIntro")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <ApplicationFacts permit={permit} />
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border p-3 sm:grid-cols-2">
            <Shown label={t("subcontractor")} value={form?.subcontractor} />
            <Shown label={t("workLead")} value={form?.work_lead} />
            <Shown label={t("contactPhone")} value={form?.contact_phone} />
            <Shown label={t("workType")} value={form?.work_type} />
            <Shown label={t("location")} value={form?.location} wide />
            <Shown label={t("workContent")} value={form?.work_content} wide />
            <Shown label={t("workStart")} value={when(form?.work_start)} />
            <Shown label={t("workEnd")} value={when(form?.work_end)} />
          </dl>
          <BroughtIn permit={permit} />
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border p-3 sm:grid-cols-2">
            <Shown label={t("measures")} value={form?.safety_measures} wide />
          </dl>
          <SectionBand>{t("approvalSection")}</SectionBand>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border p-3 sm:grid-cols-2">
            <Shown label={t("conditions")} value={form?.approval_conditions} wide />
            <Shown label={t("validFrom")} value={when(form?.valid_from)} />
            <Shown label={t("validUntil")} value={when(form?.valid_until)} />
          </dl>
          <ApprovalFacts permit={permit} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The saved e-permit's line under 「准证文件」, with 【查看电子准证】. */
export function PermitWorkFormTile({ permit, onView }: { permit: Permit; onView: () => void }) {
  const t = useTranslations("permits.eForm");
  const df = useDateFormat();
  const form = permit.work_form;
  if (!form) return null;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/5 p-2"
      data-slot="permit-work-form-tile"
    >
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <FileSignature className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 break-words">
          {t("tile", {
            no: form.permit_no,
            name: form.filled_by_name ?? "—",
            time: form.filled_at ? df.dateTime(form.filled_at) : "—",
          })}
        </span>
      </span>
      <Button type="button" size="sm" variant="outline" onClick={onView}>
        {t("view")}
      </Button>
    </div>
  );
}
