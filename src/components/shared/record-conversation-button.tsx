"use client";

/**
 * 【沟通】 on any record card, opening that record's own conversation (T-360).
 *
 * C-014 and D-233: every module has its Record Communication, bound to one
 * Record ID. It used to be reachable from three places only - the archive
 * queue, the receipt detail and the disposal detail - so the material-outgoing,
 * equipment, progress and recyclable-waste screens, which list their records as
 * cards with no detail page, had no way in at all. Somebody dealing with a
 * record had to go to the archive queue to say a sentence about it.
 *
 * One component for every card, and it opens the same panel the receipt uses,
 * so there is one conversation per record however it is reached - never a
 * second chat that splits the evidence in two.
 */

import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { RecordConversationPanel } from "@/components/shared/record-conversation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ArchiveRecordKind } from "@/interfaces/contractor-ops";

export function RecordConversationButton({
  kind,
  recordId,
  reference,
  size = "sm",
}: {
  kind: ArchiveRecordKind;
  recordId: string;
  /** What the dialog is titled with, so the reader knows which record it is. */
  reference: string;
  size?: "sm" | "default";
}) {
  const t = useTranslations("recordConversation");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant="outline" onClick={() => setOpen(true)}>
        <MessageSquare />
        {t("open")}
      </Button>
      {open && (
        <Dialog open onOpenChange={(next) => !next && setOpen(false)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{reference}</DialogTitle>
              <DialogDescription>{t("help")}</DialogDescription>
            </DialogHeader>
            <RecordConversationPanel kind={kind} recordId={recordId} />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
