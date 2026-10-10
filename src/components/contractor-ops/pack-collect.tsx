"use client";

/**
 * Multi Engine's 「添加资料」 on the modules' own lists (2026-10-10).
 *
 * 客户「添加资料及勾选关联优化（最终要求）」 and 「最后补充 4 项」: the person
 * presses 「添加资料」 in a package, chooses 材料进场 / 设备进出 / EHS …, and
 * lands on that module's existing list - its search, filters, photographs,
 * DO, signatures and states (二 4). Rows get a tick box; 「加入当前资料包」
 * links the ticked records, whole (补充 2). The package shrinks to a strip
 * at the bottom with its name, how many records it holds and the way back
 * (二 3); it stays there across modules (二 8) until 「结束选择」.
 *
 * Every list also says 「✅ 已打包 X 次」 on a record that is in packages,
 * and pressing it names each package (三 4, 三 5) - with the reminder that
 * packed is not claimed and not approved (三 7).
 *
 * Written once, here, and switched on per list by `DataTable`'s `pack` prop
 * (or `usePackList` for a list that is not a table): the module pages are not
 * rebuilt (四).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, Package, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  createContext,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { Shell } from "@/components/contractor-ops/package-shell";
import { useAuth } from "@/components/providers/auth-provider";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ApiError } from "@/interfaces/api";
import type {
  ArchiveRecordKind,
  PackRowStatus,
  RecordPackageRow,
} from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import { isRouteAllowed } from "@/lib/navigation";
import {
  PACK_PARAM,
  PACK_STORAGE_KEY,
  PACK_TARGETS,
  type CollectingPackage,
  collectHref,
  keepTickable,
  packageHref,
  parseCollecting,
  resolveCollecting,
  showsPackColumn,
  tickableIds,
  writeCollecting,
} from "@/lib/pack-collect";
import { toneOf } from "@/lib/tones";
import { cn } from "@/lib/utils";
import {
  getEvidencePackage,
  getPackStatus,
  getRecordPackages,
  linkPackageRecords,
  unlinkPackageRecords,
} from "@/services/contractor-ops.service";

/** The package sheet, loaded when somebody opens a package from a list. */
const PackageSheet = lazy(() =>
  import("@/components/contractor-ops/multi-engine").then((module) => ({
    default: module.PackageSheet,
  })),
);

/* -------------------------------------------------------------------------
 * Which package is being put together: one per browser tab
 * ---------------------------------------------------------------------- */

const listeners = new Set<() => void>();

