/** The recycler console's API surface.

Deductions and settlements live here rather than in the contractor service even
though a contractor uses them too. They belong to the flow that produces them —
a load arrives, is weighed, is argued over, is paid for — and splitting that by
which company is looking would put half a conversation in each file.
*/

import type { ListQuery, Paginated } from "@/interfaces/api";
import type { WasteDispatch } from "@/interfaces/contractor";
import type {
  Deduction,
  DeductionDecision,
  DeductionPayload,
  Driver,
  DriverPayload,
  DriverTask,
  DriverTaskDetail,
  DriverTaskPayload,
  GateBinding,
  ScanDispatchPayload,
  Settlement,
  SettlementQuote,
  TransactionReport,
  TaskState,
  Vehicle,
  VehiclePayload,
} from "@/interfaces/recycler";
import { api, download, toastSuccess } from "@/services/api-client";
import type { ExportRequest } from "@/services/contractor.service";

/** Loads on their way here. A contractor calling this correctly sees nothing. */
export function getIncoming(
  query: ListQuery,
): Promise<Paginated<WasteDispatch>> {
  return api.list<WasteDispatch>("/api/dispatches/get_incoming/", query);
}

export async function collectDispatch(
  id: string,
  recyclerReference: string,
): Promise<WasteDispatch> {
  const dispatch = await api.post<WasteDispatch>(
    `/api/dispatches/${id}/collect_dispatch/`,
    { recycler_reference: recyclerReference },
  );
  toastSuccess("incoming.toast.collected");
  return dispatch;
}

export function getVehicles(query: ListQuery): Promise<Paginated<Vehicle>> {
  return api.list<Vehicle>("/api/vehicles/get_vehicles/", query);
}

export function getVehicle(id: string): Promise<Vehicle> {
  return api.get<Vehicle>(`/api/vehicles/${id}/get_vehicle/`);
}

export async function createVehicle(payload: VehiclePayload): Promise<Vehicle> {
  const vehicle = await api.post<Vehicle>(
    "/api/vehicles/create_vehicle/",
    payload,
  );
  toastSuccess("vehicles.toast.created");
  return vehicle;
}

export async function updateVehicle(
  id: string,
  payload: Partial<VehiclePayload>,
): Promise<Vehicle> {
  const vehicle = await api.patch<Vehicle>(
    `/api/vehicles/${id}/update_vehicle/`,
    payload,
  );
  toastSuccess("vehicles.toast.updated");
  return vehicle;
}

export async function deleteVehicle(id: string): Promise<void> {
  await api.delete(`/api/vehicles/${id}/delete_vehicle/`);
  toastSuccess("vehicles.toast.removed");
}

/**
 * Record a lorry's empty weight.
 *
 * Its own call, with a mandatory reason, because on a yard weighing against a
 * stored tare this figure is subtracted from every load that lorry ever brings
 * in. It is not a field on the edit form for the same reason.
 */
export async function setVehicleTare(
  id: string,
  tareWeightKg: string,
  reason: string,
): Promise<Vehicle> {
  const vehicle = await api.post<Vehicle>(`/api/vehicles/${id}/set_tare/`, {
    tare_weight_kg: tareWeightKg,
    reason,
  });
  toastSuccess("vehicles.toast.tareSet");
  return vehicle;
}

export function getDrivers(query: ListQuery): Promise<Paginated<Driver>> {
  return api.list<Driver>("/api/drivers/get_drivers/", query);
}

export async function acceptDispatch(
  id: string,
  input: {
    recyclerReference: string;
    proposedCollectionAt: string;
    proposedCollectionNote?: string;
  },
): Promise<WasteDispatch> {
  const dispatch = await api.post<WasteDispatch>(
    `/api/dispatches/${id}/accept_dispatch/`,
    {
      recycler_reference: input.recyclerReference,
      proposed_collection_at: input.proposedCollectionAt,
      proposed_collection_note: input.proposedCollectionNote ?? "",
    },
  );
  toastSuccess("incoming.toast.accepted");
  return dispatch;
}

export interface DriverAccountOption {
  id: string;
  full_name: string;
  email: string;
}

export function getDriverAccounts(
  query: ListQuery,
): Promise<Paginated<DriverAccountOption>> {
  return api.list<DriverAccountOption>(
    "/api/drivers/get_driver_accounts/",
    query,
  );
}

export function getDriver(id: string): Promise<Driver> {
  return api.get<Driver>(`/api/drivers/${id}/get_driver/`);
}

export async function createDriver(payload: DriverPayload): Promise<Driver> {
  const driver = await api.post<Driver>("/api/drivers/create_driver/", payload);
  toastSuccess("drivers.toast.created");
  return driver;
}

export async function updateDriver(
  id: string,
  payload: Partial<DriverPayload>,
): Promise<Driver> {
  const driver = await api.patch<Driver>(
    `/api/drivers/${id}/update_driver/`,
    payload,
  );
  toastSuccess("drivers.toast.updated");
  return driver;
}

export async function deleteDriver(id: string): Promise<void> {
  await api.delete(`/api/drivers/${id}/delete_driver/`);
  toastSuccess("drivers.toast.removed");
}

export function getTasks(query: ListQuery): Promise<Paginated<DriverTask>> {
  return api.list<DriverTask>("/api/tasks/get_tasks/", query);
}

export function getTask(id: string): Promise<DriverTaskDetail> {
  return api.get<DriverTaskDetail>(`/api/tasks/${id}/get_task/`);
}

export async function createTask(
  payload: DriverTaskPayload,
): Promise<DriverTaskDetail> {
  const task = await api.post<DriverTaskDetail>(
    "/api/tasks/create_task/",
    payload,
  );
  toastSuccess("tasks.toast.created");
  return task;
}

