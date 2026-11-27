"use client";

/**
 * 邀请用户 in one page (JB242, 客户 11-23 事项 14).
 *
 * 「在一个页面填写姓名、邮箱，选择总部或项目，绑定所属项目，勾选需要的权限，就能直接
 * 建立账号并发送登录邀请。」「不必先建立角色，再到其他页面设置」「能否预设常用权限，
 * 管理员只需要调整少数特殊权限」.
 *
 * From top to bottom: 基本资料 (姓名、电子邮箱; 电话 optional; 语言 / 时区 under
 * 更多) → 这个人在哪里工作 (总部 / 项目) → 所属项目 → 从常用权限开始 (the
 * company's own roles of that kind; none: the system's default) → the same
 * switches as 编辑用户 (``SwitchSections``), already set → 【邀请】 → one
 * sign-off PIN (the API client's dialog) → the account, its permissions, its
 * projects and the invitation e-mail, at once (``POST /api/users/invite_user/``;
 * a refusal stores nothing). 【存成常用权限】 keeps this page's ticks as a
 * company role, to pick next time.
 *
 * The server decides every rule (JB139 / JB218 / JB219, the package's seats,
 * the company's own projects); the page shows the same: a project person has
 * no A and no 「全部项目」, a switch the inviter does not hold is greyed.
 */

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Building2, HardHat, Info, Loader2, UserPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { useFinishForm } from "@/components/shared/dialog-navigation";
import { SelectField, TextField, type BoundField } from "@/components/shared/form-fields";
import {
  FormSection,
  FormShell,
  FormSkeleton,
  LoadErrorCard,
  applyServerErrors,
  required,
  requiredEmail,
} from "@/components/shared/form-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SwitchSections, switchableEntries, switchesForRole } from "@/components/users/permission-switches";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { ApiError } from "@/interfaces/api";
import type { InvitePayload, PermissionEntry, Role } from "@/interfaces/auth";
import { inviteEmailCopy, linkValidFor } from "@/lib/invite-email";
import { roleName } from "@/lib/role-labels";
import { saveRefusalLine } from "@/lib/save-refusal";
import { isSignOffCancelled } from "@/lib/sign-off";
import { cn } from "@/lib/utils";
import { getPermissionCatalogue } from "@/services/auth.service";
import { createRole, getInviteOptions, inviteUser } from "@/services/users.service";

const SCOPE_CODE = "project.view_all";

export type Workplace = "head_office" | "project";

/** The 常用权限 a place offers: 总部 - head-office roles (公司管理员 too); 项目 - project roles. */
export function presetsFor(roles: Role[], workplace: Workplace | ""): Role[] {
  if (!workplace) return [];
  return roles.filter((role) =>
    workplace === "head_office" ? role.kind === "head_office" : role.kind === "project",
  );
}

/**
 * Where the switches start (JB242): the 常用权限 picked, or with none the
 * system's default - 项目: every everyday permission on, A and B off; 总部:
 * A and B off, for the inviter to switch on (JB218). As the server starts them
 * (``starting_switches_off``).
 */
export function startingSwitches(
  catalogue: PermissionEntry[],
  workplace: Workplace,
  preset?: Pick<Role, "code" | "permissions">,
): { off: Set<string>; allProjects: boolean } {
  return switchesForRole(
    catalogue.filter((entry) => entry.code !== SCOPE_CODE),
    preset ?? { code: "", permissions: [] },
    new Set(),
    workplace === "project",
  );
}

/**
 * 【存成常用权限】's ticks: what a role holds for its people (JB139, JB218) -
 * 总部: the A and B switched on, and 「全部项目」 when chosen; 项目: the B
 * switched on. Everyday project permissions are everybody's by default and
 * are not a role's.
 */
export function presetTicks(
  catalogue: PermissionEntry[],
  workplace: Workplace,
  off: Set<string>,
  allProjects: boolean,
): string[] {
  const ticks = catalogue
    .filter((entry) => entry.code !== SCOPE_CODE)
    .filter((entry) =>
      workplace === "head_office"
        ? entry.page === "hq_reserved" || entry.page === "hq_grantable"
        : entry.page === "hq_grantable",
    )
    .map((entry) => entry.code)
    .filter((code) => !off.has(code));
  if (workplace === "head_office" && allProjects) ticks.push(SCOPE_CODE);
  return ticks.sort();
}

/** The body for ``invite_user``. */
export function invitePayload(
  fields: { full_name: string; email: string; phone: string; language: string; timezone: string },
  workplace: Workplace,
  presetId: string,
  off: Set<string>,
  allProjects: boolean,
  chosen: Set<string>,
): InvitePayload {
  const all = workplace === "head_office" && allProjects;
  return {
    ...fields,
    workplace,
    role: presetId || null,
    off: [...off].filter((code) => code !== SCOPE_CODE).sort(),
    projects: all ? { all: true } : { all: false, chosen: [...chosen] },
  };
}

