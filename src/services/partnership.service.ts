import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  CompanyPartnership,
  PartnerCompanyOption,
  PartnerProjectOption,
  PartnershipStatus,
} from "@/interfaces/partnership";
import type { CompanyType } from "@/interfaces/company";
import { api, toastSuccess } from "@/services/api-client";

export function getPartnerships(
  query: ListQuery,
): Promise<Paginated<CompanyPartnership>> {
  return api.list<CompanyPartnership>(
    "/api/partnerships/get_partnerships/",
    query,
  );
}

export function getAvailablePartnerCompanies(
  options?: string | { search?: string; type?: CompanyType },
): Promise<{ results: PartnerCompanyOption[]; count: number }> {
  const query =
    typeof options === "string"
      ? options
        ? { search: options }
        : undefined
      : options;
  return api.get<{ results: PartnerCompanyOption[]; count: number }>(
    "/api/partnerships/get_available_companies/",
    query,
  );
}

export async function requestPartnership(
  company: string,
): Promise<CompanyPartnership> {
  const partnership = await api.post<CompanyPartnership>(
    "/api/partnerships/request_partnership/",
    { company },
  );
  toastSuccess("recyclers.toast.requested");
  return partnership;
}

export async function respondPartnership(
  id: string,
  statusOrPayload:
    | Extract<PartnershipStatus, "ACTIVE" | "REJECTED">
    | {
        status: Extract<PartnershipStatus, "ACTIVE" | "REJECTED">;
        note?: string;
      },
  responseNote = "",
): Promise<CompanyPartnership> {
  const status =
    typeof statusOrPayload === "string"
      ? statusOrPayload
      : statusOrPayload.status;
  const note =
    typeof statusOrPayload === "string"
      ? responseNote
      : (statusOrPayload.note ?? "");
  const partnership = await api.post<CompanyPartnership>(
    `/api/partnerships/${id}/respond_partnership/`,
    { status, note },
  );
  toastSuccess(
    status === "ACTIVE"
      ? "recyclers.toast.accepted"
      : "recyclers.toast.rejected",
  );
  return partnership;
}

export async function suspendPartnership(
  id: string,
  note: string,
): Promise<CompanyPartnership> {
  const partnership = await api.post<CompanyPartnership>(
    `/api/partnerships/${id}/suspend_partnership/`,
    { note },
  );
  toastSuccess("recyclers.toast.suspended");
  return partnership;
}

export function getAvailablePartnerProjects(
  id: string,
): Promise<{ results: PartnerProjectOption[]; count: number }> {
  return api.get<{ results: PartnerProjectOption[]; count: number }>(
    `/api/partnerships/${id}/get_available_projects/`,
  );
}

export async function bindPartnershipProject(
  id: string,
  project: string,
): Promise<CompanyPartnership> {
  const partnership = await api.post<CompanyPartnership>(
    `/api/partnerships/${id}/bind_project/`,
    { project },
  );
  toastSuccess("recyclers.toast.projectBound");
  return partnership;
}

export async function unbindPartnershipProject(
  id: string,
  binding: string,
  reason = "",
): Promise<void> {
  await api.post(`/api/partnerships/${id}/unbind_project/`, {
    binding,
    reason,
  });
  toastSuccess("recyclers.toast.projectUnbound");
}
