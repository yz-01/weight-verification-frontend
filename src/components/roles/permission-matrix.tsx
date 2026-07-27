"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCheck, Square, SquareCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import type { PermissionEntry } from "@/interfaces/auth";
import { cn } from "@/lib/utils";
import { getPermissionCatalogue } from "@/services/auth.service";

/**
 * The permission picker, grouped by domain.
 *
 * Rows come from the backend registry rather than a hardcoded list, so a
 * permission added on the server appears here with no frontend change. Labels
 * are looked up as `permissions.code.<domain>.<verb>`, which is why the
 * catalogue nests the codes: next-intl reads a dot as nesting, so the codes
 * cannot be flat keys.
 */
export function PermissionMatrix({
  selected,
  onChange,
  readOnly = false,
}: {
  selected: string[];
  onChange?: (codes: string[]) => void;
  readOnly?: boolean;
}) {
  const t = useTranslations();

  const { data, isLoading } = useQuery({
    queryKey: ["permissions", "catalogue"],
    queryFn: getPermissionCatalogue,
    // The catalogue only changes when the backend deploys, so there is no
    // reason to refetch it while someone edits a role.
    staleTime: 60 * 60_000,
  });

  const groups = useMemo(() => groupByDomain(data ?? []), [data]);
  const chosen = useMemo(() => new Set(selected), [selected]);

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

  const allCodes = (data ?? []).map((entry) => entry.code);

  return (
    <div className="space-y-5">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full px-4"
            onClick={() => onChange?.(allCodes.slice().sort())}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            {t("roles.selectAll")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full px-4"
            onClick={() => onChange?.([])}
          >
            <Square className="h-3.5 w-3.5" />
            {t("roles.clearAll")}
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {t("roles.permissionCount", { count: chosen.size })}
          </span>
        </div>
      )}

      {groups.map((group) => {
        const codes = group.entries.map((entry) => entry.code);
        const allOn = codes.every((code) => chosen.has(code));
        const someOn = !allOn && codes.some((code) => chosen.has(code));

        // In read-only mode a group with nothing granted is a heading over
        // empty space. Showing twenty of them buries the handful that matter.
        if (readOnly && !allOn && !someOn) return null;

        return (
          <div key={group.key}>
            <div className="mb-2 flex items-center gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t(`permissions.group.${group.key}`)}
              </h4>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => toggleGroup(codes, !allOn)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium transition-colors",
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
                return (
                  <label
                    key={entry.code}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors",
                      readOnly
                        ? "border-transparent bg-muted/40"
                        : isOn
                          ? "cursor-pointer border-primary/30 bg-primary/8"
                          : "cursor-pointer border-border bg-card hover:bg-muted/50",
                    )}
                  >
                    {!readOnly && (
                      <Checkbox
                        checked={isOn}
                        onCheckedChange={(value) =>
                          toggle(entry.code, value === true)
                        }
                      />
                    )}
                    <span className="min-w-0 truncate">
                      {t(`permissions.code.${entry.code}`)}
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

interface PermissionGroup {
  key: string;
  entries: PermissionEntry[];
}

/** Preserve the registry's declared order so rows do not shuffle. */
function groupByDomain(entries: PermissionEntry[]): PermissionGroup[] {
  const groups: PermissionGroup[] = [];
  const index = new Map<string, PermissionGroup>();
  for (const entry of entries) {
    let group = index.get(entry.group);
    if (!group) {
      group = { key: entry.group, entries: [] };
      index.set(entry.group, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}
