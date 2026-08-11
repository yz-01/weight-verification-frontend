import type { ListQuery } from "@/interfaces/api";
import type {
  ContractorDashboard,
  ContractorDashboardSection,
  DashboardSearchResult,
} from "@/interfaces/contractor-dashboard";
import { api, download } from "@/services/api-client";

/**
 * Read the dashboard aggregate.
 *
 * `sections` exists so an auto-refresh poll can ask for just the feeds that
 * move — the server builds only what is named, rather than paying for all
 * eight section groups on every tick.
 */
export function getContractorDashboard(input: {
  date?: string;
  project?: string;
  sections?: ContractorDashboardSection[];
} = {}): Promise<ContractorDashboard> {
  const query: ListQuery = {};
  if (input.date) query.date = input.date;
  if (input.project) query.project = input.project;
  if (input.sections?.length) query.sections = input.sections.join(",");
  return api.get<ContractorDashboard>(
    "/api/contractor-dashboard/get_dashboard/",
    query,
  );
}

export function searchContractorDashboard(input: {
  search: string;
  project?: string;
}): Promise<DashboardSearchResult> {
  const query: ListQuery = { search: input.search };
  if (input.project) query.project = input.project;
  return api.get<DashboardSearchResult>(
    "/api/contractor-dashboard/get_search/",
    query,
  );
}

export function exportContractorDashboard(input: {
  format: "PDF" | "EXCEL";
  date?: string;
  project?: string;
  title: string;
  subtitle: string;
  column_labels: Record<string, string>;
}): Promise<void> {
  return download("/api/contractor-dashboard/export_dashboard/", {
    method: "POST",
    body: input,
    fallbackFilename:
      input.format === "PDF" ? "mse-dashboard.pdf" : "mse-dashboard.xlsx",
  });
}
