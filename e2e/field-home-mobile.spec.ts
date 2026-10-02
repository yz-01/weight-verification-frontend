import { expect, test, type Page } from "@playwright/test";

import { loginAsFieldStaff } from "./helpers";

/**
 * The field home shows tasks, the avatar upload and what I sent, in that order
 * (T-209, customer 图2).
 *
 * Their words: 「首页只需要放任务，上传头像和图2就好」. The third block was on
 * this screen once and went out with the tile grid in `e754025`; the component
 * survived untouched and the driver dashboard has rendered it the whole time.
 *
 * This is the half the source guard cannot make: `field-home-composition.test.ts`
 * proves the three components are written into `FieldHomePanel` in that order,
 * which is not the same claim as three blocks a worker can actually see coming
 * down a 390px screen. A block behind a query that never resolves, or under a
 * `hidden` class, satisfies the source and fails here.
 *
 * The order is read off the rendered geometry rather than the DOM, because
 * geometry is what the customer was describing.
 *
 * It asserts the third block's *heading*, not its rows: a brand-new account
 * has sent nothing, and requiring a row would tie the spec to fixture history.
 *
 * Signed in with the task cards kept on screen: what these check is the
 * to-do card itself.
 */

async function allowLocation(page: Page) {
  // The workspace asks for a fix on open and puts a modal over the home until
  // it has one, so without this the whole screen is behind a dialog.
  await page.context().grantPermissions(["geolocation"], {
    origin: "http://localhost:3199",
  });
  await page.context().setGeolocation({ latitude: 3.139, longitude: 101.6869 });
}

test("the field home carries tasks, the avatar and what I sent, in that order", async ({
  page,
}) => {
  await allowLocation(page);
  await loginAsFieldStaff(page);

  const tasks = page.getByRole("heading", { name: "My tasks" });
  const avatar = page.getByText("Your photo", { exact: true });
  const sent = page.getByRole("heading", { name: "What I sent" });

  await expect(tasks).toBeVisible({ timeout: 30_000 });
  await expect(avatar).toBeVisible({ timeout: 20_000 });
  await expect(sent).toBeVisible({ timeout: 20_000 });

  const tops = await Promise.all(
    [tasks, avatar, sent].map(async (block) => {
      const box = await block.boundingBox();
      expect(box, "a block the assertions above found has no box").not.toBeNull();
      return box!.y;
    }),
  );
  // Strictly increasing down the page, which is the customer's order.
  expect(tops, `blocks appeared at y=${tops.join(", ")}`).toEqual(
    [...tops].sort((a, b) => a - b),
  );
  expect(new Set(tops).size, "two blocks share a y - they cannot both be read").toBe(3);

  // The handoff link stays reachable below them: it is the only way to move a
  // field session to another phone, and there is no profile screen here.
  await expect(page.getByText("Move this login to another phone")).toBeVisible();
});

/**
 * One 「My tasks」, one number (L1).
 *
 * The home used to say 「0 waiting on you」 in the card and 「1 active task」 in
 * a task list under a second 「My tasks」 heading, while the bell counted
 * every notice, news included. D04: 统一 My Tasks；手机首页上方显示待办.
 *
 * The seeded task is in progress and was assigned the way a real one is, so
 * it is one of the rows - by its own name, not only the words every
 * assignment shares.
 */
test("the field home has one My Tasks, and the red dot is its number", async ({
  page,
}) => {
  await allowLocation(page);
  await loginAsFieldStaff(page);

  const heading = page.getByRole("heading", { name: "My tasks" });
  await expect(heading).toBeVisible({ timeout: 30_000 });
  await expect(heading, "a second My tasks is the duplicate L1 removed").toHaveCount(1);
  await expect(page.getByText(/\bactive tasks?\b|No active tasks/)).toHaveCount(0);

  const card = heading.locator("xpath=ancestor::section[1]");
  const summary = card.getByText(/^\d+ waiting on you$/);
  await expect(summary).toBeVisible({ timeout: 20_000 });
  const waiting = Number((await summary.innerText()).match(/^\d+/)![0]);
  expect(waiting, "the seeded task is assigned and in progress").toBeGreaterThan(0);

  // Every row the number counts is listed - not the first five of seven.
  await expect(card.locator("ul > li")).toHaveCount(waiting, { timeout: 20_000 });

  // And the bell's red dot says the same number.
  await expect(
    page.getByRole("button", { name: `${waiting} outstanding`, exact: true }),
  ).toBeVisible({ timeout: 20_000 });

  // A task row says which task, and opens it where its controls are.
  const row = card.getByRole("button", { name: /Inspect E2E material delivery/ });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/tab=tasks&task=/, { timeout: 20_000 });
  await expect(
    page.getByRole("heading", { name: "Inspect E2E material delivery" }),
  ).toBeVisible({ timeout: 20_000 });
});
