import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const LOCALES = ["en", "zh", "zh-TW", "ms"] as const;

function messages(locale: string) {
  const file = path.join(process.cwd(), "src", "messages", `${locale}.json`);
  return JSON.parse(readFileSync(file, "utf8"));
}

function at(root: unknown, dotted: string) {
  return dotted
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[key]
          : undefined,
      root,
    );
}

/**
 * One module, one name - everywhere it appears, in all four languages.
 *
 * Lucas: 「这样会很乱啊…需要检查清楚确保每个模块对应连接的标题是一样的，后台
 * 也是一样。」 Ten of twelve modules carried a different name in the office menu
 * than on the phone (F-420): 材料进场 against 材料记录, 工地设备 against
 * 设备进退场, 隐患整改 against 安全与隐患. The phone was not even consistent
 * with itself - its bottom navigation said 清运 where its own list said
 * 废料清运 - and the four catalogues disagreed in different places, so `en`
 * read "Material receipts" against "Material record".
 *
 * A worker told to go and do the 材料进场, who finds no such button, is not
 * inconvenienced - they are stuck, and what they tap is whatever looks closest.
 *
 * This file already guarded one layer of that (the home tiles) and now covers
 * the rest. Deliberately not a second guard beside the old one: two guards over
 * one rule drift apart, and their first disagreement costs more than the rule.
 *
 * ## What is deliberately *not* aligned
 *
 * `nav.submodule.consultantFieldInbox` (待整理现场资料, C1) and
 * `nav.submodule.fieldTasks` (现场任务) keep their own names. They are not
 * other spellings of a module below - an inbox a consultant reads, and a task
 * somebody is handed, are different screens - and renaming them to match would
 * trade a naming problem for a wrong name.
 */
const MODULES: Array<{ module: string; keys: string[] }> = [
  {
    module: "material receipts",
    keys: [
      "nav.submodule.materialReceipts",
      "receipts.title",
      "fieldStaffPwa.records.material",
      "fieldStaffPwa.home.material",
      "fieldStaffPwa.type.MATERIAL",
      // 「我提交过的」 lists it under the same name (T-356).
      "mySubmissions.kind.MATERIAL_RECEIPT",
    ],
  },
  {
    module: "material outgoing",
    keys: [
      "nav.submodule.materialOutgoing",
      "fieldStaffPwa.records.outgoing",
      "fieldStaffPwa.home.outgoing",
      // 「我提交过的」 lists it under the same name (T-356).
      "mySubmissions.kind.MATERIAL_OUTGOING",
    ],
  },
  {
    module: "equipment movement",
    keys: [
      "nav.submodule.siteEquipment",
      "fieldStaffPwa.records.equipment",
      "fieldStaffPwa.home.equipment",
      "fieldStaffPwa.type.EQUIPMENT",
      // 「我提交过的」 lists it under the same name (T-356).
      "mySubmissions.kind.EQUIPMENT_MOVEMENT",
    ],
  },
  {
    module: "project progress",
    keys: [
      "nav.submodule.progressRecords",
      "progress.title",
      "fieldStaffPwa.records.progress",
      "fieldStaffPwa.home.progress",
      "fieldStaffPwa.type.PROGRESS",
      // 「我提交过的」 lists it under the same name (T-356).
      "mySubmissions.kind.PROGRESS",
    ],
  },
  {
    module: "hazard rectification",
    keys: [
      "nav.submodule.hazardRectifications",
      "fieldStaffPwa.records.safety",
      "fieldStaffPwa.home.safety",
      // The phone's own second layer: the bottom button and the list it opens.
      "fieldStaffPwa.nav.hazards",
      "fieldStaffPwa.home.hazards",
      "fieldStaffPwa.type.SAFETY",
      // 「我提交过的」 lists it under the same name (T-356).
      "mySubmissions.kind.HAZARD",
    ],
  },
  {
    module: "environmental material outgoing",
    keys: [
      "nav.submodule.wasteOutgoing",
      "wasteOutgoing.title",
      "fieldStaffPwa.records.waste",
      "fieldStaffPwa.home.waste",
      "fieldStaffPwa.type.WASTE",
      // 「我提交过的」 lists it under the same name (T-356).
      "mySubmissions.kind.WASTE_OUTGOING",
    ],
  },
  // 垃圾清运 (B08 / Q5): the entry is named after the office's merged column,
  // on the phone as in the office menu.
  {
    module: "waste clearance",
    keys: [
      "nav.submodule.wasteClearance",
      "fieldStaffPwa.records.disposal",
      "fieldStaffPwa.home.disposal",
      "fieldStaffPwa.nav.disposal",
    ],
  },
  // The kind of record keeps its own name (Q7 「每笔标明是哪一种」): the old
  // list's title and 「我提交过的」 (T-356) both say which kind it is.
  {
    module: "site disposal record",
    keys: [
      "nav.submodule.siteDisposals",
      "mySubmissions.kind.DISPOSAL_REQUEST",
    ],
  },
  // No "site records" entry: the phone's 「现场资料」 and its 现场资料分类 are
  // gone (D-285).
  {
    module: "consultant submission",
    keys: [
      "fieldStaffPwa.records.consultant",
      "fieldStaffPwa.home.consultant",
      "fieldStaffPwa.type.CONSULTANT",
    ],
  },
  // 「待整理现场资料」 (2026-10 C1, Q2): the old 「现场资料收件箱」 is a tab of
  // 顾问申请 now. The tab, the inbox's own heading, the hidden route's name
  // and what a failure says it could not load are one name.
  {
    module: "consultant inbox",
    keys: [
      "consultantWorkflow.applications.stage.inbox",
      "contractorOps.tasks.consultantInboxTitle",
      "nav.submodule.consultantFieldInbox",
      "consultantWorkflow.inbox.what",
    ],
  },
  {
    module: "site record capture",
    keys: [
      "fieldStaffPwa.records.title",
      "fieldStaffPwa.home.records",
      "fieldStaffPwa.nav.records",
      "fieldStaffPwa.type.PHOTO",
    ],
  },
  {
    module: "attendance",
    keys: [
      "fieldStaffPwa.attendance.title",
      "fieldStaffPwa.home.attendance",
      "fieldStaffPwa.nav.attendance",
    ],
  },
];

