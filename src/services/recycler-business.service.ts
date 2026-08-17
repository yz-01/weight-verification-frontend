import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  Buyer,
  BuyerPayload,
  CustomerQr,
  InventoryAdjustmentPayload,
  InventoryMovement,
  InventorySnapshot,
  OutboundAttachment,
  OutboundAttachmentKind,
  OutboundShipment,
  OutboundShipmentPayload,
  PrivateIntake,
  RecyclerCustomer,
  RecyclerCustomerPayload,
  StartPrivateIntakePayload,
} from "@/interfaces/recycler-business";
import { api, toastSuccess } from "@/services/api-client";

export function getRecyclerCustomers(
  query: ListQuery,
): Promise<Paginated<RecyclerCustomer>> {
  return api.list("/api/recycler-customers/get-customers/", query);
}

export async function createRecyclerCustomer(
  payload: RecyclerCustomerPayload,
): Promise<RecyclerCustomer> {
  const result = await api.post<RecyclerCustomer>(
    "/api/recycler-customers/create-customer/",
    payload,
  );
  toastSuccess("recyclerBusiness.toast.customerCreated");
  return result;
}

export async function updateRecyclerCustomer(
  id: string,
  payload: Partial<RecyclerCustomerPayload>,
): Promise<RecyclerCustomer> {
  const result = await api.patch<RecyclerCustomer>(
    `/api/recycler-customers/update-customer/${id}/`,
    payload,
  );
  toastSuccess("recyclerBusiness.toast.customerUpdated");
  return result;
}

export async function setRecyclerCustomerStatus(
  id: string,
  isActive: boolean,
): Promise<RecyclerCustomer> {
  const result = await api.post<RecyclerCustomer>(
    `/api/recycler-customers/change-status/${id}/`,
    { is_active: isActive },
  );
  toastSuccess("recyclerBusiness.toast.customerStatusUpdated");
  return result;
}

export async function syncPlatformCustomers(): Promise<{ created: number }> {
  const result = await api.post<{ created: number }>(
    "/api/recycler-customers/sync-platform/",
  );
  toastSuccess("recyclerBusiness.toast.customersSynced", result);
  return result;
}

export function getCustomerQr(id: string): Promise<CustomerQr | null> {
  return api.get(`/api/recycler-customers/get-qr/${id}/`);
}

export async function issueCustomerQr(id: string): Promise<CustomerQr> {
  const result = await api.post<CustomerQr>(
    `/api/recycler-customers/issue-qr/${id}/`,
  );
  toastSuccess("recyclerBusiness.toast.qrIssued");
  return result;
}

export async function reissueCustomerQr(
  id: string,
  note: string,
): Promise<CustomerQr> {
  const result = await api.post<CustomerQr>(
    `/api/recycler-customers/reissue-qr/${id}/`,
    { note },
  );
  toastSuccess("recyclerBusiness.toast.qrReissued");
  return result;
}

export async function setCustomerQrStatus(
  id: string,
  status: "ACTIVE" | "DISABLED",
): Promise<CustomerQr> {
  const result = await api.post<CustomerQr>(
    `/api/recycler-customers/set-qr-status/${id}/`,
    { status },
  );
  toastSuccess("recyclerBusiness.toast.qrStatusUpdated");
  return result;
}

export function getPrivateIntakes(
  query: ListQuery,
): Promise<Paginated<PrivateIntake>> {
  return api.list("/api/private-intakes/get-intakes/", query);
}

export async function startPrivateIntake(
  payload: StartPrivateIntakePayload,
): Promise<PrivateIntake> {
  const result = await api.post<PrivateIntake>(
    "/api/private-intakes/start-intake/",
    payload,
  );
  toastSuccess("recyclerBusiness.toast.intakeStarted");
  return result;
}

export async function completePrivateIntake(
  id: string,
  session: string,
): Promise<PrivateIntake> {
  const result = await api.post<PrivateIntake>(
    `/api/private-intakes/complete-intake/${id}/`,
    { session },
  );
  toastSuccess("recyclerBusiness.toast.intakeCompleted");
  return result;
}

