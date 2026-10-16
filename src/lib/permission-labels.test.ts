import { describe, expect, it } from "vitest";

import {
  permissionGroupLabel,
  permissionLabel,
  readablePermissionKey,
} from "@/lib/permission-labels";

/**
 * The role editor never shows a raw `permissions.…` key (I31). When a
 * catalogue has the message it wins; otherwise the backend's English label;
 * otherwise a readable form of the code.
 */

type Translate = Parameters<typeof permissionLabel>[1];

function translator(messages: Record<string, string>): Translate {
  const t = ((key: string) => messages[key] ?? key) as unknown as Translate;
  (t as unknown as { has: (key: string) => boolean }).has = (key: string) => key in messages;
  return t;
}

describe("permissionLabel", () => {
  it("uses the catalogue when it has the code", () => {
    const t = translator({ "permissions.code.safety.verify": "安全验收（可审批施工准证）" });
    expect(permissionLabel({ code: "safety.verify", label: "Safety verification" }, t)).toBe(
      "安全验收（可审批施工准证）",
    );
  });

  it("falls back to the backend's English, never the key", () => {
    const t = translator({});
    const shown = permissionLabel(
      { code: "material_target.manage", label: "Manage material targets" },
      t,
    );
    expect(shown).toBe("Manage material targets");
    expect(shown).not.toContain("permissions.");
  });

  it("makes the code readable when even the English is missing", () => {
    const t = translator({});
    expect(permissionLabel({ code: "site_worker.view" }, t)).toBe("Site worker: view");
    expect(permissionLabel({ code: "site_worker.view", label: "  " }, t)).toBe("Site worker: view");
  });
});

describe("permissionGroupLabel", () => {
  it("prefers the catalogue, then the backend, then the key made readable", () => {
    expect(permissionGroupLabel("safety", "Safety / EHS", translator({ "permissions.group.safety": "安全 / EHS" }))).toBe("安全 / EHS");
    expect(permissionGroupLabel("safety", "Safety / EHS", translator({}))).toBe("Safety / EHS");
    expect(permissionGroupLabel("sundry_claim", undefined, translator({}))).toBe("Sundry claim");
  });
});

describe("readablePermissionKey", () => {
  it("turns a code into words", () => {
    expect(readablePermissionKey("claim.confirm_payment")).toBe("Claim: confirm payment");
    expect(readablePermissionKey("project")).toBe("Project");
  });
});
