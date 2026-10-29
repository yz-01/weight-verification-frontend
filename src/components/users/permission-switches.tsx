"use client";

/**
 * 权限开关 (J17, Q17): what one back-office person may do, switch by switch.
 *
 * The client, 10-20: 「不要写死」 - every permission its own ON / OFF switch,
 * all ON for a new user, the company switches off what it wants. The page
 * is in two areas (Q17 统一答复 2): 总部后台 - the company's own set-up, where
 * 「用户管理」 is - and 项目后台: which projects (all, or chosen ones), 金额查看,
 * the everyday work by module, and the approvals, which still ask for the
 * approver's own sign-off PIN when used. Saving asks for the editor's PIN
 * (the API client's dialog). Field staff and consultants have no switches:
 * their role decides, as before (Q17-6).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useImperativeHandle, useMemo, useState } from "react";

import { LoadFailed, QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/interfaces/api";
import type { PermissionEntry, PermissionSwitchState, Role } from "@/interfaces/auth";
import { permissionGroupLabel, permissionLabel } from "@/lib/permission-labels";
import { roleName } from "@/lib/role-labels";
import { isSignOffCancelled } from "@/lib/sign-off";
import { cn } from "@/lib/utils";
import { getPermissionCatalogue } from "@/services/auth.service";
import { getPermissionSwitches, getRoles, setPermissionSwitches } from "@/services/users.service";

const SCOPE_CODE = "project.view_all";

interface Group {
  key: string;
  label?: string;
  entries: PermissionEntry[];
}

function groups(entries: PermissionEntry[]): Group[] {
  const list: Group[] = [];
  const index = new Map<string, Group>();
  for (const entry of entries) {
    let group = index.get(entry.group);
    if (!group) {
      group = { key: entry.group, label: entry.group_label, entries: [] };
      index.set(entry.group, group);
      list.push(group);
    }
    group.entries.push(entry);
  }
  return list;
}

/**
 * What the edit-user dialog holds of an embedded panel: its single 「保存」
 * saves the switches too (Lucas, 10-29: 「我已经更改权限了为什么还是不会变」).
 */
export interface PermissionSwitchesHandle {
  /** Saves the switches when they changed. ``true`` when clean or saved. */
  saveIfDirty: () => Promise<boolean>;
}

/** Whether the draft differs from what the server holds. */
export function isSwitchesDirty(
  state: PermissionSwitchState,
  off: Set<string>,
  allProjects: boolean,
  chosen: Set<string>,
): boolean {
  const key = (codes: Iterable<string>) =>
    [...codes].filter((code) => code !== SCOPE_CODE).sort().join(",");
  if (key(off) !== key(state.off)) return true;
  if (allProjects !== state.projects.all) return true;
  if (allProjects) return false;
  return [...chosen].sort().join(",") !== [...state.projects.chosen].sort().join(",");
}

/** Runs ``save`` only when there is something to save; ``false`` when it failed. */
export async function saveSwitchesIfDirty(
  dirty: boolean,
  save: () => Promise<unknown>,
): Promise<boolean> {
  if (!dirty) return true;
  try {
    await save();
    return true;
  } catch {
    return false;
  }
}

/** The line at the top while the switches have unsaved changes. */
export function UnsavedSwitchesNote() {
  const t = useTranslations("users.switches");
  return (
    // Sticky on an opaque backing: it stays in view down among the switches
    // the person just changed, and the switches don't show through it.
    <div className="sticky top-0 z-10 rounded-lg bg-background">
      <p
        role="status"
        data-switches-unsaved
        className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium text-foreground shadow-sm"
      >
        {t("unsaved")}
      </p>
    </div>
  );
}

/**
 * The switches did not save from the dialog's 「保存」: the user's own fields
 * did, so the dialog stays open and says so plainly.
 */
export function SwitchesNotSavedNote({ error }: { error: string }) {
  const t = useTranslations("users.switches");
  return (
    <div role="alert" data-switches-not-saved className="space-y-1 text-sm text-destructive">
      <p className="font-medium">{t("partSaved")}</p>
      {error ? <p>{error}</p> : null}
    </div>
  );
}

