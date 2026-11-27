/**
 * 菜单名称按公司自定义 (JB251, 客户 11-24 事项 2): 「能否由 MSE Admin 开放菜单名称
 * 自定义权限，让每家客户公司的授权登录用户自行修改菜单显示名称？例如：「设备管理」
 * 可以改成「设备租赁管理」。修改只影响该公司的菜单显示，不影响其他公司，也不改变原有
 * 功能、数据及权限。」
 *
 * A menu item's identity - its feature key, address, permission and package
 * switch - never changes. Only where its name is drawn does the company's own
 * name come first: `GET /api/auth/get_me/` carries
 * `company_preferences.menu_names` (only while MSE has switched it on for the
 * company), keyed by the item's full message key (`nav.equipment`,
 * `nav.submodule.siteEquipment`) and then by language. A language left empty
 * reads the system name.
 *
 * Read in: the left menu, the page title 「菜单项 › 页面」, the page switcher,
 * the module search (which finds both names) and the report picker items that
 * borrow a menu name, and the phone's 现场记录 tiles that are the same module
 * as a menu page (QA2: the phone home is that company's menu too - see
 * `PHONE_TILE_MENU_KEYS`). Not read by page help texts, PDFs, notifications,
 * to-do cards, or MSE Admin's own menu (they keep the system names).
 */

import type { Portal } from "@/interfaces/auth";
import {
  PORTAL_NAVIGATION,
  visibleNavigation,
  type FeatureNavChild,
  type FeatureNavItem,
} from "@/lib/navigation";

/** Language → the company's name for one menu item. */
export type MenuNameByLanguage = Partial<Record<string, string>>;

/** Full message key → the company's names (JB251). */
export type MenuNames = Record<string, MenuNameByLanguage>;

/** The portals whose menus a company may rename: a builder's and a recycler's. */
export const RENAMEABLE_PORTALS = ["MSE_TRACE", "MSE_SCRAP"] as const satisfies readonly Portal[];

/** The longest name the server takes (`companies.menu_names.MAX_LENGTH`). */
export const MENU_NAME_MAX_LENGTH = 20;

/** The message key a main menu item's name is read from. */
export function itemNameKey(item: Pick<FeatureNavItem, "labelKey">): string {
  return `nav.${item.labelKey}`;
}

export interface MenuNameRow {
  key: string;
  /** 0 for a main item, 1 for a page under it, 2 for a page a level further. */
  depth: number;
}

function rowsOf(items: readonly FeatureNavItem[]): MenuNameRow[] {
  const seen = new Set<string>();
  const rows: MenuNameRow[] = [];
  const add = (key: string, depth: number) => {
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ key, depth });
  };
  const walk = (children: readonly FeatureNavChild[] | undefined, depth: number) => {
    for (const child of children ?? []) {
      // A page the client asked to take out of the menu has no menu name.
      if (child.menuHidden) continue;
      add(child.labelKey, depth);
      walk(child.children, depth + 1);
    }
  };
  for (const item of items) {
    add(itemNameKey(item), 0);
    walk(item.children, 1);
  }
  return rows;
}

/**
 * Every menu name of a portal that a company may change, in menu order: each
 * main item, then the pages under it. The server's own list
 * (`companies.menu_names.MENU_NAME_KEYS`) must be the same; the two are tied
 * by `menu-name-keys.json` (this side's test and the backend's guard).
 */
export function menuNameKeys(portal: Portal): string[] {
  return rowsOf(PORTAL_NAVIGATION[portal] as readonly FeatureNavItem[]).map((row) => row.key);
}

/**
 * The 「菜单名称」 block's rows: the company's own menu (the modules its
 * package and MSE leave on, every page of them whoever may open it), in menu
 * order.
 */
export function companyMenuNameRows(portal: Portal, features: readonly string[]): MenuNameRow[] {
  const items = visibleNavigation(portal, features, [], true).flatMap((group) => group.items);
  return rowsOf(items);
}

