/**
 * What head office ticks for a consultant on one project (JB210, 客户 11-16).
 *
 * 「请完善顾问权限设置，保留原有7项权限，并支持总部按项目勾选以下11个模块」 and
 * 「原有7项与上述模块重叠的权限请统一关联，避免重复设置或互相冲突」.
 *
 * Mirrors `accounts.consultant_access` on the backend, which is authoritative:
 * a grant stores the module ticks and the three codes that are not a module
 * (顾问申请 查看 / 审批 and 导出). Four of the original seven *are* ticks now
 * (查看项目 → 项目, 查看安全记录 → 整改／EHS, 查看报表 → 报表中心, 查看通知 → 通知中心),
 * so each of the seven is set in exactly one place.
 */

/** The client's 11, in the client's order. */
export const CONSULTANT_MODULES = [
  "dashboard",
  "projects",
  "field_tasks",
  "materials",
  "progress",
  "safety",
  "documents",
  "record_centre",
  "reports",
  "notifications",
  "conversations",
] as const;

export type ConsultantModule = (typeof CONSULTANT_MODULES)[number];

/** 「其他权限」: the three of the original seven that are not a module. */
export const CONSULTANT_OPTIONS = ["approval.view", "approval.review", "report.export"] as const;

export type ConsultantOption = (typeof CONSULTANT_OPTIONS)[number];

/** Today's default in ticks: 仪表板, 项目, 整改／EHS, 通知中心 + 顾问申请 查看 / 审批. */
export const DEFAULT_CONSULTANT_MODULES: readonly ConsultantModule[] = [
  "dashboard",
  "projects",
  "safety",
  "notifications",
];
export const DEFAULT_CONSULTANT_OPTIONS: readonly ConsultantOption[] = ["approval.view", "approval.review"];

/** The four original codes that became ticks. */
const LEGACY_CODE_MODULES: Readonly<Record<string, ConsultantModule>> = {
  "project.view": "projects",
  "safety.view": "safety",
  "report.view": "reports",
  "notification.view": "notifications",
};

/** Message key under `consultantAccess.module` (and `siteControl.permissionDefaults.module`). */
export const MODULE_MESSAGE_KEYS: Readonly<Record<ConsultantModule, string>> = {
  dashboard: "dashboard",
  projects: "projects",
  field_tasks: "fieldTasks",
  materials: "materials",
  progress: "progress",
  safety: "safety",
  documents: "documents",
  record_centre: "recordCentre",
  reports: "reports",
  notifications: "notifications",
  conversations: "conversations",
};

/** Message key under `consultantAccess.option`. */
export const OPTION_MESSAGE_KEYS: Readonly<Record<ConsultantOption, string>> = {
  "approval.view": "approvalView",
  "approval.review": "approvalReview",
  "report.export": "export",
};

export const isConsultantModule = (value: string): value is ConsultantModule =>
  (CONSULTANT_MODULES as readonly string[]).includes(value);

export const isConsultantOption = (value: string): value is ConsultantOption =>
  (CONSULTANT_OPTIONS as readonly string[]).includes(value);

/** Known ticks only, once each, in the client's order. */
export function orderedModules(values: readonly string[] | null | undefined): ConsultantModule[] {
  const chosen = new Set(values ?? []);
  return CONSULTANT_MODULES.filter((key) => chosen.has(key));
}

/** Option codes only; 审批 brings 查看 with it, as the backend does. */
export function orderedOptions(values: readonly string[] | null | undefined): ConsultantOption[] {
  const chosen = new Set((values ?? []).filter(isConsultantOption));
  if (chosen.has("approval.review")) chosen.add("approval.view");
  return CONSULTANT_OPTIONS.filter((code) => chosen.has(code));
}

/**
 * A list of the seven codes (a company default saved before the ticks) as
 * ticks and options. Anything else is dropped: nobody gains by folding.
 */
export function foldLegacyCodes(codes: readonly string[] | null | undefined): {
  modules: ConsultantModule[];
  options: ConsultantOption[];
} {
  const modules = (codes ?? []).flatMap((code) => (code in LEGACY_CODE_MODULES ? [LEGACY_CODE_MODULES[code]] : []));
  return { modules: orderedModules(modules), options: orderedOptions(codes) };
}

