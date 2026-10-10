"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { RecordSheet } from "@/components/contractor-ops/archive-queue";
import { InPlaceRecord, opensInPlace } from "@/components/shared/in-place-record";
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
 * record popup over the page the reader is on (`InPlaceRecord`, Lucas
 * 2026-10-10: 「关掉还是会保留在刚刚的页面，不会跳转」), its module's own
 * page when that popup only lives inside the module's list, or - for a module
 * with no detail page yet - the shared record sheet, which only reads.
 *
 * `confirm` is for 「等你处理」 (C4): the reader was told the record waits for
 * their 【确认归档】, so the sheet standing in for a missing business page
 * offers it. A dashboard photo opens the sheet without it (F9).
 *
 * `open` returns false when there is nowhere to go, so a caller can leave the
 * item unlinked instead of offering a click that does nothing.
 */
export function useRecordOpener({ confirm = false }: { confirm?: boolean } = {}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [row, setRow] = useState<ArchiveQueueRow<CategoryRecordKind> | null>(null);
  const [inPlace, setInPlace] = useState<{ kind: string; id: string } | null>(null);
  const open = (kind: string, id: string | null | undefined, heading: OpenedRecordHeading) => {
    const target = recordTarget(kind, id);
    if (!target) return false;
    if ("href" in target) {
      if (id && opensInPlace(kind)) {
        setInPlace({ kind, id });
        return true;
      }
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
  const closeInPlace = () => {
    setInPlace(null);
    // A step taken inside (a confirm, a decision) moves the counts and the
    // lists of the page underneath, which no longer reloads on the way back.
    void queryClient.invalidateQueries({ queryKey: ["contractor-dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["archive-queue"] });
  };
  const sheet = row ? (
    <RecordSheet
      row={row}
      fetchRecord={getCategoryRecord}
      confirm={confirm}
      onClose={() => setRow(null)}
    />
  ) : inPlace ? (
    <InPlaceRecord kind={inPlace.kind} id={inPlace.id} onClose={closeInPlace} />
  ) : null;
  return { open, sheet };
}
