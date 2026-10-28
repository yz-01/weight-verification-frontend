"use client";

import { useState } from "react";

import { RecordSheet } from "@/components/contractor-ops/archive-queue";
import { InPlaceRecord, opensInPlace } from "@/components/shared/in-place-record";
import type { ArchiveQueueRow, ArchiveRecordKind } from "@/interfaces/contractor-ops";

/** What the sheet shows in its header before the record loads. */
export interface PackageRecordHeading {
  reference: string;
  project_id: string | null;
  project_name: string;
}

/**
 * Opens one record of a package, over the package (JB49, 客户 10-28 事项 3:
 * 「打开完整业务记录 → 查看所有资料和照片 → 勾选整条记录 → 加入资料包」).
 *
 * The module's own record popup where it stands on its own (a delivery, a
 * material outgoing, an MR, a sundry claim, a consultant application); every
 * other kind in the record centre's full read-only sheet (fields, photos,
 * signatures, corrections, conversation). Never a jump to another page: the
 * package - or the 「添加资料」 list - is still there when it closes.
 */
export function usePackageRecordOpener() {
  const [inPlace, setInPlace] = useState<{ kind: string; id: string } | null>(null);
  const [row, setRow] = useState<ArchiveQueueRow | null>(null);

  const open = (kind: ArchiveRecordKind, id: string, heading: PackageRecordHeading) => {
    if (opensInPlace(kind)) {
      setInPlace({ kind, id });
      return;
    }
    setRow({
      id,
      kind,
      reference: heading.reference,
      detail: "",
      project_id: heading.project_id,
      project_name: heading.project_name,
      submitted_at: "",
      status: "",
      status_label: "",
      photo: null,
      seen_at: null,
      archivable: false,
      archived: null,
    });
  };

  const element = inPlace ? (
    <InPlaceRecord kind={inPlace.kind} id={inPlace.id} onClose={() => setInPlace(null)} />
  ) : row ? (
    <RecordSheet row={row} onClose={() => setRow(null)} />
  ) : null;

  return { open, element };
}
