/**
 * QA2 (JB251 audit): 「修改只影响该公司的菜单显示」 - the phone's 现场记录 is
 * that company's menu too. A tile that is the same module as a renamed menu
 * page shows the company's name (in the reader's language); every other tile,
 * and every tile of a company that renamed nothing, keeps its words.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import keys from "@/lib/menu-name-keys.json";
import { PHONE_TILE_MENU_KEYS, phoneTileName } from "@/lib/menu-names";

const panel = readFileSync("src/components/field-staff/field-records-panel.tsx", "utf-8");

describe("QA2 JB251: the phone's tiles follow the company's menu names", () => {
  it("names only menu pages the company may rename", () => {
    const renameable = new Set(keys.MSE_TRACE);
    for (const menuKeys of Object.values(PHONE_TILE_MENU_KEYS)) {
      for (const key of menuKeys) expect(renameable.has(key), key).toBe(true);
    }
  });

  it("the company's own name in the reader's language, else null (the tile's words)", () => {
    const names = {
      "nav.submodule.siteEquipment": { zh: "设备租赁进退场" },
      "nav.progress": { en: "Works progress" },
    };
    expect(phoneTileName(names, "zh", "equipment")).toBe("设备租赁进退场");
    expect(phoneTileName(names, "en", "equipment")).toBeNull();
    // 工程进度: the page first, then its menu item.
    expect(phoneTileName(names, "en", "progress")).toBe("Works progress");
    expect(phoneTileName(names, "zh", "gate")).toBeNull();
    expect(phoneTileName(null, "zh", "material")).toBeNull();
  });

  it("the tile and the page title it opens both read it", () => {
    expect(panel).toContain("phoneTileName(user?.company_preferences?.menu_names, locale, key) ?? t(`records.${key}`)");
    expect(panel).toContain("{tile(option.key)}");
    expect(panel).not.toMatch(/title=\{t\("records\./);
  });
});
