import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  EvidenceAsset,
  EvidenceIntegrityResult,
  EvidenceRevision,
  EvidenceRevisionPayload,
  OriginalBackupOverview,
} from "@/interfaces/evidence";
import { api, download, toastSuccess } from "@/services/api-client";

/** The technical page: what each person's phone still owes of originals. */
export function getOriginalBackupOverview(): Promise<OriginalBackupOverview> {
  return api.get<OriginalBackupOverview>("/api/evidence-originals/get_backup_overview/");
}

export function getEvidenceAssets(
  query: ListQuery,
): Promise<Paginated<EvidenceAsset>> {
  return api.list<EvidenceAsset>(
    "/api/evidence-assets/get_evidence/",
    query,
  );
}

export function verifyEvidenceIntegrity(
  id: string,
): Promise<EvidenceIntegrityResult> {
  return api.get<EvidenceIntegrityResult>(
    `/api/evidence-assets/${id}/verify_integrity/`,
  );
}

/**
 * The full original behind one photo, as a file (H5 三, WP1). Guarded like
 * the ledger itself; only an original the server has verified is served.
 */
export function downloadEvidenceOriginal(id: string): Promise<void> {
  return download(`/api/evidence-assets/${id}/download_original/`, {
    fallbackFilename: `original-${id}.jpg`,
  });
}

export function getEvidenceRevisions(
  id: string,
): Promise<Paginated<EvidenceRevision>> {
  return api.list<EvidenceRevision>(
    `/api/evidence-assets/${id}/get_revisions/`,
  );
}

/**
 * Record a decision about a piece of evidence.
 *
 * The asset itself is never touched - it is immutable and its hash is what
 * makes it worth anything. What this writes is a separate, equally immutable
 * decision on top of it: hidden, restored, replaced by another asset, or
 * corrected. That is why a reason is mandatory rather than nice to have; the
 * revision *is* the reason, and an unexplained one would leave the archive
 * saying an image was withdrawn with nobody accountable for withdrawing it.
 */
export async function reviseEvidence(
  id: string,
  payload: EvidenceRevisionPayload,
): Promise<EvidenceRevision> {
  const row = await api.post<EvidenceRevision>(
    `/api/evidence-assets/${id}/revise/`,
    payload,
  );
  toastSuccess("evidence.toast.revised");
  return row;
}