/** The company's name for `key` in `locale`, or `null` for the system name. */
export function companyMenuName(
  names: MenuNames | null | undefined,
  locale: string,
  key: string,
): string | null {
  const name = names?.[key]?.[locale];
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

/** The names with one language of one item set, or cleared when blank. */
export function withMenuName(names: MenuNames, key: string, locale: string, value: string): MenuNames {
  const own = { ...(names[key] ?? {}) };
  if (value.trim()) own[locale] = value;
  else delete own[locale];
  const next = { ...names };
  if (Object.keys(own).length) next[key] = own;
  else delete next[key];
  return next;
}

/** The names with one item back to the system name, every language. */
export function withoutMenuName(names: MenuNames, key: string): MenuNames {
  const next = { ...names };
  delete next[key];
  return next;
}

/** Names as the server takes them: trimmed, blanks dropped. */
export function cleanMenuNames(names: MenuNames): MenuNames {
  const out: MenuNames = {};
  for (const [key, byLanguage] of Object.entries(names)) {
    const kept: MenuNameByLanguage = {};
    for (const [language, value] of Object.entries(byLanguage ?? {})) {
      const text = typeof value === "string" ? value.trim() : "";
      if (text) kept[language] = text;
    }
    if (Object.keys(kept).length) out[key] = kept;
  }
  return out;
}

/** What is wrong with one typed name, or `null` (the server's same rules). */
export function menuNameProblem(value: string): "tooLong" | "lineBreak" | "markup" | null {
  const text = value.trim();
  if (!text) return null;
  if (/[\r\n]/.test(value)) return "lineBreak";
  if (/[<>]/.test(text)) return "markup";
  if ([...text].length > MENU_NAME_MAX_LENGTH) return "tooLong";
  return null;
}

/**
 * Whether a module search entry matches the typed words (already lower-cased):
 * its name as shown (the company's own), where it sits, or `also` - the
 * system names, so 「设备管理」 still finds a menu renamed 「设备租赁管理」 (JB251).
 */
export function moduleEntryMatches(
  entry: { label: string; context: string; also?: string },
  normalized: string,
): boolean {
  return `${entry.label} ${entry.context} ${entry.also ?? ""}`.toLocaleLowerCase().includes(normalized);
}

/**
 * The phone's 现场记录 tiles that are the same module as a menu page, and the
 * menu name(s) they follow, first renamed wins (QA2, JB251: 「修改只影响该公司的
 * 菜单显示」 - the phone home is that company's menu too). A tile that is not
 * one menu page (门岗, 顾问资料提交, 废料处理, Rainy Weather) keeps its words.
 */
export const PHONE_TILE_MENU_KEYS: Readonly<Record<string, readonly string[]>> = {
  material: ["nav.submodule.materialReceipts"],
  outgoing: ["nav.submodule.materialOutgoing"],
  equipment: ["nav.submodule.siteEquipment"],
  operatorHours: ["nav.submodule.equipmentOperatorHours"],
  progress: ["nav.submodule.progressRecords", "nav.progress"],
  disposal: ["nav.site_disposals"],
  waste: ["nav.submodule.wasteOutgoing"],
  safety: ["nav.submodule.hazardRectifications", "nav.hazard_rectification"],
  permit: ["nav.submodule.permits"],
  request: ["nav.material_requests"],
  sundry: ["nav.submodule.sundryClaims"],
  visitor: ["nav.submodule.gateScanning"],
};

/** The company's name for a phone tile, or `null` for the tile's own words. */
export function phoneTileName(
  names: MenuNames | null | undefined,
  locale: string,
  tile: string,
): string | null {
  for (const key of PHONE_TILE_MENU_KEYS[tile] ?? []) {
    const name = companyMenuName(names, locale, key);
    if (name) return name;
  }
  return null;
}
