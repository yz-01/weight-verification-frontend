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
import { getProjects } from "@/services/contractor.service";
import {
  createFieldInvitation,
  reissueFieldInvitation,
  type FieldInvitationResult,
} from "@/services/field-access.service";
import { getRoles, getUsers } from "@/services/users.service";

type AccessMode = "new" | "existing";

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
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState(initialUser?.phone ?? "");
  const [email, setEmail] = useState("");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [result, setResult] = useState<FieldInvitationResult | null>(null);
  const [copied, setCopied] = useState<"link" | "pin" | "all" | null>(null);

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

  const create = useMutation({
    mutationFn: () =>
      mode === "existing"
        ? reissueFieldInvitation(existingUserId)
        : createFieldInvitation({
              full_name: fullName.trim(),
              phone: phone.trim(),
              ...(email.trim() ? { email: email.trim() } : {}),
              project_ids: projectIds,
            }),
    onSuccess: (invitation) => {
      setResult(invitation);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  function changeMode(value: string) {
    const nextMode = value as AccessMode;
    setMode(nextMode);
    setExistingUserId("");
    setFullName("");
    setPhone("");
    setEmail("");
    setProjectIds([]);
    setResult(null);
    create.reset();
  }

  function chooseExistingUser(userId: string) {
    const selected = fieldUsers.data?.results.find((user) => user.id === userId);
    setExistingUserId(userId);
    setPhone(selected?.phone ?? "");
    setProjectIds([]);
    create.reset();
  }

  function toggleProject(id: string, checked: boolean) {
    setProjectIds((current) =>
      checked
        ? current.includes(id)
          ? current
          : [...current, id]
        : current.filter((value) => value !== id),
    );
  }

  async function copy(value: string, kind: "link" | "pin" | "all") {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
  }

  const canCreate =
    (mode === "existing"
      ? existingUserId.length > 0
      : fullName.trim().length > 0 &&
        phone.trim().length > 0 &&
        projectIds.length > 0) &&
    !create.isPending;

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
                  <p className="font-medium">{t("expiresAt")}</p>
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
              <FieldWrapper label={t("fullName")} required>
                <Input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoComplete="off"
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
              <FieldWrapper label={t("phone")} required>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  autoComplete="off"
                />
              </FieldWrapper>
            ) : (
              <FieldWrapper label={t("phone")} className="sm:col-span-2">
                <Input type="tel" value={phone} disabled />
              </FieldWrapper>
            )}
            {mode === "new" && (
              <FieldWrapper
                label={t("email")}
                optional={t("optional")}
                className="sm:col-span-2"
              >
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="off"
                />
              </FieldWrapper>
            )}
            {mode === "existing" && (
              <p className="rounded-md border border-info/25 bg-info/8 px-3 py-2.5 text-sm text-foreground sm:col-span-2">
                {t("existingHelp")}
              </p>
            )}
            {mode === "new" && (
              <FieldWrapper
                label={t("projects")}
                required
                className="sm:col-span-2"
              >
                <div className="max-h-56 overflow-y-auto rounded-md border">
                  {(projects.data?.results ?? []).map((project) => (
                    <label
                      key={project.id}
                      className="flex min-h-11 cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={projectIds.includes(project.id)}
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
            {create.isError && (
              <p className="text-sm font-medium text-destructive sm:col-span-2">
                {create.error instanceof ApiError
                  ? create.error.message
                  : t("createError")}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {result ? t("close") : t("cancel")}
          </Button>
          {!result && (
            <Button disabled={!canCreate} onClick={() => create.mutate()}>
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