describe("one module carries one name", () => {
  for (const locale of LOCALES) {
    const catalogue = messages(locale);
    for (const { module, keys } of MODULES) {
      it(`${locale}: ${module}`, () => {
        const values = keys.map((key) => [key, at(catalogue, key)] as const);
        // Every key has to resolve. A renamed or deleted key would otherwise
        // let this pass by comparing nothing with nothing.
        for (const [key, value] of values) {
          expect(value, `${key} is missing from ${locale}.json`).toBeTypeOf(
            "string",
          );
        }
        expect(new Set(values.map(([, value]) => value)).size).toBe(1);
      });
    }
  }
});

describe("the names that are meant to differ still do", () => {
  /**
   * Without these, the cheapest way to satisfy the block above is to give
   * everything the same name - a worse screen than the one complained about.
   */
  it("leaves each screen's own heading alone", () => {
    for (const locale of LOCALES) {
      const fsp = messages(locale).fieldStaffPwa;
      expect(fsp.home.title).not.toBe(fsp.records.title);
      expect(fsp.home.subtitle).not.toBe(fsp.records.subtitle);
    }
  });

  it("names the inbox 待整理现场资料 (C1, Q2)", () => {
    expect(at(messages("zh"), "consultantWorkflow.applications.stage.inbox")).toBe("待整理现场资料");
    expect(at(messages("zh-TW"), "consultantWorkflow.applications.stage.inbox")).toBe("待整理現場資料");
  });

  it("keeps the consultant inbox and site tasks as themselves", () => {
    for (const locale of LOCALES) {
      const catalogue = messages(locale);
      expect(at(catalogue, "nav.submodule.consultantFieldInbox")).not.toBe(
        at(catalogue, "fieldStaffPwa.records.consultant"),
      );
      expect(at(catalogue, "nav.submodule.fieldTasks")).not.toBe(
        at(catalogue, "fieldStaffPwa.records.title"),
      );
    }
  });

  /**
   * The equipment page names the direction it is filtered to (B14): the
   * module is 「设备进退场」, a list of exits is 「设备退场」. Each is the
   * module's own word for that direction - the same 进场 / 退场 the list's
   * direction column and filter show - so the title and the rows agree.
   */
  it("names the equipment page after the direction it shows", () => {
    for (const locale of LOCALES) {
      const catalogue = messages(locale);
      const moduleName = at(catalogue, "nav.submodule.siteEquipment");
      const entry = at(catalogue, "nav.submodule.equipmentEntry");
      const exit = at(catalogue, "nav.submodule.equipmentExit");
      expect(entry, `${locale}: equipmentEntry`).toBeTypeOf("string");
      expect(exit, `${locale}: equipmentExit`).toBeTypeOf("string");
      expect(new Set([moduleName, entry, exit]).size).toBe(3);
      const word = (direction: "ENTRY" | "EXIT") =>
        String(at(catalogue, `contractorOps.direction.${direction}`)).toLowerCase();
      expect(String(entry).toLowerCase()).toContain(word("ENTRY"));
      expect(String(exit).toLowerCase()).toContain(word("EXIT"));
    }
    expect(at(messages("zh"), "nav.submodule.equipmentEntry")).toBe("设备进场");
    expect(at(messages("zh"), "nav.submodule.equipmentExit")).toBe("设备退场");
  });

  /**
   * The dashboard card for open hazard work says what it is (C15). It was
   * 「待处理异常」 and added out-of-bounds clock-ins and expiring passes to the
   * hazards; the client asked for 「待处理整改 / EHS」. It ends in the module's
   * own "/ EHS", so the card and the menu name the same thing.
   */
  it("names the dashboard's open-rectification card after its module (C15)", () => {
    for (const locale of LOCALES) {
      const catalogue = messages(locale);
      const card = String(at(catalogue, "contractorDashboard.rectifications.title"));
      const moduleName = String(at(catalogue, "nav.submodule.hazardRectifications"));
      expect(moduleName.endsWith(" / EHS"), `${locale}: ${moduleName}`).toBe(true);
      expect(card.endsWith(" / EHS"), `${locale}: ${card}`).toBe(true);
      expect(card).not.toBe(moduleName);
      expect(at(catalogue, "contractorDashboard.anomalies")).toBeUndefined();
    }
    expect(at(messages("zh"), "contractorDashboard.rectifications.title")).toBe(
      "待处理整改 / EHS",
    );
  });

  it("gives every module a name of its own", () => {
    for (const locale of LOCALES) {
      const catalogue = messages(locale);
      const names = MODULES.map(({ keys }) => at(catalogue, keys[0]));
      expect(new Set(names).size).toBe(MODULES.length);
    }
  });
});

