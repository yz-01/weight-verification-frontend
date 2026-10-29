"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Power, Trash2, UserPlus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { pinDigits } from "@/components/shared/sign-off-dialog";
import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/interfaces/api";
import { SIGN_OFF_CODES } from "@/lib/sign-off";
import {
  addSignOffAssistant,
  changeSignOffAssistant,
  getSignOffAssistants,
  type SignOffAssistant,
  type SignOffAssistants,
} from "@/services/sign-off.service";

const QUERY_KEY = ["sign-off-assistants"];

/** What the person is doing in the dialog. */
type Task =
  | { kind: "add" }
  | { kind: "pin"; assistant: SignOffAssistant }
  | { kind: "active"; assistant: SignOffAssistant; active: boolean }
  | { kind: "remove"; assistant: SignOffAssistant };

/** Where a refusal is shown: under the owner's PIN, the new PIN, or below. */
export function assistantErrorField(error: unknown): "owner_pin" | "pin" | "form" {
  if (!(error instanceof ApiError)) return "form";
  const ownerCodes: string[] = [
    SIGN_OFF_CODES.incorrect,
    SIGN_OFF_CODES.locked,
    SIGN_OFF_CODES.notSet,
  ];
  if (ownerCodes.includes(error.code) || error.fieldError("owner_pin")) return "owner_pin";
  if (error.code === "sign_off_assistant_pin_taken" || error.fieldError("pin")) return "pin";
  return "form";
}

/**
 * 「助理副密码」 on the profile (JB56, 客户 10-28 事项 9): up to two assistants
 * keep working on this account with their own six-digit PIN while the owner
 * is away. The owner types their own PIN first; the assistant then types a
 * name, a phone and their own PIN on the same computer - no link is sent.
 * The owner turns one off, on, changes their PIN or removes them, each time
 * with the owner's own PIN. What an assistant signs says their name.
 */
