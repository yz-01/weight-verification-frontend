import type {
  CorrectableKind,
  CorrectionForm,
  CorrectionHistoryKind,
  CorrectRecordResult,
  RecordCorrectionHistory,
} from "@/interfaces/record-correction";
import { api, toastSuccess } from "@/services/api-client";

/** The fields this record may have corrected, filled with what it holds (I30). */
export function getCorrectionForm(kind: CorrectableKind, record: string): Promise<CorrectionForm> {
  return api.get<CorrectionForm>("/api/record-corrections/get_form/", { kind, record });
}

/** Every correction of one record, oldest first (「改正记录」). */
export function listRecordCorrections(
  kind: CorrectionHistoryKind,
  record: string,
): Promise<RecordCorrectionHistory> {
  return api.get<RecordCorrectionHistory>(
    "/api/record-corrections/list_corrections/",
    { kind, record },
    // The history is a panel under the facts; a failed read says so there.
    { silent: true },
  );
}

/**
 * Correct whitelisted values with a reason (ID70). `expected` is what the
 * dialog showed, so a value somebody else changed meanwhile is refused (409)
 * rather than silently overwritten.
 */
export async function correctRecord(
  kind: CorrectableKind,
  record: string,
  changes: Record<string, string>,
  expected: Record<string, string>,
  reason: string,
): Promise<CorrectRecordResult> {
  const result = await api.post<CorrectRecordResult>("/api/record-corrections/correct_record/", {
    kind,
    record,
    changes,
    expected,
    reason,
  });
  toastSuccess("recordCorrection.toast.saved");
  return result;
}
