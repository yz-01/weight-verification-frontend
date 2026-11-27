/**
 * 菜单名称按公司自定义 (JB251, 客户 11-24 事项 2).
 *
 * The company's own block (公司设置 › 菜单名称, behind the JB239 PIN pass) and
 * MSE's switch on the company page.
 */

import type { MenuNames } from "@/lib/menu-names";
import { api, toastSuccess } from "@/services/api-client";

export interface CompanyMenuNames {
  company: string;
  /** MSE has opened renaming for this company. */
  enabled: boolean;
  /** The names saved - kept while `enabled` is off, shown only while on. */
  names: MenuNames;
  /** Every menu name the company may change, in menu order. */
  keys: string[];
  /** The company's menus (its package's, less what MSE switched off). */
  features: string[];
  languages: string[];
  max_length: number;
}

/** The caller's own company (公司设置). */
export function getOwnMenuNames(): Promise<CompanyMenuNames> {
  return api.get<CompanyMenuNames>("/api/company-menu-names/get_menu_names/");
}

export async function setOwnMenuNames(names: MenuNames): Promise<CompanyMenuNames> {
  const row = await api.post<CompanyMenuNames>("/api/company-menu-names/set_menu_names/", { names });
  toastSuccess("jb251.saved");
  return row;
}

/** One company, for MSE's company page. */
export function getCompanyMenuNames(companyId: string): Promise<CompanyMenuNames> {
  return api.get<CompanyMenuNames>(`/api/companies/${companyId}/get_menu_names/`);
}

export async function setCompanyMenuNamesEnabled(
  companyId: string,
  enabled: boolean,
): Promise<CompanyMenuNames> {
  const row = await api.post<CompanyMenuNames>(
    `/api/companies/${companyId}/set_menu_names_enabled/`,
    { enabled },
  );
  toastSuccess(enabled ? "jb251.mse.openedToast" : "jb251.mse.closedToast");
  return row;
}
