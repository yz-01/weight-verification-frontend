"use client";

import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";

/**
 * 垃圾桶 (JB25, 客户 10-26 事项 1): delete an ordinary record - or one file on
 * it - before 确认归档.
 *
 * 「删除必须验证本人六位数密码」「删除后彻底清除，不保留历史、回收站或后台删除
 * 审计记录」: the confirmation says plainly it cannot be recovered; the server
 * then asks for the PIN (`sign_off_pin_required`, the shared dialog opens by
 * itself) and deletes everything. A refusal - archived, or used by a formal
 * record - comes back as a toast from the API client.
 *
 * 「只针对电脑 Web 后台页面」: never drawn for an account that works on the
 * phone.
 */
export function DeleteRecordButton({
  onDelete,
  onDeleted,
  what,
  size = "sm",
  iconOnly = false,
  className,
}: {
  /** The DELETE call. */
  onDelete: () => Promise<unknown>;
  onDeleted?: () => void;
  /** What goes, as the person knows it (a number, a file name). */
  what: string;
  size?: "sm" | "icon" | "default";
  iconOnly?: boolean;
  className?: string;
}) {
  const t = useTranslations("draftRecords");
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: onDelete,
    onSuccess: () => {
      setOpen(false);
      onDeleted?.();
    },
  });
  if (user?.is_field_staff) return null;
  return (
    <>
      <Button
        type="button"
        size={iconOnly ? "icon" : size}
        variant="outline"
        className={className}
        aria-label={t("delete")}
        title={t("delete")}
        data-slot="delete-record"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4 text-destructive" />
        {iconOnly ? null : t("delete")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("confirmTitle", { what })}
        description={t("confirmBody")}
        confirmLabel={t("confirmDelete")}
        isPending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}

/** 「确认归档后才能导出 / 打印 / 发送」 - the reason on the greyed buttons. */
export function useNotArchivedReason() {
  return useTranslations("draftRecords")("notArchived");
}