/**
 * What a new grant starts with: the company's 「顾问项目默认权限」, else the
 * usual default. A default still written as codes counts as its ticks.
 */
export function startingGrant(
  companyModules: readonly string[] | null | undefined,
  companyOptions: readonly string[] | null | undefined,
  companyItems?: readonly string[] | null,
): { modules: ConsultantModule[]; options: ConsultantOption[]; items: ConsultantItem[] } {
  const folded = foldLegacyCodes(companyOptions);
  const modules = orderedModules([...(companyModules ?? []), ...folded.modules]);
  const options = folded.options;
  if (!modules.length && !options.length) {
    return { modules: [...DEFAULT_CONSULTANT_MODULES], options: [...DEFAULT_CONSULTANT_OPTIONS], items: [] };
  }
  // JB225: the default's items of 材料管理 / 工程进度 (all of a module saved without them).
  return { modules, options, items: normaliseTicks(modules, companyItems).items };
}

/** Tick or untick one option: 审批 brings 查看; dropping 查看 drops 审批 too. */
export function toggleOption(
  options: readonly ConsultantOption[],
  code: ConsultantOption,
  checked: boolean,
): ConsultantOption[] {
  if (checked) return orderedOptions([...options, code]);
  const left = options.filter((item) => item !== code);
  return orderedOptions(code === "approval.view" ? left.filter((item) => item !== "approval.review") : left);
}

/** Tick or untick one module. */
export function toggleModule(
  modules: readonly ConsultantModule[],
  key: ConsultantModule,
  checked: boolean,
): ConsultantModule[] {
  return orderedModules(checked ? [...modules, key] : modules.filter((item) => item !== key));
}

// ── The nine items under 材料管理 and 工程进度 (JB225) ─────────────────────
//
// 客户 11-19 事项 5: 「材料管理：材料进场、材料退场、材料领用、按供应商统计、材料目标。
// 工程进度：施工进度、施工日报告、雨天记录、施工计划。以上各项请设置独立的勾选权限，
// 由建筑商总部自行决定开放哪些内容给顾问。」 Mirrors `accounts.consultant_access.ITEMS`
// and `normalise`: a module counts as ticked when one of its items is.

/** The client's nine, in his order. */
export const CONSULTANT_ITEMS = [
  "materials.in",
  "materials.returns",
  "materials.issues",
  "materials.supplier_totals",
  "materials.targets",
  "progress.records",
  "progress.daily_reports",
  "progress.rain",
  "progress.schedule",
  // JB265 (客户 11-26 事项 6): 「支持总部独立勾选：查看现场任务。发起及指派现场
  // 任务。验收现场任务。」
  "field_tasks.view",
  "field_tasks.assign",
  "field_tasks.accept",
] as const;

export type ConsultantItem = (typeof CONSULTANT_ITEMS)[number];

/** The two modules that have items, and their items in the client's order. */
export const ITEMS_OF_MODULE: Readonly<Partial<Record<ConsultantModule, readonly ConsultantItem[]>>> = {
  materials: CONSULTANT_ITEMS.filter((key) => key.startsWith("materials.")),
  progress: CONSULTANT_ITEMS.filter((key) => key.startsWith("progress.")),
  field_tasks: CONSULTANT_ITEMS.filter((key) => key.startsWith("field_tasks.")),
};

/**
 * What a module ticked without any of its items holds (the backend's
 * `DEFAULT_ITEMS_OF_MODULE`): all of them, except 现场任务 - a grant from
 * before JB265 had 「查看现场任务」 only, and keeps exactly that.
 */
const DEFAULT_ITEMS_OF_MODULE: Readonly<Partial<Record<ConsultantModule, readonly ConsultantItem[]>>> = {
  field_tasks: ["field_tasks.view"],
};