export function SignOffAssistantsSettings() {
  const t = useTranslations("signOff.assistants");
  const queryClient = useQueryClient();
  const [task, setTask] = useState<Task | null>(null);
  const list = useQuery({ queryKey: QUERY_KEY, queryFn: getSignOffAssistants });
  const data = list.data;
  const rows = data?.assistants ?? [];
  const full = data ? rows.length >= data.max : false;

  return (
    <div className="surface-panel scroll-mt-20 rounded-xl" id="sign-off-assistants">
      <div className="flex flex-wrap items-center gap-3 p-4 sm:px-6 sm:py-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Users className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="panel-title">{t("title")}</h3>
          <p className="text-sm text-muted-foreground">{t("help")}</p>
        </div>
        <Button
          type="button"
          className="ml-auto"
          disabled={!data || full || !data.has_pin}
          disabledReason={
            data && !data.has_pin ? t("needOwnPin") : full ? t("full") : undefined
          }
          onClick={() => setTask({ kind: "add" })}
        >
          <UserPlus className="size-4" />
          {t("add")}
        </Button>
      </div>
      <div className="border-t border-panel-border p-4 sm:px-6">
        {list.isError ? (
          <QueryFailedNote query={list} what={t("title")} />
        ) : !data ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="assistants-empty">
            {data.has_pin ? t("empty") : t("needOwnPin")}
          </p>
        ) : (
          <ul className="divide-y divide-panel-border">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
                data-testid="assistant-row"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {row.name}
                    <Badge variant={row.is_active ? "default" : "secondary"}>
                      {row.is_active ? t("active") : t("stopped")}
                    </Badge>
                  </p>
                  <p className="text-sm text-muted-foreground">{t("phoneLine", { phone: row.phone })}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTask({ kind: "pin", assistant: row })}
                  >
                    <KeyRound className="size-4" />
                    {t("changePin")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTask({ kind: "active", assistant: row, active: !row.is_active })}
                  >
                    <Power className="size-4" />
                    {row.is_active ? t("stop") : t("start")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setTask({ kind: "remove", assistant: row })}
                  >
                    <Trash2 className="size-4" />
                    {t("remove")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {task && (
        <AssistantDialog
          key={task.kind + ("assistant" in task ? task.assistant.id : "")}
          task={task}
          onClose={() => setTask(null)}
          onDone={(next) => {
            queryClient.setQueryData(QUERY_KEY, next);
            setTask(null);
          }}
        />
      )}
    </div>
  );
}

function AssistantDialog({
  task,
  onClose,
  onDone,
}: {
  task: Task;
  onClose: () => void;
  onDone: (next: SignOffAssistants) => void;
}) {
  const t = useTranslations("signOff.assistants");
  const common = useTranslations("signOff");
  const [ownerPin, setOwnerPin] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const needsNewPin = task.kind === "add" || task.kind === "pin";
  const who = "assistant" in task ? task.assistant.name : "";

  const save = useMutation({
    mutationFn: () => {
      if (task.kind === "add") {
        return addSignOffAssistant({ ownerPin, name: name.trim(), phone: phone.trim(), pin });
      }
      return changeSignOffAssistant(
        task.assistant,
        ownerPin,
        task.kind === "pin"
          ? { kind: "pin", pin }
          : task.kind === "active"
            ? { kind: "active", active: task.active }
            : { kind: "remove" },
      );
    },
    onSuccess: onDone,
    onError: (failure) => {
      const field = assistantErrorField(failure);
      setError({
        field,
        message: failure instanceof ApiError && failure.message ? failure.message : common("failed"),
      });
      if (field === "owner_pin") setOwnerPin("");
    },
  });

  const pinsMatch = pin.length === 6 && pin === confirmPin;
  const ready =
    ownerPin.length === 6 &&
    (task.kind !== "add" || (name.trim() !== "" && phone.trim() !== "")) &&
    (!needsNewPin || pinsMatch);

  const title =
    task.kind === "add"
      ? t("addTitle")
      : task.kind === "pin"
        ? t("changePinTitle", { name: who })
        : task.kind === "active"
          ? task.active
            ? t("startTitle", { name: who })
            : t("stopTitle", { name: who })
          : t("removeTitle", { name: who });
  const description =
    task.kind === "add"
      ? t("addHelp")
      : task.kind === "pin"
        ? t("changePinHelp", { name: who })
        : task.kind === "active"
          ? task.active
            ? t("startHelp", { name: who })
            : t("stopHelp", { name: who })
          : t("removeHelp", { name: who });
  const submitLabel =
    task.kind === "add"
      ? t("saveAdd")
      : task.kind === "pin"
        ? t("saveChange")
        : task.kind === "active"
          ? task.active
            ? t("confirmStart")
            : t("confirmStop")
          : t("confirmRemove");

  const requires: Array<[unknown, string]> = [[ownerPin.length === 6, t("ownerPin")]];
  if (task.kind === "add") {
    requires.push([name.trim(), t("name")], [phone.trim(), t("phone")]);
  }
  if (needsNewPin) {
    requires.push([pin.length === 6, task.kind === "add" ? t("pin") : t("newPin")]);
    requires.push([confirmPin.length === 6, t("confirmPin")]);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="assistant-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          id="assistant-form"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready && !save.isPending) {
              setError(null);
              save.mutate();
            }
          }}
        >
          {task.kind === "add" && <p className="text-sm font-semibold">{t("step1")}</p>}
          <FieldWrapper
            label={t("ownerPin")}
            required
            hint={t("ownerPinHint")}
            error={error?.field === "owner_pin" ? error.message : undefined}
          >
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              autoFocus
              value={ownerPin}
              onChange={(event) => setOwnerPin(pinDigits(event.target.value))}
            />
          </FieldWrapper>
          {task.kind === "add" && (
            <>
              <p className="border-t border-panel-border pt-4 text-sm font-semibold">{t("step2")}</p>
              <FieldWrapper label={t("name")} required>
                <Input value={name} maxLength={150} onChange={(event) => setName(event.target.value)} />
              </FieldWrapper>
              <FieldWrapper label={t("phone")} required>
                <Input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  maxLength={40}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </FieldWrapper>
            </>
          )}
          {needsNewPin && (
            <>
              <FieldWrapper
                label={task.kind === "add" ? t("pin") : t("newPin")}
                required
                hint={t("pinHint")}
                error={error?.field === "pin" ? error.message : undefined}
              >
                <Input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={6}
                  value={pin}
                  onChange={(event) => setPin(pinDigits(event.target.value))}
                />
              </FieldWrapper>
              <FieldWrapper
                label={t("confirmPin")}
                required
                error={confirmPin.length === 6 && confirmPin !== pin ? t("pinMismatch") : undefined}
              >
                <Input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(event) => setConfirmPin(pinDigits(event.target.value))}
                />
              </FieldWrapper>
            </>
          )}
          {error?.field === "form" && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error.message}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>
            {common("cancel")}
          </Button>
          <Button
            type="submit"
            form="assistant-form"
            variant={task.kind === "remove" ? "destructive" : "default"}
            requires={requires}
            disabledReason={
              needsNewPin && pin.length === 6 && confirmPin.length === 6 && pin !== confirmPin
                ? t("pinMismatch")
                : undefined
            }
            disabled={save.isPending || (needsNewPin && confirmPin.length === 6 && pin !== confirmPin)}
          >
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
