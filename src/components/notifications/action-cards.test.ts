import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Pop-up task cards (#6, #30, #39; D-207).
 *
 * 「点进去查看不会消失；处理完成一项只消失那一张卡片」 - so a card is an
 * outstanding ACTION notice, opening it only navigates, and nothing on the
 * card removes it: it leaves when the server closes the notice.
 */
const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const stack = read("src/components/notifications/action-card-stack.tsx");
const bell = read("src/components/notifications/notification-button.tsx");

describe("pop-up task cards", () => {
  it("are the outstanding ACTION notices", () => {
    expect(stack).toMatch(/rows\.filter\(\(row\) => row\.card === "ACTION"\)/);
    // The bell's list is the outstanding one.
    expect(bell).toMatch(/state: "PENDING"/);
  });

  it("open without disappearing", () => {
    expect(stack).toMatch(/onClick=\{\(\) => onOpen\(row\)\}/);
    expect(stack).not.toMatch(/confirmNotificationDone|onDismiss|hiddenIds/);
  });

  it("show in the back office, not on the phone", () => {
    expect(bell).toMatch(/!user\?\.is_field_staff && \(\s*<ActionCardStack/);
  });
});
