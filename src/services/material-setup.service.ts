/**
 * How a company sets its materials up (2026-10 A4, D1): the unit list
 * (「单位管理」) and the manufacturer list (制造厂商).
 *
 * Both are company-wide lists the office keeps once and every site uses, so
 * they live together here rather than in the per-project services.
 */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  FormerManufacturer,
  Manufacturer,
  MaterialUnitOption,
} from "@/interfaces/contractor";
import { api, toastSuccess } from "@/services/api-client";

// ---------------------------------------------------------------- units

/** The company's units; switched-off ones only when the office asks. */
export function getMaterialUnits(includeInactive = false): Promise<MaterialUnitOption[]> {
  return api.get<MaterialUnitOption[]>(
    "/api/material-units/get_units/",
    includeInactive ? { include_inactive: "true" } : undefined,
  );
}

export async function createMaterialUnit(payload: {
  label: string;
  code?: string;
}): Promise<MaterialUnitOption> {
  const row = await api.post<MaterialUnitOption>("/api/material-units/create_unit/", payload);
  toastSuccess("categoryManagement.units.toast.created");
  return row;
}

export async function updateMaterialUnit(
  id: string,
  payload: Partial<Pick<MaterialUnitOption, "label" | "is_active" | "sort_order">>,
): Promise<MaterialUnitOption> {
  const row = await api.post<MaterialUnitOption>(
    `/api/material-units/${id}/update_unit/`,
    payload,
  );
  toastSuccess("categoryManagement.units.toast.updated");
  return row;
}

// --------------------------------------------------------- manufacturers

/**
 * The choices for 指定厂商（MR）: the supplier list, names only (2026-10-10).
 * A manufacturer is a supplier; there is no second list to keep.
 */
export function getManufacturers(query: ListQuery = {}): Promise<Paginated<Manufacturer>> {
  return api.list<Manufacturer>("/api/manufacturers/get_manufacturers/", query);
}

/** The retired manufacturer list, read-only, with the supplier each entry became. */
export function getFormerManufacturers(): Promise<FormerManufacturer[]> {
  return api.get<FormerManufacturer[]>("/api/manufacturers/get_former_list/");
}
