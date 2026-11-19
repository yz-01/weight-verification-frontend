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
): { modules: ConsultantModule[]; options: ConsultantOption[] } {
  const folded = foldLegacyCodes(companyOptions);
  const modules = orderedModules([...(companyModules ?? []), ...folded.modules]);
  const options = folded.options;
  if (!modules.length && !options.length) {
    return { modules: [...DEFAULT_CONSULTANT_MODULES], options: [...DEFAULT_CONSULTANT_OPTIONS] };
  }
  return { modules, options };
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
