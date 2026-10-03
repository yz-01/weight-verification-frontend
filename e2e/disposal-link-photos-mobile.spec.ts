import fs from "node:fs";
import path from "node:path";

import { expect, test, type APIRequestContext } from "@playwright/test";

import { API, freshExternalTask } from "./helpers";

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


async function sendPhoto(request: APIRequestContext, token: string, event: string) {
  return request.post(`${API}/api/external-disposal-task/${token}/`, {
    multipart: {
      operation: "add_evidence",
      kind: "DISPOSAL_PROOF",
      client_event_id: event,
      image: fs.createReadStream(PHOTO),
    },
  });
}

/*
 * L6 / B24 replaced the four-kind gate this file was written for (F-301):
 * 「取消装车 / 卸货 / DO / 其他四类强制模板」, 「一次最多 4 张，不要求拍满」 -
 * and 「没有最终处理证明不能算完成」, so none is still refused.
 *
 * E04 then made Submit the end: 「Submit 最终处理证明后马上停止加照片，任务
 * 结束、链接失效」 - no waiting for the site to check, and the server refuses
 * anything sent to the link afterwards.
 */
test("the disposal link needs one photo, takes no more than four, and Submit ends it", async ({
  page,
  request,
}) => {
  const token = await freshExternalTask(request);
  await page.goto(`/disposal-task/${token}`);

  await page.getByRole("button", { name: "Start disposal work" }).click();
  await expect(page.getByText("Final disposal proof (up to 4 photos)").first()).toBeVisible({
    timeout: 20_000,
  });

  // None yet: refused, and the button says so rather than failing on click.
  const submit = page.getByRole("button", { name: "Submit final disposal proof (ends the job)" });
  await expect(submit).toBeDisabled();

  // One photograph of no particular kind is enough.
  const stamp = Date.now();
  const first = await sendPhoto(request, token, `e2e-b24-${stamp}-0`);
  expect(first.ok(), await first.text()).toBeTruthy();
  for (let index = 1; index < 4; index += 1) {
    const more = await sendPhoto(request, token, `e2e-b24-${stamp}-${index}`);
    expect(more.ok(), await more.text()).toBeTruthy();
  }
  // A fifth is refused by the server.
  const fifth = await sendPhoto(request, token, `e2e-b24-${stamp}-4`);
  expect(fifth.status()).toBe(409);

  await page.reload();
  const ready = page.getByRole("button", { name: "Submit final disposal proof (ends the job)" });
  await expect(ready).toBeEnabled({ timeout: 20_000 });
  await ready.click();
  await expect(page.getByText("Job finished")).toBeVisible({ timeout: 20_000 });

  // The link is closed on the server, not just on this screen.
  const late = await sendPhoto(request, token, `e2e-b24-${stamp}-late`);
  expect(late.status()).toBe(404);
  await page.reload();
  await expect(page.getByText("Task link unavailable")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Submit final disposal proof (ends the job)" })).toHaveCount(0);
});

test("the link handed out at approval works with no collector assigned (D10)", async ({
  page,
  request,
}) => {
  const token = await freshExternalTask(request, { atApproval: true });
  await page.goto(`/disposal-task/${token}`);

  await page.getByRole("button", { name: "Start disposal work" }).click();
  await expect(page.getByText("Final disposal proof (up to 4 photos)").first()).toBeVisible({
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
  await expect(page.getByText("Final disposal proof (up to 4 photos)").first()).toBeVisible({
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
