"use client";

/**
 * A project's 「项目权限」 (JB131, 客户 11-07 事项 6: 「除总部专属权限外，其余现有
 * 业务权限全部放入项目权限页面。创建项目时，自动带入项目业务权限选项，由项目经理
 * 自行勾选。总部授权开放的管理权限，才会额外出现在对应项目」).
 *
 * Every project has it from the day it is made. Head office ticks which 总部
 * 权限 B it opens to this project; the project manager (or head office) ticks,
 * person by person, the project permissions of the project's office people.
 * Each save asks for the six-digit PIN like any permission change.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, KeyRound, Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { LoadFailed } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  // query-failure: unread, every box still shows - named by its code until it loads.
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
    mutationFn: (body: { grants?: string[]; member?: string; on?: string[] }) =>
      setProjectPermissions(projectId, body),
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
      ) : (
        <>
          {data.can_grant && (
            <Grants
              data={data}
              entries={entries}
              saving={save.isPending}
              onSave={(grants) => save.mutate({ grants })}
            />
          )}
          {data.members.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("noPeople")}</p>
          ) : (
            <ul className="space-y-2">
              {data.members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  options={data.options}
                  entries={entries}
                  canEdit={data.can_edit}
                  saving={save.isPending}
                  onSave={(on) => save.mutate({ member: member.id, on })}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function Grants({
  data,
  entries,
  saving,
  onSave,
}: {
  data: ProjectPermissionsState;
  entries: Map<string, PermissionEntry>;
  saving: boolean;
  onSave: (grants: string[]) => void;
}) {
  const t = useTranslations("projects.permissions");
  const all = useTranslations();
  const [picked, setPicked] = useState<string[]>(data.granted);
  const changed = picked.slice().sort().join() !== data.granted.slice().sort().join();
  return (
    <div className="space-y-2 rounded-lg border p-3" data-project-grants>
      <p className="text-sm font-semibold">{t("grantsTitle")}</p>
      <p className="text-xs text-muted-foreground">{t("grantsHelp")}</p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {data.grantable.map((code) => (
          <label key={code} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <Checkbox
              checked={picked.includes(code)}
              onCheckedChange={(value) =>
                setPicked((current) =>
                  value === true ? [...current, code] : current.filter((item) => item !== code),
                )
              }
            />
            <span>{label(code, entries, all)}</span>
          </label>
        ))}
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={!changed || saving}
          disabledReason={saving ? t("saving") : t("nothingChanged")}
          onClick={() => onSave(picked)}
        >
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {t("saveGrants")}
        </Button>
      </div>
    </div>
  );
}

function MemberRow({
  member,
  options,
  entries,
  canEdit,
  saving,
  onSave,
}: {
  member: ProjectPermissionsState["members"][number];
  options: string[];
  entries: Map<string, PermissionEntry>;
  canEdit: boolean;
  saving: boolean;
  onSave: (on: string[]) => void;
}) {
  const t = useTranslations("projects.permissions");
  const all = useTranslations();
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState<string[]>(member.on);
  const editable = canEdit && member.editable;
  const changed = on.slice().sort().join() !== member.on.slice().sort().join();
  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const code of options) {
      const group = entries.get(code)?.group ?? code.split(".")[0];
      map.set(group, [...(map.get(group) ?? []), code]);
    }
    return [...map.entries()];
  }, [entries, options]);
  return (
    <li className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{member.full_name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {roleName({ code: member.role_code ?? "", name: member.role_name }, all)} · {t("count", { count: member.on.length })}
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t p-3">
          {!member.editable && <p className="text-xs text-muted-foreground">{t("roleOnly")}</p>}
          {groups.map(([group, codes]) => (
            <div key={group}>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">
                {permissionGroupLabel(group, entries.get(codes[0])?.group_label, all)}
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {codes.map((code) => (
                  <label key={code} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                    <Checkbox
                      checked={on.includes(code)}
                      disabled={!editable}
                      onCheckedChange={(value) =>
                        setOn((current) =>
                          value === true ? [...current, code] : current.filter((item) => item !== code),
                        )
                      }
                    />
                    <span>{label(code, entries, all)}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
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

function label(code: string, entries: Map<string, PermissionEntry>, t: ReturnType<typeof useTranslations>) {
  const entry = entries.get(code);
  return entry ? permissionLabel(entry, t) : code;
}