function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): string | null {
  try {
    return sessionStore()?.getItem(PACK_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function remember(value: CollectingPackage | null) {
  writeCollecting(sessionStore(), value);
  listeners.forEach((listener) => listener());
}

interface PackCollectValue {
  /** The draft being put together, or null. */
  collecting: CollectingPackage | null;
  /** Its holding, for the strip: how many records, its number. */
  itemCount: number | null;
  packageNo: string;
  start: (pkg: CollectingPackage) => void;
  end: () => void;
}

const NOT_COLLECTING: PackCollectValue = {
  collecting: null,
  itemCount: null,
  packageNo: "",
  start: () => undefined,
  end: () => undefined,
};

const PackCollectContext = createContext<PackCollectValue>(NOT_COLLECTING);

/** The package being put together, wherever in the console the person is. */
export function usePackCollect(): PackCollectValue {
  return useContext(PackCollectContext);
}

/** For tests: a fixed 「正在挑选资料」 state. */
export const PackCollectValueProvider = PackCollectContext.Provider;
export type { PackCollectValue };

/**
 * Holds 「正在挑选资料」 for the signed-in console. The address's `?pack=`
 * starts it (Multi Engine sent the person here); this tab's session storage
 * keeps it across modules and reloads; a package that has been confirmed or
 * deleted since ends it - there is nothing to add to any more.
 */
export function PackCollectProvider({ children }: { children: React.ReactNode }) {
  const { can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const remembered = useMemo(() => parseCollecting(raw), [raw]);
  const allowed = can("package.manage");
  const fromAddress = searchParams.get(PACK_PARAM);
  const wanted = allowed ? resolveCollecting(fromAddress, remembered) : null;

  const pkg = useQuery({
    queryKey: ["evidence-packages", "detail", wanted?.id ?? ""],
    queryFn: () => getEvidencePackage(wanted?.id ?? ""),
    enabled: Boolean(wanted),
  });
  const data = pkg.data;
  const gone = pkg.error instanceof ApiError && (pkg.error.isNotFound || pkg.error.isForbidden);
  const closed = data !== undefined && data.state !== "DRAFT";

  const end = useCallback(() => {
    remember(null);
    if (searchParams.has(PACK_PARAM)) {
      const next = new URLSearchParams(searchParams.toString());
      next.delete(PACK_PARAM);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }
  }, [pathname, router, searchParams]);

  // What the address brought is remembered with its name and project once
  // read, so the next module - reached from the menu, without `?pack=` -
  // keeps collecting into it (二 8).
  useEffect(() => {
    if (!data || closed || !wanted || data.id !== wanted.id) return;
    if (remembered?.id === data.id && remembered.name === data.name && remembered.project === data.project) return;
    remember({ id: data.id, name: data.name, project: data.project });
  }, [closed, data, remembered, wanted]);

  // Confirmed or deleted since it was opened: nothing left to add to.
  useEffect(() => {
    if (gone || closed) end();
  }, [closed, end, gone]);

  const wantedId = wanted?.id;
  const wantedName = wanted?.name ?? "";
  const wantedProject = wanted?.project ?? "";
  const value = useMemo<PackCollectValue>(() => {
    if (!allowed) return NOT_COLLECTING;
    if (!wantedId || gone || closed) return { ...NOT_COLLECTING, start: remember, end };
    return {
      collecting: {
        id: wantedId,
        name: data?.name ?? wantedName,
        project: data?.project ?? wantedProject,
      },
      itemCount: data ? data.item_count : null,
      packageNo: data?.package_no ?? "",
      start: remember,
      end,
    };
  }, [allowed, closed, data, end, gone, wantedId, wantedName, wantedProject]);

  return <PackCollectContext.Provider value={value}>{children}</PackCollectContext.Provider>;
}

/**
 * The package, shrunk to a strip (二 3): its name, how many records it holds,
 * 「返回 Multi Engine」 and 「结束选择」. In the layout under the page - like
 * the task cards - so it never sits on top of a row or a page button; on a
 * desktop it keeps to the right, on a phone it is the bottom bar.
 */
export function PackCollectDock() {
  const t = useTranslations("multiEngine.collect");
  const pathname = usePathname();
  const { collecting, itemCount, packageNo, end } = usePackCollect();
  // In Multi Engine itself the package is on screen already.
  if (!collecting || pathname.startsWith("/evidence-packages")) return null;
  return (
    <aside
      aria-label={t("dockTitle")}
      data-slot="pack-collect-dock"
      className="flex shrink-0 justify-end border-t border-panel-border bg-muted/60 px-4 py-2 lg:px-6"
    >
      <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:max-w-xl">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset", toneOf("info").soft)}>
          <Package className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">
            {t("dockTitle")}
            {packageNo ? ` · ${packageNo}` : ""}
          </p>
          <p className="truncate text-sm font-semibold">
            {collecting.name || "…"}
            {itemCount !== null && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {t("inPackage", { count: itemCount })}
              </span>
            )}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href={packageHref(collecting.id)}>
            <ArrowLeft className="size-4" />
            <span className="max-sm:sr-only">{t("back")}</span>
          </Link>
        </Button>
        <Button size="sm" variant="outline" onClick={end}>
          <X className="size-4" />
          <span className="max-sm:sr-only">{t("end")}</span>
        </Button>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------
 * 「添加资料」: which module to pick from
 * ---------------------------------------------------------------------- */

const KIND_PERMISSION: Record<ArchiveRecordKind, string> = {
  MATERIAL_RECEIPT: "receipt.view",
  MATERIAL_OUTGOING: "material_outgoing.view",
  EQUIPMENT_MOVEMENT: "equipment.view",
  HAZARD: "safety.view",
  WASTE_OUTGOING: "waste_outgoing.view",
  DISPOSAL_REQUEST: "disposal.view",
  PROGRESS: "progress.view",
  CONSULTANT_APPLICATION: "approval.view",
  ATTENDANCE_DAY: "attendance.view",
  SUNDRY_CLAIM: "sundry_claim.view",
};

/**
 * 「添加资料」 → choose the column → that module's own list (二 1, 二 2).
 * Only the modules this account can open. The simple in-dialog list stays one
 * press away for whoever prefers it (「确保不要影响到功能」).
 */
export function PackTargetChooser({
  pkg,
  onClose,
  onQuickList,
}: {
  pkg: CollectingPackage;
  onClose: () => void;
  onQuickList: () => void;
}) {
  const t = useTranslations("multiEngine.collect");
  const tRoot = useTranslations();
  const { user, can } = useAuth();
  const { start } = usePackCollect();
  const router = useRouter();
  const targets = PACK_TARGETS.filter(
    (target) =>
      user !== null &&
      can(KIND_PERMISSION[target.kind]) &&
      isRouteAllowed(user.portal, user.features, target.path, user.permissions, user.is_superuser),
  );
  return (
    <Shell title={t("chooserTitle")} onClose={onClose}>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <p className="rounded-lg border border-dashed border-panel-border bg-muted/30 p-3 text-xs text-muted-foreground">
          {t("chooserHelp")}
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {targets.map((target) => (
            <li key={target.key}>
              <button
                type="button"
                className="flex min-h-12 w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left text-sm font-medium transition-colors hover:border-primary/50 hover:bg-accent"
                onClick={() => {
                  start(pkg);
                  router.push(collectHref(target, pkg));
                }}
              >
                <Package className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate">{tRoot(target.labelKey)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <footer className="flex flex-col-reverse gap-2 border-t border-panel-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={onQuickList}>
          {t("quickList")}
        </Button>
        <Button variant="outline" onClick={onClose}>
          {tRoot("common.cancel")}
        </Button>
      </footer>
    </Shell>
  );
}

/* -------------------------------------------------------------------------
 * A module's list: tick boxes, 「已打包 X 次」, 「加入当前资料包」
 * ---------------------------------------------------------------------- */

export interface PackListConfig<T> {
  kind: ArchiveRecordKind;
  /** The record's id when a row's `id` is something else. */
  rowId?: (row: T) => string;
}

/** Column ids, so the table does not open a row when its box is pressed. */
export const PACK_SELECT_COLUMN = "pack-select";
export const PACK_BADGE_COLUMN = "pack";

export interface PackList {
  /** Tick boxes are on: a package is being put together, by somebody who may. */
  picking: boolean;
  /** The 「资料包」 column is worth showing on this page. */
  showColumn: boolean;
  check: (id: string) => React.ReactNode;
  checkAll: React.ReactNode;
  badge: (id: string) => React.ReactNode;
  /** 「已勾选 N 条 · 加入当前资料包」, above the rows; null when not picking. */
  bar: React.ReactNode;
  /** A package opened from a badge, over the page. */
  overlay: React.ReactNode;
}

/**
 * Everything a module's list needs for Multi Engine, from its kind and its
 * rows. One request per page for all of its badges (`pack_status`).
 */
export function usePackList<T>(config: PackListConfig<T>, rows: readonly T[]): PackList {
  const t = useTranslations("multiEngine.collect");
  const { can } = useAuth();
  const { collecting } = usePackCollect();
  const queryClient = useQueryClient();
  const { kind, rowId } = config;
  const canView = can("package.view");
  const picking = collecting !== null && can("package.manage");
  const ids = rows
    .map((row) => (rowId ? rowId(row) : String((row as { id?: unknown }).id ?? "")))
    .filter(Boolean);

  const status = useQuery({
    queryKey: ["evidence-packages", "pack-status", kind, collecting?.id ?? "", ids],
    queryFn: () => getPackStatus(kind, ids, collecting?.id),
    enabled: canView && ids.length > 0,
  });
  const records = status.data?.records;
  const [picked, setPicked] = useState<string[]>([]);
  // Derived, not stored: a row that joined, left the page or cannot be added
  // any more is no longer ticked.
  const ticks = keepTickable(picked, ids, records);
  const open = tickableIds(ids, records);
  const [opened, setOpened] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["evidence-packages"] });
  const link = useMutation({
    mutationFn: (chosen: string[]) => linkPackageRecords(collecting?.id ?? "", kind, chosen),
    onSuccess: () => {
      setPicked([]);
      void refresh();
    },
  });
  const unlink = useMutation({
    mutationFn: (id: string) => unlinkPackageRecords(collecting?.id ?? "", kind, [id]),
    onSuccess: () => void refresh(),
  });

  const toggle = (id: string, next: boolean) =>
    setPicked((current) => (next ? [...current.filter((value) => value !== id), id] : current.filter((value) => value !== id)));

  const check = (id: string) => {
    const row = records?.[id];
    const reason = row?.reason ? t(`reason.${row.reason}`) : t("reason.loading");
    if (row?.in_package) {
      return <Checkbox checked disabled aria-label={t("inCurrent")} title={t("inCurrent")} />;
    }
    if (!row?.can_add) {
      return <Checkbox disabled aria-label={reason} title={reason} />;
    }
    return (
      <Checkbox
        checked={ticks.includes(id)}
        onCheckedChange={(next) => toggle(id, next === true)}
        aria-label={t("selectRow")}
      />
    );
  };

  const all = open.length > 0 && ticks.length === open.length;
  const checkAll = (
    <Checkbox
      checked={all ? true : ticks.length > 0 ? "indeterminate" : false}
      disabled={open.length === 0}
      onCheckedChange={(next) => setPicked(next === true ? open : [])}
      aria-label={t("selectAll")}
      title={t("selectAll")}
    />
  );

  const badge = (id: string) => (
    <PackCell
      kind={kind}
      recordId={id}
      status={records?.[id]}
      onOpen={setOpened}
      onRemove={picking ? () => unlink.mutate(id) : undefined}
      removing={unlink.isPending}
    />
  );

  const bar = picking ? (
    <PackActionBar
      name={collecting?.name ?? ""}
      ticked={ticks.length}
      pending={link.isPending}
      onAdd={() => link.mutate(ticks)}
      onClear={() => setPicked([])}
      failure={<QueryFailedNote query={status} what={t("what.status")} />}
    />
  ) : status.isError ? (
    <div className="px-4 py-1 sm:px-6">
      <QueryFailedNote query={status} what={t("what.status")} />
    </div>
  ) : null;

  const overlay = opened ? (
    <Suspense fallback={null}>
      <PackageSheet id={opened} onClose={() => setOpened(null)} />
    </Suspense>
  ) : null;

  return {
    picking,
    showColumn: canView && showsPackColumn(picking, records),
    check,
    checkAll,
    badge,
    bar,
    overlay,
  };
}

/** The page's columns with the tick box first and 「资料包」 second. */
export function withPackColumns<T>(
  columns: ColumnDef<T, unknown>[],
  pack: PackList,
  label: string,
  rowId: (row: T) => string,
): ColumnDef<T, unknown>[] {
  const out = [...columns];
  if (pack.showColumn) {
    out.splice(Math.min(1, out.length), 0, {
      id: PACK_BADGE_COLUMN,
      meta: { label },
      header: () => <span className="text-xs font-semibold text-muted-foreground">{label}</span>,
      cell: ({ row }) => pack.badge(rowId(row.original)),
    });
  }
  if (pack.picking) {
    out.unshift({
      id: PACK_SELECT_COLUMN,
      enableHiding: false,
      header: () => pack.checkAll,
      cell: ({ row }) => pack.check(rowId(row.original)),
    });
  }
  return out;
}

/** 「已勾选 N 条」 and 「加入当前资料包」 (二 5, 二 6). */
export function PackActionBar({
  name,
  ticked,
  pending,
  onAdd,
  onClear,
  failure,
}: {
  name: string;
  ticked: number;
  pending: boolean;
  onAdd: () => void;
  onClear: () => void;
  failure?: React.ReactNode;
}) {
  const t = useTranslations("multiEngine.collect");
  return (
    <div
      data-slot="pack-action-bar"
      className="flex flex-wrap items-center gap-2 border-b border-panel-border bg-primary/5 px-4 py-2 sm:px-6"
    >
      <Package className="size-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{t("barTitle", { name: name || "…" })}</span>
        <span className="ml-2 text-xs text-muted-foreground">{t("ticked", { count: ticked })}</span>
      </p>
      {failure}
      {ticked > 0 && (
        <Button size="sm" variant="ghost" onClick={onClear}>
          {t("clear")}
        </Button>
      )}
      <Button
        size="sm"
        disabled={ticked === 0 || pending}
        disabledReason={ticked === 0 ? t("tickFirst") : undefined}
        onClick={onAdd}
      >
        {t("addTicked")}
      </Button>
    </div>
  );
}

/**
 * One row's 「✅ 已加入当前资料包」 and 「✅ 已打包 X 次」. The count opens the
 * packages it is in; with nothing to say the cell is empty.
 */
export function PackCell({
  kind,
  recordId,
  status,
  onOpen,
  onRemove,
  removing = false,
}: {
  kind: ArchiveRecordKind;
  recordId: string;
  status: PackRowStatus | undefined;
  onOpen: (packageId: string) => void;
  onRemove?: () => void;
  removing?: boolean;
}) {
  const t = useTranslations("multiEngine.collect");
  if (!status || (!status.in_package && status.count === 0)) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
      {status.in_package && (
        <span
          className={cn(
            "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-medium ring-1 ring-inset",
            toneOf("positive").soft,
          )}
        >
          {t("inCurrent")}
          {onRemove && (
            <button
              type="button"
              className="ml-1 font-normal underline underline-offset-2 disabled:opacity-50"
              disabled={removing}
              onClick={onRemove}
            >
              {t("remove")}
            </button>
          )}
        </span>
      )}
      {status.count > 0 && <PackedBadge kind={kind} recordId={recordId} count={status.count} onOpen={onOpen} />}
    </span>
  );
}

/** 「✅ 已打包 X 次」, opening the list of packages (三 4, 三 5, 三 7). */
export function PackedBadge({
  kind,
  recordId,
  count,
  onOpen,
}: {
  kind: ArchiveRecordKind;
  recordId: string;
  count: number;
  onOpen: (packageId: string) => void;
}) {
  const t = useTranslations("multiEngine.collect");
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-6 items-center whitespace-nowrap rounded-full px-2 text-xs font-medium ring-1 ring-inset transition-colors hover:brightness-110",
            toneOf("info").soft,
          )}
          onClick={(event) => event.stopPropagation()}
        >
          {t("packed", { count })}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80" onClick={(event) => event.stopPropagation()}>
        {open && (
          <PackageList
            kind={kind}
            recordId={recordId}
            onOpen={(id) => {
              setOpen(false);
              onOpen(id);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Where one record was packed: number, name, recipient, time, state. */
export function PackageList({
  kind,
  recordId,
  onOpen,
}: {
  kind: ArchiveRecordKind;
  recordId: string;
  onOpen: (packageId: string) => void;
}) {
  const t = useTranslations("multiEngine.collect");
  const packages = useQuery({
    queryKey: ["evidence-packages", "record-packages", kind, recordId],
    queryFn: () => getRecordPackages(kind, recordId),
  });
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{t("packedTitle")}</p>
      <QueryFailedNote query={packages} what={t("what.packages")} />
      {packages.isLoading ? (
        <p className="text-xs text-muted-foreground">{t("loading")}</p>
      ) : packages.data && packages.data.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("noPackages")}</p>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {(packages.data ?? []).map((row) => (
            <li key={row.package}>
              <PackageLine row={row} onOpen={() => onOpen(row.package)} />
            </li>
          ))}
        </ul>
      )}
      {/* 三 7: 「勾选只代表已加入资料包，不代表已 Claim 或顾问已批准」. */}
      <p className="border-t border-panel-border pt-2 text-xs text-muted-foreground">{t("packedHint")}</p>
    </div>
  );
}

/** One package a record is in, as a button that opens it. */
export function PackageLine({ row, onOpen }: { row: RecordPackageRow; onOpen: () => void }) {
  const t = useTranslations("multiEngine");
  const formatter = useDateFormat();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-lg border bg-card p-2 text-left transition-colors hover:border-primary/50 hover:bg-accent"
    >
      <span className="block truncate text-xs text-muted-foreground">{row.package_no || "—"}</span>
      <span className="block truncate text-sm font-medium">{row.name}</span>
      <span className="block text-xs text-muted-foreground">
        {row.sent_to_name ? t("collect.sentTo", { name: row.sent_to_name }) : t("collect.notSent")}
      </span>
      <span className="block text-xs text-muted-foreground">
        {t("collect.addedAt", { when: formatter.dateTime(row.added_at), who: row.added_by_name || "—" })}
      </span>
      <span className="mt-1 block text-xs font-medium">{packageStateLine(row, t)}</span>
    </button>
  );
}

/** Draft / confirmed / with the consultant / reviewed, and this record's own verdict. */
export function packageStateLine(
  row: Pick<RecordPackageRow, "state" | "review_state" | "item_review_state" | "returned_reason">,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (row.state === "DRAFT") return t("state.DRAFT");
  if (row.review_state === "NOT_SENT") return t("state.CONFIRMED");
  const parts = [t(`review.${row.review_state}`)];
  if (row.item_review_state === "ACCEPTED") parts.push(t("itemAccepted"));
  if (row.item_review_state === "RETURNED") parts.push(t("returnedWithReason", { reason: row.returned_reason }));
  return parts.join(" · ");
}

/**
 * 「已打包 X 次」 on one record's own dialog (三 4). A package opens in
 * Multi Engine: a record dialog is itself a layer, and a second sheet over
 * it would close it.
 */
export function RecordPackBadge({ kind, recordId }: { kind: ArchiveRecordKind; recordId: string }) {
  const { can } = useAuth();
  const router = useRouter();
  const { collecting } = usePackCollect();
  const status = useQuery({
    queryKey: ["evidence-packages", "pack-status", kind, collecting?.id ?? "", [recordId]],
    queryFn: () => getPackStatus(kind, [recordId], collecting?.id),
    enabled: can("package.view") && Boolean(recordId),
  });
  const t = useTranslations("multiEngine.collect");
  if (status.isError) return <QueryFailedNote query={status} what={t("what.status")} />;
  return (
    <PackCell
      kind={kind}
      recordId={recordId}
      status={status.data?.records[recordId]}
      onOpen={(id) => router.push(packageHref(id))}
    />
  );
}