/** Message key under `consultantAccess.item` / `itemHint` / `itemShort`. */
export const ITEM_MESSAGE_KEYS: Readonly<Record<ConsultantItem, string>> = {
  "materials.in": "materialsIn",
  "materials.returns": "materialsReturns",
  "materials.issues": "materialsIssues",
  "materials.supplier_totals": "materialsSupplierTotals",
  "materials.targets": "materialsTargets",
  "progress.records": "progressRecords",
  "progress.daily_reports": "progressDailyReports",
  "progress.rain": "progressRain",
  "progress.schedule": "progressSchedule",
  "field_tasks.view": "fieldTasksView",
  "field_tasks.assign": "fieldTasksAssign",
  "field_tasks.accept": "fieldTasksAccept",
};

/** The consultant's menu key for each item (`consultant_access.Item.features[0]`). */
export const ITEM_FEATURES: Readonly<Record<ConsultantItem, string>> = {
  "materials.in": "item_materials_in",
  "materials.returns": "item_materials_returns",
  "materials.issues": "item_materials_issues",
  "materials.supplier_totals": "item_materials_supplier_totals",
  "materials.targets": "item_materials_targets",
  "progress.records": "item_progress_records",
  "progress.daily_reports": "item_progress_daily_reports",
  "progress.rain": "item_progress_rain",
  "progress.schedule": "item_progress_schedule",
  // One page, one menu key, whichever of the three is ticked (JB265).
  "field_tasks.view": "field_tasks",
  "field_tasks.assign": "field_tasks",
  "field_tasks.accept": "field_tasks",
};

export const isConsultantItem = (value: string): value is ConsultantItem =>
  (CONSULTANT_ITEMS as readonly string[]).includes(value);

const moduleOfItem = (item: ConsultantItem): ConsultantModule =>
  item.split(".", 1)[0] as ConsultantModule;

/** Known item keys only, once each, in the client's order. */
export function orderedItems(values: readonly string[] | null | undefined): ConsultantItem[] {
  const chosen = new Set(values ?? []);
  return CONSULTANT_ITEMS.filter((key) => chosen.has(key));
}

/** A grant's (or the company default's) module ticks with their items. */
export interface ConsultantTicks {
  modules: ConsultantModule[];
  items: ConsultantItem[];
}

/**
 * The backend's `normalise`: with `itemsSent` an item brings its module; a
 * module with none of its items gets all of them (a grant saved before
 * JB225); items of a module not ticked are dropped.
 */
export function normaliseTicks(
  modules: readonly string[] | null | undefined,
  items: readonly string[] | null | undefined,
  itemsSent = false,
): ConsultantTicks {
  const ticked = new Set<string>(orderedModules(modules));
  let chosen = orderedItems(items);
  if (itemsSent) for (const item of chosen) ticked.add(moduleOfItem(item));
  chosen = chosen.filter((item) => ticked.has(moduleOfItem(item)));
  const all = new Set<ConsultantItem>(chosen);
  for (const [module, keys] of Object.entries(ITEMS_OF_MODULE)) {
    if (ticked.has(module) && !(keys ?? []).some((key) => all.has(key))) {
      for (const key of DEFAULT_ITEMS_OF_MODULE[module as ConsultantModule] ?? keys ?? []) all.add(key);
    }
  }
  return { modules: orderedModules([...ticked]), items: orderedItems([...all]) };
}

/** 「全部」, 「部分」 or 「没有」 of a module's items - its checkbox's three states. */
export function moduleItemState(ticks: ConsultantTicks, module: ConsultantModule): "all" | "some" | "none" {
  const keys = ITEMS_OF_MODULE[module];
  if (!keys) return ticks.modules.includes(module) ? "all" : "none";
  const held = keys.filter((key) => ticks.items.includes(key)).length;
  if (held === 0) return "none";
  return held === keys.length ? "all" : "some";
}

/** Tick or untick a module: its items follow (all on, all off). */
export function toggleModuleTicks(
  ticks: ConsultantTicks,
  module: ConsultantModule,
  checked: boolean,
): ConsultantTicks {
  const keys = ITEMS_OF_MODULE[module] ?? [];
  const items = checked
    ? orderedItems([...ticks.items, ...keys])
    : ticks.items.filter((item) => !keys.includes(item));
  return { modules: toggleModule(ticks.modules, module, checked), items };
}

