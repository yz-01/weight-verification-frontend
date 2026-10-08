"use client";

/**
 * E6 (Lucas 2026-10-07): a draft is a draft.
 *
 * On a consultant application's detail, 「关联现场证据」「关联现场资料」「申请附件」
 * could only be added to. While the application is still a draft - including
 * the new version made after it was returned for revision - anything added by
 * mistake can now come off again or be corrected, without starting over:
 *
 *   - an attachment: removed, its file replaced, its type and note changed;
 *   - a linked photo: unlinked, re-captioned, moved up or down;
 *   - a related site record: taken off, which unlinks the photos behind it.
 *
 * Removing uses the product's anti-mistap switch (spec rule 8): the switch
 * arms the Remove buttons, and a press takes effect at once - no confirm
 * dialog. Once submitted none of these controls is drawn and the block says
 * why (`draftEdit.locked`); the server refuses with 409 regardless.
 */

import { useMutation } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  ZoomIn,
  Lock,
  Paperclip,
  Pencil,
  Save,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

import { FieldWrapper } from "@/components/shared/page-primitives";
import { PhotoViewer, type ShellPhoto } from "@/components/shared/record-detail-shell";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  ApplicationAttachment,
  ApplicationRelatedRecord,
  ConsultantApplication,
} from "@/interfaces/consultant-workflow";
import {
  removeApplicationAttachment,
  reorderApplicationEvidence,
  unlinkApplicationEvidence,
  updateApplicationAttachment,
  updateApplicationEvidenceCaption,
} from "@/services/consultant-workflow.service";

/** The attachment types the add dialog offers; editing offers the same. */
export const ATTACHMENT_TYPES = [
  "CHECKLIST",
  "IFC_DRAWING",
  "SURVEY_REPORT",
  "MATERIAL_TEST",
  "CALIBRATION",
  "ITP",
  "OTHER",
] as const;

/** The switch that arms a block's Remove buttons (spec rule 8, no dialog). */
export function RemoveSwitch({
  armed,
  onArmedChange,
}: {
  armed: boolean;
  onArmedChange: (armed: boolean) => void;
}) {
  const t = useTranslations("consultantWorkflow");
  return (
    <label
      className="flex items-center gap-2 rounded-lg border px-2 py-1.5"
      title={t("draftEdit.armRemoveHelp")}
    >
      <Switch
        checked={armed}
        onCheckedChange={onArmedChange}
        aria-label={t("draftEdit.armRemove")}
      />
      <span className="text-xs text-muted-foreground">{t("draftEdit.armRemove")}</span>
    </label>
  );
}

/** Said in place of the controls once the application has been submitted. */
export function LockedNote() {
  const t = useTranslations("consultantWorkflow");
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-draft-locked>
      <Lock className="size-3.5 shrink-0" />
      {t("draftEdit.locked")}
    </p>
  );
}

/**
 * The linked photos as the shared viewer pages through them (2026-10 C1):
 * the stamped copy when there is one - it is the evidence - else the file.
 */
export function evidenceViewerPhotos(
  links: ConsultantApplication["evidence_links"],
): ShellPhoto[] {
  return links.map((link) => ({
    id: link.id,
    url: link.evidence_watermarked_file || link.evidence_file,
    label: link.caption || link.original_filename,
    takenAt: link.captured_at,
    latitude: link.latitude,
    longitude: link.longitude,
  }));
}

