import type { CompanyType } from "@/interfaces/company";
import type { ProjectStatus } from "@/interfaces/contractor";

export type PartnershipStatus =
  | "PENDING"
  | "ACTIVE"
  | "REJECTED"
  | "SUSPENDED";

export interface PartnershipProjectBinding {
  id: string;
  project: string;
  project_code: string;
  project_name: string;
  project_status: ProjectStatus;
  created_at: string;
}

export interface CompanyPartnership {
  id: string;
  contractor: string;
  contractor_code: string;
  contractor_name: string;
  recycler: string;
  recycler_code: string;
  recycler_name: string;
  status: PartnershipStatus;
  requested_by_company: string;
  requested_by_company_name: string;
  responded_at: string | null;
  responded_by: string | null;
  response_note: string;
  project_bindings: PartnershipProjectBinding[];
  created_at: string;
  updated_at: string;
}

export interface PartnerCompanyOption {
  id: string;
  code: string;
  name: string;
  type: CompanyType;
  city: string;
  state: string;
}

export interface PartnerProjectOption {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  address_line_1: string;
  city: string;
  state: string;
}

export interface PartnerOptions<T> {
  results: T[];
  count: number;
}
