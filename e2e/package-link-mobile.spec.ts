import fs from "node:fs";
import path from "node:path";

import { expect, test, type APIRequestContext } from "@playwright/test";

import { ACCOUNTS, API, LOGIN_PATHS, apiLogin, columnFor, loginAs } from "./helpers";

/**
 * The package link, opened on a phone (batch H, H17 八 3).
 *
 * 「外部单位多数是在 WhatsApp 里点开链接的」: an owner taps the link, sees the
 * package without signing in, is asked for a name once, confirms a record,
 * leaves a message - and the office sees the open, the answer and the message
 * on the package's recipients and timeline. A link that is wrong says
 * 「找不到」 and nothing else.
 */

const PHOTO = path.join(__dirname, "fixtures", "loading-photo.png");
const WAIT = { timeout: 30_000 };

async function setUp(request: APIRequestContext, stamp: string) {
  const token = await apiLogin(request, ACCOUNTS.contractor, "MSE_TRACE");
  const headers = { Authorization: `Bearer ${token}` };
  const projects = await request.get(`${API}/api/projects/get_projects/?page_size=10`, { headers });
  const project = (await projects.json()).data.results.find((row: { code: string }) => row.code === "P-E2E");
  expect(project, "run `manage.py seed_e2e` first").toBeTruthy();

  const phase = await request.post(`${API}/api/site-progress/create_phase/`, {
    headers,
    data: { project: project.id, code: `LNK-${stamp}`, name: `Link phase ${stamp}`, planned_weight: "1" },
  });
  expect(phase.ok(), await phase.text()).toBe(true);
  const form = new FormData();
  form.append("project", project.id);
  form.append("phase", (await phase.json()).data.id);
  form.append("category", await columnFor(request, headers, project.id, "PROGRESS"));
  form.append("description", `Linked progress ${stamp}`);
  form.append("client_event_id", `e2e-link-${stamp}`);
  form.append("latitude", "3.1390000");
  form.append("longitude", "101.6869000");
  form.append("photos", new Blob([fs.readFileSync(PHOTO)], { type: "image/png" }), "progress.png");
  const record = await request.post(`${API}/api/site-progress/create_record/`, { headers, multipart: form });
  expect(record.status(), await record.text()).toBe(201);

  const made = await request.post(`${API}/api/evidence-packages/create_package/`, {
    headers,
    data: { project: project.id, name: `Owner pack ${stamp}`, package_type: "APPROVAL" },
  });
  expect(made.status(), await made.text()).toBe(201);
  const packageId = (await made.json()).data.id;
  const added = await request.post(`${API}/api/evidence-packages/${packageId}/add_items/`, {
    headers,
    data: { kind: "PROGRESS", ids: [(await record.json()).data.id] },
  });
  expect(added.ok(), await added.text()).toBe(true);
  const confirmed = await request.post(`${API}/api/evidence-packages/${packageId}/confirm_package/`, {
    headers,
    data: { remarks: "For the owner's approval." },
  });
  expect(confirmed.ok(), await confirmed.text()).toBe(true);
  const recipient = await request.post(`${API}/api/evidence-packages/${packageId}/add_recipient/`, {
    headers,
    data: { kind: "OWNER", name: "Owner Rep", organization: "Owner Sdn Bhd", contact: "+60123456789" },
  });
  expect(recipient.status(), await recipient.text()).toBe(201);
  return { packageId, token: (await recipient.json()).data.token as string };
}

test("an owner opens the link on a phone, confirms, writes, and the office sees it", async ({
  browser,
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const stamp = Date.now().toString().slice(-6);
  const { packageId, token } = await setUp(request, stamp);

  // The owner: a fresh browser, nobody signed in.
  const owner = await browser.newContext({ ...test.info().project.use, storageState: undefined });
  const phone = await owner.newPage();
  const opened = await phone.goto(`/package/${token}`);
  expect(opened?.headers()["x-robots-tag"]).toContain("noindex");
  expect(opened?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(phone.getByRole("heading", { name: `Owner pack ${stamp}` })).toBeVisible(WAIT);
  await expect(phone.getByText("For: Owner Rep")).toBeVisible();

  await phone.getByRole("button", { name: "Confirm", exact: true }).first().click();
  const ask = phone.getByRole("dialog", { name: "Your name, please" });
  await expect(ask).toBeVisible(WAIT);
  await ask.getByRole("textbox").fill("Olive Tan");
  await ask.getByRole("button", { name: "Continue" }).click();
  await expect(phone.getByText("You confirmed it")).toBeVisible(WAIT);

  await phone.getByRole("textbox", { name: "Write a message…" }).fill("All good from the owner.");
  await phone.getByRole("button", { name: "Send message" }).click();
  await expect(phone.getByText("All good from the owner.")).toBeVisible(WAIT);
  await phone.screenshot({ path: test.info().outputPath("package-link-phone.png"), fullPage: true });

  // A wrong link: 「找不到」, nothing about why.
  await phone.goto(`/package/${token.slice(0, -2)}xx`);
  await expect(phone.getByRole("heading", { name: "Not found" })).toBeVisible(WAIT);
  await owner.close();

  // The office: the open, the answer and the message are on the package.
  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await page.goto(`/evidence-packages?package=${packageId}`);
  const sheet = page.getByRole("dialog", { name: `Owner pack ${stamp}` });
  await expect(sheet.getByText("Owner Rep").first()).toBeVisible(WAIT);
  await page.screenshot({ path: test.info().outputPath("package-office-recipients.png"), fullPage: true });
  await expect(sheet.getByText("Olive Tan: confirmed").or(sheet.getByText(/Owner Rep: confirmed/))).toBeVisible(WAIT);
  await sheet.getByRole("tab", { name: "Timeline" }).click();
  await expect(sheet.getByText("Opened").first()).toBeVisible(WAIT);
  await expect(sheet.getByText("Confirmed", { exact: true }).first()).toBeVisible(WAIT);
  await sheet.getByRole("tab", { name: "Messages" }).click();
  await expect(sheet.getByText("All good from the owner.")).toBeVisible(WAIT);
});
