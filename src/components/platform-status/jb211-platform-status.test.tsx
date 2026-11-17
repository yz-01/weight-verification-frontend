/**
 * JB211 (Lucas 11-16 「把它们真的做出来」; 「要站在老人家的角度去思考」): what a
 * person sees of 11.2.11 系统维护, 11.2.9 强制更新 and 11.2.1 联络资料 - the
 * banner, the full-screen notice, 联系 MSE, the bill's 开票方, and 版本管理's
 * 「这台电脑正在用的版本」.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh.json";
import { ApiError } from "@/interfaces/api";
import { APP_VERSION } from "@/lib/app-version";
import {
  contactLines,
  issuerLines,
  maintenanceWindowWording,
  showsMaintenanceBanner,
  type PlatformContact,
  type PlatformMaintenance,
} from "@/lib/platform-status";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));
vi.mock("@/components/shared/data-table", () => ({
  DataTable: () => null,
  SortableHeader: () => null,
}));

const { MaintenanceBanner, MaintenanceNotice } = await import(
  "@/components/platform-status/maintenance-banner"
);
const { PlatformGateScreen, maintenanceIsOver } = await import(
  "@/components/platform-status/platform-gate-overlay"
);
const { ContactMse } = await import("@/components/platform-status/contact-mse");
const { InvoiceIssuerBlock } = await import("@/components/billing/invoice-issuer");
const { VersionList } = await import("@/components/platform-settings/version-list");
const { refusalForMse } = await import("@/components/auth/login");
const { PLATFORM_STATUS_KEY } = await import("@/hooks/use-platform-status");

const CONTACT: PlatformContact = {
  company_name: "MSE Technology Sdn Bhd",
  registration_no: "202401012345 (1234567-X)",
  address: "Lot 8, Jalan Industri\nShah Alam",
  phone: "+603-1234 5678",
  email: "support@mse.example",
  website: "",
};

const NOW = new Date("2026-11-20T10:00:00+08:00");
const ACTIVE: PlatformMaintenance = {
  active: true,
  upcoming: false,
  service_stopped: false,
  starts_at: "2026-11-20T09:00:00+08:00",
  ends_at: "2026-11-20T12:00:00+08:00",
  notice: "Moving to a new server",
};
const OFF: PlatformMaintenance = {
  active: false,
  upcoming: false,
  service_stopped: false,
  starts_at: null,
  ends_at: null,
  notice: "",
};

function render(node: ReactNode, { locale = "zh", seed }: { locale?: "zh" | "en"; seed?: unknown } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed !== undefined) client.setQueryData(PLATFORM_STATUS_KEY, seed);
  client.setQueryData(["app-versions"], []);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "zh" ? zh : en}
        timeZone="Asia/Kuala_Lumpur"
        now={NOW}
      >
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("JB211-F5 the 系统维护 banner", () => {
  it("shows the window and MSE's words while maintenance is under way", () => {
    const html = render(<MaintenanceBanner />, { seed: { maintenance: ACTIVE, contact: CONTACT } });
    expect(html).toContain('data-testid="maintenance-banner"');
    expect(html).toContain('data-state="active"');
    expect(html).toContain("系统维护中：");
    expect(html).toContain(" 至 ");
    expect(html).toContain("Moving to a new server");
    expect(html).toContain(zh.platformStatus.maintenance.customerNote);
  });

  it("says it ahead of time while it is still coming", () => {
    const html = render(
      <MaintenanceNotice maintenance={{ ...ACTIVE, active: false, upcoming: true }} staff />,
    );
    expect(html).toContain('data-state="upcoming"');
    expect(html).toContain("系统维护通知：");
    expect(html).toContain(zh.platformStatus.maintenance.staffNote);
  });

  it("shows nothing when there is no maintenance, or no answer", () => {
    expect(render(<MaintenanceBanner />, { seed: { maintenance: OFF, contact: CONTACT } })).toBe("");
    expect(render(<MaintenanceBanner />)).toBe("");
  });

  it("words each kind of window", () => {
    expect(maintenanceWindowWording(ACTIVE)).toBe("between");
    expect(maintenanceWindowWording({ ...ACTIVE, ends_at: null })).toBe("from");
    expect(maintenanceWindowWording({ ...ACTIVE, starts_at: null })).toBe("until");
    expect(maintenanceWindowWording({ ...ACTIVE, starts_at: null, ends_at: null })).toBe("open");
    expect(maintenanceWindowWording({ ...ACTIVE, service_stopped: true })).toBe("stopped");
    expect(showsMaintenanceBanner(OFF)).toBe(false);
    expect(showsMaintenanceBanner(null)).toBe(false);
  });
});

describe("JB211-F6 the full-screen notice", () => {
  it("系统维护: what is happening, that nothing is lost, and who to call", () => {
    const html = render(
      <PlatformGateScreen gate="maintenance" maintenance={ACTIVE} contact={CONTACT} onReload={() => undefined} />,
    );
    expect(html).toContain('data-gate="maintenance"');
    expect(html).toContain(zh.platformStatus.gate.maintenanceTitle);
    expect(html).toContain("Moving to a new server");
    expect(html).toContain(zh.platformStatus.gate.nothingLost);
    expect(html).toContain(zh.platformStatus.gate.tryAgain);
    expect(html).toContain("tel:+60312345678");
    expect(html).toContain("support@mse.example");
  });

  it("「系统已更新」: one big 【重新载入】, and a calmer line when the old build came back", () => {
    const first = render(
      <PlatformGateScreen gate="update" maintenance={null} contact={null} onReload={() => undefined} />,
    );
    expect(first).toContain(zh.platformStatus.gate.updateTitle);
    expect(first).toContain(zh.platformStatus.gate.reload);
    expect(first).not.toContain('data-testid="update-still-old"');

    const again = render(
      <PlatformGateScreen gate="update" maintenance={null} contact={null} reloadedRecently onReload={() => undefined} />,
    );
    expect(again).toContain(zh.platformStatus.gate.updateStillOld);
  });

  it("系统维护 goes away by itself only on an answer newer than the screen", () => {
    const raised = 1_000;
    // The answer the page held from before the maintenance said 「off」: not over.
    expect(maintenanceIsOver({ gate: "maintenance", maintenance: OFF, answeredAt: raised, answerWhenRaised: raised })).toBe(false);
    // A later answer still says it is on: not over.
    expect(maintenanceIsOver({ gate: "maintenance", maintenance: ACTIVE, answeredAt: raised + 60_000, answerWhenRaised: raised })).toBe(false);
    // A later answer says it is off: reload, still signed in.
    expect(maintenanceIsOver({ gate: "maintenance", maintenance: OFF, answeredAt: raised + 60_000, answerWhenRaised: raised })).toBe(true);
    // No answer at all yet (0 = never fetched) never counts.
    expect(maintenanceIsOver({ gate: "maintenance", maintenance: null, answeredAt: 0, answerWhenRaised: 0 })).toBe(false);
    // The update screen waits for 【重新载入】, never reloads by itself.
    expect(maintenanceIsOver({ gate: "update", maintenance: OFF, answeredAt: raised + 60_000, answerWhenRaised: raised })).toBe(false);
  });
});

describe("JB211-F7 联系 MSE and the bill's 开票方 (11.2.1)", () => {
  it("lists only what MSE filled in", () => {
    expect(contactLines(CONTACT).map((line) => line.kind)).toEqual(["phone", "email"]);
    expect(contactLines({ ...CONTACT, website: "www.mse.example" })[2].href).toBe("https://www.mse.example");
    const html = render(<ContactMse contact={CONTACT} />);
    expect(html).toContain(zh.platformStatus.contact.title);
    expect(html).toContain("+603-1234 5678");
    expect(html).not.toContain(zh.platformStatus.contact.website);
    expect(render(<ContactMse contact={{ ...CONTACT, phone: "", email: "" }} />)).toBe("");
  });

  it("puts the issuer on the bill: name, registration number, address", () => {
    const html = render(<InvoiceIssuerBlock contact={CONTACT} />);
    expect(html).toContain(zh.platformStatus.issuer.title);
    expect(html).toContain("MSE Technology Sdn Bhd");
    expect(html).toContain("公司注册号码：202401012345 (1234567-X)");
    expect(html).toContain("Shah Alam");
    expect(issuerLines({ ...CONTACT, company_name: "", registration_no: "", address: "" })).toBeNull();
    expect(render(<InvoiceIssuerBlock contact={null} />)).toBe("");
  });

  it("shows MSE's contact under the refusals only MSE can lift", () => {
    expect(refusalForMse(new ApiError("", 403, {}, "company_suspended"))).toBe(true);
    expect(refusalForMse(new ApiError("", 503, {}, "platform_maintenance"))).toBe(true);
    expect(refusalForMse(new ApiError("", 401, {}, "invalid_credentials"))).toBe(false);
  });
});

describe("JB211-F8 版本管理 shows this computer's version", () => {
  it("says which build this browser runs", () => {
    const html = render(<VersionList />);
    expect(html).toContain('data-testid="this-computer-version"');
    expect(html).toContain(`这台电脑正在用的版本：v${APP_VERSION}`);
  });
});
