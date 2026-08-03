/** The Cloud Weighing Engine's read and configuration paths.

There is deliberately no way to alter a reading or a verdict from here. The
backend refuses it and offers no action for it: a weighing is judged once, by
the rules in force at the time, and afterwards it can only be looked at.
*/

import type { ListQuery, Paginated } from "@/interfaces/api";
import type {
  ChainVerification,
  GatewayDevice,
  GatewayInstallerManifest,
  RecyclingSite,
  RecyclingSitePayload,
  RuleParameter,
  Scale,
  ScalePayload,
  SessionTrace,
  WeighingRuleSet,
  WeighSessionDetail,
  WeighSessionRow,
  WeighSessionSummary,
} from "@/interfaces/weighing";
import { api, download, toastSuccess } from "@/services/api-client";

export function getSites(query: ListQuery): Promise<Paginated<RecyclingSite>> {
  return api.list<RecyclingSite>("/api/sites/get_sites/", query);
}

export function getSite(id: string): Promise<RecyclingSite> {
  return api.get<RecyclingSite>(`/api/sites/${id}/get_site/`);
}

export async function createSite(
  payload: RecyclingSitePayload,
): Promise<RecyclingSite> {
  const site = await api.post<RecyclingSite>("/api/sites/create_site/", payload);
  toastSuccess("sites.toast.created");
  return site;
}

export async function updateSite(
  id: string,
  payload: Partial<RecyclingSitePayload>,
): Promise<RecyclingSite> {
  const site = await api.patch<RecyclingSite>(
    `/api/sites/${id}/update_site/`,
    payload,
  );
  toastSuccess("sites.toast.updated");
  return site;
}

export async function deleteSite(id: string): Promise<void> {
  await api.delete(`/api/sites/${id}/delete_site/`);
  toastSuccess("sites.toast.removed");
}

export function getScales(query: ListQuery): Promise<Paginated<Scale>> {
  return api.list<Scale>("/api/scales/get_scales/", query);
}

export function getScale(id: string): Promise<Scale> {
  return api.get<Scale>(`/api/scales/${id}/get_scale/`);
}

export async function createScale(payload: ScalePayload): Promise<Scale> {
  const scale = await api.post<Scale>("/api/scales/create_scale/", payload);
  toastSuccess("scales.toast.created");
  return scale;
}

export async function updateScale(
  id: string,
  payload: Partial<ScalePayload>,
): Promise<Scale> {
  const scale = await api.patch<Scale>(
    `/api/scales/${id}/update_scale/`,
    payload,
  );
  toastSuccess("scales.toast.updated");
  return scale;
}

export async function deleteScale(id: string): Promise<void> {
  await api.delete(`/api/scales/${id}/delete_scale/`);
  toastSuccess("scales.toast.removed");
}

export function getGateways(
  scaleId: string,
): Promise<{ results: GatewayDevice[]; count: number }> {
  return api.get<{ results: GatewayDevice[]; count: number }>(
    `/api/scales/${scaleId}/get_gateways/`,
  );
}

/**
 * Register a gateway.
 *
 * The secret comes back exactly once, here. The platform stores it encrypted
 * and never serialises it again, so the caller has to show it to the installer
 * immediately — there is no second chance and no recovery, only rotation.
 */
export async function createGateway(
  scaleId: string,
  payload: { device_id: string; firmware_version?: string; notes?: string },
): Promise<{
  gateway: GatewayDevice;
  secret: string;
  integration_device: { id: string; device_type: string; device_id: string };
  installer_manifest: GatewayInstallerManifest;
}> {
  const result = await api.post<{
    gateway: GatewayDevice;
    secret: string;
    integration_device: { id: string; device_type: string; device_id: string };
    installer_manifest: GatewayInstallerManifest;
  }>(
    `/api/scales/${scaleId}/create_gateway/`,
    payload,
  );
  toastSuccess("gateways.toast.created");
  return result;
}

