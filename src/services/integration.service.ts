import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  DeviceCommand,
  DeviceCommandPayload,
  DeviceMedia,
  DeviceTelemetry,
  IntegrationConfig,
  IntegrationDelivery,
  IntegrationDevice,
  IntegrationDevicePayload,
  IntegrationPayload,
  ThirdPartyAccessEvent,
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

/**
 * What the platform can send outward, and which kinds may receive each one.
 *
 * Fetched rather than restated in the console: the same table drives the
 * publisher and the validator, so a checkbox can never appear for an event
 * nothing would ever send.
 */
export async function getIntegrationEventCatalogue(): Promise<
  { event_type: string; kinds: string[] }[]
> {
  const result = await api.get<{
    events: { event_type: string; kinds: string[] }[];
  }>("/api/integrations/get_event_catalogue/");
  return result.events;
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

export function getIntegrationDeliveries(
  id: string,
  query: ListQuery = {},
): Promise<Paginated<IntegrationDelivery>> {
  return api.list<IntegrationDelivery>(
    `/api/integrations/${id}/get_deliveries/`,
    query,
  );
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

/**
 * Correct a registered device, or give it a new secret.
 *
 * Until now the console could only register a device and delete one, so a
 * device that moved to another weighbridge, shipped new firmware, or needed
 * its key rotated had to be deleted and re-registered - which throws away its
 * history and every reading traced back to it (F-101). The device id and type
 * are deliberately not sent: they are the identity the unit signs with, and
 * changing either silently breaks every request it makes from then on.
 */
export async function updateIntegrationDevice(
  id: string,
  payload: Partial<IntegrationDevicePayload>,
  company?: string,
): Promise<IntegrationDevice> {
  const result = await api.patch<IntegrationDevice>(
    `/api/integration-devices/${id}/update_device/`,
    company ? { ...payload, company } : payload,
  );
  toastSuccess("integrations.toast.deviceUpdated");
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

/** Everything a device pushed for one business record. */
export function getDeviceMedia(
  sourceModel: string,
  sourceId: string,
): Promise<Paginated<DeviceMedia>> {
  return api.list<DeviceMedia>("/api/device-media/get_media/", {
    source_model: sourceModel,
    source_id: sourceId,
  });
}

/** The estate-wide feed, newest first. */
export function getRecentDeviceMedia(
  query: ListQuery = {},
): Promise<Paginated<DeviceMedia>> {
  return api.list<DeviceMedia>("/api/device-media/get_recent_media/", query);
}

/** Plate reads, card swipes and face matches reported by vendor adapters. */
export function getThirdPartyAccessEvents(
  query: ListQuery = {},
): Promise<Paginated<ThirdPartyAccessEvent>> {
  return api.list<ThirdPartyAccessEvent>(
    "/api/site-access-passes/get_third_party_events/",
    query,
  );
}

/** The estate-wide observation feed, newest first. */
export function getRecentDeviceTelemetry(
  query: ListQuery = {},
): Promise<Paginated<DeviceTelemetry>> {
  return api.list<DeviceTelemetry>(
    "/api/device-telemetry/get_telemetry/",
    query,
  );
}

/** One device's own history. `device` is required by the endpoint. */
export function getDeviceTelemetry(
  device: string,
  query: ListQuery = {},
): Promise<Paginated<DeviceTelemetry>> {
  return api.list<DeviceTelemetry>(
    "/api/device-telemetry/get_device_telemetry/",
    { ...query, device },
  );
}

/**
 * Commands issued to one controller, newest first.
 *
 * This is the commissioning log: what was asked, and whether the controller
 * ever answered. A PENDING row that stopped moving is the useful finding on
 * an install day - it means the wiring or the adapter is not there.
 */
export function getDeviceCommands(
  deviceId: string,
  query: ListQuery = {},
): Promise<Paginated<DeviceCommand>> {
  return api.list<DeviceCommand>("/api/device-commands/get-commands/", {
    device: deviceId,
    sort_by: "issued_at",
    sort_order: "desc",
    ...query,
  });
}

/**
 * Ask a controller to do something, once.
 *
 * `client_command_id` is the idempotency key: pressing the button twice with
 * the same key queues one command, not two, which matters when the thing on
 * the other end is a physical barrier.
 */
export async function issueDeviceCommand(
  payload: DeviceCommandPayload,
): Promise<DeviceCommand> {
  const row = await api.post<DeviceCommand>(
    "/api/device-commands/issue-command/",
    payload,
  );
  toastSuccess("integrations.console.toast.issued");
  return row;
}

/**
 * Give up on a command the controller never answered.
 *
 * Closing does not undo anything physical - it records that a person stopped
 * waiting, so the log does not carry a PENDING row forever and pretend the
 * question is still open.
 */
export async function closeDeviceCommand(
  commandId: string,
  reason: string,
): Promise<DeviceCommand> {
  const row = await api.post<DeviceCommand>(
    `/api/device-commands/close-command/${commandId}/`,
    { reason },
  );
  toastSuccess("integrations.console.toast.closed");
  return row;
}
