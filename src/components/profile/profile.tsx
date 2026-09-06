"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, Loader2, Save, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  SelectField,
  TextField,
  type BoundField,
} from "@/components/shared/form-fields";
import { AvatarUpload } from "@/components/shared/avatar-upload";
import { FormSection, minLength, required } from "@/components/shared/form-shell";
import { ReadField, TypeBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { LOCALES, LOCALE_LABELS, resolveLocale, type Locale } from "@/i18n/config";
import { ApiError } from "@/interfaces/api";
import { changePassword, updateProfile } from "@/services/auth.service";

/**
 * The signed-in user's own account.
 *
 * Role, status and company are read-only here on purpose: a user must not be
 * able to promote themselves, and the backend's profile endpoint accepts none
 * of them regardless.
 */
export function Profile() {
  const t = useTranslations();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const profileMutation = useMutation({
    mutationFn: (values: {
      full_name: string;
      phone: string;
      language: Locale;
      timezone: string;
    }) => updateProfile(values),
    onSuccess: async () => {
      await refresh();
      // The catalogue is resolved on the server from the locale cookie, so the
      // tree has to be re-rendered for a language change to take effect.
      router.refresh();
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (values: { current_password: string; new_password: string }) =>
      changePassword(values),
  });

  const profileForm = useForm({
    defaultValues: {
      full_name: user?.full_name ?? "",
      phone: user?.phone ?? "",
      language: (user?.language ?? "en") as Locale,
      timezone: user?.timezone ?? "Asia/Kuala_Lumpur",
    },
    onSubmit: async ({ value }) => {
      await profileMutation.mutateAsync(value);
    },
  });

  const passwordForm = useForm({
    defaultValues: {
      current_password: "",
      new_password: "",
      confirm_password: "",
    },
    onSubmit: async ({ value, formApi }) => {
      setPasswordError(null);
      if (value.new_password !== value.confirm_password) {
        setPasswordError(t("validation.passwordMismatch"));
        return;
      }
      try {
        await passwordMutation.mutateAsync({
          current_password: value.current_password,
          new_password: value.new_password,
        });
        formApi.reset();
      } catch (error) {
        if (error instanceof ApiError) {
          setPasswordError(
            error.fieldError("current_password") ??
              error.fieldError("new_password") ??
              error.message,
          );
        }
      }
    },
  });

  if (user === null) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {t("profile.title")}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{user.email}</p>
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-6 py-5">
          <h3 className="text-base font-semibold text-foreground">
            {user.full_name}
          </h3>
          {user.role_name && <TypeBadge label={user.role_name} />}
          <Button
            type="submit"
            form="profile-form"
            size="sm"
            disabled={profileMutation.isPending}
            className="ml-auto rounded-full px-4 shadow-sm"
          >
            {profileMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t("common.save")}
          </Button>
        </div>

        <form
          id="profile-form"
          className="divide-y border-t"
          onSubmit={(event) => {
            event.preventDefault();
            void profileForm.handleSubmit();
          }}
        >
          <FormSection title={t("profile.section.identity")}>
            <AvatarUpload className="pb-2" />
            <profileForm.Field
              name="full_name"
              validators={{ onSubmit: required(t("validation.required")) }}
            >
              {(field) => (
                <TextField
                  field={field as unknown as BoundField}
                  label={t("users.field.fullName")}
                  required
                />
              )}
            </profileForm.Field>

            <profileForm.Field name="phone">
              {(field) => (
                <TextField
                  field={field as unknown as BoundField}
                  label={t("users.field.phone")}
                  optional
                  type="tel"
                  disabled={user.is_field_staff}
                />
              )}
            </profileForm.Field>

            <ReadField label={t("users.field.email")} value={user.email} />
            <ReadField
              label={t("users.field.role")}
              value={user.role_name}
            />
            {user.company_name && (
              <ReadField
                label={t("users.field.company")}
                value={user.company_name}
                className="md:col-span-2"
              />
            )}
          </FormSection>

          <FormSection title={t("profile.section.preferences")}>
            <profileForm.Field name="language">
              {(field) => (
                <SelectField
                  field={field as unknown as BoundField}
                  label={t("users.field.language")}
                  options={LOCALES.map((locale) => ({
                    value: locale,
                    label: LOCALE_LABELS[resolveLocale(locale)],
                  }))}
                />
              )}
            </profileForm.Field>

            <profileForm.Field name="timezone">
              {(field) => (
                <TextField
                  field={field as unknown as BoundField}
                  label={t("users.field.timezone")}
                />
              )}
            </profileForm.Field>
          </FormSection>
        </form>
      </div>

      {!user.is_field_staff && (
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-3 px-6 py-5">
            <h3 className="text-base font-semibold text-foreground">
              {t("auth.changePassword.title")}
            </h3>
            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full px-4"
                onClick={() => {
                  passwordForm.reset();
                  setPasswordError(null);
                }}
              >
                <X className="h-4 w-4" />
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                form="password-form"
                size="sm"
                disabled={passwordMutation.isPending}
                className="rounded-full px-4 shadow-sm"
              >
                {passwordMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                {t("auth.changePassword.submit")}
              </Button>
            </div>
          </div>

          <form
            id="password-form"
            className="border-t"
            onSubmit={(event) => {
              event.preventDefault();
              void passwordForm.handleSubmit();
            }}
          >
            <FormSection title={t("profile.section.security")}>
            <passwordForm.Field
              name="current_password"
              validators={{ onSubmit: required(t("validation.required")) }}
            >
              {(field) => (
                <TextField
                  field={field as unknown as BoundField}
                  label={t("auth.changePassword.current")}
                  required
                  type="password"
                  autoComplete="current-password"
                  className="md:col-span-2"
                />
              )}
            </passwordForm.Field>

            <passwordForm.Field
              name="new_password"
              validators={{
                onSubmit: minLength(10, t("validation.passwordTooShort")),
              }}
            >
              {(field) => (
                <TextField
                  field={field as unknown as BoundField}
                  label={t("auth.changePassword.new")}
                  required
                  type="password"
                  autoComplete="new-password"
                />
              )}
            </passwordForm.Field>

            <passwordForm.Field
              name="confirm_password"
              validators={{ onSubmit: required(t("validation.required")) }}
            >
              {(field) => (
                <TextField
                  field={field as unknown as BoundField}
                  label={t("auth.changePassword.confirm")}
                  required
                  type="password"
                  autoComplete="new-password"
                />
              )}
            </passwordForm.Field>

            {passwordError && (
              <p className="text-sm font-medium text-destructive md:col-span-2">
                {passwordError}
              </p>
            )}
            </FormSection>
          </form>
        </div>
      )}
    </div>
  );
}
