/**
 * 出门条 (JB217, 客户 11-18 事项 2): read one, sign it, 外部审批, the gate's
 * 待放行 and 确认放行 (`wt/review/jb217-contract.md`).
 *
 * Every write answers the whole pass again (the release answers the new
 * 门岗事项), so a screen shows the server's state, never a guess. The PIN on
 * the web comes from the api-client's own sign-off flow: the server refuses,
 * the PIN box opens, the request is sent again.
 */

import type {
  ExitPass,
  ExitPassKind,
  ExitPassWaiting,
} from "@/interfaces/exit-pass";
import type { GateIncidentDetail, GatePhotoDraft } from "@/interfaces/site-access";
import { api, download, fetchObjectUrl, toastSuccess } from "@/services/api-client";

const BASE = "/api/exit-passes";

export function getExitPass(kind: ExitPassKind, record: string): Promise<ExitPass> {
  return api.get<ExitPass>(`${BASE}/get_pass/`, { kind, record });
}

/**
 * 「见附件：…」 - the registered signed copy, read by whoever reads the 出门条
 * (contract v4 F7: the guard, a safety manager without the record's page),
 * not through the record's 附件 download, which asks for the record's page.
 */
export function exitPassPaperCopyObjectUrl(kind: ExitPassKind, record: string): Promise<string> {
  return fetchObjectUrl(`${BASE}/get_paper_copy/`, { query: { kind, record, inline: "1" } });
}

export function downloadExitPassPaperCopy(kind: ExitPassKind, record: string, filename: string): Promise<void> {
  return download(`${BASE}/get_paper_copy/`, { query: { kind, record }, fallbackFilename: filename });
}

/**
 * 【启动出门条】 (JB237, 客户 11-23 事项 9): the office, once the site's exit
 * photos are in. The server refuses it before them (`exit_pass_photos_missing`)
 * and asks the project's safety managers to sign after it.
 */
export async function startExitPass(kind: ExitPassKind, record: string): Promise<ExitPass> {
  const pass = await api.post<ExitPass>(`${BASE}/start/`, { kind, record });
  toastSuccess("exitPass.start.done", { reference: pass.reference });
  return pass;
}

/** 【签名批准】: the safety manager's drawn signature (and the 「需要外部审批」 switch). */
export async function signExitPass(
  kind: ExitPassKind,
  record: string,
  signature: File,
  externalRequired: boolean,
): Promise<ExitPass> {
  const body = new FormData();
  body.append("kind", kind);
  body.append("record", record);
  body.append("signature", signature);
  body.append("external_required", externalRequired ? "true" : "false");
  const pass = await api.post<ExitPass>(`${BASE}/sign/`, body);
  toastSuccess(signedToast(pass), { reference: pass.reference });
  return pass;
}

/**
 * What 【签名批准】 says it did - whom the 出门条 really reached, from the
 * server's own sent-to list (walk 11-18: 「已发给申请人和门岗」 on a project
 * with no gate phone).
 */
export function signedToast(pass: Pick<ExitPass, "state" | "sent">): string {
  if (pass.state === "awaiting_external") return "exitPass.toast.signedWaitExternal";
  const to = pass.sent?.to ?? [];
  const applicant = to.some((one) => one.role === "applicant");
  const gate = to.some((one) => one.role === "gate");
  if (applicant && gate) return "exitPass.toast.signedSent";
  if (applicant) return "exitPass.toast.signedSentApplicant";
  if (gate) return "exitPass.toast.signedSentGate";
  return "exitPass.toast.signedSentNobody";
}

/**
 * 「需要外部审批」 on or off. Before the safety manager signs, either way, no
 * PIN; after, only off - and that sends the 出门条 at once (PIN on the web).
 */
