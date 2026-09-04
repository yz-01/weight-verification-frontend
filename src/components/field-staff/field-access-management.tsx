"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Copy,
  RefreshCw,
  Smartphone,
  UserRoundCheck,
  UserRoundPlus,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ApiError } from "@/interfaces/api";
import type { UserRow } from "@/interfaces/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getProjects } from "@/services/contractor.service";
import {
  createFieldInvitation,
  getFieldAccessInfo,
  resetFieldDevice,
  reissueFieldInvitation,
  type FieldInvitationResult,
} from "@/services/field-access.service";
import { getRoles, getUsers } from "@/services/users.service";

type AccessMode = "new" | "existing";

function toMobileSubscriberDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("60")) return digits.slice(2);
  return digits.startsWith("0") ? digits.slice(1) : digits;
}

export function FieldAccessManagementDialog({
  onClose,
  initialUser,
}: {
  onClose: () => void;
  initialUser?: Pick<UserRow, "id" | "full_name" | "phone">;
}) {
  const t = useTranslations("fieldAccessAdmin");
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AccessMode>(initialUser ? "existing" : "new");
  const [existingUserId, setExistingUserId] = useState(initialUser?.id ?? "");
  const [unbinding, setUnbinding] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState(
    toMobileSubscriberDigits(initialUser?.phone ?? ""),
  );
  const [email, setEmail] = useState("");
  const [projectIds, setProjectIds] = useState<string[] | null>(null);
  const [result, setResult] = useState<FieldInvitationResult | null>(null);
  const [copied, setCopied] = useState<"link" | "pin" | "all" | null>(null);

  const phoneDigits = phone.replace(/\D/g, "");
  const canonicalPhone = phoneDigits ? `+60${phoneDigits}` : "";

  const projects = useQuery({
    queryKey: ["projects", "field-access-options"],
    queryFn: () =>
      getProjects({ page_size: 500, sort_by: "name", sort_order: "asc" }),
  });

  const roles = useQuery({
    queryKey: ["roles", "field-access-options"],
    queryFn: () => getRoles({ page_size: 100, sort_by: "name" }),
  });
  const siteStaffRole = roles.data?.results.find(
    (role) => role.code === "site_staff",
  );
  const fieldUsers = useQuery({
    queryKey: ["users", "field-access-options", siteStaffRole?.id],
    queryFn: () =>
      getUsers({
        page_size: 500,
        role: siteStaffRole!.id,
        sort_by: "full_name",
        sort_order: "asc",
      }),
    enabled: mode === "existing" && Boolean(siteStaffRole?.id),
  });
  const accessInfo = useQuery({
    queryKey: ["field-access", "info", existingUserId],
    queryFn: () => getFieldAccessInfo(existingUserId),
    enabled: mode === "existing" && Boolean(existingUserId),
  });

  const selectedProjectIds =
    projectIds ??
    (mode === "existing"
      ? (accessInfo.data?.projects.map((project) => project.id) ?? [])
      : []);

  const create = useMutation({
    mutationFn: () =>
      mode === "existing"
        ? reissueFieldInvitation(existingUserId, selectedProjectIds)
        : createFieldInvitation({
              full_name: fullName.trim(),
              phone: canonicalPhone,
              ...(email.trim() ? { email: email.trim() } : {}),
              project_ids: selectedProjectIds,
            }),
    onSuccess: (invitation) => {
      setResult(invitation);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const fieldErrors = create.error instanceof ApiError ? create.error : null;
  const firstFieldError = fieldErrors
    ? Object.values(fieldErrors.errors)[0]
    : undefined;

  // Unbinding is the other half of "this person changed phones". It revokes
  // the binding, expires the PIN and kills the sessions, so the only way back
  // in is a fresh invitation - which is exactly what the dialog above issues.
  const unbind = useMutation({
    mutationFn: () => resetFieldDevice(existingUserId),
    onSuccess: async () => {
      setUnbinding(false);
      await queryClient.invalidateQueries({
        queryKey: ["field-access", "info", existingUserId],
      });
    },
  });

  function clearCreateError() {
    if (create.isError) create.reset();
  }

  function changeMode(value: string) {
    const nextMode = value as AccessMode;
    setMode(nextMode);
    setExistingUserId("");
    setFullName("");
    setPhone("");
    setEmail("");
    setProjectIds(null);
    setResult(null);
    create.reset();
  }

  function chooseExistingUser(userId: string) {
    const selected = fieldUsers.data?.results.find((user) => user.id === userId);
    setExistingUserId(userId);
    setPhone(toMobileSubscriberDigits(selected?.phone ?? ""));
    setProjectIds(null);
    create.reset();
  }

  function toggleProject(id: string, checked: boolean) {
    clearCreateError();
    setProjectIds(
      checked
        ? selectedProjectIds.includes(id)
          ? selectedProjectIds
          : [...selectedProjectIds, id]
        : selectedProjectIds.filter((value) => value !== id),
    );
  }

  async function copy(value: string, kind: "link" | "pin" | "all") {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{result ? t("resultTitle") : t("title")}</DialogTitle>
          <DialogDescription>
            {result ? t("resultDescription") : t("description")}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
            <div className="grid content-start justify-center gap-2">
              <div className="grid size-[200px] place-items-center rounded-md border bg-white p-2">
                <QRCodeCanvas
                  value={result.activation_url}
                  size={180}
                  level="H"
                  marginSize={1}
                  title={t("qrTitle")}
                />
              </div>
              <p className="text-center text-xs text-muted-foreground">
                {result.full_name}
              </p>
            </div>

            <div className="min-w-0 space-y-4">
              <FieldWrapper label={t("activationLink")}>
                <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
                  <code className="min-w-0 flex-1 break-all text-xs leading-5">
                    {result.activation_url}
                  </code>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    title={t("copyLink")}
                    onClick={() => void copy(result.activation_url, "link")}
                  >
                    {copied === "link" ? <CheckCircle2 /> : <Copy />}
                  </Button>
                </div>
              </FieldWrapper>

              <FieldWrapper label={t("pin")}>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 rounded-md border bg-muted/30 px-4 py-3 text-center font-mono text-2xl font-semibold tabular-nums tracking-[0.2em]">
                    {result.pin}
                  </div>
                  <Button
                    size="icon"
                    variant="outline"
                    title={t("copyPin")}
                    onClick={() => void copy(result.pin, "pin")}
                  >
                    {copied === "pin" ? <CheckCircle2 /> : <Copy />}
                  </Button>
                </div>
              </FieldWrapper>

              <div className="grid gap-3 rounded-md border px-3 py-2 text-sm sm:grid-cols-2">
                <div>
                  <p className="font-medium">{t("linkExpiresAt")}</p>
                  <p className="mt-1 text-muted-foreground">
                    {new Date(result.invitation_expires_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="font-medium">{t("pinExpiresAt")}</p>
                  <p className="mt-1 text-muted-foreground">
                    {new Date(result.pin_expires_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("expiryHelp")}</p>

              <Button
                className="w-full"
                onClick={() =>
                  void copy(
                    `${t("activationLink")}: ${result.activation_url}\n${t("pin")}: ${result.pin}`,
                    "all",
                  )
                }
              >
                {copied === "all" ? <CheckCircle2 /> : <Copy />}
                {copied === "all" ? t("copied") : t("copyAll")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {!initialUser && (
              <Tabs
                value={mode}
                onValueChange={changeMode}
                className="sm:col-span-2"
              >
                <TabsList className="grid h-10 w-full grid-cols-2">
                  <TabsTrigger value="new">
                    <UserRoundPlus />
                    {t("modeNew")}
                  </TabsTrigger>
                  <TabsTrigger value="existing">
                    <UserRoundCheck />
                    {t("modeExisting")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            {mode === "new" ? (
              <FieldWrapper
                label={t("fullName")}
                required
                error={fieldErrors?.fieldError("full_name")}
              >
                <Input
                  value={fullName}
                  onChange={(event) => {
                    setFullName(event.target.value);
                    clearCreateError();
                  }}
                  autoComplete="off"
                  aria-invalid={Boolean(fieldErrors?.fieldError("full_name"))}
                />
              </FieldWrapper>
            ) : initialUser ? (
              <div className="rounded-md border bg-muted/20 px-3 py-2.5 sm:col-span-2">
                <p className="text-sm font-medium">{initialUser.full_name}</p>
              </div>
            ) : (
              <FieldWrapper
                label={t("existingStaff")}
                required
                className="sm:col-span-2"
              >
                <Select value={existingUserId} onValueChange={chooseExistingUser}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder={t("selectStaff")} />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {(fieldUsers.data?.results ?? []).map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name} / {user.phone || user.email}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {!fieldUsers.isLoading &&
                  (fieldUsers.data?.results ?? []).length === 0 && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("noExistingStaff")}
                    </p>
                  )}
              </FieldWrapper>
            )}
            {mode === "new" ? (
              <FieldWrapper
                label={t("phone")}
                required
                error={fieldErrors?.fieldError("phone")}
                hint={t("phoneHint")}
              >
                <div
                  className={cn(
                    "flex h-8 overflow-hidden rounded-lg border border-input bg-transparent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
                    fieldErrors?.fieldError("phone") &&
                      "border-destructive ring-3 ring-destructive/20",
                  )}
                >
                  <span className="flex items-center border-r border-input bg-muted/40 px-3 text-sm font-medium text-muted-foreground">
                    +60
                  </span>
                  <Input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={phoneDigits}
                    onChange={(event) => {
                      setPhone(
                        toMobileSubscriberDigits(event.target.value).slice(0, 10),
                      );
                      clearCreateError();
                    }}
                    autoComplete="tel-national"
                    placeholder="123456789"
                    className="h-full rounded-none border-0 bg-transparent focus-visible:ring-0"
                    aria-invalid={Boolean(fieldErrors?.fieldError("phone"))}
                  />
                </div>
              </FieldWrapper>
            ) : (
              <FieldWrapper label={t("phone")} className="sm:col-span-2">
                <Input
                  type="tel"
                  value={accessInfo.data?.phone ?? canonicalPhone}
                  disabled
                />
              </FieldWrapper>
            )}
            {mode === "new" && (
              <FieldWrapper
                label={t("email")}
                optional={t("optional")}
                error={fieldErrors?.fieldError("email")}
                hint={t("emailHint")}
                className="sm:col-span-2"
              >
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    clearCreateError();
                  }}
                  autoComplete="off"
                  aria-invalid={Boolean(fieldErrors?.fieldError("email"))}
                />
              </FieldWrapper>
            )}
            {mode === "existing" && (
              <p className="rounded-md border border-info/25 bg-info/8 px-3 py-2.5 text-sm text-foreground sm:col-span-2">
                {t("existingHelp")}
              </p>
            )}
            {(mode === "new" || existingUserId) && (
              <FieldWrapper
                label={t("projects")}
                required
                error={fieldErrors?.fieldError("project_ids")}
                className="sm:col-span-2"
              >
                <div
                  className={cn(
                    "max-h-56 overflow-y-auto rounded-md border",
                    fieldErrors?.fieldError("project_ids") &&
                      "border-destructive",
                  )}
                >
                  {(projects.data?.results ?? []).map((project) => (
                    <label
                      key={project.id}
                      className="flex min-h-11 cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={selectedProjectIds.includes(project.id)}
                        disabled={accessInfo.isLoading}
                        onCheckedChange={(checked) =>
                          toggleProject(project.id, checked === true)
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {project.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {project.code}
                        </span>
                      </span>
                    </label>
                  ))}
                  {!projects.isLoading &&
                    (projects.data?.results.length ?? 0) === 0 && (
                      <p className="p-4 text-center text-sm text-muted-foreground">
                        {t("noProjects")}
                      </p>
                    )}
                </div>
              </FieldWrapper>
            )}
            {create.isError && !firstFieldError && (
              <p className="text-sm font-medium text-destructive sm:col-span-2">
                {fieldErrors?.message ?? t("createError")}
              </p>
            )}
          </div>
        )}

        {mode === "existing" && existingUserId && !result && (
          <div className="rounded-md border border-destructive/25 bg-destructive/5 p-3">
            <p className="text-sm font-medium">{t("unbind.title")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("unbind.help")}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={unbind.isPending}
              onClick={() => setUnbinding(true)}
            >
              <Smartphone className="size-4" />
              {t("unbind.action")}
            </Button>
          </div>
        )}

        {unbinding && (
          <ConfirmDialog
            open
            onOpenChange={(next) => !next && setUnbinding(false)}
            title={t("unbind.title")}
            description={t("unbind.confirm")}
            confirmLabel={t("unbind.action")}
            isPending={unbind.isPending}
            onConfirm={() => unbind.mutate()}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {result ? t("close") : t("cancel")}
          </Button>
          {!result && (
            <Button requires={mode === "existing" ? [[existingUserId, t("existingStaff")], [selectedProjectIds.length, t("projects")]] : [[fullName, t("fullName")], [phone, t("phone")], [selectedProjectIds.length, t("projects")]]}
                    disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? (
                <Smartphone />
              ) : mode === "existing" ? (
                <RefreshCw />
              ) : (
                <UserRoundPlus />
              )}
              {t(mode === "existing" ? "reissue" : "create")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
