"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { RecordSheet } from "@/components/contractor-ops/archive-queue";
import type { ArchiveQueueRow, CategoryRecordKind } from "@/interfaces/contractor-ops";
import { recordTarget } from "@/lib/record-routes";
import { getCategoryRecord } from "@/services/contractor-ops.service";

/** What the read-only sheet shows in its header before the record loads. */
export interface OpenedRecordHeading {
  reference: string;
  project_id: string | null;
  project_name: string;
  submitted_at: string | null;
  photo?: string | null;
}

/**
 * Opens one record where `recordTarget` says it lives (F9): its module's own
 * page, or - for a module with no detail page yet - the shared record sheet,
 * read-only, with no 确认归档 and no 我看过了.
 *
 * `open` returns false when there is nowhere to go, so a caller can leave the
 * item unlinked instead of offering a click that does nothing.
 */
export function useRecordOpener() {
  const router = useRouter();
  const [row, setRow] = useState<ArchiveQueueRow<CategoryRecordKind> | null>(null);
  const open = (kind: string, id: string | null | undefined, heading: OpenedRecordHeading) => {
    const target = recordTarget(kind, id);
    if (!target) return false;
    if ("href" in target) {
      router.push(target.href);
      return true;
    }
    setRow({
      id: target.id,
      kind: target.sheet,
      reference: heading.reference,
      detail: "",
      project_id: heading.project_id,
      project_name: heading.project_name,
      submitted_at: heading.submitted_at ?? "",
      status: "",
      status_label: "",
      photo: heading.photo ?? null,
      seen_at: null,
      archivable: false,
      archived: null,
    });
    return true;
  };
  const sheet = row ? (
    <RecordSheet
      row={row}
      fetchRecord={getCategoryRecord}
      readOnly
      onClose={() => setRow(null)}
    />
  ) : null;
  return { open, sheet };
}
