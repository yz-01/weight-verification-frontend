import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

/**
 * The external collector's link must show the photograph it just took (F-289).
 *
 * The customer reported it as 废料清运 temporary link 的拍照好像不能 preview.
 * `FieldCamera` has drawn a thumbnail from a local `File` since 2026-09-05,
 * but these two disposal screens post each shot the moment it is taken and
 * then re-read the record, so they hold no `File` and were passing only
 * `fileCount` - which renders the same "photo ready" line and camera icon as
 * an empty slot. T-225 gave the component a `previewUrl` for a photograph the
 * server already holds, and wired both disposal screens to it.
 *
 * The upload here goes through the API rather than the camera. That is
 * deliberate: the change under test is *rendering a stored photograph*, and
 * the capture path it replaces was never broken. Driving the real camera would
 * need a fake media stream and would test `FieldCamera`'s capture instead of
 * the fix.
 *
 * Reloading after the upload is the second half of the report: the collector
 * is an outside company on a phone with a poor connection, so a preview that
 * only lived in page memory would disappear on the first refresh. The stored
 * URL is what makes it survive, which is why it is preferred over holding the
 * local `File`.
 *
 * The task and its token are seeded by `manage.py seed_e2e`
 * (`EXTERNAL_DISPOSAL_TOKEN`), so this link needs no console step to issue it.
 */

const TOKEN = "e2e-external-disposal-token";
const PATH = `/disposal-task/${TOKEN}`;
const API = "http://127.0.0.1:8199";

/**
 * A real 240x180 PNG on disk, not an inline base64 pixel.
 *
 * The server validates the upload through Pillow, and a hand-written 1x1
 * data URI was rejected as "not an image or a corrupted image". A checked-in
 * file is also what a reader can open to see what the test uploaded.
 */
const PHOTO = path.join(__dirname, "fixtures", "loading-photo.png");

test("the external disposal link shows a photograph it already holds", async ({
  page,
  request,
}) => {
  // ASSIGNED hides the photo section until the collector says they have
  // started, which is the real order of events on site.
  await page.goto(PATH);
  await expect(page.getByRole("heading", { name: "Disposal task" })).toBeVisible(
    { timeout: 30_000 },
  );
  const start = page.getByRole("button", { name: "Start disposal work" });
  if (await start.isVisible()) await start.click();
  await expect(page.getByText("Required photos")).toBeVisible({
    timeout: 20_000,
  });

  const tile = page
    .locator("button")
    .filter({ hasText: "Loading photo" })
    .first();
  await expect(tile).toBeVisible({ timeout: 20_000 });

  /*
   * There is deliberately no "the slot is empty first" assertion.
   *
   * Evidence is append-only and this token has no delete, so such an
   * assertion passes once and fails on every later run against the same
   * seeded task - a test that only works the first time is worse than none.
   * The property under test is that a photograph the *server* holds is drawn,
   * which this asserts idempotently. The negative direction is covered
   * properly by the teeth check recorded for V-444: with the T-225 change
   * reverted, the same upload leaves the tile with no `img` at all.
   */
  const uploaded = await request.post(`${API}/api/external-disposal-task/${TOKEN}/`, {
    multipart: {
      operation: "add_evidence",
      kind: "LOADING",
      client_event_id: `e2e-preview-${Date.now()}`,
      image: fs.createReadStream(PHOTO),
    },
  });
  expect(uploaded.ok(), await uploaded.text()).toBeTruthy();

  // After: the same slot draws the stored photograph and offers a retake.
  await page.reload();
  await expect(page.getByText("Required photos")).toBeVisible({
    timeout: 20_000,
  });
  await expect(tile.locator("img")).toHaveCount(1);
  await expect(tile).toContainText("Tap to retake");
});
