import { expect, test } from "@playwright/test";

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
 * `mobile.spec.ts` already signs this account in and checks the task tiles, so
 * this file deliberately asserts only the composition - and it asserts the
 * third block's *heading*, not its rows: a brand-new account has sent nothing,
 * and requiring a row would tie the spec to fixture history.
 */

test("the field home carries tasks, the avatar and what I sent, in that order", async ({
  page,
  context,
}) => {
  // The workspace asks for a fix on open and puts a modal over the home until
  // it has one, so without this the whole screen is behind a dialog.
  await context.grantPermissions(["geolocation"], {
    origin: "http://localhost:3199",
  });
  await context.setGeolocation({ latitude: 3.139, longitude: 101.6869 });

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
