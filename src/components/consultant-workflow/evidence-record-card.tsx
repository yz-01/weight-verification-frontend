"use client";

/**
 * One record in 关联现场证据's picker (JB269, 客户 11-26 事项 10, 图 12):
 * 「请统一每条记录的显示方式，直接展示照片缩略图、事项编号、材料名称、规格、上传人及
 * 日期时间。点击缩略图可以放大查看，支持整条事项勾选及单张照片勾选，无须逐条展开寻找。」
 *
 * Every module's record looks the same: its number · module · name (the
 * material, for a delivery), then 规格 · 上传人 · 日期时间, then every photo as
 * a thumbnail with its own tick. The record's tick takes all of them; a
 * thumbnail opens the photo large (the one viewer every record uses). Never a
 * table's name, an id or a file name as the record's name (事项 9: 「统一中英文
 * 界面显示」).
 */

import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";

import { Checkbox } from "@/components/ui/checkbox";
import type { EvidenceCandidate } from "@/interfaces/consultant-workflow";
import { useDateFormat } from "@/lib/dates";
import { MODULE_LABEL_PATH, rowModuleKey } from "@/lib/evidence-filters";

export interface EvidenceRecordCardProps {
  rows: readonly EvidenceCandidate[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  onToggleRecord: () => void;
  /** Opens the record's photos large, at this photo. */
  onOpen: (photoIndex: number) => void;
}

/** The record's name in the reader's language: module, and its own name. */
export function useEvidenceRecordLabel() {
  const root = useTranslations();
  const t = useTranslations("jb269");
  return (row: EvidenceCandidate) => {
    const key = rowModuleKey(row);
    const path = MODULE_LABEL_PATH[key];
    // Not `module`: Next's lint refuses that name for a variable.
    const moduleName = path ? root(path) : root("consultantWorkflow.evidence.moduleName.other");
    const title =
      row.record_title || (row.record_type === "SITE_PROGRESS" ? t("unclassified") : "");
    return { reference: row.record_reference || t("noNumber"), module: moduleName, title };
  };
}

export function EvidenceRecordCard({ rows, selected, onToggle, onToggleRecord, onOpen }: EvidenceRecordCardProps) {
  const t = useTranslations("jb269");
  const tw = useTranslations("consultantWorkflow");
  const df = useDateFormat();
  const label = useEvidenceRecordLabel();
  const first = rows[0];
  const { reference, module: moduleName, title } = label(first);
  const allSelected = rows.every((row) => selected.includes(row.id));
  const uploader = first.record_uploader || first.photographer_name || tw("common.unknown");
  const when = df.dateTime(first.record_date || first.captured_at);
  // Each photo's place among the record's photos (a file in between is not
  // one), for the viewer it opens.
  const photoIds = rows.filter((row) => row.kind === "PHOTO").map((row) => row.id);
  return (
    <div
      data-evidence-record={first.record_key}
      className={`rounded-lg border p-3 ${allSelected ? "border-primary ring-2 ring-primary/20" : ""}`}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={allSelected}
          onCheckedChange={onToggleRecord}
          aria-label={tw("evidence.selectRecord")}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="min-w-0">
            <p className="font-medium" data-slot="record-name">
              {[reference, moduleName, title].filter(Boolean).join(" · ")}
            </p>
            <p className="text-xs text-muted-foreground" data-slot="record-facts">
              {[
                first.record_spec ? t("spec", { spec: first.record_spec }) : "",
                t("uploader", { name: uploader }),
                when,
                t("count", { count: rows.length }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {rows.map((row) => {
              const checked = selected.includes(row.id);
              const isPhoto = row.kind === "PHOTO";
              const index = photoIds.indexOf(row.id);
              const image = row.thumbnail_url || row.watermarked_file || row.file;
              return (
                <div
                  key={row.id}
                  className={`relative w-24 overflow-hidden rounded-md border bg-muted ${checked ? "border-primary ring-2 ring-primary/30" : ""}`}
                >
                  {isPhoto ? (
                    <button
                      type="button"
                      className="relative block aspect-4/3 w-full"
                      onClick={() => onOpen(index)}
                      aria-label={t("enlarge", { n: index + 1 })}
                      title={t("enlarge", { n: index + 1 })}
                    >
                      <Image src={image} alt={t("enlarge", { n: index + 1 })} fill unoptimized className="object-cover" />
                    </button>
                  ) : (
                    <a
                      href={row.watermarked_file || row.file}
                      target="_blank"
                      rel="noreferrer"
                      className="grid aspect-4/3 w-full place-items-center p-1 text-center text-2xs text-muted-foreground"
                      title={t("openFile")}
                    >
                      <FileText className="size-5" aria-hidden />
                      <span className="line-clamp-2 break-all">{t("openFile")}</span>
                    </a>
                  )}
                  <span className="absolute left-1 top-1 rounded bg-background/90 p-0.5">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => onToggle(row.id)}
                      aria-label={t("selectPhoto", { n: rows.indexOf(row) + 1 })}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