export function InviteUser() {
  const t = useTranslations();
  const tSwitches = useTranslations("users.switches");
  const locale = useLocale();
  const finish = useFinishForm();
  const queryClient = useQueryClient();
  const { user: me, can } = useAuth();

  const catalogue = useQuery({
    queryKey: ["permissions", "catalogue"],
    queryFn: getPermissionCatalogue,
    staleTime: 60 * 60_000,
  });
  const options = useQuery({
    queryKey: ["users", "invite-options"],
    queryFn: () => getInviteOptions(),
  });

  const [workplace, setWorkplace] = useState<Workplace | "">("");
  const [presetId, setPresetId] = useState("");
  const [off, setOff] = useState<Set<string>>(new Set());
  const [startOff, setStartOff] = useState<Set<string>>(new Set());
  const [allProjects, setAllProjects] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [more, setMore] = useState(false);
  const [placeError, setPlaceError] = useState("");
  const [projectsError, setProjectsError] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [presetName, setPresetName] = useState<string | null>(null);
  const [presetError, setPresetError] = useState("");
  const [presetSaved, setPresetSaved] = useState("");

  const entries = useMemo(() => catalogue.data ?? [], [catalogue.data]);
  const roles = useMemo(() => options.data?.roles ?? [], [options.data]);
  const presets = presetsFor(roles, workplace);
  const lockedOn = useMemo(() => new Set(options.data?.locked_on ?? []), [options.data]);
  // What the inviter does not hold he never switches on (JB219 audit F1).
  const locked = (code: string) => lockedOn.has(code) && startOff.has(code);
  const projectUser = workplace === "project";

  const start = (place: Workplace, preset?: Role) => {
    const next = startingSwitches(entries, place, preset);
    setOff(next.off);
    setStartOff(new Set(next.off));
    setAllProjects(place === "head_office" && next.allProjects && !lockedOn.has(SCOPE_CODE));
  };
  const choosePlace = (place: Workplace) => {
    if (place === workplace) return;
    setWorkplace(place);
    setPresetId("");
    setPlaceError("");
    setPresetSaved("");
    start(place);
  };
  const choosePreset = (id: string) => {
    if (!workplace) return;
    const preset = roles.find((role) => role.id === id);
    setPresetId(preset ? preset.id : "");
    setPresetSaved("");
    start(workplace, preset);
  };
  const turn = (codes: string[], on: boolean) =>
    setOff((current) => {
      const next = new Set(current);
      for (const code of codes) {
        if (locked(code)) continue;
        if (on) next.delete(code);
        else next.add(code);
      }
      return next;
    });

  const savePreset = useMutation({
    mutationFn: (name: string) =>
      createRole({
        code: "",
        name,
        head_office: workplace === "head_office",
        permissions: presetTicks(entries, workplace as Workplace, off, allProjects),
      }),
    onSuccess: async (role) => {
      setPresetName(null);
      setPresetError("");
      setPresetSaved(t("jb242.presetSaved", { name: role.name }));
      await queryClient.invalidateQueries({ queryKey: ["users", "invite-options"] });
      void queryClient.invalidateQueries({ queryKey: ["roles"] });
      // The switches are already this role's: picked without changing them.
      setPresetId(role.id);
    },
    onError: (reason) => {
      if (isSignOffCancelled(reason)) return;
      setPresetError(saveRefusalLine(reason, t("common.saveFailed")) ?? t("common.saveFailed"));
    },
  });

  const form = useForm({
    defaultValues: {
      full_name: "",
      email: "",
      phone: "",
      language: me?.company_preferences?.language ?? "en",
      timezone: me?.company_preferences?.timezone ?? "Asia/Kuala_Lumpur",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      let missing = false;
      if (!workplace) {
        setPlaceError(t("jb242.workplaceRequired"));
        missing = true;
      }
      const all = workplace === "head_office" && allProjects;
      if (workplace && !all && chosen.size === 0) {
        setProjectsError(t("jb242.projectsRequired"));
        missing = true;
      }
      if (missing || !workplace) {
        // Said beside 【邀请】 too: the field's own line may be scrolled away.
        setFormError(t(workplace ? "jb242.projectsRequired" : "jb242.workplaceRequired"));
        return;
      }
      setSaving(true);
      try {
        await inviteUser(
          invitePayload(value, workplace, presetId, off, allProjects, chosen),
          inviteEmailCopy(t, locale),
        );
        void queryClient.invalidateQueries({ queryKey: ["users"] });
        finish("/users");
      } catch (error) {
        if (isSignOffCancelled(error)) return;
        if (error instanceof ApiError && error.isValidation && Object.keys(error.errors).length > 0) {
          const leftover = applyServerErrors(
            error.errors,
            form as unknown as Parameters<typeof applyServerErrors>[1],
          );
          if (leftover.length > 0) setFormError(leftover[0]);
        } else {
          setFormError(saveRefusalLine(error, t("common.saveFailed")));
        }
      } finally {
        setSaving(false);
      }
    },
  });

  if (catalogue.isLoading || options.isLoading) return <FormSkeleton sections={4} />;
  if (catalogue.isError || options.isError || !catalogue.data || !options.data) {
    return <LoadErrorCard backHref="/users" backLabel={t("users.title")} />;
  }

  const switchable = switchableEntries(entries, projectUser);
  const onCount = switchable.filter((entry) => !off.has(entry.code)).length;
  const projects = options.data.available_projects;
  const showProjects = workplace === "project" || (workplace === "head_office" && !allProjects);

  return (
    <FormShell
      backHref="/users"
      backLabel={t("users.title")}
      title={t("users.createTitle")}
      isSubmitting={saving}
      submitLabel={t("jb242.submit")}
      submitIcon={UserPlus}
      onSubmit={() => void form.handleSubmit()}
      footerError={formError}
      submitDisabledReason={can("user.update") ? undefined : t("jb242.needsUserUpdate")}
    >
      <FormSection title={t("users.section.identity")}>
        <form.Field name="full_name" validators={{ onSubmit: required(t("validation.required")) }}>
          {(field) => (
            <TextField field={field as unknown as BoundField} label={t("users.field.fullName")} required />
          )}
        </form.Field>
        <form.Field
          name="email"
          validators={{ onSubmit: requiredEmail(t("validation.required"), t("validation.email")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("users.field.email")}
              required
              type="email"
              autoComplete="off"
            />
          )}
        </form.Field>
        <form.Field name="phone">
          {(field) => (
            <TextField field={field as unknown as BoundField} label={t("users.field.phone")} optional type="tel" />
          )}
        </form.Field>
        <div className="md:col-span-2 xl:col-span-3">
          <button
            type="button"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            aria-expanded={more}
            onClick={() => setMore((open) => !open)}
            data-invite-more
          >
            {more ? t("jb242.less") : t("jb242.more")}
          </button>
        </div>
        {more ? (
          <>
            <form.Field name="language">
              {(field) => (
                <SelectField
                  field={field as unknown as BoundField}
                  label={t("users.field.language")}
                  options={LOCALES.map((value) => ({ value, label: LOCALE_LABELS[value] }))}
                />
              )}
            </form.Field>
            <form.Field name="timezone">
              {(field) => <TextField field={field as unknown as BoundField} label={t("users.field.timezone")} />}
            </form.Field>
          </>
        ) : null}
      </FormSection>

      <FormSection title={t("jb242.workplaceTitle")}>
        <div className="grid gap-2 sm:grid-cols-2 md:col-span-2 xl:col-span-3" role="radiogroup" data-invite-workplace>
          {(
            [
              ["head_office", Building2, "jb242.headOffice", "jb242.headOfficeHelp"],
              ["project", HardHat, "jb242.project", "jb242.projectHelp"],
            ] as const
          ).map(([place, Icon, label, help]) => (
            <button
              key={place}
              type="button"
              role="radio"
              aria-checked={workplace === place}
              data-invite-place={place}
              onClick={() => choosePlace(place)}
              className={cn(
                "flex min-w-0 items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                workplace === place
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0">
                <span className="block text-base font-semibold text-foreground">{t(label)}</span>
                <span className="block text-sm">{t(help)}</span>
              </span>
            </button>
          ))}
        </div>
        {placeError ? <p className="text-sm text-destructive md:col-span-2 xl:col-span-3">{placeError}</p> : null}
      </FormSection>

      <FormSection title={t("users.section.projects")}>
        <div className="space-y-2 md:col-span-2 xl:col-span-3" data-invite-projects>
          {!workplace ? (
            <p className="text-sm text-muted-foreground">{t("jb242.chooseFirst")}</p>
          ) : (
            <>
              {workplace === "head_office" ? (
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("users.section.projects")}>
                  {[true, false].map((all) => (
                    <button
                      key={String(all)}
                      type="button"
                      role="radio"
                      aria-checked={allProjects === all}
                      disabled={all && lockedOn.has(SCOPE_CODE)}
                      onClick={() => {
                        setAllProjects(all);
                        setProjectsError("");
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                        allProjects === all
                          ? "border-primary/40 bg-primary/12 text-primary"
                          : "border-border bg-card text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {all ? tSwitches("allProjects") : tSwitches("chosenProjects")}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("jb242.projectsHelpProject")}</p>
              )}
              {showProjects ? (
                projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{tSwitches("noProjects")}</p>
                ) : (
                  <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {projects.map((project) => (
                      <label
                        key={project.id}
                        className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                      >
                        <Checkbox
                          checked={chosen.has(project.id)}
                          onCheckedChange={(value) => {
                            setProjectsError("");
                            setChosen((current) => {
                              const next = new Set(current);
                              if (value === true) next.add(project.id);
                              else next.delete(project.id);
                              return next;
                            });
                          }}
                        />
                        <span className="min-w-0 break-words">
                          {project.code} · {project.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )
              ) : null}
              {projectsError ? <p className="text-sm text-destructive">{projectsError}</p> : null}
            </>
          )}
        </div>
      </FormSection>

      <FormSection title={t("jb242.presetTitle")}>
        <div className="space-y-2 md:col-span-2 xl:col-span-3" data-invite-preset>
          {!workplace ? (
            <p className="text-sm text-muted-foreground">{t("jb242.chooseFirst")}</p>
          ) : (
            <>
              <Select value={presetId || "none"} onValueChange={(id) => choosePreset(id === "none" ? "" : id)}>
                <SelectTrigger className="w-full bg-card sm:w-80" aria-label={t("jb242.presetTitle")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("jb242.presetNone")}</SelectItem>
                  {presets.map((role) => (
                    <SelectItem key={role.id} value={role.id} disabled={role.can_give === false}>
                      {roleName(role, t)}
                      {role.can_give === false ? ` ${t("users.field.roleNotYours")}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {presetId
                  ? t("jb242.presetHelp")
                  : t(workplace === "project" ? "jb242.defaultProject" : "jb242.defaultHeadOffice")}
              </p>
              {presets.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-invite-no-presets>
                  {t("jb242.presetEmpty")}
                </p>
              ) : null}
            </>
          )}
        </div>
      </FormSection>

      <FormSection title={t("users.section.access")}>
        <div className="space-y-4 md:col-span-2 xl:col-span-3" data-invite-switches>
          {!workplace ? (
            <p className="text-sm text-muted-foreground">{t("jb242.chooseFirst")}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm text-muted-foreground">{tSwitches("approveHint")}</p>
                  {lockedOn.size > 0 ? (
                    <p className="text-sm font-medium text-foreground" data-switches-not-mine>
                      {tSwitches("notMine")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {tSwitches("countOn", { on: onCount, total: switchable.length })}
                  </span>
                  {can("role.create") && presetName === null ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPresetName("");
                        setPresetError("");
                      }}
                      data-invite-save-preset
                    >
                      <BookmarkPlus />
                      {t("jb242.saveAsPreset")}
                    </Button>
                  ) : null}
                </div>
              </div>
              {presetName !== null ? (
                <div className="space-y-2 rounded-lg border p-3" data-invite-preset-form>
                  <label className="block text-sm font-medium" htmlFor="invite-preset-name">
                    {t("jb242.presetName")}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      id="invite-preset-name"
                      className="w-full sm:w-72"
                      value={presetName}
                      maxLength={100}
                      onChange={(event) => setPresetName(event.target.value)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={savePreset.isPending}
                      onClick={() => {
                        const name = presetName.trim();
                        if (!name) {
                          setPresetError(t("jb242.presetNameRequired"));
                          return;
                        }
                        savePreset.mutate(name);
                      }}
                    >
                      {savePreset.isPending ? <Loader2 className="animate-spin" /> : null}
                      {t("jb242.presetSave")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setPresetName(null)}>
                      {t("common.cancel")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("jb242.presetNote")}</p>
                  {presetError ? <p className="text-sm text-destructive">{presetError}</p> : null}
                </div>
              ) : null}
              {presetSaved ? (
                <p role="status" className="text-sm font-medium text-primary" data-invite-preset-saved>
                  {presetSaved}
                </p>
              ) : null}
              <SwitchSections
                catalogue={entries}
                projectUser={projectUser}
                isOn={(code) => !off.has(code)}
                turn={turn}
                locked={locked}
                t={tSwitches}
                tRoot={t}
              />
            </>
          )}
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-info/25 bg-info/8 p-3 md:col-span-2 xl:col-span-3">
          <Info className="mt-0.5 size-4 shrink-0 text-info" />
          <p className="text-sm text-foreground">
            {t("users.invite.hint")}{" "}
            {t("jb242.linkValid", { valid: linkValidFor(t, options.data.link_valid_hours) })}
          </p>
        </div>
      </FormSection>
    </FormShell>
  );
}
