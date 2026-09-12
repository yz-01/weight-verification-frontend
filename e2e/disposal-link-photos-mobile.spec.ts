import fs from "node:fs";
import path from "node:path";

import { expect, test, type APIRequestContext } from "@playwright/test";

import { ACCOUNTS, API, apiLogin } from "./helpers";

/**
 * The outside collector's link asks for photographs and nothing else
 * (T-224, D-116, AC-210).
 *
 * 客户：「因为废料清运是属于外部公司，所以temporary link是不需要填写任何东西的，
 * 只是需要拍照就好了」, and then 「这个也需要他们拍丢废料的地方，就是丢完废料之后
 * 必须要拍照。然后那两个数据从后台补吧」.
 *
 * F-301 found the two gates installed backwards. The link's submit button
 * listed a weight, a trip count and a DO number in `requires` and **said
 * nothing about the photographs**, while the server refused any submission
 * missing one of the four kinds. So the only thing the screen asked for was
 * the typing the customer wants gone, and the thing they want enforced was
 * enforced by an API error after the collector had filled everything in.
 *
 * A fresh task is built through the API for each run rather than using the
 * seeded one. Disposal evidence is append-only and has no delete, so a spec
 * that leant on the fixture would pass once and then find four photographs
 * already uploaded and the task already submitted - the same trap V-444 hit.
 *
 * The negative direction is asserted first and on the *button*: a disabled
 * submit is the whole point of the change, and checking it after uploading
 * everything would prove nothing.
 */

const PHOTO = path.join(__dirname, "fixtures", "loading-photo.png");

/** An approved disposal handed to an outside collector, work started. */
async function freshExternalTask(request: APIRequestContext): Promise<string> {
  const token = await apiLogin(request, ACCOUNTS.contractor, "MSE_TRACE");
  const headers = { Authorization: `Bearer ${token}` };

  const projects = await request.get(
    `${API}/api/projects/get_projects/?page_size=10`,
    { headers },
  );
  expect(projects.ok()).toBe(true);
  const project = (await projects.json()).data.results.find(
    (row: { code: string }) => row.code === "P-E2E",
  );
  expect(project, "the seeded E2E project is missing").toBeTruthy();

  const stamp = Date.now();
  /*
   * `FormData`, not the object form of `multipart`.
   *
   * The request form wants four photographs under the same field name, and
   * `multipart: { photos: [stream, stream] }` is not that - Playwright reads
   * an array there as one value and fails with `stream.on is not a function`.
   * Four `append` calls on the same key is what a browser sends.
   *
   * (These four are a different gate from the execution photos this spec is
   * about: they are the site's own photographs of the waste being reported.)
   */
  const form = new FormData();
  form.append("project", project.id);
  form.append("waste_description", "Strip-out debris");
  form.append("location_description", "Rear compound");
  form.append("client_event_id", `e2e-disposal-${stamp}`);
  form.append("latitude", "3.1390000");
  form.append("longitude", "101.6869000");
  const bytes = fs.readFileSync(PHOTO);
  for (let index = 0; index < 4; index += 1) {
    form.append(
      "photos",
      new Blob([bytes], { type: "image/png" }),
      `waste-${index}.png`,
    );
  }
  const created = await request.post(
    `${API}/api/site-disposals/create_request/`,
    { headers, multipart: form },
  );
  expect(created.status(), await created.text()).toBe(201);
  const disposalId = (await created.json()).data.id;

  const approved = await request.post(
    `${API}/api/site-disposals/${disposalId}/review_request/`,
    { headers, data: { decision: "APPROVED", note: "Proceed" } },
  );
  expect(approved.status(), await approved.text()).toBe(200);

  const assigned = await request.post(
    `${API}/api/site-disposals/${disposalId}/assign_collector/`,
    {
      headers,
      data: {
        collector_company_name: "Clean Site Services",
        collector_contact_name: "External Executor",
        collector_phone: "+60123456789",
        expires_at: new Date(stamp + 2 * 24 * 3600 * 1000).toISOString(),
      },
    },
  );
  expect(assigned.status(), await assigned.text()).toBe(200);
  return (await assigned.json()).data.external_token;
}

