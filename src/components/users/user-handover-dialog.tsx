"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Loader2, UserPlus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { FieldWrapper } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import type { UserRow } from "@/interfaces/auth";
import { getUsers, replaceUser } from "@/services/users.service";

type Mode = "existing" | "new";

function errorText(error: unknown) {
  if (!(error instanceof ApiError)) return "";
  return Object.values(error.errors)[0] || error.message;
}

export function UserHandoverDialog({
  outgoing,
  onClose,
  onSaved,
}: {
  outgoing: UserRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("userHandover");
  const [mode, setMode] = useState<Mode>("existing");
  const [incomingUser, setIncomingUser] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [transferRole, setTransferRole] = useState(true);
  const [transferProjects, setTransferProjects] = useState(true);
  const [transferResponsibilities, setTransferResponsibilities] =
    useState(true);
  const [transferTasks, setTransferTasks] = useState(true);
  const candidates = useQuery({
    queryKey: ["users", "handover-candidates", outgoing.company],
    queryFn: () =>
      getUsers({
        page_size: 500,
        company: outgoing.company ?? undefined,
        sort_by: "full_name",
      }),
  });
  const rows = useMemo(
    () =>
      (candidates.data?.results ?? []).filter(
        (row) =>
          row.id !== outgoing.id &&
          row.company === outgoing.company &&
          row.status !== "SUSPENDED",
      ),
    [candidates.data?.results, outgoing.company, outgoing.id],
  );
  const save = useMutation({
    mutationFn: () =>
      replaceUser(outgoing.id, {
        ...(mode === "existing"
          ? { incoming_user: incomingUser }
          : {
              full_name: fullName.trim(),
              email: email.trim(),
              phone: phone.trim(),
            }),
        reason: reason.trim(),
        transfer_role: transferRole,
        transfer_projects: transferProjects,
        transfer_responsibilities: transferResponsibilities,
        transfer_open_tasks: transferTasks,
      }),
    onSuccess: onSaved,
  });
  const blocked =
    !reason.trim() ||
    (mode === "existing" ? !incomingUser : !fullName.trim() || !email.trim());

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("dialog.title", { name: outgoing.full_name })}
          </DialogTitle>
          <DialogDescription>{t("dialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
          <Button
            type="button"
            variant={mode === "existing" ? "default" : "ghost"}
            onClick={() => setMode("existing")}
          >
            <Users /> {t("mode.existing")}
          </Button>
          <Button
            type="button"
            variant={mode === "new" ? "default" : "ghost"}
            onClick={() => setMode("new")}
          >
            <UserPlus /> {t("mode.new")}
          </Button>
        </div>

        {mode === "existing" ? (
          <FieldWrapper label={t("field.incomingUser")} required>
            <Select
              value={incomingUser || undefined}
              onValueChange={setIncomingUser}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("field.chooseUser")} />
              </SelectTrigger>
              <SelectContent>
                {rows.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.full_name} - {row.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!candidates.isLoading && rows.length === 0 && (
              <p className="text-xs text-warning">{t("state.noCandidate")}</p>
            )}
          </FieldWrapper>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldWrapper label={t("field.fullName")} required>
              <Input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </FieldWrapper>
            <FieldWrapper label={t("field.phone")}>
              <Input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </FieldWrapper>
            <FieldWrapper
              label={t("field.email")}
              required
              className="sm:col-span-2"
            >
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </FieldWrapper>
          </div>
        )}

        <FieldWrapper label={t("field.reason")} required>
          <Textarea
            rows={3}
            value={reason}
            placeholder={t("field.reasonPlaceholder")}
            onChange={(event) => setReason(event.target.value)}
          />
        </FieldWrapper>

        <div className="space-y-2">
          <p className="text-sm font-semibold">{t("transfer.title")}</p>
          {[
            ["role", transferRole, setTransferRole],
            ["projects", transferProjects, setTransferProjects],
            [
              "responsibilities",
              transferResponsibilities,
              setTransferResponsibilities,
            ],
            ["tasks", transferTasks, setTransferTasks],
          ].map(([key, checked, setter]) => (
            <label
              key={String(key)}
              className="flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2"
            >
              <Checkbox
                checked={Boolean(checked)}
                onCheckedChange={(value) =>
                  (setter as (next: boolean) => void)(value === true)
                }
              />
              <span className="text-sm font-medium">
                {t(`transfer.${key}`)}
              </span>
            </label>
          ))}
        </div>

        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
          <p className="font-semibold text-warning">{t("warning.title")}</p>
          <p className="mt-1 text-muted-foreground">
            {t("warning.description")}
          </p>
        </div>
        {save.isError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {errorText(save.error)}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            disabled={blocked || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <ArrowRightLeft />
            )}
            {t("action.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
