"use client";

/**
 * One 「发送」 of the gate guard, opened (JB35).
 *
 * 客户 10-26 事项 10: 「后台日常照片记录，无论门岗发了几张照片后上专，后台都是要在
 * 一行的事项内」「PDF，GPS不需要再表头内把那些空间腾出来给照片用」. The list
 * shows the press as one row; here it shows everything the row gave up: each
 * record of it with its photo, its own time and GPS, its single PDF, and
 * 「查看」 for the record itself (its conversation, its 沟通).
 */
import { DoorOpen, Eye, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";

import { PhotoStrip } from "@/components/shared/photo-thumb";
import { RecordNo } from "@/components/shared/record-no";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ShellPhoto } from "@/components/shared/record-detail-shell";
import { useDateFormat } from "@/lib/dates";
import type { GateUpload, WallRecord } from "@/lib/gate-photo-wall";
import { photoMeta } from "@/lib/photo-meta";

/** A record's photos for the viewer, each with its own time and GPS. */
export function wallShellPhotos(record: WallRecord): ShellPhoto[] {
  return record.wall_photos.map((photo) => ({
    id: photo.id,
    url: photo.watermarked_image,
    thumbnailUrl: photo.thumbnail,
    label: record.incident_no,
    ...photoMeta(photo, record),
  }));
}

/** Every photo of an upload, in the order taken. */
export function uploadShellPhotos(upload: GateUpload): ShellPhoto[] {
  return upload.records.flatMap(wallShellPhotos);
}

export function GateUploadDetailDialog({
  upload,
  renderPdf,
  onOpenRecord,
  onClose,
}: {
  upload: GateUpload;
  /** The single PDF of one record (the list's 「单笔」, now here). */
  renderPdf: (record: WallRecord) => React.ReactNode;
  onOpenRecord: (id: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("siteControl.gateRecords");
  const df = useDateFormat();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl" data-gate-upload={upload.upload_batch}>
        <DialogHeader>
          <DialogTitle>{t("upload.title", { first: upload.incident_no, last: upload.last_incident_no, count: upload.photo_count })}</DialogTitle>
          <DialogDescription>
            {[upload.project_name, upload.guard_name, df.dateTime(upload.occurred_at)].join(" · ")}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {upload.records.map((record) => (
            <li
              key={record.id}
              data-gate-upload-record={record.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
            >
              <PhotoStrip
                thumbs={record.wall_photos.map((photo) => photo.thumbnail)}
                count={record.wall_photos.length}
                icon={DoorOpen}
                reference={record.incident_no}
                photos={wallShellPhotos(record)}
                squares={2}
              />
              <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                <RecordNo value={record.incident_no} projectCode={record.project_code} />
                <p className="tabular text-xs text-muted-foreground">{df.dateTime(record.occurred_at)}</p>
                <p className="flex items-center gap-1 tabular text-xs">
                  <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                  {record.latitude && record.longitude
                    ? `${record.latitude}, ${record.longitude}`
                    : t("gpsUnavailable")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {renderPdf(record)}
                <Button size="sm" variant="outline" onClick={() => onOpenRecord(record.id)}>
                  <Eye />
                  {t("upload.openRecord")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
