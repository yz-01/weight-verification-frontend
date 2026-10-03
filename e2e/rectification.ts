/**
 * Steps of a 隐患整改 loop over the API, for the specs that walk it (B21, B22).
 *
 * The browser is used for the part each spec is about - who sees 【确认完成】
 * and what pressing it does. Raising, assigning and submitting are driven here
 * so a run does not depend on a camera, and each run raises fresh items:
 * evidence is append-only, so a seeded hazard could only be closed once.
 */

import fs from "node:fs";
import path from "node:path";

import { expect, type APIRequestContext } from "@playwright/test";

import {
  ACCOUNTS,
  API,
  FIELD_DEVICE_ID,
  FIELD_PIN,
  apiLogin,
} from "./helpers";

const PHOTO = fs.readFileSync(path.join(__dirname, "fixtures", "loading-photo.png"));
const GPS = { latitude: "3.1390000", longitude: "101.6869000" };

export type Who = "contractor" | "field" | "consultant";

export interface Session {
  who: Who;
  userId: string;
  headers: Record<string, string>;
}

export interface Site {
  projectId: string;
  /** An EHS column that is not the permit one. */
  columnId: string;
}

async function sessionFor(request: APIRequestContext, who: Who, projectId?: string): Promise<Session> {
  if (who === "field") {
    const response = await request.post(`${API}/api/field-access/field_login/`, {
      data: { pin: FIELD_PIN, device_id: FIELD_DEVICE_ID },
    });
    expect(response.status(), await response.text()).toBe(200);
    const data = (await response.json()).data;
    return {
      who,
      userId: data.user.id,
      headers: { Authorization: `Bearer ${data.tokens.access}` },
    };
  }
  const login = await request.post(`${API}/api/auth/login/`, {
    data: {
      email: who === "consultant" ? ACCOUNTS.consultant : ACCOUNTS.contractor,
      password: "E2e-Pass-1234!",
      portal: "MSE_TRACE",
    },
  });
  expect(login.ok(), await login.text()).toBe(true);
  const data = (await login.json()).data;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${data.tokens.access}`,
  };
  // A consultant acts inside one granted project, named on every request.
  if (who === "consultant" && projectId) headers["X-MSE-Project"] = projectId;
  return { who, userId: data.user.id, headers };
}

export async function site(request: APIRequestContext): Promise<Site> {
  const token = await apiLogin(request, ACCOUNTS.contractor, "MSE_TRACE");
  const headers = { Authorization: `Bearer ${token}` };
  const projects = await request.get(`${API}/api/projects/get_projects/?page_size=50`, { headers });
  expect(projects.ok()).toBe(true);
  const project = (await projects.json()).data.results.find(
    (row: { code: string }) => row.code === "P-E2E",
  );
  expect(project, "the seeded E2E project is missing").toBeTruthy();
  const columns = await request.get(
    `${API}/api/project-categories/get_categories/?project=${project.id}&kind=EHS&is_active=true&page_size=200`,
    { headers },
  );
  expect(columns.ok()).toBe(true);
  const column = (await columns.json()).data.results.find(
    (row: { code: string; is_active: boolean }) =>
      row.is_active && row.code !== "HZD-PERMIT" && row.code !== "HZD-VO",
  );
  expect(column, "the seeded project has no EHS column").toBeTruthy();
  return { projectId: project.id, columnId: column.id };
}

export async function sessions(request: APIRequestContext, where: Site) {
  return {
    contractor: await sessionFor(request, "contractor"),
    field: await sessionFor(request, "field"),
    consultant: await sessionFor(request, "consultant", where.projectId),
  };
}

function photos(form: FormData, field: string, count: number, prefix: string) {
  for (let index = 0; index < count; index += 1) {
    form.append(field, new Blob([PHOTO], { type: "image/png" }), `${prefix}-${index}.png`);
  }
}

/** 上报 (and, with a rectifier, 指派 in the same step). */
export async function raise(
  request: APIRequestContext,
  where: Site,
  by: Session,
  {
    rectifier,
    gps = true,
    title,
  }: { rectifier?: Session; gps?: boolean; title: string },
): Promise<{ id: string; incident_no: string; confirmer: string | null }> {
  const form = new FormData();
  form.append("project", where.projectId);
  form.append("category", where.columnId);
  form.append("title", title);
  form.append("description", `${title} - raised by the e2e suite.`);
  form.append("client_event_id", `e2e-hazard-${Date.now()}-${Math.random()}`);
  if (gps) {
    form.append("latitude", GPS.latitude);
    form.append("longitude", GPS.longitude);
  }
  if (rectifier) {
    form.append("responsible_person", rectifier.userId);
    form.append("due_at", new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString());
  }
  photos(form, "photos", 4, "hazard");
  const response = await request.post(`${API}/api/safety-incidents/create_safety_incident/`, {
    headers: by.headers,
    multipart: form,
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).data;
}

/** 整改人提交: four photos, what was done, and the site GPS. */
export async function submitFix(request: APIRequestContext, incidentId: string, by: Session) {
  const form = new FormData();
  form.append("note", "Fixed and checked by the e2e suite.");
  form.append("latitude", GPS.latitude);
  form.append("longitude", GPS.longitude);
  photos(form, "images", 4, "fixed");
  const response = await request.post(
    `${API}/api/safety-incidents/${incidentId}/submit_rectification/`,
    { headers: by.headers, multipart: form },
  );
  expect(response.status(), await response.text()).toBe(201);
}

/** Where the confirmer's 「请确认」 card points - the link must open the item. */
export async function confirmCardHref(
  request: APIRequestContext,
  incidentId: string,
  to: Session,
): Promise<string> {
  const response = await request.get(
    `${API}/api/notifications/get_notifications/?page_size=100`,
    { headers: to.headers },
  );
  expect(response.ok(), await response.text()).toBe(true);
  const card = (await response.json()).data.results.find(
    (row: { kind: string; data: { incident_id?: string } }) =>
      row.kind === "safety.rectification_submitted" && row.data?.incident_id === incidentId,
  );
  expect(card, "the confirmer was not sent 「请确认」").toBeTruthy();
  return card.data.href as string;
}

/** 闭环锁定: after confirmation the item takes no more photos or words. */
export async function expectLocked(request: APIRequestContext, incidentId: string, rectifier: Session) {
  const detail = await request.get(
    `${API}/api/safety-incidents/${incidentId}/get_hazard_conversation/`,
    { headers: rectifier.headers },
  );
  expect(detail.ok(), await detail.text()).toBe(true);
  const room = (await detail.json()).data;
  expect(room.incident.status).toBe("VERIFIED");
  expect(room.is_closed).toBe(true);
  const form = new FormData();
  photos(form, "photo", 1, "late");
  form.append("body", "One more photo after closing.");
  const late = await request.post(
    `${API}/api/safety-incidents/${incidentId}/post_hazard_message/`,
    { headers: rectifier.headers, multipart: form },
  );
  expect(late.status(), await late.text()).toBe(409);
}
