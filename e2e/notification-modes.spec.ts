import { expect, test } from "@playwright/test";
import { ACCOUNTS, API, apiLogin, loginAs, LOGIN_PATHS } from "./helpers";

test("notification switches and modes persist across both admin pages", async ({ page, request }) => {
  const token = await apiLogin(request, ACCOUNTS.admin, "MSE_ADMIN");
  const headers = { Authorization: `Bearer ${token}` };
  const status = await request.get(`${API}/api/notifications/get_channel_status/`, { headers });
  expect(status.ok()).toBe(true);
  const original = (await status.json()).data.channels.find((row: { channel: string }) => row.channel === "EMAIL");
  const setConfig = async (key: string, value: string | boolean) => {
    const saved = await request.post(`${API}/api/platform-config/set_config/`, { headers, data: { key, value } });
    expect(saved.ok()).toBe(true);
  };

  try {
    await setConfig("notification.email.enabled", false);
    await setConfig("notification.email.mode", "SIMULATED");
    await loginAs(page, LOGIN_PATHS.admin, ACCOUNTS.admin);
    await page.goto("/notifications/channels");
    const enabled = page.getByRole("switch", { name: "Enable Email", exact: true });
    const mode = page.getByRole("combobox", { name: "Email mode", exact: true });
    await expect(enabled).not.toBeChecked();
    await expect(mode).toHaveValue("SIMULATED");
    await enabled.click();
    await expect(enabled).toBeChecked();
    await mode.selectOption("LIVE");
    await expect(mode).toHaveValue("LIVE");
    await expect(mode).toBeEnabled();

    await page.goto("/system-settings/notifications");
    await expect(page.getByRole("switch", { name: "Email enabled", exact: true })).toBeChecked();
    const settingsMode = page.getByLabel("Email mode", { exact: true });
    await expect(settingsMode).toHaveValue("LIVE");
    await settingsMode.selectOption("SIMULATED");
    const save = settingsMode.locator("..").getByRole("button", { name: "Save", exact: true });
    await save.click();
    await expect(save).toBeDisabled();

    await page.goto("/notifications/channels");
    await expect(mode).toHaveValue("SIMULATED");
    await expect(enabled).toBeChecked();
    await enabled.click();
    await expect(enabled).not.toBeChecked();
    await expect(enabled).toBeEnabled();
    await page.reload();
    await expect(enabled).not.toBeChecked();
    await expect(mode).toHaveValue("SIMULATED");
    await expect(page.getByText(/^Simulated only — not sent:/).first()).toBeVisible();
  } finally {
    await setConfig("notification.email.enabled", original.enabled);
    await setConfig("notification.email.mode", original.configured_mode);
  }
});
