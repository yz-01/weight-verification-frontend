"use client";

/**
 * A project's 「项目权限」 (JB131, JB139).
 *
 * 客户 11-09 事项 3: 「所有项目日常管理及操作权限全部自动开通，无须逐项勾选」「B组由
 * 总部自行勾选，选择开放给指定项目用户」. Lucas 11-09: 「默认是全部打开，后续可以
 * 自行开关和修改」.
 *
 * The project's office people, each with their project permissions - all on
 * by default. The project manager (or head office) may switch one off for one
 * person, and back on. Head office also sees the 总部 B permissions here and
 * may switch them on for one person. Each save asks for the six-digit PIN
 * like any permission change.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, KeyRound, Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { LoadFailed } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { PermissionEntry } from "@/interfaces/auth";
import { permissionGroupLabel, permissionLabel } from "@/lib/permission-labels";
import { roleName } from "@/lib/role-labels";
import { cn } from "@/lib/utils";
import { getPermissionCatalogue } from "@/services/auth.service";
import {
  getProjectPermissions,
  setProjectPermissions,
  type ProjectPermissionsState,
} from "@/services/contractor.service";

export function ProjectPermissions({ projectId }: { projectId: string }) {
  const t = useTranslations("projects.permissions");
  const queryClient = useQueryClient();
  const key = ["projects", "permissions", projectId] as const;
  const state = useQuery({ queryKey: key, queryFn: () => getProjectPermissions(projectId) });
  // query-failure: unread, every switch still shows - named by its code until it loads.
  const catalogue = useQuery({
    queryKey: ["permissions", "catalogue"],
    queryFn: getPermissionCatalogue,
    staleTime: 60 * 60_000,
  });
  const entries = useMemo(
    () => new Map((catalogue.data ?? []).map((entry) => [entry.code, entry])),
    [catalogue.data],
  );
  const save = useMutation({
    mutationFn: (body: { member: string; on: string[] }) => setProjectPermissions(projectId, body),
    onSuccess: (data) => queryClient.setQueryData(key, data),
  });

  if (state.isError) return <LoadFailed what={t("title")} onRetry={() => void state.refetch()} />;
  const data = state.data;

  return (
    <section className="surface-panel space-y-4 rounded-xl p-4" data-project-permissions>
      <div>
        <h3 className="panel-title">
          <KeyRound className="size-4 text-primary" aria-hidden />
          {t("title")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("help")}</p>
      </div>
      {!data ? (
        <Loader2 className="size-5 animate-spin text-primary" />
      ) : data.members.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("noPeople")}</p>
      ) : (
        <ul className="space-y-2">
          {data.members.map((member) => (
            <MemberRow
              key={`${member.id}:${member.on.join(",")}`}
              member={member}
              data={data}
              entries={entries}
              saving={save.isPending}
              onSave={(on) => save.mutate({ member: member.id, on })}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function MemberRow({
  member,
  data,
  entries,
  saving,
  onSave,
}: {
  member: ProjectPermissionsState["members"][number];
  data: ProjectPermissionsState;
  entries: Map<string, PermissionEntry>;
  saving: boolean;
  onSave: (on: string[]) => void;
}) {
  const t = useTranslations("projects.permissions");
  const all = useTranslations();
  const [open, setOpen] = useState(false);
  // Only what the reader may switch is sent; the rest is left as it is.
  const initial = useMemo(() => {
    const options = new Set(data.options);
    return member.on.filter((code) => options.has(code));
  }, [member.on, data.options]);
  const [on, setOn] = useState<string[]>(initial);
  const editable = data.can_edit && member.editable;
  const changed = on.slice().sort().join() !== initial.slice().sort().join();
  const projectOff = data.project_codes.filter((code) => !member.on.includes(code)).length;
  const grantedB = data.grantable.filter((code) => member.on.includes(code)).length;
  const daily = useMemo(() => grouped(data.project_codes, entries), [data.project_codes, entries]);
  const grantable = useMemo(() => grouped(data.grantable, entries), [data.grantable, entries]);
  const toggle = (code: string, value: boolean) =>
    setOn((current) => (value ? [...current, code] : current.filter((item) => item !== code)));
  return (
    <li className="rounded-lg border" data-project-member={member.id}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{member.full_name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {roleName({ code: member.role_code ?? "", name: member.role_name }, all)}
            {" · "}
            {projectOff === 0 ? t("allOn") : t("someOff", { count: projectOff })}
            {grantedB > 0 ? ` · ${t("grantedCount", { count: grantedB })}` : ""}
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-4 border-t p-3">
          <div className="space-y-3" data-member-part="project">
            <p className="text-xs text-muted-foreground">{t("projectNote")}</p>
            {daily.map(([group, codes]) => (
              <SwitchGroup
                key={group}
                group={group}
                codes={codes}
                entries={entries}
                isOn={(code) => on.includes(code)}
                onToggle={toggle}
                disabled={!editable}
              />
            ))}
          </div>
          {data.can_grant && (
            <div className="space-y-3 rounded-lg border p-3" data-member-part="grantable">
              <p className="text-sm font-semibold">{t("grantsTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("grantsHelp")}</p>
              {grantable.map(([group, codes]) => (
                <SwitchGroup
                  key={group}
                  group={group}
                  codes={codes}
                  entries={entries}
                  isOn={(code) => on.includes(code)}
                  onToggle={toggle}
                  disabled={!editable}
                />
              ))}
            </div>
          )}
          {editable && (
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={!changed || saving}
                disabledReason={saving ? t("saving") : t("nothingChanged")}
                onClick={() => onSave(on)}
              >
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                {t("save")}
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function SwitchGroup({
  group,
  codes,
  entries,
  isOn,
  onToggle,
  disabled,
}: {
  group: string;
  codes: string[];
  entries: Map<string, PermissionEntry>;
  isOn: (code: string) => boolean;
  onToggle: (code: string, value: boolean) => void;
  disabled: boolean;
}) {
  const t = useTranslations();
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-muted-foreground">
        {permissionGroupLabel(group, entries.get(codes[0])?.group_label, t)}
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {codes.map((code) => {
          const text = label(code, entries, t);
          return (
            <label
              key={code}
              data-project-switch={code}
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm"
            >
              <span className="min-w-0 break-words">{text}</span>
              <Switch
                checked={isOn(code)}
                disabled={disabled}
                aria-label={text}
                onCheckedChange={(value) => onToggle(code, value)}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

function grouped(codes: string[], entries: Map<string, PermissionEntry>): [string, string[]][] {
  const map = new Map<string, string[]>();
  for (const code of codes) {
    const group = entries.get(code)?.group ?? code.split(".")[0];
    map.set(group, [...(map.get(group) ?? []), code]);
  }
  return [...map.entries()];
}

function label(code: string, entries: Map<string, PermissionEntry>, t: ReturnType<typeof useTranslations>) {
  const entry = entries.get(code);
  return entry ? permissionLabel(entry, t) : code;
}
