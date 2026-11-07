"use client";

import { useMutation } from "@tanstack/react-query";
import { CheckCheck, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { FieldTask } from "@/interfaces/contractor-ops";
import { transitionFieldTask } from "@/services/contractor-ops.service";

/**
 * 「确认完成」 before anything was handed in (JB129, 客户 11-07 事项 4: 「项目
 * 人员与总部沟通完成后，没有「确认完成」功能……请增加「确认完成」按钮，事项处理
 * 完毕后可以正式结束，并自动更新状态为「已完成」……是后台电脑，手机端保留」).
 *
 * Only where the server says this reader may (`can_close`: whoever confirms
 * the task, on the desk, while it is still with its assignee). One line on
 * how it was settled goes with it; the conversation stays as it was.
 */
export function CloseTaskButton({
  task,
  onDone,
  size = "sm",
}: {
  task: Pick<FieldTask, "id" | "title" | "can_close">;
  onDone: () => void;
  size?: "sm" | "default";
}) {
  const t = useTranslations("contractorOps.tasks.close");
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const close = useMutation({
    mutationFn: () => transitionFieldTask(task.id, "ACCEPTED", note.trim()),
    onSuccess: () => {
      setOpen(false);
      setNote("");
      onDone();
    },
  });
  if (!task.can_close) return null;
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)} data-close-task>
        <CheckCheck />
        {t("action")}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !close.isPending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("title", { task: task.title })}</DialogTitle>
            <DialogDescription>{t("body")}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("placeholder")}
            rows={3}
            aria-label={t("noteLabel")}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={close.isPending} disabledReason={t("saving")}>
              {t("cancel")}
            </Button>
            <Button
              onClick={() => close.mutate()}
              disabled={!note.trim() || close.isPending}
              disabledReason={close.isPending ? t("saving") : t("needNote")}
            >
              {close.isPending ? <Loader2 className="animate-spin" /> : <CheckCheck />}
              {t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
