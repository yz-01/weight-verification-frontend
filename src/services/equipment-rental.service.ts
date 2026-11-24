/**
 * 设备租赁设定 and the month's rental fees (JB255, 客户 11-24b 事项 2).
 *
 * Every write asks for the six-digit sign-off PIN on the server
 * (「填写或修改金额前，须输入六位数密码」); the API client opens the PIN box
 * when the server asks for it.
 */

import type { DieselSupply, RentalMachines, RentalMethod, RentalTermsValues } from "@/interfaces/equipment-hours";
import { api, toastSuccess } from "@/services/api-client";

export function listRentalMachines(project: string): Promise<RentalMachines> {
  return api.get<RentalMachines>("/api/equipment-rental/list_machines/", { project });
}

export interface RentalTermsPayload {
  project: string;
  equipment: string;
  method: RentalMethod;
  unit_price: string;
  standard_days: number | null;
  normal_hours_per_day: string | null;
  overtime_rate: string | null;
  extra_day_rate: string | null;
  stoppage_terms: string;
  start_date: string;
  end_date: string | null;
  diesel_supply: DieselSupply;
  remarks: string;
}

export async function setRentalTerms(payload: RentalTermsPayload): Promise<RentalTermsValues> {
  const saved = await api.post<RentalTermsValues>("/api/equipment-rental/set_terms/", payload);
  toastSuccess("equipmentRental.toast.termsSaved");
  return saved;
}

export interface RentalMonthAmountsPayload {
  project: string;
  equipment: string;
  month: string;
  diesel_fee?: string | null;
  adjustment?: string | null;
  reason?: string;
}

export async function setRentalMonthAmounts(payload: RentalMonthAmountsPayload): Promise<void> {
  await api.post("/api/equipment-rental/set_month_amounts/", payload);
  toastSuccess("equipmentRental.toast.amountsSaved");
}

export async function confirmRentalMonth(payload: {
  project: string;
  month: string;
  equipment: string[];
}): Promise<{ month: string; confirmed: string[] }> {
  const answer = await api.post<{ month: string; confirmed: string[] }>(
    "/api/equipment-rental/confirm_month/",
    payload,
  );
  toastSuccess("equipmentRental.toast.confirmed");
  return answer;
}