/**
 * No retired module name survives anywhere in the catalogues (T-367, F-439).
 *
 * The block above lists each module's *title* keys, and that was not enough:
 * the old names lived on in fifty-odd other strings - the receipt dialog's own
 * heading (「材料收货」 under a sidebar that said 「材料进场」, the screenshot
 * Lucas sent), the "record a delivery" button, dashboard tiles, archive and
 * package labels, permission names. So this reads every string.
 *
 * `废料出场` is on the list because it was the one name serving two modules at
 * once: the recycle order (now 「废料订单」, as the menu says) and the
 * application (「环保材料出场申请」).
 */
const RETIRED: Record<(typeof LOCALES)[number], string[]> = {
  zh: ["材料收货", "收货记录", "记录收货", "施工进度", "安全与隐患", "废料清运", "材料记录", "工地设备", "废料出场"],
  "zh-TW": ["材料收貨", "收貨記錄", "記錄收貨", "施工進度", "安全與隱患", "廢料清運", "材料記錄", "工地設備", "廢料出場"],
  en: ["Material record", "Site equipment", "Progress records", "Safety / hazard"],
  ms: ["Penerimaan bahan", "Peralatan tapak", "Rekod kemajuan", "Keselamatan / bahaya"],
};

function strings(node: unknown, path = "", out: Array<[string, string]> = []) {
  if (typeof node === "string") out.push([path, node]);
  else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      strings(value, path ? `${path}.${key}` : key, out);
    }
  }
  return out;
}

describe("no retired module name is left anywhere (T-367)", () => {
  for (const locale of LOCALES) {
    it(`${locale}.json`, () => {
      const offenders = strings(messages(locale)).filter(([, value]) =>
        RETIRED[locale].some((name) => value.includes(name)),
      );
      expect(offenders).toEqual([]);
    });
  }
});
