import type {
  LinkableRequest,
  RecordRequestLinks,
  RequestLinkedRecords,
  RequestLinkRecordKind,
} from "@/interfaces/material-request-link";
import { api, toastSuccess } from "@/services/api-client";

/** JB279: 进场 / 退场 / 领用 ↔ MR / 其他申请. Endpoints in `contractor_ops/material_request_links.py`. */

/** The project's requests a record may be linked to (not returned), newest first. */
export const getLinkableRequests = (project: string) =>
  api.get<{ results: LinkableRequest[] }>("/api/material-request-links/get_options/", { project });

/** A record's linked requests. */
export const getRecordRequestLinks = (kind: RequestLinkRecordKind, record: string) =>
  api.get<RecordRequestLinks>("/api/material-request-links/get_links/", { kind, record });

/** The office makes a record's links exactly `requests` (before it is archived). */
export async function setRecordRequestLinks(
  kind: RequestLinkRecordKind,
  record: string,
  requests: string[],
): Promise<RecordRequestLinks> {
  const row = await api.post<RecordRequestLinks>("/api/material-request-links/set_links/", {
    kind,
    record,
    requests,
  });
  toastSuccess("jb279.link.saved");
  return row;
}

/** One request's linked 进场 / 退场 / 领用 and its quantities. */
export const getRequestLinkedRecords = (request: string) =>
  api.get<RequestLinkedRecords>("/api/material-request-links/get_request_records/", { request });

/** The query keys, so a change on one page refreshes the others. */
export const recordRequestLinksKey = (kind: RequestLinkRecordKind, record: string) =>
  ["material-request-links", "record", kind, record] as const;
export const requestLinkedRecordsKey = (request: string) =>
  ["material-request-links", "request", request] as const;
