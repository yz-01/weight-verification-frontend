"use client";

/**
 * 「后台发来的文件」 on the phone (JB33).
 *
 * 客户 10-26 事项 9: 「手机端设备退场，页面少了一个文件接收框。这个文件接收框是
 * 用来接收后台发过来的gatepass和文件，请检查现场人员手机端材料和设备退场，文件
 * 接收框。」
 *
 * One box, the same on every exit the phone shows: what the office uploaded
 * with 【上传文件】 (a Gate Pass, a photographed note), the Return Note once
 * filled, and the record's attachments (a Gate Pass sent as a PDF). Read
 * only - opened to look at, or saved - and it says so when nothing has come
 * yet, so an empty box does not read as a broken one.
 *
 * Used by 设备进退场 for the machine's exit under way (`OpenExitOfficeFiles`)
 * and by 我提交过的 for a material or equipment exit.
 */
import { useQuery } from "@tanstack/react-query";
import { Download, Inbox, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { equipmentReturnNoteSource } from "@/components/contractor-ops/equipment-applications";
import { ReturnNotePanel } from "@/components/contractor-ops/return-note";
import { FileThumbs } from "@/components/shared/file-thumbs";
import { RecordAttachmentsPanel, recordAttachmentsKey } from "@/components/shared/record-attachments";
import { getEquipmentMovements } from "@/services/contractor-ops.service";
import { getRecordAttachments } from "@/services/record-attachment.service";

export type OfficeSentKind = "EQUIPMENT_MOVEMENT" | "MATERIAL_OUTGOING";

/** One file the office uploaded onto the record (stage OFFICE). */
export interface OfficeSentFile {
  id: string;
  url: string;
  thumbnailUrl?: string | null;
  /** Its caption, if the office gave one. */
  name?: string;
}

export function OfficeSentFiles({
  kind,
  recordId,
  files,
  returnNote,
}: {
  kind: OfficeSentKind;
  recordId: string;
  files: readonly OfficeSentFile[];
  /** The Return Note, drawn by the caller; only when it has been filled. */
  returnNote?: React.ReactNode;
}) {
  const t = useTranslations("fieldStaffPwa.officeFiles");
  // The same query the attachments panel reads (one request): its count
  // decides whether the box is empty.
  const attachments = useQuery({
    queryKey: recordAttachmentsKey(kind, recordId),
    queryFn: () => getRecordAttachments(kind, recordId),
  });
  const attachmentCount = attachments.data?.attachments.length ?? 0;
  const empty =
    files.length === 0 && !returnNote && attachments.isSuccess && attachmentCount === 0;
  return (
    <section
      data-testid="office-sent-files"
      className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-3"
    >
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Inbox className="size-4 text-primary" />
          {t("title")}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("hint")}</p>
      </div>
      {empty ? (
        <p className="rounded-lg border border-dashed bg-background/60 p-3 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <>
          {files.length > 0 && (
            <ul className="space-y-1.5" data-slot="office-files">
              {files.map((file, index) => {
                const name = file.name || t("fileName", { number: index + 1 });
                return (
                  <li
                    key={file.id}
                    className="flex min-w-0 items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
                  >
                    <FileThumbs
                      files={[{ id: file.id, name, thumbnail_url: file.thumbnailUrl || file.url, href: file.url }]}
                    />
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-primary underline-offset-4 hover:underline"
                    >
                      {name}
                    </a>
                    <a
                      href={file.url}
                      download
                      className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
                    >
                      <Download className="size-3.5" />
                      {t("download")}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          {returnNote}
          {/* Drawn while it loads, and when the read fails - the panel says
              so, with 重试; hidden only once it is known to hold nothing. */}
          {(attachments.isError || !(attachments.isSuccess && attachmentCount === 0)) && (
            <RecordAttachmentsPanel kind={kind} recordId={recordId} readOnly />
          )}
        </>
      )}
    </section>
  );
}

/**
 * The box for a machine's exit under way, on 设备进退场 (JB33).
 *
 * Read from the office's own list by the movement's id: the exit may have been
 * applied for by another worker on this site, so it is not in this worker's
 * 我提交过的. The phone reads the machines with the same permission.
 */
export function OpenExitOfficeFiles({ movementId }: { movementId: string }) {
  const t = useTranslations("fieldStaffPwa.officeFiles");
  const words = useTranslations("contractorOps");
  const movement = useQuery({
    queryKey: ["equipment-movements", "office-files", movementId],
    queryFn: () => getEquipmentMovements({ id: movementId, page_size: 1 }),
  });
  const row = movement.data?.results[0];
  if (movement.isLoading) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {t("loading")}
      </p>
    );
  }
  if (!row) {
    return movement.isError ? (
      <p role="alert" className="text-xs text-destructive">
        {t("loadFailed")}
      </p>
    ) : null;
  }
  return (
    <OfficeSentFiles
      kind="EQUIPMENT_MOVEMENT"
      recordId={row.id}
      files={row.photos
        .filter((photo) => photo.stage === "OFFICE")
        .map((photo) => ({ id: photo.id, url: photo.watermarked || photo.image }))}
      returnNote={
        row.has_return_note ? (
          <ReturnNotePanel
            machine
            row={equipmentReturnNoteSource(row, words("equipmentExit.unitMachine"))}
          />
        ) : undefined
      }
    />
  );
}
