import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  EvidenceAsset,
  EvidenceIntegrityResult,
} from "@/interfaces/evidence";
import { api } from "@/services/api-client";

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
