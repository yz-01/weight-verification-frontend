/**
 * JB215B-1 (Lucas 11-17, jb209 「not done」): 调拨报表's 「类型」 column
 * printed the movement-type codes (TRANSFER, ISSUE, RETURN …) in the Excel and
 * PDF files. It now goes out with the movement types' own words, the way
 * JB209-16 did for the other reports' code columns.
 */
import { describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/assets/reports",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1" }, can: () => true }),
}));

const { REPORT_VALUE_GROUPS } = await import("@/components/assets/asset-management-workspace");

/** `assets/constants.py` MovementType - every code a movement row can carry. */
const MOVEMENT_TYPES = ["PURCHASE", "ISSUE", "INSTALL", "TRANSFER", "RETURN", "REPAIR", "DISPOSAL"];

describe("JB215B-1 调拨报表 「类型」", () => {
  it("sends the movement types' words with the column", () => {
    expect(REPORT_VALUE_GROUPS.movements).toEqual({ type: "movementType" });
  });

  it("has a word for every movement type in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const words = (messages.adminAssetManagement as unknown as Record<string, Record<string, string>>).movementType;
      for (const code of MOVEMENT_TYPES) {
        expect(words?.[code], code).toBeTruthy();
        expect(words?.[code]).not.toBe(code);
      }
    }
    expect(zh.adminAssetManagement.movementType.TRANSFER).toBe("调拨");
  });
});
