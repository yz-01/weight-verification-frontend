import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  IntegrationConfig,
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

export async function testIntegration(id: string): Promise<unknown> {
  const result = await api.post(
    `/api/integrations/${id}/test_integration/`,
    undefined,
  );
  toastSuccess("integrations.toast.queued");
  return result;
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
