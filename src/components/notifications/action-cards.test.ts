import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { pendingActionCards } from "@/components/notifications/action-cards";
import type { NotificationRow } from "@/interfaces/platform-ops";

/**
 * Pop-up task cards (#6, #30, #39; D-207).
 *
 * 「点进去查看不会消失；处理完成一项只消失那一张卡片」 - so a card is an
 * outstanding ACTION notice, opening it only navigates, and nothing on the
 * card removes it: it leaves when the server closes the notice.
 */
const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
const stack = read("src/components/notifications/action-card-stack.tsx");
const bell = read("src/components/notifications/notification-button.tsx");

describe("pop-up task cards", () => {
  it("are the outstanding ACTION notices", () => {
    expect(stack).toMatch(/const cards = pendingActionCards\(rows\);/);
    // The bell's list is the outstanding one.
    expect(bell).toMatch(/state: "PENDING"/);
  });

  it("open without disappearing", () => {
    expect(stack).toMatch(/onClick=\{\(\) => \{\s*onOpen\(card\);/);
    expect(stack).not.toMatch(/confirmNotificationDone|onDismiss|hiddenIds/);
  });

  it("show in the back office, not on the phone", () => {
    expect(bell).toMatch(/!user\?\.is_field_staff && \(\s*<ActionCardStack/);
  });

  it("sit in the page layout, never over it (B01)", () => {
    // 「桌面及手机无内容遮挡」: a floating stack covered the 查看 button in a
    // table's last column. In the layout, the content column gets shorter
    // instead and every button stays reachable.
    expect(stack).not.toMatch(/className="[^"]*\bfixed\b/);
    expect(stack).toMatch(/useTaskCardDock\(\)/);
    expect(stack).toMatch(/return createPortal\(/);
    expect(stack).toMatch(/\s+dock,\s*\);/);
    expect(stack).not.toMatch(/document\.body/);
    const shell = read("src/components/layout/dashboard-shell.tsx");
    expect(shell).toMatch(/<TaskCardDockSlot \/>/);
    // The slot follows the scrolling content column, inside the inset.
    expect(shell.indexOf("<TaskCardDockSlot />")).toBeGreaterThan(shell.indexOf("{children}"));
  });

  it("fold into one bar on a phone-sized screen", () => {
    expect(stack).toMatch(/isMobile \? !mobileOpen/);
    expect(stack).toMatch(/safe-area-inset-bottom/);
  });
});

const notice = (id: string, created_at: string, card: NotificationRow["card"] = "ACTION") =>
  ({ id, created_at, card, title: id, message: "", data: {} }) as unknown as NotificationRow;

describe("the task card row (2026-10-09)", () => {
  // 「最新的通知在第一个，然后会显示所有待处理的事项，可是可以往右滑动查看」
  it("puts the newest notice first", () => {
    const cards = pendingActionCards([
      notice("a", "2026-10-08T09:00:00+08:00"),
      notice("b", "2026-10-09T01:30:00Z"),
      notice("c", "2026-10-09T09:00:00+08:00"),
    ]);
    // 09:30 +08:00 is newer than 09:00 +08:00 even though the text sorts lower.
    expect(cards.map((row) => row.id)).toEqual(["b", "c", "a"]);
  });

  it("keeps every ACTION notice and only those", () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      notice(`n${index}`, `2026-10-09T0${index % 10}:00:00Z`, index === 4 ? "NOTICE" : "ACTION"),
    );
    const cards = pendingActionCards(rows);
    expect(cards).toHaveLength(11);
    expect(cards.some((row) => row.card !== "ACTION")).toBe(false);
  });

  it("does not reorder the list it was given", () => {
    const rows = [notice("a", "2026-10-08T00:00:00Z"), notice("b", "2026-10-09T00:00:00Z")];
    pendingActionCards(rows);
    expect(rows.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("shows them all in one sideways row, the count matching the cards", () => {
    expect(stack).not.toMatch(/VISIBLE|\.slice\(0,/);
    expect(stack).toMatch(/\{t\("count", \{ count: cards\.length \}\)\}/);
    expect(stack).toMatch(/\{cards\.map\(\(card\) =>/);
    expect(stack).toMatch(/overflow-x-auto/);
    expect(stack).toMatch(/snap-x/);
    expect(stack).toMatch(/shrink-0 snap-start/);
  });
});
