/**
 * JB205W (browser walk 11-17) - MSE Admin 二维码管理 showed the raw key
 * 「adminQr.subjectType.CUSTOMER」 for a recycler's private-customer code, and
 * the 类型 filter had no entry for it. The code is made on the recycler's
 * 客户与私人入库 page, so it is listed, counted and filterable here, but the
 * admin issue form keeps its own list.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";

const source = readFileSync(
  path.join(__dirname, "admin-qr-workspace.tsx"),
  "utf8",
);

describe("JB205W QR private-customer type", () => {
  it("has a label for CUSTOMER in all four languages", () => {
    expect(zh.adminQr.subjectType.CUSTOMER).toBe("私人客户");
    expect(zhTW.adminQr.subjectType.CUSTOMER).toBe("私人客戶");
    expect(en.adminQr.subjectType.CUSTOMER).toBe("Private customer");
    expect(ms.adminQr.subjectType.CUSTOMER).toBe("Pelanggan persendirian");
  });

  it("lists, counts and filters CUSTOMER codes", () => {
    expect(source).toContain(
      'const LISTED_SUBJECT_TYPES: QRSubjectType[] = [...SUBJECT_TYPES, "CUSTOMER"];',
    );
    // overview cards, the 类型 filter and 按类型 statistics
    expect(source.match(/LISTED_SUBJECT_TYPES\.map\(/g)).toHaveLength(3);
  });

  it("keeps CUSTOMER out of the admin issue form", () => {
    const issueList = source.slice(
      source.indexOf("const SUBJECT_TYPES"),
      source.indexOf("];", source.indexOf("const SUBJECT_TYPES")),
    );
    expect(issueList).not.toContain("CUSTOMER");
    expect(source).toContain(
      "options={SUBJECT_TYPES.map((value) => ({ value, label: t(`subjectType.${value}`) }))}",
    );
  });
});
