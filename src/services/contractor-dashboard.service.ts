import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  ContractorDashboard,
  ContractorDashboardSection,
  DashboardSearchResult,
} from "@/interfaces/contractor-dashboard";
import type {
  HeadquartersOverview,
  HeadquartersPhoto,
} from "@/interfaces/headquarters";
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
  /**
   * Ask without complaining if the answer is no.
   *
   * The sidebar badge reads this endpoint on every page load. A reader who
   * may not have it should lose the badge, not be told across the whole page
   * that they lack permission for a screen they are already standing on.
   */
  silent?: boolean;
} = {}): Promise<ContractorDashboard> {
  const query: ListQuery = {};
  if (input.date) query.date = input.date;
  if (input.project) query.project = input.project;
  if (input.sections?.length) query.sections = input.sections.join(",");
  return api.get<ContractorDashboard>(
    "/api/contractor-dashboard/get_dashboard/",
    query,
    { silent: input.silent },
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

/** 公司总部 Dashboard (C13, C15): the company's numbers and each project's. */
export function getHeadquarters(): Promise<HeadquartersOverview> {
  return api.get<HeadquartersOverview>(
    "/api/contractor-dashboard/get_headquarters/",
  );
}

/** 今日现场照片 (C14), a page at a time - the list loads more, never stops. */
export function getHeadquartersPhotos(input: {
  page?: number;
  page_size?: number;
  project?: string;
} = {}): Promise<Paginated<HeadquartersPhoto>> {
  const query: ListQuery = {};
  if (input.page) query.page = input.page;
  if (input.page_size) query.page_size = input.page_size;
  if (input.project) query.project = input.project;
  return api.get<Paginated<HeadquartersPhoto>>(
    "/api/contractor-dashboard/get_headquarters_photos/",
    query,
  );
}
