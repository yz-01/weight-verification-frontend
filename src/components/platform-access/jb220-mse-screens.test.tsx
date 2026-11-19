/**
 * Every mixed (C) MSE screen of the JB220 plan says 「客户未开放」 where a
 * customer withheld a field, with one line above saying why and whom to ask -
 * never a blank cell, a dash that reads as missing data, or 「加载失败」 (客户
 * 11-18; contract §3, §8.3).
 *
 * A screen added to the plan's list without the pieces fails here. Where a
 * screen can be drawn on its own it is rendered; the rest are read in source.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import zh from "@/messages/zh.json";

const reader = vi.hoisted(() => ({ superuser: false }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/companies/c-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "mse-1", is_platform_staff: true, is_superuser: reader.superuser, company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" } },
    can: () => true,
  }),
}));
vi.mock("@/components/ui/dialog", async () => (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule());

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { ExpiredVisitorPhotosDialog } = await import("@/components/site-access/visitor-privacy-settings");
const { OwnerAccountPanel } = await import("@/components/companies/owner-account-panel");

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

/** The plan's C screens and the pieces each must use. */
const SCREENS: Array<[string, string[]]> = [
  ["src/components/weighing/admin-cwe-workspace.tsx", ["<PlatformClosedNote rows={sessions}", "<ClosedOr row={row} value={row.vehicle_plate}"]],
  ["src/components/weighing/view-weigh-session.tsx", ["closedValue(record, record.vehicle_plate)", "<PlatformClosedPhotos", "platform_access_closed"]],
  ["src/components/monitoring/monitoring-workspace.tsx", ["<PlatformClosedNote rows={query.data?.results} />", "<PlatformClosedNote rows={rows} />", "<ClosedOr row={row} value={row.credential_hint}", "isPlatformClosed(row) ? (\n                      <PlatformClosedCell />"]],
  ["src/components/qrcodes/admin-qr-workspace.tsx", ["<PlatformClosedNote rows={codes.data?.results} />", "<PlatformClosedNote rows={scans.data?.results} />", "<ClosedOr row={code} value={code.subject_label}", "<ClosedOr row={scan} value={scan.scanned_by_name}"]],
  ["src/components/notifications/admin-notification-workspace.tsx", ["<PlatformClosedNote rows={notifications.data?.results} />", "<ClosedOr row={row} value={row.title} />", "<ClosedOr row={row} value={row.notification_title} />"]],
  ["src/components/audit/audit-logs.tsx", ['t("mseAccess.closed.auditHidden")', "hidden_customer_rows"]],
  ["src/components/reports/admin-report-workspace.tsx", ["<PlatformClosedNote hidden />", 'root("errors.api.platform_access_view_only")', "previewOnlyReason={previewOnly}"]],
  ["src/components/dashboard/admin-dashboard.tsx", ["<PlatformHiddenPins count={data.map.hidden_project_pins}"]],
  ["src/components/site-access/visitor-privacy-settings.tsx", ["<PlatformClosedNote rows={data.photos} />", "<ClosedOr row={row} value={row.visitor} />"]],
  ["src/components/shared/record-send-log.tsx", ["<PlatformClosedNote hidden={platformHidden}"]],
];

describe("every C screen of the plan (JB220-2)", () => {
  it.each(SCREENS)("%s says 「客户未开放」 and why", (file, pieces) => {
    const source = read(file);
    for (const piece of pieces) expect(source, piece).toContain(piece);
  });

  it("the pieces' words are the contract's (§8.3)", () => {
    expect(zh.mseAccess.closed.cell).toBe("客户未开放");
    expect(zh.mseAccess.closed.note).toBe(
      "客户没有开放查看的资料，这里只显示数量和状态；需要时请客户管理员在「公司设置」里点「允许 MSE 查看」。",
    );
    expect(zh.mseAccess.closed.auditHidden).toBe(
      "这里只显示 MSE 同事的操作、登录记录和已开放客户的操作；客户自己同事的操作要客户开放查看后才显示。",
    );
    expect(zh.mseAccess.reason.externalLink).toBe("帮客户开外部访问链接要客户先开放「允许 MSE 查看」。");
  });
});