export async function cancelPrivateIntake(
  id: string,
  reason: string,
): Promise<PrivateIntake> {
  const result = await api.post<PrivateIntake>(
    `/api/private-intakes/cancel-intake/${id}/`,
    { reason },
  );
  toastSuccess("recyclerBusiness.toast.intakeCancelled");
  return result;
}

export function getInventory(
  query: ListQuery = {},
): Promise<InventorySnapshot> {
  return api.get("/api/recycler-inventory/get-inventory/", query);
}

export function getInventoryMovements(
  query: ListQuery,
): Promise<Paginated<InventoryMovement>> {
  return api.list("/api/recycler-inventory/get-movements/", query);
}

export async function adjustInventory(
  payload: InventoryAdjustmentPayload,
): Promise<InventoryMovement> {
  const result = await api.post<InventoryMovement>(
    "/api/recycler-inventory/adjust-inventory/",
    payload,
  );
  toastSuccess("recyclerBusiness.toast.inventoryAdjusted");
  return result;
}

export function getBuyers(query: ListQuery): Promise<Paginated<Buyer>> {
  return api.list("/api/recycler-buyers/get-buyers/", query);
}

export async function createBuyer(payload: BuyerPayload): Promise<Buyer> {
  const result = await api.post<Buyer>(
    "/api/recycler-buyers/create-buyer/",
    payload,
  );
  toastSuccess("recyclerBusiness.toast.buyerCreated");
  return result;
}

export async function updateBuyer(
  id: string,
  payload: Partial<BuyerPayload>,
): Promise<Buyer> {
  const result = await api.patch<Buyer>(
    `/api/recycler-buyers/update-buyer/${id}/`,
    payload,
  );
  toastSuccess("recyclerBusiness.toast.buyerUpdated");
  return result;
}

export async function setBuyerStatus(
  id: string,
  isActive: boolean,
): Promise<Buyer> {
  const result = await api.post<Buyer>(
    `/api/recycler-buyers/change-status/${id}/`,
    { is_active: isActive },
  );
  toastSuccess("recyclerBusiness.toast.buyerStatusUpdated");
  return result;
}

export function getOutboundShipments(
  query: ListQuery,
): Promise<Paginated<OutboundShipment>> {
  return api.list("/api/recycler-outbound/get-shipments/", query);
}

export async function createOutboundShipment(
  payload: OutboundShipmentPayload,
): Promise<OutboundShipment> {
  const result = await api.post<OutboundShipment>(
    "/api/recycler-outbound/create-shipment/",
    payload,
  );
  toastSuccess("recyclerBusiness.toast.shipmentCreated");
  return result;
}

export async function updateOutboundShipment(
  id: string,
  payload: Partial<OutboundShipmentPayload>,
): Promise<OutboundShipment> {
  const result = await api.patch<OutboundShipment>(
    `/api/recycler-outbound/update-shipment/${id}/`,
    payload,
  );
  toastSuccess("recyclerBusiness.toast.shipmentUpdated");
  return result;
}

export async function confirmOutboundShipment(
  id: string,
): Promise<OutboundShipment> {
  const result = await api.post<OutboundShipment>(
    `/api/recycler-outbound/confirm-shipment/${id}/`,
  );
  toastSuccess("recyclerBusiness.toast.shipmentConfirmed");
  return result;
}

export async function cancelOutboundShipment(
  id: string,
  reason: string,
): Promise<OutboundShipment> {
  const result = await api.post<OutboundShipment>(
    `/api/recycler-outbound/cancel-shipment/${id}/`,
    { reason },
  );
  toastSuccess("recyclerBusiness.toast.shipmentCancelled");
  return result;
}

export async function uploadOutboundAttachment(
  id: string,
  kind: OutboundAttachmentKind,
  file: File,
  description: string,
): Promise<OutboundAttachment> {
  const body = new FormData();
  body.append("kind", kind);
  body.append("file", file);
  body.append("description", description);
  const result = await api.post<OutboundAttachment>(
    `/api/recycler-outbound/upload-attachment/${id}/`,
    body,
  );
  toastSuccess("recyclerBusiness.toast.attachmentUploaded");
  return result;
}