test("the disposal link cannot be submitted until every photograph is taken", async ({
  page,
  request,
}) => {
  const token = await freshExternalTask(request);
  await page.goto(`/disposal-task/${token}`);

  await page.getByRole("button", { name: "Start disposal work" }).click();
  await expect(page.getByText("Required photos")).toBeVisible({
    timeout: 20_000,
  });

  const submit = page.getByRole("button", { name: "Send for verification" });
  await expect(submit).toBeVisible();

  /*
   * Before: nothing uploaded, so the button refuses.
   *
   * Asserted as disabled rather than clicked. `Button`'s `requires` prop
   * genuinely sets `disabled` and writes its own reason naming what is
   * missing, so clicking would hang waiting for an enabled control - which
   * is what the first version of this spec did.
   *
   * The reason text is checked too, because a disabled button with no
   * explanation is the complaint the `requires` prop exists to answer
   * (「有时候我不知道为什么这个按钮点不到」).
   */
  await expect(submit).toBeDisabled();
  await expect(page.getByText("Required photos")).toBeVisible();

  // Three of the four: still refused, and this is the half the customer added
  // last - `UNLOADING` is 「丢废料的地方」.
  for (const kind of ["LOADING", "DISPOSAL_DO", "OTHER"]) {
    const uploaded = await request.post(
      `${API}/api/external-disposal-task/${token}/`,
      {
        multipart: {
          operation: "add_evidence",
          kind,
          client_event_id: `e2e-${kind}-${Date.now()}`,
          image: fs.createReadStream(PHOTO),
        },
      },
    );
    expect(uploaded.ok(), await uploaded.text()).toBeTruthy();
  }
  await page.reload();
  // Three of four: still refused, and by name - `UNLOADING` is the one the
  // customer added, and it is the one still missing.
  await expect(
    page.getByRole("button", { name: "Send for verification" }),
  ).toBeDisabled();

  // With the tipping photograph too: accepted, and nothing was typed.
  const last = await request.post(
    `${API}/api/external-disposal-task/${token}/`,
    {
      multipart: {
        operation: "add_evidence",
        kind: "UNLOADING",
        client_event_id: `e2e-UNLOADING-${Date.now()}`,
        image: fs.createReadStream(PHOTO),
      },
    },
  );
  expect(last.ok(), await last.text()).toBeTruthy();

  await page.reload();
  const ready = page.getByRole("button", { name: "Send for verification" });
  await expect(ready).toBeEnabled({ timeout: 20_000 });
  await ready.click();
  await expect(page.getByText("Sent for verification")).toBeVisible({
    timeout: 20_000,
  });
});

test("the disposal link asks for no weight, trip count or DO number", async ({
  page,
  request,
}) => {
  const token = await freshExternalTask(request);
  await page.goto(`/disposal-task/${token}`);
  await page.getByRole("button", { name: "Start disposal work" }).click();
  await expect(page.getByText("Required photos")).toBeVisible({
    timeout: 20_000,
  });

  // Asserted by absence, because that is the change. Three labels the outside
  // company used to have to fill in; the contractor types them now, on their
  // own confirmation screen, reading them off these photographs.
  for (const label of [
    "Actual weight (kg)",
    "Number of trips",
    "Disposal DO number",
  ]) {
    await expect(
      page.getByText(label, { exact: true }),
      `the link still asks for ${label}`,
    ).toHaveCount(0);
  }
  // The note stays: optional, and the only way a collector can say something
  // went wrong. "Nothing to fill in" is not the same as "nothing to say".
  await expect(page.getByRole("textbox")).toHaveCount(1);
});