export function PermissionSwitches({
  userId,
  handleRef,
}: {
  userId: string;
  /**
   * Inside the edit-user dialog: no save button of its own - the dialog's
   * 「保存」 saves the switches through this handle. Without it the panel
   * keeps its own 「保存权限」.
   */
  handleRef?: React.Ref<PermissionSwitchesHandle>;
}) {
  const t = useTranslations("users.switches");
  const tRoot = useTranslations();
  const queryClient = useQueryClient();
  const catalogue = useQuery({
    queryKey: ["permissions", "catalogue"],
    queryFn: getPermissionCatalogue,
    staleTime: 60 * 60_000,
  });
  const state = useQuery({
    queryKey: ["users", "permission-switches", userId],
    queryFn: () => getPermissionSwitches(userId),
  });
  if (catalogue.isLoading || state.isLoading) {
    return (
      <div className="space-y-3" aria-busy>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (catalogue.isError || state.isError || !catalogue.data || !state.data) {
    return (
      <LoadFailed
        what={t("what")}
        onRetry={() => {
          void catalogue.refetch();
          void state.refetch();
        }}
      />
    );
  }
  if (!state.data.switchable) {
    return <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">{t("notSwitchable")}</p>;
  }
  return (
    <SwitchForm
      // A fresh form for what the server holds now (after a save, too).
      key={JSON.stringify([state.data.off, state.data.projects])}
      userId={userId}
      handleRef={handleRef}
      catalogue={catalogue.data}
      state={state.data}
      onSaved={(next) => {
        queryClient.setQueryData(["users", "permission-switches", userId], next);
        void queryClient.invalidateQueries({ queryKey: ["users", "detail", userId] });
      }}
      t={t}
      tRoot={tRoot}
    />
  );
}

function SwitchForm({
  userId,
  handleRef,
  catalogue,
  state,
  onSaved,
  t,
  tRoot,
}: {
  userId: string;
  handleRef?: React.Ref<PermissionSwitchesHandle>;
  catalogue: PermissionEntry[];
  state: PermissionSwitchState;
  onSaved: (next: PermissionSwitchState) => void;
  t: ReturnType<typeof useTranslations>;
  tRoot: ReturnType<typeof useTranslations>;
}) {
  const [off, setOff] = useState<Set<string>>(() => new Set(state.off));
  const [allProjects, setAllProjects] = useState(state.projects.all);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(state.projects.chosen));
  const [error, setError] = useState("");
  // Embedded: the dialog's 「保存」 saved the user but not these.
  const [notSaved, setNotSaved] = useState(false);
  const embedded = handleRef !== undefined;
  const roles = useQuery({
    queryKey: ["roles", "switch-presets"],
    queryFn: () => getRoles({ page_size: 100 }),
  });

  const entries = useMemo(() => catalogue.filter((entry) => entry.code !== SCOPE_CODE), [catalogue]);
  const hq = useMemo(() => groups(entries.filter((entry) => entry.area === "hq")), [entries]);
  const operate = useMemo(
    () => groups(entries.filter((entry) => entry.area !== "hq" && entry.kind === "operate")),
    [entries],
  );
  const approve = useMemo(
    () => entries.filter((entry) => entry.area !== "hq" && entry.kind === "approve"),
    [entries],
  );
  const amounts = entries.find((entry) => entry.kind === "amounts");

  const isOn = (code: string) => !off.has(code);
  const turn = (codes: string[], on: boolean) =>
    setOff((current) => {
      const next = new Set(current);
      for (const code of codes) {
        if (on) next.delete(code);
        else next.add(code);
      }
      return next;
    });

  const save = useMutation({
    mutationFn: () =>
      setPermissionSwitches(
        userId,
        {
          off: [...off].filter((code) => code !== SCOPE_CODE).sort(),
          projects: allProjects ? { all: true } : { all: false, chosen: [...chosen] },
        },
        // Inside the edit dialog its 「保存」 says it once, for both.
        { quiet: embedded },
      ),
    onSuccess: (next) => {
      setError("");
      onSaved(next);
    },
    onError: (reason) => {
      if (isSignOffCancelled(reason)) {
        setError("");
        return;
      }
      setError(reason instanceof ApiError && reason.message ? reason.message : t("failed"));
    },
  });

  // 按角色套用: the role's codes ON, the rest OFF - a starting point.
  const applyRole = (role: Role) => {
    const granted = new Set(role.permissions);
    setOff(new Set(entries.map((entry) => entry.code).filter((code) => !granted.has(code))));
    setAllProjects(granted.has(SCOPE_CODE));
  };

  const total = entries.length;
  const onCount = entries.filter((entry) => isOn(entry.code)).length;
  const needsProject = !allProjects && chosen.size === 0;
  const dirty = isSwitchesDirty(state, off, allProjects, chosen);

  useImperativeHandle(
    handleRef,
    () => ({
      saveIfDirty: async () => {
        if (!dirty) return true;
        if (needsProject) {
          setError(t("needOneProject"));
          setNotSaved(true);
          return false;
        }
        const saved = await saveSwitchesIfDirty(dirty, () => save.mutateAsync());
        setNotSaved(!saved);
        return saved;
      },
    }),
    [dirty, needsProject, save, t],
  );

  return (
    <div className="space-y-6" data-permission-switches>
      {dirty ? <UnsavedSwitchesNote /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            {t("title")}
          </h3>
          <p className="text-sm text-muted-foreground">{t("intro")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">{t("countOn", { on: onCount, total })}</span>
          <Select
            value=""
            onValueChange={(id) => {
              const role = roles.data?.results.find((row) => row.id === id);
              if (role) applyRole(role);
            }}
          >
            <SelectTrigger className="w-44 bg-card" aria-label={t("applyRole")} title={t("applyRoleHint")}>
              <SelectValue placeholder={t("applyRole")} />
            </SelectTrigger>
            <SelectContent>
              {(roles.data?.results ?? [])
                .filter((role) => role.code !== "site_staff")
                .map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {roleName(role, tRoot)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <QueryFailedNote query={roles} what={t("applyRole")} />
        </div>
      </div>

      <section className="space-y-4 rounded-xl border p-4" data-switch-area="hq">
        <header>
          <h4 className="panel-title">{t("hq")}</h4>
          <p className="text-xs text-muted-foreground">{t("hqHint")}</p>
        </header>
        {hq.map((group) => (
          <SwitchGroup key={group.key} group={group} isOn={isOn} turn={turn} t={t} tRoot={tRoot} />
        ))}
      </section>

      <section className="space-y-5 rounded-xl border p-4" data-switch-area="project">
        <header>
          <h4 className="panel-title">{t("project")}</h4>
        </header>

        <div className="space-y-2" data-switch-part="scope">
          <p className="text-sm font-medium">{t("scope")}</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("scope")}>
            {[true, false].map((all) => (
              <button
                key={String(all)}
                type="button"
                role="radio"
                aria-checked={allProjects === all}
                onClick={() => setAllProjects(all)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  allProjects === all
                    ? "border-primary/40 bg-primary/12 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {all ? t("allProjects") : t("chosenProjects")}
              </button>
            ))}
          </div>
          {!allProjects ? (
            state.available_projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noProjects")}</p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {state.available_projects.map((project) => (
                  <label
                    key={project.id}
                    className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                  >
                    <Checkbox
                      checked={chosen.has(project.id)}
                      onCheckedChange={(value) =>
                        setChosen((current) => {
                          const next = new Set(current);
                          if (value === true) next.add(project.id);
                          else next.delete(project.id);
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0 break-words">
                      {project.code} · {project.name}
                    </span>
                  </label>
                ))}
              </div>
            )
          ) : null}
          {needsProject ? <p className="text-sm text-destructive">{t("needOneProject")}</p> : null}
        </div>

        {amounts ? (
          <SwitchRow
            entry={amounts}
            on={isOn(amounts.code)}
            onChange={(on) => turn([amounts.code], on)}
            hint={t("amountsHint")}
            label={t("amounts")}
          />
        ) : null}

        <div className="space-y-4" data-switch-part="operate">
          <p className="text-sm font-medium">{t("operate")}</p>
          {operate.map((group) => (
            <SwitchGroup key={group.key} group={group} isOn={isOn} turn={turn} t={t} tRoot={tRoot} />
          ))}
        </div>

        <div className="space-y-2" data-switch-part="approve">
          <p className="text-sm font-medium">{t("approve")}</p>
          <p className="text-xs text-muted-foreground">{t("approveHint")}</p>
          <SwitchGroup
            group={{ key: "approve", entries: approve }}
            title={null}
            isOn={isOn}
            turn={turn}
            t={t}
            tRoot={tRoot}
          />
        </div>
      </section>

      {embedded ? (
        notSaved ? (
          <SwitchesNotSavedNote error={error} />
        ) : null
      ) : (
        <>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end">
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || needsProject}
              disabledReason={needsProject ? t("needOneProject") : undefined}
            >
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {t("save")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function SwitchGroup({
  group,
  title,
  isOn,
  turn,
  t,
  tRoot,
}: {
  group: Group;
  /** The group's heading; ``null`` for none. */
  title?: string | null;
  isOn: (code: string) => boolean;
  turn: (codes: string[], on: boolean) => void;
  t: ReturnType<typeof useTranslations>;
  tRoot: ReturnType<typeof useTranslations>;
}) {
  const codes = group.entries.map((entry) => entry.code);
  if (codes.length === 0) return null;
  const allOn = codes.every(isOn);
  const heading = title === undefined ? permissionGroupLabel(group.key, group.label, tRoot) : title;
  return (
    <div className="space-y-1.5" data-switch-group={group.key}>
      <div className="flex flex-wrap items-center gap-2">
        {heading ? <p className="text-xs font-semibold text-muted-foreground">{heading}</p> : null}
        <button
          type="button"
          onClick={() => turn(codes, !allOn)}
          className="rounded-full px-2 py-0.5 text-2xs font-medium text-primary hover:bg-primary/10"
        >
          {allOn ? t("allOff") : t("allOn")}
        </button>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {group.entries.map((entry) => (
          <SwitchRow
            key={entry.code}
            entry={entry}
            on={isOn(entry.code)}
            onChange={(on) => turn([entry.code], on)}
            label={permissionLabel(entry, tRoot)}
          />
        ))}
      </div>
    </div>
  );
}

function SwitchRow({
  entry,
  on,
  onChange,
  label,
  hint,
}: {
  entry: PermissionEntry;
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label
      data-switch={entry.code}
      className={cn(
        "flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
        on ? "border-primary/30 bg-primary/8" : "border-border bg-card",
      )}
    >
      <span className="min-w-0">
        <span className="block leading-snug break-words">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      <Switch checked={on} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}