export async function updateTask(
  id: string,
  payload: Partial<DriverTaskPayload>,
): Promise<DriverTaskDetail> {
  const task = await api.patch<DriverTaskDetail>(
    `/api/tasks/${id}/update_task/`,
    payload,
  );
  toastSuccess("tasks.toast.updated");
  return task;
}

/**
 * Move a trip one step.
 *
 * There is no way to set a state directly, here or on the server. Every change
 * goes through the transition table, so a load cannot be marked collected
 * without someone having driven anywhere.
 */
export async function advanceTask(
  id: string,
  payload: {
    state: TaskState;
    latitude?: string;
    longitude?: string;
    notes?: string;
    reason?: string;
  },
): Promise<DriverTaskDetail> {
  const task = await api.post<DriverTaskDetail>(
    `/api/tasks/${id}/advance_task/`,
    payload,
  );
  toastSuccess("tasks.toast.advanced");
  return task;
}

/**
 * Attach a photograph to a trip.
 *
 * Multipart, so the browser sets its own boundary — the client leaves the
 * Content-Type alone for FormData for exactly that reason.
 */
export async function addTaskPhoto(
  id: string,
  file: File,
  kind = "LOADING",
): Promise<unknown> {
  const body = new FormData();
  body.append("image", file);
  body.append("kind", kind);
  const photo = await api.post(`/api/tasks/${id}/add_photo/`, body);
  toastSuccess("driver.toast.photoSent");
  return photo;
}

/** Queue a load at a weighbridge, before the vehicle drives on. */
export async function scanDispatch(
  payload: ScanDispatchPayload,
): Promise<GateBinding> {
  const binding = await api.post<GateBinding>(
    "/api/weigh-sessions/scan_dispatch/",
    payload,
  );
  toastSuccess("gate.toast.scanned");
  return binding;
}

export function getGateBinding(scaleId: string): Promise<GateBinding | null> {
  return api.get<GateBinding | null>("/api/weigh-sessions/get_gate_binding/", {
    scale: scaleId,
  });
}

export async function clearGateBinding(scaleId: string): Promise<void> {
  await api.post("/api/weigh-sessions/clear_gate_binding/", { scale: scaleId });
  toastSuccess("gate.toast.cleared");
}

export function getDeductions(query: ListQuery): Promise<Paginated<Deduction>> {
  return api.list<Deduction>("/api/deductions/get_deductions/", query);
}

export function getDeduction(id: string): Promise<Deduction> {
  return api.get<Deduction>(`/api/deductions/${id}/get_deduction/`);
}

export async function createDeduction(
  payload: DeductionPayload,
): Promise<Deduction> {
  const deduction = await api.post<Deduction>(
    "/api/deductions/create_deduction/",
    payload,
  );
  toastSuccess("deductions.toast.created");
  return deduction;
}

/** The producer's answer. Only they can send it; the backend checks. */
export async function respondToDeduction(
  id: string,
  decision: DeductionDecision,
  note: string,
): Promise<Deduction> {
  const deduction = await api.post<Deduction>(
    `/api/deductions/${id}/respond_to_deduction/`,
    { decision, note },
  );
  toastSuccess("deductions.toast.answered");
  return deduction;
}

export function getSettlements(
  query: ListQuery,
): Promise<Paginated<Settlement>> {
  return api.list<Settlement>("/api/settlements/get_settlements/", query);
}

export function getSettlement(id: string): Promise<Settlement> {
  return api.get<Settlement>(`/api/settlements/${id}/get_settlement/`);
}

export function getTransactionReport(
  query: ListQuery,
): Promise<TransactionReport> {
  return api.get<TransactionReport>(
    "/api/settlements/get_transaction_report/",
    query,
  );
}

export function exportTransactions(request: ExportRequest): Promise<void> {
  const { page, page_size, ...query } = request.query;
  void page;
  void page_size;
  return download("/api/settlements/export_transactions/", {
    method: "POST",
    query,
    body: {
      format: request.format,
      title: request.title,
      subtitle: request.subtitle ?? "",
      empty_label: request.emptyLabel ?? "",
      columns: request.columns,
    },
    fallbackFilename: `transactions.${request.format}`,
  });
}

/** The working, before either side commits to it. Readable by both. */
export function getSettlementQuote(
  dispatchId: string,
  unitPrice?: string,
): Promise<SettlementQuote> {
  return api.get<SettlementQuote>("/api/settlements/get_quote/", {
    dispatch: dispatchId,
    ...(unitPrice ? { unit_price: unitPrice } : {}),
  });
}

export async function issueSettlement(payload: {
  dispatch: string;
  unit_price: string;
  notes?: string;
}): Promise<Settlement> {
  const settlement = await api.post<Settlement>(
    "/api/settlements/issue_settlement/",
    payload,
  );
  toastSuccess("settlements.toast.issued");
  return settlement;
}

export async function lockSettlement(
  id: string,
  reason: string,
): Promise<Settlement> {
  const settlement = await api.post<Settlement>(
    `/api/settlements/${id}/lock_settlement/`,
    { reason },
  );
  toastSuccess("settlements.toast.locked");
  return settlement;
}

export async function recordPayment(
  id: string,
  payload: {
    amount: string;
    paid_on: string;
    method: string;
    reference?: string;
    notes?: string;
  },
): Promise<unknown> {
  const payment = await api.post(
    `/api/settlements/${id}/record_payment/`,
    payload,
  );
  toastSuccess("settlements.toast.paymentRecorded");
  return payment;
}