describe("过期访客照片 on MSE's company page", () => {
  const dialog = (photos: unknown[]) =>
    renderDetail(<ExpiredVisitorPhotosDialog companyId="c-1" onClose={() => {}} />, (client) => {
      client.setQueryData(["visitor-photos", "expired", "c-1"], {
        retention_months: 12, cutoff: "2025-11-18", count: photos.length, photos, purges: [],
      });
    });
  const PHOTO = { id: "p1", source: "arrival_photo", pass_no: "VP-0001", project_name: "示范商业大厦一期", direction: "ENTRY", taken_at: "2025-10-01T09:00:00+08:00" };

  it("a closed customer's visitor names read 「客户未开放」; pass, project and 清除 stay", () => {
    const html = dialog([{ ...PHOTO, visitor: null, platform_closed: true }]);
    expect(html).toContain("VP-0001 · ");
    expect(html).toContain("客户未开放");
    expect(html).toContain("示范商业大厦一期");
    expect(html).toContain(zh.mseAccess.closed.note);
  });

  it("an open customer's names show", () => {
    const html = dialog([{ ...PHOTO, visitor: "王先生", platform_closed: false }]);
    expect(html).toContain("王先生");
    expect(html).not.toContain("客户未开放");
  });
});

describe("负责人账号 after onboarding (PO-2 = A)", () => {
  const panel = (superuser: boolean) => {
    reader.superuser = superuser;
    return renderDetail(<OwnerAccountPanel companyId="c-1" />, (client) => {
      client.setQueryData(["companies", "c-1", "owner-account"], {
        id: "u-own", full_name: "陈经理", email: "boss@shifan.invalid", phone: "+60123", status: "ACTIVE", can_be_edited: false,
      });
    });
  };

  it("tells a superadmin why the e-mail cannot change and what to tell the customer", () => {
    const html = panel(true);
    expect(html).toContain(zh.errors.api.platform_owner_locked);
    expect(html).not.toContain('type="email"');
  });

  it("tells anyone else, as before, that only a superadmin may", () => {
    expect(panel(false)).toContain(zh.companies.owner.account.readOnly);
  });
});

describe("the QR 签发 dialog", () => {
  it("waits for the customer's 「允许 MSE 查看」 before choosing its driver, vehicle or worker", () => {
    const source = read("src/components/qrcodes/admin-qr-workspace.tsx");
    expect(source).toContain("companyViewOpen(chosen?.platform_access) === false");
    expect(source).toContain("disabledReason={subjectsClosed ? closedReason : undefined}");
    expect(source).toContain("data-qr-subject-closed");
  });

  it("never lists a customer's delivery notes or suppliers, door open or not (list 3)", () => {
    const source = read("src/components/qrcodes/admin-qr-workspace.tsx");
    expect(source).toContain('["SUPPLIER", "DELIVERY_NOTE"].includes(form.subject_type)');
    expect(source).toContain("enabled: open && !viewClosed && !customerOnly");
    expect(source).toContain('tApi("platform_qr_customer_only")');
    expect(zh.errors.api.platform_qr_customer_only).toBe("送货单和供应商的二维码由客户自己签发，MSE 看不到这些资料。");
  });
});

describe("MSE's project pickers use the project directory (contract §9)", () => {
  it.each([
    "src/components/integrations/integrations.tsx",
    "src/components/external-access/external-access-management.tsx",
    "src/components/field-staff/field-access-management.tsx",
  ])("%s", (file) => {
    expect(read(file)).toContain("getCompanyProjectArchiveLocks(");
  });
});

describe("walk 11-18, small things on MSE's screens (P3)", () => {
  it("公司目录's 「客户开放」 keeps its own lines: 「还在开户，可直接开账号」 is not cut to 「还在开户，可…」", () => {
    expect(read("src/components/companies/companies.tsx")).toContain(
      'meta: { label: t("mseAccess.directory.column"), unclamped: true }',
    );
  });

  it("a greyed 「打印地磅单」 is drawn as greyed buttons are (a faded outline)", () => {
    expect(read("src/components/weighing/print-ticket-button.tsx")).toContain(
      'variant={disabledReason ? "outline" : "default"}',
    );
  });

  it("「添加证据」 is not offered to MSE on a customer's ticket", () => {
    expect(read("src/components/weighing/view-weigh-session.tsx")).toContain('{can("weighing.operate") && !mse && (');
  });

  it("报表历史记录 greys a customer's file by its scope, which the server now sends (F3)", () => {
    const source = read("src/components/reports/admin-report-workspace.tsx");
    expect(source).toContain('row.scope && row.scope !== "PLATFORM" ? root("errors.api.platform_access_view_only") : undefined');
    expect(zh.errors.api.platform_access_view_only.startsWith("客户只开放了查看")).toBe(true);
  });
});
