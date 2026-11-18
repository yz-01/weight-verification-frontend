/**
 * JB220 (客户 11-18 「MSE 管理人员及开发团队是否必须经过客户授权，才能进入客户后台
 * 查看其内部业务资料？」): where a customer has not opened 「允许 MSE 查看」, an MSE
 * cell says 「客户未开放」 - never an empty cell, a dash that reads as missing
 * data, or 「加载失败」 - and one line above the table says whom to ask.
 *
 * Rendered to static markup (the runner has no DOM).
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  anyPlatformClosed,
  ClosedOr,
  closedValue,
  isPlatformClosed,
  PlatformClosedCell,
  PlatformClosedNote,
  PlatformClosedPhotos,
  PlatformHiddenPins,
  PlatformReasonLine,
} from "@/components/platform-access/closed";
import en from "@/messages/en.json";
import zh from "@/messages/zh.json";

const render = (node: React.ReactNode, messages: Record<string, unknown> = zh, locale = "zh") =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kuala_Lumpur">
      {node}
    </NextIntlClientProvider>,
  );

const CLOSED = { id: "1", platform_closed: true, vehicle_plate: null };
const OPEN = { id: "2", platform_closed: false, vehicle_plate: "WXY 1234" };
const TENANT = { id: "3", vehicle_plate: "" };

describe("a withheld field (JB220)", () => {
  it("reads 「客户未开放」, not a dash", () => {
    const html = render(<ClosedOr row={CLOSED} value={CLOSED.vehicle_plate} empty="-" />);
    expect(html).toContain("客户未开放");
    expect(html).toContain("data-platform-closed");
    expect(html).not.toMatch(/>-</);
  });

  it("shows the value of an open row, and the screen's own empty mark for a blank one", () => {
    expect(render(<ClosedOr row={OPEN} value={OPEN.vehicle_plate} empty="-" />)).toContain("WXY 1234");
    expect(render(<ClosedOr row={TENANT} value={TENANT.vehicle_plate} empty="-" />)).toBe("-");
  });

  it("works for a field that takes a value (ReadField)", () => {
    expect(render(<>{closedValue(CLOSED, null)}</>)).toContain("客户未开放");
    expect(closedValue(OPEN, "WXY 1234")).toBe("WXY 1234");
    expect(closedValue(TENANT, "")).toBe("");
  });

  it("is said in every language, never as a code", () => {
    expect(render(<PlatformClosedCell />, en, "en")).toContain(en.mseAccess.closed.cell);
    expect(en.mseAccess.closed.cell).not.toMatch(/platform|closed_/i);
  });

  it("knows a withheld row from an open one and from a customer's own", () => {
    expect(isPlatformClosed(CLOSED)).toBe(true);
    expect(isPlatformClosed(OPEN)).toBe(false);
    expect(isPlatformClosed(TENANT)).toBe(false);
    expect(isPlatformClosed(null)).toBe(false);
    expect(anyPlatformClosed([OPEN, CLOSED])).toBe(true);
    expect(anyPlatformClosed([OPEN, TENANT])).toBe(false);
    expect(anyPlatformClosed(undefined)).toBe(false);
  });
});

describe("the one line above the table", () => {
  it("says why and whom to ask when a row on the page was withheld", () => {
    const html = render(<PlatformClosedNote rows={[OPEN, CLOSED]} />);
    expect(html).toContain(zh.mseAccess.closed.note);
    expect(zh.mseAccess.closed.note).toContain("允许 MSE 查看");
  });

  it("is not there when nothing was withheld", () => {
    expect(render(<PlatformClosedNote rows={[OPEN, TENANT]} />)).toBe("");
    expect(render(<PlatformClosedNote rows={[]} />)).toBe("");
  });

  it("says rows were left out, for a list that leaves them out (审计日志, 报表导出历史)", () => {
    expect(render(<PlatformClosedNote hidden />)).toContain(zh.mseAccess.closed.hiddenRows);
  });

  it("stands where a ticket's photos would be, as a sentence", () => {
    const html = render(<PlatformClosedPhotos />);
    expect(html).toContain(zh.mseAccess.closed.photos);
    expect(html).not.toContain(zh.common.sectionLoadFailed);
  });

  it("counts the customer sites left off the map, and says nothing when none were", () => {
    expect(render(<PlatformHiddenPins count={3} />)).toContain("3 个客户的工地没有显示在地图上");
    expect(render(<PlatformHiddenPins count={0} />)).toBe("");
  });

  it("writes a waiting button's reason on the page, not only in its tooltip", () => {
    expect(render(<PlatformReasonLine text={zh.mseAccess.reason.accounts} />)).toContain("允许 MSE 管理账号");
    expect(render(<PlatformReasonLine text={undefined} />)).toBe("");
  });
});
