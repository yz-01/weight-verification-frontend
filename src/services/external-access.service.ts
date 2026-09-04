/**
 * External Access Portal (架构文档 七、应用层架构).
 *
 * The architecture document lists External Access Portal as one of the six
 * application ends, beside Driver H5 and Field Staff H5. The reader page at
 * `/external/[token]` was already built; what was missing was any way to issue
 * a link, so no reader could ever reach it.
 *
 * A grant is read-only, project-scoped, expiring and revocable. The token is
 * returned exactly once, at creation — only its hash is stored.
 */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  ExternalAccessGrant,
  ExternalAccessGrantInput,
  IssuedExternalAccessGrant,
} from "@/interfaces/external-access";
import { api, toastSuccess } from "@/services/api-client";

export function getExternalAccessGrants(
  query?: ListQuery,
): Promise<Paginated<ExternalAccessGrant>> {
  return api.list<ExternalAccessGrant>(
    "/api/external-access-grants/get_grants/",
    query,
  );
}

export async function createExternalAccessGrant(
  input: ExternalAccessGrantInput,
): Promise<IssuedExternalAccessGrant> {
  const grant = await api.post<IssuedExternalAccessGrant>(
    "/api/external-access-grants/create_grant/",
    input,
  );
  toastSuccess("externalAccess.toast.created");
  return grant;
}

export async function revokeExternalAccessGrant(
  id: string,
  reason: string,
): Promise<ExternalAccessGrant> {
  const grant = await api.post<ExternalAccessGrant>(
    `/api/external-access-grants/${id}/revoke_grant/`,
    { reason },
  );
  toastSuccess("externalAccess.toast.revoked");
  return grant;
}
