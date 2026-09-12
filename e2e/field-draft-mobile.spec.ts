import { expect, test, type Page } from "@playwright/test";

import { loginAsFieldStaff } from "./helpers";

/**
 * The draft banner must not lie (F-282).
 *
 * All nine field record forms are wrapped in `<FieldDraft>`, whose banner is
 * rendered unconditionally. Six of them kept their values in plain `useState`,
 * so nothing was ever written to the store and the banner sat permanently in
 * its `empty` state - which reads "Your entries are saved on this device."
 * That is a present-tense promise, not a neutral "nothing saved yet", so a
 * worker who mis-tapped lost everything they had typed while the screen told
 * them it was safe. `field-draft-coverage.test.ts` guards the wiring at source
 * level; this file is the half that source cannot prove - type, close the
 * page, reopen it, and see the value come back.
 *
 * Verified to have teeth: with the T-212 wiring stashed, every case here fails
 * on the missing `[data-draft-status="saved"]`, because an unwired form never
 * leaves `empty`.
 *
 * Closing the page rather than reloading is deliberate: a reload can be served
 * from memory, while `page.close()` followed by a fresh page in the same
 * context is the closest thing to a worker mis-tapping out of the app and
 * coming back, which is the reported failure.
 *
 * The filename ends in `mobile.spec.ts` on purpose. The project matchers in
 * `playwright.config.ts` are unanchored regexes, so this name puts the file in
 * the iPhone 12 project and out of the desktop one - these are phone screens,
 * and AC-200 is written against a 390px viewport.
 *
 * Every case reaches its form by URL, with no seeded task, so the spec does
 * not depend on fixture data a future seed change could move. Disposal needs
 * one click because its console does not auto-open the dialog without a task.
 * All four were among the six broken forms.
 */

const ORIGIN = "http://localhost:3199";

/** A `FieldWrapper` row's own control, found through its label text. */
function labelledInput(page: Page, label: string) {
  return page
    .locator("label")
    .filter({ hasText: label })
    .locator("..")
    .locator("input, textarea")
    .first();
}

/**
 * One case per modified module, not one per form.
 *
 * The six forms fixed in T-212 live in three modules and share one hook and
 * one store, so the risk that varies between them is the module wiring rather
 * than the field list. These three cases cover all three modules:
 * `field-records-panel.tsx` (consultant, waste), `site-disposal-workspaces.tsx`
 * (disposal) and `operations-workspaces.tsx` (progress). Equipment and
 * material-outgoing are the two left to the source guard - both sit in the
 * same module and use the same hook as progress, and neither is reachable
 * without either a seeded equipment row or an extra click through a console
 * list, which would tie this spec to fixture data.
 */
const FORMS = [
  {
    mode: "consultant",
    heading: "Consultant submission",
    // `<Textarea placeholder={t("consultantCapture.note")} />`
    field: (page: Page) => page.getByPlaceholder("Extra note (optional)"),
    value: () => `consultant draft ${Date.now()}`,
  },
  {
    mode: "waste",
    heading: "Environmental material outgoing",
    // Was `Collection address` until T-227 removed that input from this form
    // - the office fills the order address in now. `Note` is the remaining
    // free-text field on the same form, so this case still exercises the same
    // wiring it was written for.
    field: (page: Page) => labelledInput(page, "Note"),
    value: () => `waste draft ${Date.now()}`,
  },
  {
    mode: "disposal",
    heading: "Waste disposal",
    // This console does not auto-open its dialog without a task.
    open: async (page: Page) => {
      await page.getByRole("button", { name: "New request" }).click();
      await expect(
        page.getByRole("heading", { name: "New disposal request" }),
      ).toBeVisible({ timeout: 20_000 });
    },
    field: (page: Page) => labelledInput(page, "Debris / waste description"),
    value: () => `disposal draft ${Date.now()}`,
  },
  {
    mode: "progress",
    // `create=1` is the console's own deep link into the record dialog, and
    // that dialog is modal: Radix marks the rest of the page `aria-hidden`,
    // so the frame title behind it is in the DOM but not in the a11y tree.
    // The heading to wait for is therefore the dialog's own, not the frame's.
    query: "&create=1",
    heading: "New progress evidence",
    field: (page: Page) => labelledInput(page, "Actual completion (%)"),
    // A percent is `input[type=number]`, which refuses free text. Any value
    // in range proves restoration as long as it is not the field's default.
    value: () => String(1 + Math.floor(Math.random() * 98)),
  },
] as const;

for (const form of FORMS) {
  test(`field staff ${form.mode} draft survives closing and reopening the form`, async ({
    page,
    context,
  }) => {
    // These screens ask for a fix on open; an unanswered prompt would stall
    // the run rather than fail it.
    await context.grantPermissions(["geolocation"], { origin: ORIGIN });
    await context.setGeolocation({ latitude: 3.139, longitude: 101.6869 });

    const query = "query" in form ? form.query : "";
    const url = `/field-staff?tab=records&record=${form.mode}${query}`;
    await loginAsFieldStaff(page);
    await page.goto(url);
    await expect(
      page.getByRole("heading", { name: form.heading }),
    ).toBeVisible({ timeout: 20_000 });
    if ("open" in form) await form.open(page);

    const typed = form.value();
    await form.field(page).fill(typed);

    // The banner is the promise under test, so wait for the state it claims
    // rather than for a fixed delay.
    await expect(page.locator('[data-draft-status="saved"]')).toBeVisible({
      timeout: 20_000,
    });

    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(url);
    if ("open" in form) await form.open(reopened);
    await expect(form.field(reopened)).toHaveValue(typed, { timeout: 20_000 });
  });
}
