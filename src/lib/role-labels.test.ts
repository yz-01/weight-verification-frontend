import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh.json";

import { roleLabel } from "./role-labels";

const tEn = createTranslator({ locale: "en", messages: en });
const tZh = createTranslator({ locale: "zh", messages: zh });

describe("roleLabel", () => {
  it("shows a preset role by its code in the reader's language", () => {
    expect(roleLabel("company_admin", "Company Administrator", tEn)).toBe("Company Administrator");
    expect(roleLabel("company_admin", "Company Administrator", tZh)).toBe(
      zh.roles.system_.company_admin,
    );
    expect(zh.roles.system_.company_admin).not.toBe("Company Administrator");
  });

  it("recognises a preset by its seeded name when only the name travels", () => {
    expect(roleLabel(null, "Company Administrator", tZh)).toBe(zh.roles.system_.company_admin);
    expect(roleLabel(undefined, "Site Staff", tZh)).toBe(zh.roles.system_.site_staff);
  });

  it("keeps a custom role's own name", () => {
    expect(roleLabel(null, "Lorry Marshal", tZh)).toBe("Lorry Marshal");
    expect(roleLabel("custom_1", "Lorry Marshal", tZh)).toBe("Lorry Marshal");
    expect(roleLabel(null, null, tZh)).toBe("");
  });
});
