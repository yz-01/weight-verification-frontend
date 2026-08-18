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
    files
      .slice(0, FIELD_EVIDENCE_PHOTO_COUNT)
      .every((file) => Boolean(file))
  );
}

export function FieldEvidenceGrid({
  labels,
  files,
  progressLabel,
  onChange,
}: {
  labels: string[];
  files: FieldEvidenceFiles;
  progressLabel: string;
  onChange: (files: FieldEvidenceFiles) => void;
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
      <p className="mb-3 text-sm text-muted-foreground">{progressLabel}</p>
      <div className="grid grid-cols-2 gap-3">
        {labels.slice(0, FIELD_EVIDENCE_PHOTO_COUNT).map((label, index) => (
          <FieldCamera
            key={`${index}-${label}`}
            label={label}
            fileCount={requiredFiles[index] ? 1 : 0}
            onCapture={(file) =>
              onChange(
                [
                  ...requiredFiles.map((current, itemIndex) =>
                    itemIndex === index ? file : current,
                  ),
                  ...additionalFiles,
                ],
              )
            }
            onClear={() =>
              onChange(
                [
                  ...requiredFiles.map((current, itemIndex) =>
                    itemIndex === index ? undefined : current,
                  ),
                  ...additionalFiles,
                ],
              )
            }
          />
        ))}
        {additionalFiles.map((file, additionalIndex) => {
          const index = FIELD_EVIDENCE_PHOTO_COUNT + additionalIndex;
          return (
            <FieldCamera
              key={`${file.name}-${file.lastModified}-${additionalIndex}`}
              label={t("otherPhotoNumber", { number: additionalIndex + 1 })}
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
        <FieldCamera
          label={t("addOtherPhoto")}
          fileCount={0}
          onCapture={(file) =>
            onChange([...requiredFiles, ...additionalFiles, file])
          }
        />
      </div>
    </div>
  );
}