export function EvidenceLinkCards({
  application,
  editable,
  armed,
  onChanged,
}: {
  application: ConsultantApplication;
  editable: boolean;
  armed: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("consultantWorkflow");
  const [editing, setEditing] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  // A tap opens the shared viewer - zoom, print, download (C1) - instead of
  // a bare link to the file.
  const [viewing, setViewing] = useState<number | null>(null);
  const links = application.evidence_links;
  const photos = evidenceViewerPhotos(links);
  const unlink = useMutation({
    mutationFn: (ids: string[]) => unlinkApplicationEvidence(application.id, ids),
    onSuccess: onChanged,
  });
  const saveCaption = useMutation({
    mutationFn: (link: string) =>
      updateApplicationEvidenceCaption(application.id, link, caption),
    onSuccess: () => {
      setEditing(null);
      onChanged();
    },
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderApplicationEvidence(application.id, ids),
    onSuccess: onChanged,
  });
  const move = (index: number, by: -1 | 1) => {
    const ids = links.map((link) => link.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + by, 0, moved);
    reorder.mutate(ids);
  };
  const busy = unlink.isPending || saveCaption.isPending || reorder.isPending;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {links.map((link, index) => (
        <div
          key={link.id}
          className="group min-w-0 overflow-hidden rounded-lg border bg-card"
          data-evidence-link={link.id}
        >
          <button
            type="button"
            data-photo-open={index}
            aria-label={t("evidence.open", { name: link.caption || link.original_filename })}
            onClick={() => setViewing(index)}
            className="block w-full transition-colors hover:bg-muted/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <div className="photo-hatch relative aspect-[4/3] overflow-hidden">
              <Image
                src={link.evidence_watermarked_file || link.evidence_file}
                alt={link.caption || link.original_filename}
                fill
                unoptimized
                className="object-cover transition-transform group-hover:scale-[1.02]"
              />
              <span className="absolute right-1.5 bottom-1.5 grid size-7 place-items-center rounded-full bg-background/85 text-foreground shadow-sm">
                <ZoomIn className="size-4" />
              </span>
            </div>
          </button>
          <div className="space-y-1 p-3">
            {editing === link.id ? (
              <div className="flex items-center gap-1.5">
                <Input
                  value={caption}
                  aria-label={t("evidence.caption")}
                  className="h-8 text-sm"
                  maxLength={255}
                  onChange={(event) => setCaption(event.target.value)}
                />
                <Button
                  size="icon-sm"
                  aria-label={t("draftEdit.saveCaption")}
                  disabled={saveCaption.isPending}
                  onClick={() => saveCaption.mutate(link.id)}
                >
                  {saveCaption.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("action.cancel")}
                  onClick={() => setEditing(null)}
                >
                  <X />
                </Button>
              </div>
            ) : (
              <p className="truncate text-sm font-medium">{link.caption || link.original_filename}</p>
            )}
            <p className="truncate text-xs text-muted-foreground">
              {link.photographer_name || t("common.unknown")} - {new Date(link.captured_at).toLocaleString()}
            </p>
            <p className="truncate font-mono text-2xs text-muted-foreground">{link.sha256}</p>
            {editable && (
              <div className="flex flex-wrap items-center gap-1 pt-1" data-draft-controls>
                {editing !== link.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setCaption(link.caption);
                      setEditing(link.id);
                    }}
                  >
                    <Pencil />
                    {t("draftEdit.editCaption")}
                  </Button>
                )}
                {index > 0 && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("draftEdit.moveUp")}
                    disabled={busy}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp />
                  </Button>
                )}
                {index < links.length - 1 && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("draftEdit.moveDown")}
                    disabled={busy}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown />
                  </Button>
                )}
                {armed && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="ml-auto"
                    disabled={busy}
                    onClick={() => unlink.mutate([link.id])}
                    data-draft-remove
                  >
                    {unlink.isPending ? <Loader2 className="animate-spin" /> : <Unlink />}
                    {t("draftEdit.unlink")}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
      {viewing !== null && photos[viewing] ? (
        <PhotoViewer
          photos={photos}
          index={viewing}
          reference={application.application_no}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}

/** Take a related site record off: unlinks the photos that brought it here. */
export function RelatedRecordRemove({
  application,
  record,
  onChanged,
}: {
  application: ConsultantApplication;
  record: ApplicationRelatedRecord;
  onChanged: () => void;
}) {
  const t = useTranslations("consultantWorkflow");
  const unlink = useMutation({
    mutationFn: () => unlinkApplicationEvidence(application.id, record.evidence_link_ids),
    onSuccess: onChanged,
  });
  if (!record.removable || !record.evidence_link_ids.length) return null;
  return (
    <Button
      size="sm"
      variant="destructive"
      className="shrink-0"
      title={t("draftEdit.recordUnlinkHint")}
      disabled={unlink.isPending}
      onClick={() => unlink.mutate()}
      data-draft-remove
    >
      {unlink.isPending ? <Loader2 className="animate-spin" /> : <Unlink />}
      {t("draftEdit.remove")}
    </Button>
  );
}

export function AttachmentRows({
  application,
  editable,
  armed,
  onChanged,
}: {
  application: ConsultantApplication;
  editable: boolean;
  armed: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("consultantWorkflow");
  const [editing, setEditing] = useState<ApplicationAttachment | null>(null);
  const remove = useMutation({
    mutationFn: (attachment: string) => removeApplicationAttachment(application.id, attachment),
    onSuccess: onChanged,
  });
  const typeLabel = (code: string) => {
    if (!code) return t("attachment.other");
    return t.has(`attachmentType.${code}`) ? t(`attachmentType.${code}`) : code;
  };

  return (
    <>
      <div className="divide-y rounded-lg border">
        {application.attachments.map((attachment) => (
          <div key={attachment.id} className="flex min-w-0 flex-wrap items-center gap-3 p-3" data-attachment={attachment.id}>
            <a
              href={attachment.file}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 flex-1 items-center gap-3 transition-colors hover:text-primary"
            >
              <Paperclip className="size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{attachment.original_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {typeLabel(attachment.category)} - {formatBytes(attachment.byte_size)}
                </p>
                {attachment.note && (
                  <p className="truncate text-xs text-muted-foreground">{attachment.note}</p>
                )}
              </div>
            </a>
            {editable && (
              <div className="flex shrink-0 items-center gap-1" data-draft-controls>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={remove.isPending}
                  onClick={() => setEditing(attachment)}
                >
                  <Pencil />
                  {t("draftEdit.edit")}
                </Button>
                {armed && (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(attachment.id)}
                    data-draft-remove
                  >
                    {remove.isPending && remove.variables === attachment.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Trash2 />
                    )}
                    {t("draftEdit.remove")}
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {editing && (
        <AttachmentEditDialog
          application={application}
          attachment={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </>
  );
}

function AttachmentEditDialog({
  application,
  attachment,
  onClose,
  onSaved,
}: {
  application: ConsultantApplication;
  attachment: ApplicationAttachment;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("consultantWorkflow");
  const [category, setCategory] = useState(attachment.category || "OTHER");
  const [note, setNote] = useState(attachment.note);
  const [file, setFile] = useState<File | null>(null);
  const save = useMutation({
    mutationFn: () =>
      updateApplicationAttachment(application.id, attachment.id, { category, note, file }),
    onSuccess: onSaved,
  });
  const changed =
    Boolean(file) || category !== (attachment.category || "OTHER") || note !== attachment.note;
  const types: string[] = [...ATTACHMENT_TYPES];
  // An older attachment may carry a type this list no longer offers; keep
  // it choosable so opening the dialog does not silently change it.
  if (attachment.category && !types.includes(attachment.category)) types.push(attachment.category);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("draftEdit.attachmentTitle")}</DialogTitle>
          <DialogDescription>{t("draftEdit.attachmentHelp")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="flex items-center gap-2 truncate rounded-lg border bg-muted/30 p-3 text-sm">
            <Paperclip className="size-4 shrink-0 text-primary" />
            {attachment.original_name}
          </p>
          <FieldWrapper label={t("draftEdit.replaceFile")} hint={t("draftEdit.replaceFileHint")}>
            <Input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </FieldWrapper>
          <FieldWrapper label={t("attachment.category")}>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t.has(`attachmentType.${value}`) ? t(`attachmentType.${value}`) : value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("attachment.note")}>
            <Textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
          </FieldWrapper>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            disabled={save.isPending}
            // Nothing changed is not an error to report; it is just done.
            onClick={() => (changed ? save.mutate() : onClose())}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {t("draftEdit.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