export async function setExitPassExternalRequired(
  kind: ExitPassKind,
  record: string,
  required: boolean,
  waive = false,
): Promise<ExitPass> {
  const pass = await api.post<ExitPass>(`${BASE}/set_external_required/`, { kind, record, required });
  if (waive) toastSuccess("exitPass.toast.waived", { reference: pass.reference });
  return pass;
}

/** 【在线签名】 of 外部审批 (an office account that already approves this kind). */
export async function signExitPassExternal(
  kind: ExitPassKind,
  record: string,
  fields: { company: string; opinion: string; signature: File },
): Promise<ExitPass> {
  const body = new FormData();
  body.append("kind", kind);
  body.append("record", record);
  body.append("company", fields.company);
  body.append("opinion", fields.opinion);
  body.append("signature", fields.signature);
  const pass = await api.post<ExitPass>(`${BASE}/sign_external/`, body);
  toastSuccess("exitPass.toast.externalDone", { reference: pass.reference });
  return pass;
}

/**
 * 【登记签回的文件】: a file already in 附件, or one uploaded now (it goes into
 * 附件 first). `correcting` - 【换一个签回的文件】: the pass went out already
 * and is not sent again, so the toast does not say it was (walk 11-18).
 */
export async function recordExitPassExternalPaper(
  kind: ExitPassKind,
  record: string,
  fields: {
    company: string;
    name: string;
    opinion: string;
    date: string;
    attachment?: string;
    file?: File;
  },
  correcting = false,
): Promise<ExitPass> {
  const body = new FormData();
  body.append("kind", kind);
  body.append("record", record);
  body.append("company", fields.company);
  body.append("name", fields.name);
  body.append("opinion", fields.opinion);
  body.append("date", fields.date);
  if (fields.attachment) body.append("attachment", fields.attachment);
  if (fields.file) body.append("file", fields.file);
  const pass = await api.post<ExitPass>(`${BASE}/record_external_paper/`, body);
  toastSuccess(correcting ? "exitPass.toast.paperReplaced" : "exitPass.toast.externalDone", {
    reference: pass.reference,
  });
  return pass;
}

/** The guard's 「待放行」: sent, not yet released, on this phone's projects. */
export function getExitPassesWaiting(project?: string): Promise<{ results: ExitPassWaiting[]; count: number }> {
  return api.get<{ results: ExitPassWaiting[]; count: number }>(
    `${BASE}/get_waiting/`,
    project ? { project } : undefined,
  );
}

/**
 * 【确认放行】: the check photos, each with its own time and GPS, filed as a
 * 门岗事项 closed in the guard's name. Online only; `clientEventId` is kept
 * across a retry, so a resend after a lost answer is the same release.
 */
export async function releaseExit(payload: {
  kind: ExitPassKind;
  record: string;
  photos: GatePhotoDraft[];
  clientEventId: string;
  fix?: { latitude: string; longitude: string; accuracy_m?: string };
}): Promise<GateIncidentDetail> {
  const body = new FormData();
  body.append("kind", payload.kind);
  body.append("record", payload.record);
  body.append("client_event_id", payload.clientEventId);
  payload.photos.forEach((photo) => body.append("photos", photo.file));
  body.append(
    "photo_meta",
    JSON.stringify(
      payload.photos.map(({ captured_at, latitude, longitude, accuracy_m, client_event_id, shot }) => ({
        captured_at,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        accuracy_m: accuracy_m ?? null,
        client_event_id,
        // JB281: 车辆 / 车牌 / 退场货物 on a 材料退场's release.
        ...(shot ? { shot } : {}),
      })),
    ),
  );
  if (payload.fix) {
    body.append("latitude", payload.fix.latitude);
    body.append("longitude", payload.fix.longitude);
    if (payload.fix.accuracy_m) body.append("accuracy_m", payload.fix.accuracy_m);
  }
  const row = await api.post<GateIncidentDetail>("/api/gate-incidents/release_exit/", body);
  toastSuccess("exitPass.toast.released", { reference: row.incident_no });
  return row;
}