export async function rotateGatewaySecret(
  scaleId: string,
  gatewayId: string,
  reason: string,
): Promise<{ secret: string }> {
  const result = await api.post<{ secret: string }>(
    `/api/scales/${scaleId}/rotate_gateway_secret/`,
    { gateway: gatewayId, reason },
  );
  toastSuccess("gateways.toast.rotated");
  return result;
}

export async function revokeGateway(
  scaleId: string,
  gatewayId: string,
  reason: string,
): Promise<GatewayDevice> {
  const result = await api.post<GatewayDevice>(
    `/api/scales/${scaleId}/revoke_gateway/`,
    { gateway: gatewayId, reason },
  );
  toastSuccess("gateways.toast.revoked");
  return result;
}

export function getWeighSessions(
  query: ListQuery,
): Promise<Paginated<WeighSessionRow>> {
  return api.list<WeighSessionRow>(
    "/api/weigh-sessions/get_sessions/",
    query,
  );
}

export function getWeighSession(id: string): Promise<WeighSessionDetail> {
  return api.get<WeighSessionDetail>(
    `/api/weigh-sessions/${id}/get_session/`,
  );
}

/** Every reading, for replaying the weighing as a curve. */
export function getSessionTrace(id: string): Promise<SessionTrace> {
  return api.get<SessionTrace>(`/api/weigh-sessions/${id}/get_readings/`);
}

/**
 * Re-derive every hash and report any break.
 *
 * This is what turns "the readings cannot be modified" from a claim into
 * something a customer can check for themselves.
 */
export function verifySessionChain(id: string): Promise<ChainVerification> {
  return api.get<ChainVerification>(
    `/api/weigh-sessions/${id}/verify_session_chain/`,
  );
}

export function getWeighSummary(): Promise<WeighSessionSummary> {
  return api.get<WeighSessionSummary>("/api/weigh-sessions/get_summary/");
}

export function getRuleSets(
  query: ListQuery,
): Promise<Paginated<WeighingRuleSet>> {
  return api.list<WeighingRuleSet>(
    "/api/weighing-rules/get_rule_sets/",
    query,
  );
}

export function getEffectiveRules(
  scaleId: string,
): Promise<{ scale: string; ruleset: WeighingRuleSet; params: Record<string, number> }> {
  return api.get<{
    scale: string;
    ruleset: WeighingRuleSet;
    params: Record<string, number>;
  }>("/api/weighing-rules/get_effective_rules/", { scale: scaleId });
}

/** The tunable parameters, from the engine's own list rather than a copy. */
export async function getRuleParameters(): Promise<RuleParameter[]> {
  const data = await api.get<{ parameters: RuleParameter[] }>(
    "/api/weighing-rules/get_parameter_catalogue/",
  );
  return data.parameters;
}

/**
 * Publish the next version of a rule set.
 *
 * Never edits the current one. Sessions already judged keep the thresholds
 * that judged them, so widening a threshold cannot clear existing history.
 */
export async function publishRuleSet(payload: {
  scope: "PLATFORM" | "COMPANY" | "SCALE";
  scale?: string;
  params: Record<string, number>;
  reason?: string;
}): Promise<WeighingRuleSet> {
  const ruleset = await api.post<WeighingRuleSet>(
    "/api/weighing-rules/publish_rule_set/",
    payload,
  );
  toastSuccess("weighingRules.toast.published");
  return ruleset;
}


/**
 * The weighbridge ticket, as a PDF.
 *
 * Every word on the document travels in the request. The backend holds no
 * message catalogue — one copy of the translations, in one place — so it is
 * handed the labels already in the reader's language and lays out the page.
 *
 * Readable by both companies. A producer disputing a load needs the same sheet
 * the yard is holding, not a summary of it.
 */
export function printWeighTicket(
  sessionId: string,
  sessionNo: string,
  labels: Record<string, string>,
): Promise<void> {
  return download(`/api/weigh-sessions/${sessionId}/print_ticket/`, {
    method: "POST",
    body: { labels },
    fallbackFilename: `${sessionNo}.pdf`,
  });
}