/**
 * Whether head office ticked this item for the consultant on the project he
 * is working in (JB265: 发起及指派 / 验收现场任务). The server checks the same
 * on every request; this only decides which buttons to show. False for anyone
 * who is not a consultant - their permission codes decide.
 */
export function consultantHoldsItem(
  user: { account_type?: string; active_project?: { sub_modules?: string[] } | null } | null | undefined,
  item: ConsultantItem,
): boolean {
  if (!user || user.account_type !== "CONSULTANT") return false;
  return (user.active_project?.sub_modules ?? []).includes(item);
}

/** Tick or untick one item: the first ticks its module, the last unticks it. */
export function toggleItem(ticks: ConsultantTicks, item: ConsultantItem, checked: boolean): ConsultantTicks {
  // Not `module`: Next's lint refuses that name for a variable.
  const owner = moduleOfItem(item);
  const items = checked ? orderedItems([...ticks.items, item]) : ticks.items.filter((key) => key !== item);
  const anyLeft = (ITEMS_OF_MODULE[owner] ?? []).some((key) => items.includes(key));
  return { modules: toggleModule(ticks.modules, owner, anyLeft), items };
}

/** 「全选」: every module and every item. */
export function allTicks(): ConsultantTicks {
  return { modules: [...CONSULTANT_MODULES], items: [...CONSULTANT_ITEMS] };
}

/**
 * The record conversations a consultant takes part in (JB210, 客户 11-16:
 * 「任务和沟通只显示顾问参与的记录」; Lucas 11-16 Q2 = A): the 顾问申请 sent to
 * him and the tasks sent to him to 验收. The contractor's own talk on a
 * delivery, a progress record or a document is not shown to him. Mirrors
 * `record_chat.CONSULTANT_CHAT_KINDS`; 整改 keeps its own room. JB224 (客户 11-19
 * 事项 4): `DIRECT` too - his own conversations with the project office; the
 * server answers him only in the ones he is in.
 */
export const CONSULTANT_CHAT_KINDS: readonly string[] = ["CONSULTANT_APPLICATION", "FIELD_TASK", "DIRECT"];

export function consultantSeesConversation(accountType: string | undefined, kind: string): boolean {
  return accountType !== "CONSULTANT" || CONSULTANT_CHAT_KINDS.includes(kind);
}

/** The marker a consultant's feature list carries (`navigation.CONSULTANT_MENU`). */
const CONSULTANT_MENU_KEY = "consultant_menu";

/** What every item's menu key starts with (`item_materials_in` …). */
export const ITEM_FEATURE_PREFIX = "item_";

/**
 * Whether a feature list names a consultant's items at all. A backend from
 * before JB225 sends none: its consultant opens whole modules (audit 11-19 F3).
 */
export function featuresCarryItems(features: Iterable<string> | null | undefined): boolean {
  for (const key of features ?? []) {
    if (key.startsWith(ITEM_FEATURE_PREFIX)) return true;
  }
  return false;
}

/**
 * Whether this reader is a consultant without item `item` on his project
 * (JB225, 「未勾选的事项，顾问不得查看」). Always false for anyone else: a
 * contractor's pages are decided by his codes, as before. False too when the
 * list names no item at all - an older backend, whose consultant has whole
 * modules (the screen must not empty 材料管理 / 工程进度 before it is updated).
 */
export function consultantLacks(features: readonly string[] | null | undefined, item: ConsultantItem): boolean {
  const list = features ?? [];
  if (!list.includes(CONSULTANT_MENU_KEY) || !featuresCarryItems(list)) return false;
  return !list.includes(ITEM_FEATURES[item]);
}

/**
 * The sides of 材料出场 this reader sees (JB225): both for anyone but a
 * consultant; for a consultant, 供应商退货 with 材料退场 ticked and 材料领用 with
 * 材料领用.
 */
export function outgoingKindsFor(features: readonly string[] | null | undefined): ("RETURN" | "ISSUE")[] {
  return (["RETURN", "ISSUE"] as const).filter(
    (kind) => !consultantLacks(features, kind === "RETURN" ? "materials.returns" : "materials.issues"),
  );
}
