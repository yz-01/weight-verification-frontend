/**
 * How a company sets its materials up (2026-10 A4, D1): the unit list
 * (「单位管理」) and the manufacturer list (制造厂商).
 *
 * Both are company-wide lists the office keeps once and every site uses, so
 * they live together here rather than in the per-project services.
 */

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  Manufacturer,
  ManufacturerPayload,
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

export function getManufacturers(query: ListQuery = {}): Promise<Paginated<Manufacturer>> {
  return api.list<Manufacturer>("/api/manufacturers/get_manufacturers/", query);
}

export async function createManufacturer(payload: ManufacturerPayload): Promise<Manufacturer> {
  const row = await api.post<Manufacturer>("/api/manufacturers/create_manufacturer/", payload);
  toastSuccess("manufacturers.toast.created");
  return row;
}

export async function updateManufacturer(
  id: string,
  payload: Partial<ManufacturerPayload>,
): Promise<Manufacturer> {
  const row = await api.patch<Manufacturer>(
    `/api/manufacturers/${id}/update_manufacturer/`,
    payload,
  );
  toastSuccess("manufacturers.toast.updated");
  return row;
}

export async function deleteManufacturer(id: string): Promise<void> {
  await api.delete(`/api/manufacturers/${id}/delete_manufacturer/`);
  toastSuccess("manufacturers.toast.removed");
}

/**
 * Add one from a picker by name alone (D1 「选的时候可以顺手新增」). A name
 * already on the list comes back as that row, so a retry never duplicates.
 */
export function quickAddManufacturer(name: string): Promise<Manufacturer> {
  return api.post<Manufacturer>(
    "/api/manufacturers/quick_add_manufacturer/",
    { name },
    { silent: true },
  );
}
