"use client";

import { useTranslations } from "next-intl";

import { FieldCamera } from "@/components/shared/field-camera";

export const FIELD_EVIDENCE_PHOTO_COUNT = 4;

export type FieldEvidenceFiles = Array<File | undefined>;

export function createEmptyFieldEvidence(): FieldEvidenceFiles {
  return Array.from({ length: FIELD_EVIDENCE_PHOTO_COUNT }, () => undefined);
}

export function completedFieldEvidence(files: FieldEvidenceFiles): File[] {
  return files.filter((file): file is File => Boolean(file));
}

export function hasRequiredFieldEvidence(files: FieldEvidenceFiles): boolean {
  return (
    files.length >= FIELD_EVIDENCE_PHOTO_COUNT &&
    files.slice(0, FIELD_EVIDENCE_PHOTO_COUNT).every((file) => Boolean(file))
  );
}

export function FieldEvidenceGrid({
  labels,
  files,
  progressLabel,
  onChange,
  maxFiles,
}: {
  labels: string[];
  files: FieldEvidenceFiles;
  progressLabel: string;
  onChange: (files: FieldEvidenceFiles) => void;
  /**
   * The most photographs this module accepts, when it has a ceiling (设备进出场
   * 最多 5 张, D-257). The 「添加其他照片」 slot disappears once it is reached,
   * so the phone never lets somebody take a photo the server will refuse.
   */
  maxFiles?: number;
}) {
  const t = useTranslations("fieldStaffPwa.camera");
  const requiredFiles = Array.from(
    { length: FIELD_EVIDENCE_PHOTO_COUNT },
    (_, index) => files[index],
  );
  const additionalFiles = files
    .slice(FIELD_EVIDENCE_PHOTO_COUNT)
    .filter((file): file is File => Boolean(file));

  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">{progressLabel}</p>
      {/* Two across on a phone, as it always was; on the office screen the
          four slots and 「添加其他照片」 sit in one row so the form's submit
          button stays on screen (T-371). */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {labels.slice(0, FIELD_EVIDENCE_PHOTO_COUNT).map((label, index) => (
          <FieldCamera
            key={`${index}-${label}`}
            label={label}
            file={requiredFiles[index]}
            fileCount={requiredFiles[index] ? 1 : 0}
            onCapture={(file) =>
              onChange([
                ...requiredFiles.map((current, itemIndex) =>
                  itemIndex === index ? file : current,
                ),
                ...additionalFiles,
              ])
            }
            onClear={() =>
              onChange([
                ...requiredFiles.map((current, itemIndex) =>
                  itemIndex === index ? undefined : current,
                ),
                ...additionalFiles,
              ])
            }
          />
        ))}
        {additionalFiles.map((file, additionalIndex) => {
          const index = FIELD_EVIDENCE_PHOTO_COUNT + additionalIndex;
          return (
            <FieldCamera
              key={`${file.name}-${file.lastModified}-${additionalIndex}`}
              label={t("otherPhotoNumber", { number: additionalIndex + 1 })}
              file={file}
              fileCount={1}
              onCapture={(replacement) =>
                onChange(
                  files.map((current, itemIndex) =>
                    itemIndex === index ? replacement : current,
                  ),
                )
              }
              onClear={() =>
                onChange(files.filter((_, itemIndex) => itemIndex !== index))
              }
            />
          );
        })}
        {(maxFiles === undefined ||
          completedFieldEvidence(files).length < maxFiles) && (
          <FieldCamera
            label={t("addOtherPhoto")}
            fileCount={0}
            onCapture={(file) =>
              onChange([...requiredFiles, ...additionalFiles, file])
            }
          />
        )}
      </div>
    </div>
  );
}
