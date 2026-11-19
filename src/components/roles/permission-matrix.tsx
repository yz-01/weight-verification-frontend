"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCheck, Square, SquareCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { LoadFailed } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import type { PermissionEntry } from "@/interfaces/auth";
import { permissionGroupLabel, permissionLabel } from "@/lib/permission-labels";
import { cn } from "@/lib/utils";
import { getPermissionCatalogue } from "@/services/auth.service";

/**
 * The permission picker, grouped by domain.
 *
 * Rows come from the backend registry rather than a hardcoded list, so a
 * permission added on the server appears here with no frontend change. Labels
 * are looked up as `permissions.code.<domain>.<verb>`, which is why the
 * catalogue nests the codes: next-intl reads a dot as nesting, so the codes
 * cannot be flat keys. A missing translation shows the backend's English
 * label, never the key (`lib/permission-labels.ts`, I31).
 */
export function PermissionMatrix({
  selected,
  onChange,
  readOnly = false,
  kind = "plain",
  initialPage,
  notYours,
}: {
  selected: string[];
  onChange?: (codes: string[]) => void;
  readOnly?: boolean;
  /**
   * JB219 audit F1: boxes the editor may not tick - codes he does not hold
   * himself (「A组及B组权限由公司管理员自行勾选及分配」). Shown greyed.
   */
  notYours?: ReadonlySet<string>;
  /**
   * Whose role it is (JB139, JB218/JB219 客户 11-18 事项 3、4).
   * ``head_office`` (总部角色): A and B both ticked by the company, nothing
   * locked; the 项目权限 are on by default for its people - shown, not ticked.
   * ``project`` (项目角色): 总部专属 A cannot be ticked (the server drops it
   * too), B is head office's choice, 项目权限 on by default as above.
   * ``phone``: A locked, the rest ticked (the phone keeps its own set).
   * ``plain``: a recycler's or MSE's role - one page, every box (their roles
   * are not split into A / B).
   */
  kind?: RoleKind;
  /** The page shown first; a builder office role opens on 总部权限. */
  initialPage?: "hq" | "project";
}) {
  const t = useTranslations();
  const headOffice = kind === "head_office";
  const plain = kind === "plain";
  // 项目权限 on by default for a builder office role's people: not ticked here.
  const projectDefaultOn = kind === "project" || kind === "head_office";
  // A is head office's: locked on a project role and on the phone's.
  const reservedLocked = kind === "project" || kind === "phone";
  // 「请将现有权限分成两个独立页面：总部权限、项目权限」 (JB131).
  const [page, setPage] = useState<"hq" | "project">(
    initialPage ?? (projectDefaultOn ? "hq" : "project"),
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["permissions", "catalogue"],
    queryFn: getPermissionCatalogue,
    // The catalogue only changes when the backend deploys, so there is no
    // reason to refetch it while someone edits a role.
    staleTime: 60 * 60_000,
  });

  // A switch-only code (金额查看, J17) means nothing on a role.
  const entries = useMemo(() => (data ?? []).filter((entry) => !entry.switch_only), [data]);
  const pageOf = (entry: PermissionEntry) => entry.page ?? "project";
  const shownEntries = useMemo(
    () =>
      readOnly || plain
        ? // A builder office role's 项目权限 are on for its people whatever it
          // ticks (the note says so): only its 总部权限 are its own.
          projectDefaultOn
          ? entries.filter((entry) => pageOf(entry) !== "project")
          : entries
        : entries.filter((entry) =>
            page === "project" ? pageOf(entry) === "project" : pageOf(entry) !== "project",
          ),
    [entries, page, readOnly, plain, projectDefaultOn],
  );
  const groups = useMemo(() => groupByDomain(shownEntries), [shownEntries]);
  const locked = (entry: PermissionEntry) =>
    (reservedLocked && pageOf(entry) === "hq_reserved") ||
    (projectDefaultOn && pageOf(entry) === "project") ||
    Boolean(notYours?.has(entry.code));
  const chosen = useMemo(() => new Set(selected), [selected]);
  // The count is of what the role itself decides: its 总部权限 on a builder
  // office role (a kept 总部 preset also stores project codes, which are on
  // for everybody anyway).
  const countable = useMemo(
    () =>
      projectDefaultOn
        ? entries.filter((entry) => pageOf(entry) !== "project" && chosen.has(entry.code)).length
        : chosen.size,
    [entries, chosen, projectDefaultOn],
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, group) => (
          <div key={group} className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((__, row) => (
                <Skeleton key={row} className="h-8 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Without the catalogue there is nothing to tick, and an empty picker would
  // read as "this role has no permissions to choose from".
  if (isError) {
    return <LoadFailed what={t("roles.what.permissions")} onRetry={() => refetch()} />;
  }

  function toggle(code: string, next: boolean) {
    if (!onChange) return;
    const updated = new Set(chosen);
    if (next) updated.add(code);
    else updated.delete(code);
    onChange([...updated].sort());
  }

  function toggleGroup(codes: string[], next: boolean) {
    if (!onChange) return;
    const updated = new Set(chosen);
    for (const code of codes) {
      if (next) updated.add(code);
      else updated.delete(code);
    }
    onChange([...updated].sort());
  }

  // 全选 / 全部取消 work on the page shown, never on what is locked.
  const allCodes = shownEntries.filter((entry) => !locked(entry)).map((entry) => entry.code);
  const pageCodes = new Set(shownEntries.map((entry) => entry.code));
  const lockedCodes = new Set(shownEntries.filter(locked).map((entry) => entry.code));

  return (
    <div className="space-y-4">
      {!readOnly && !plain && (
        <div className="space-y-2" data-permission-pages>
          <div className="inline-flex rounded-lg border p-1" role="tablist" aria-label={t("roles.pages.label")}>
            {(["hq", "project"] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={page === key}
                onClick={() => setPage(key)}
                className={cn(
                  "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                  page === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {t(`roles.pages.${key}`)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {page === "hq"
              ? t(headOffice ? "roles.pages.hqHelp" : "roles.pages.hqHelpProjectRole")
              : t(
                  headOffice
                    ? "roles.pages.projectDefaultOnHeadOffice"
                    : projectDefaultOn
                      ? "roles.pages.projectDefaultOn"
                      : "roles.pages.projectHelp",
                )}
          </p>
        </div>
      )}
      {readOnly && projectDefaultOn && (
        <p className="rounded-lg border border-primary/30 bg-primary/8 px-3 py-2 text-sm" data-project-default-on>
          {t(headOffice ? "roles.pages.projectDefaultOnHeadOffice" : "roles.pages.projectDefaultOn")}
        </p>
      )}
      {!readOnly && !(projectDefaultOn && page === "project") && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange?.([...new Set([...selected, ...allCodes])].sort())}
          >
            <CheckCheck className="size-4" />
            {t("roles.selectAll")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onChange?.(selected.filter((code) => !pageCodes.has(code) || lockedCodes.has(code)))
            }
          >
            <Square className="size-4" />
            {t("roles.clearAll")}
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {t("roles.permissionCount", { count: countable })}
          </span>
        </div>
      )}

      {groups.map((group, index) => {
        const codes = group.entries.filter((entry) => !locked(entry)).map((entry) => entry.code);
        const section = sectionOf(group.entries[0]);
        const previous = index > 0 ? sectionOf(groups[index - 1].entries[0]) : null;
        const allOn = codes.every((code) => chosen.has(code));
        const someOn = !allOn && codes.some((code) => chosen.has(code));

        // In read-only mode a group with nothing granted is a heading over
        // empty space. Showing twenty of them buries the handful that matter.
        if (readOnly && !allOn && !someOn) return null;

        return (
          <div key={`${section}:${group.key}`}>
            {/* 总部保留 (A) / 可授权给项目 (B) headings on the head-office page. */}
            {!readOnly && !plain && page === "hq" && section !== previous ? (
              <p className="mb-2 mt-4 text-sm font-semibold text-primary" data-permission-section={section}>
                {t(section === "hq_reserved" ? "roles.pages.sectionA" : "roles.pages.sectionB")}
              </p>
            ) : null}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h4 className="panel-title">
                {permissionGroupLabel(group.key, group.label, t)}
              </h4>
              {!readOnly && codes.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggleGroup(codes, !allOn)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium transition-colors",
                    allOn || someOn
                      ? "text-primary hover:bg-primary/10"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <SquareCheck className="h-3 w-3" />
                  {allOn ? t("roles.clearAll") : t("roles.selectAll")}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {group.entries.map((entry) => {
                const isOn = chosen.has(entry.code);
                if (readOnly && !isOn) return null;
                if (projectDefaultOn && pageOf(entry) === "project") {
                  // On by default for the role's people (JB139): shown, not ticked.
                  return (
                    <div
                      key={entry.code}
                      data-default-on={entry.code}
                      className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/8 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 leading-snug break-words">{permissionLabel(entry, t)}</span>
                      <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-2xs font-medium text-primary">
                        {t("roles.pages.defaultOn")}
                      </span>
                    </div>
                  );
                }
                return (
                  <label
                    key={entry.code}
                    className={cn(
                      "flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                      readOnly
                        ? "border-transparent bg-muted/40"
                        : isOn
                          ? "cursor-pointer border-primary/30 bg-primary/8"
                          : "cursor-pointer border-border bg-card hover:bg-muted/50",
                    )}
                  >
                    {!readOnly && (
                      <Checkbox
                        checked={isOn && !locked(entry)}
                        disabled={locked(entry)}
                        onCheckedChange={(value) =>
                          toggle(entry.code, value === true)
                        }
                      />
                    )}
                    {/* Wrapped, not truncated: a label such as 「安全验收（可审批施工准证）」
                        is the explanation, and cutting it off hides the part
                        that says what the box is for. */}
                    <span className="min-w-0 leading-snug break-words">
                      {permissionLabel(entry, t)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const SECTION_ORDER = ["hq_reserved", "hq_grantable", "project"] as const;

/**
 * Whose role a matrix edits (JB139, JB219): a builder's 总部角色, phone role
 * or 项目角色, or a recycler's / MSE's role (``plain``, not split into A / B).
 */
export type RoleKind = "head_office" | "phone" | "project" | "plain";

const PHONE_ROLE_CODES = ["site_staff", "equipment_operator", "gate_guard", "all_pages"];

/**
 * The kind of a role: the server's when it says, else its 总部角色 mark, else
 * its code. Head office is the company's choice now (JB219), not a code: only
 * 公司管理员 is head office by its code.
 */
export function roleKindOf(
  role: { code?: string | null; kind?: RoleKind; head_office?: boolean } | undefined | null,
): RoleKind {
  if (role?.kind) return role.kind;
  const code = String(role?.code ?? "").trim();
  if (role?.head_office || code === "company_admin") return "head_office";
  if (PHONE_ROLE_CODES.includes(code)) return "phone";
  return "project";
}

interface PermissionGroup {
  key: string;
  /** The backend's English name, for when the catalogue has none. */
  label?: string;
  entries: PermissionEntry[];
}

/** Which part of 总部权限 a group sits in (JB131), by its first code. */
function sectionOf(entry: PermissionEntry | undefined): "hq_reserved" | "hq_grantable" | "project" {
  return entry?.page ?? "project";
}

/** Preserve the registry's declared order so rows do not shuffle. */
function groupByDomain(entries: PermissionEntry[]): PermissionGroup[] {
  const groups: PermissionGroup[] = [];
  const index = new Map<string, PermissionGroup>();
  // A domain whose codes sit on two pages (e.g. 项目: view on 项目权限, create
  // on 总部保留) is one group per page, so each heading is on its own page.
  const ordered = [...entries].sort(
    (a, b) => SECTION_ORDER.indexOf(a.page ?? "project") - SECTION_ORDER.indexOf(b.page ?? "project"),
  );
  for (const entry of ordered) {
    const key = `${entry.page ?? "project"}:${entry.group}`;
    let group = index.get(key);
    if (!group) {
      group = { key: entry.group, label: entry.group_label, entries: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}
