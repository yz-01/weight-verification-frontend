import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  IntegrationConfig,
  IntegrationDelivery,
  IntegrationDevice,
  IntegrationDevicePayload,
  IntegrationPayload,
} from "@/interfaces/integration";
import { api, toastSuccess } from "@/services/api-client";

export function getIntegrations(
  query: ListQuery = {},
): Promise<Paginated<IntegrationConfig>> {
  return api.list<IntegrationConfig>(
    "/api/integrations/get_integrations/",
    query,
  );
}

export async function createIntegration(
  payload: IntegrationPayload,
  company?: string,
): Promise<IntegrationConfig> {
  const result = await api.post<IntegrationConfig>(
    "/api/integrations/create_integration/",
    company ? { ...payload, company } : payload,
  );
  toastSuccess("integrations.toast.created");
  return result;
}

export async function updateIntegration(
  id: string,
  payload: Partial<IntegrationPayload>,
): Promise<IntegrationConfig> {
  const result = await api.patch<IntegrationConfig>(
    `/api/integrations/${id}/update_integration/`,
    payload,
  );
  toastSuccess("integrations.toast.updated");
  return result;
}

export async function testIntegration(
  id: string,
  company?: string,
): Promise<IntegrationDelivery> {
  const result = await api.post<IntegrationDelivery>(
    `/api/integrations/${id}/test_integration/`,
    undefined,
    company ? { query: { company } } : undefined,
  );
  if (result.status === "SENT") {
    toastSuccess("integrations.toast.testPassed");
  }
  return result;
}

export async function deleteIntegration(
  id: string,
  company?: string,
): Promise<void> {
  await api.delete<void>(
    `/api/integrations/${id}/delete_integration/`,
    company ? { query: { company } } : undefined,
  );
  toastSuccess("integrations.toast.removed");
}

export function getIntegrationDevices(
  query: ListQuery = {},
): Promise<Paginated<IntegrationDevice>> {
  return api.list<IntegrationDevice>(
    "/api/integration-devices/get_devices/",
    query,
  );
}

export async function createIntegrationDevice(
  payload: IntegrationDevicePayload,
  company?: string,
): Promise<IntegrationDevice> {
  const result = await api.post<IntegrationDevice>(
    "/api/integration-devices/create_device/",
    company ? { ...payload, company } : payload,
  );
  toastSuccess("integrations.toast.deviceCreated");
  return result;
}

export async function deleteIntegrationDevice(
  id: string,
  company?: string,
): Promise<void> {
  await api.delete<void>(
    `/api/integration-devices/${id}/delete_device/`,
    company ? { query: { company } } : undefined,
  );
  toastSuccess("integrations.toast.deviceRemoved");
}
