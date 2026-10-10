import type {
  ArchiveRecordKind,
  PackRowReason,
  PackRowStatus,
} from "@/interfaces/contractor-ops";

/**
 * Multi Engine's 「添加资料」 on the modules' own lists (2026-10-10).
 *
 * 客户「添加资料及勾选关联优化（最终要求）」:
 *
 * 1. 在 Multi Engine 点击「添加资料」，选择材料进场、设备进场、EHS 等分类。
 * 2. 直接跳转到对应的原有业务栏目。
 * 3. 当前 Multi Engine 资料包缩到旁边，显示资料包名称、已选数量及返回入口。
 * …
 * 8. 可以继续进入其他栏目勾选，之前已选资料不能消失。
 *
 * So "putting package X together" is a state of the whole console, not of one
 * page: it rides in the address (`?pack=`) when Multi Engine sends the person
 * to a module, and in this tab's session storage after that, so moving to
 * another module from the menu or reloading keeps it. What was ticked is on
 * the server the moment it is added - closing the browser loses nothing but
 * the docked panel (五 5).
 *
 * Pure functions here; the panel and the list columns are in
 * `components/contractor-ops/pack-collect.tsx`.
 */

/** The address parameter Multi Engine sends a module page with. */
export const PACK_PARAM = "pack";

/** Where this tab remembers the package being put together. */
export const PACK_STORAGE_KEY = "mse.multiEngine.collecting";

/** The package being put together, as the docked panel shows it. */
export interface CollectingPackage {
  id: string;
  name: string;
  /** Its project: the module page opens on it (三 8). */
  project: string;
}

/** A store with the two calls this needs - `sessionStorage`, or a fake in tests. */
export interface KeyValueStore {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function isCollecting(value: unknown): value is CollectingPackage {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    row.id.length > 0 &&
    typeof row.name === "string" &&
    typeof row.project === "string"
  );
}

/** A stored entry, read; a broken one is no entry. */
export function parseCollecting(raw: string | null | undefined): CollectingPackage | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isCollecting(parsed) ? { id: parsed.id, name: parsed.name, project: parsed.project } : null;
  } catch {
    return null;
  }
}

/** What this tab was putting together, or null. */
export function readCollecting(store: KeyValueStore | null | undefined): CollectingPackage | null {
  if (!store) return null;
  try {
    return parseCollecting(store.getItem(PACK_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Remember (or, with null, forget) the package being put together. */
export function writeCollecting(
  store: KeyValueStore | null | undefined,
  value: CollectingPackage | null,
): void {
  if (!store) return;
  try {
    if (value) store.setItem(PACK_STORAGE_KEY, JSON.stringify(value));
    else store.removeItem(PACK_STORAGE_KEY);
  } catch {
    // A private window or a full store: collecting still works on this page.
  }
}

/**
 * Which package is being put together on this page: the address wins (Multi
 * Engine just sent the person here, or a link was shared), then what this tab
 * remembered. The address carries only the id; the name comes with it once
 * the package is read.
 */
export function resolveCollecting(
  fromAddress: string | null | undefined,
  remembered: CollectingPackage | null,
): CollectingPackage | null {
  const id = (fromAddress ?? "").trim();
  if (id) {
    return remembered && remembered.id === id ? remembered : { id, name: "", project: "" };
  }
  return remembered;
}

/**
 * One column Multi Engine can pick from, and the module page that is its
 * list. Labelled with the menu's own name (the naming guards hold module
 * names identical everywhere).
 */
export interface PackTarget {
  key: string;
  kind: ArchiveRecordKind;
  /** A `nav.submodule.*` key - the module's name in the menu. */
  labelKey: string;
  /** The module's list, before `project` and `pack` are added. */
  path: string;
  /** Fixed parameters the list needs to open on the right tab. */
  params?: Record<string, string>;
}

/**
 * Every column Multi Engine has always offered (补充 1: 「适用于所有现有分类」).
 * 施工准证 is a hazard record, but its own module since 2026-10-10, so it is
 * its own entry here.
 */
export const PACK_TARGETS: readonly PackTarget[] = [
  { key: "receipts", kind: "MATERIAL_RECEIPT", labelKey: "nav.submodule.materialReceipts", path: "/receipts" },
  { key: "outgoing", kind: "MATERIAL_OUTGOING", labelKey: "nav.submodule.materialOutgoing", path: "/material-outgoing" },
  { key: "equipment", kind: "EQUIPMENT_MOVEMENT", labelKey: "nav.submodule.siteEquipment", path: "/site-equipment" },
  { key: "hazards", kind: "HAZARD", labelKey: "nav.submodule.hazardRectifications", path: "/hazard-rectifications" },
  { key: "permits", kind: "HAZARD", labelKey: "nav.submodule.permits", path: "/permits" },
  { key: "wasteOutgoing", kind: "WASTE_OUTGOING", labelKey: "nav.submodule.wasteOutgoing", path: "/waste-outgoing" },
  {
    key: "disposals",
    kind: "DISPOSAL_REQUEST",
    labelKey: "nav.submodule.siteDisposals",
    path: "/waste-clearance",
    params: { kind: "disposal" },
  },
  {
    key: "progress",
    kind: "PROGRESS",
    labelKey: "nav.submodule.progressRecords",
    path: "/progress",
    params: { tab: "photos", view: "records" },
  },
  {
    key: "applications",
    kind: "CONSULTANT_APPLICATION",
    labelKey: "nav.submodule.consultantApplications",
    path: "/consultant-applications",
  },
];

/** The module's list, opened on the package's project, collecting into it. */
export function collectHref(target: PackTarget, pkg: { id: string; project: string }): string {
  const params = new URLSearchParams(target.params ?? {});
  // The top bar moves to the package's project (`?project=` wins, B13): a
  // package draws from one project's columns (三 8, D-143).
  if (pkg.project) params.set("project", pkg.project);
  params.set(PACK_PARAM, pkg.id);
  return `${target.path}?${params.toString()}`;
}

/** Back to the package in Multi Engine, opened (二 7). */
export function packageHref(id: string): string {
  return `/evidence-packages?package=${encodeURIComponent(id)}`;
}

/** No status yet: a row nobody has asked about. */
export const UNKNOWN_ROW: PackRowStatus = {
  count: 0,
  in_package: false,
  can_add: false,
  reason: "no_package",
};

/** The rows of a page that can still be ticked into the open package. */
export function tickableIds(
  ids: readonly string[],
  records: Readonly<Record<string, PackRowStatus>> | undefined,
): string[] {
  return ids.filter((id) => records?.[id]?.can_add === true);
}

/**
 * The ticks that still mean something after the list reloaded: a row that
 * joined the package, left the page or cannot be added any more drops out.
 */
export function keepTickable(
  picked: readonly string[],
  ids: readonly string[],
  records: Readonly<Record<string, PackRowStatus>> | undefined,
): string[] {
  const open = new Set(tickableIds(ids, records));
  return picked.filter((id) => open.has(id));
}

/** The words for why a row's box is greyed out (`multiEngine.collect.reason.*`). */
export function reasonKey(reason: PackRowReason): string | null {
  return reason ? `reason.${reason}` : null;
}

/** Whether a page shows the 「资料包」 column at all: collecting, or a row was packed. */
export function showsPackColumn(
  collecting: boolean,
  records: Readonly<Record<string, PackRowStatus>> | undefined,
): boolean {
  if (collecting) return true;
  return Object.values(records ?? {}).some((row) => row.count > 0 || row.in_package);
}
