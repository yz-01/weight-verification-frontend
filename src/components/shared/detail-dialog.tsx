"use client";

import { useRouter } from "next/navigation";

import { FormSurfaceProvider } from "@/components/shared/form-surface";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/**
 * The dialog an intercepted detail route renders into (T-243).
 *
 * Lucas, of the waste order list: 「为什么我按眼睛查看详情的时候不是弹窗」.
 * T-216 turned the create and edit routes into dialogs and left the view
 * routes as full-page navigations, so pressing the eye threw away the list -
 * its filters, its page, its scroll position - to show one row, and getting
 * back meant rebuilding all of it. Every reason that applied to the forms
 * applies here; they were simply not in that task.
 *
 * The same three properties come for free, for the same reason:
 *
 * - `/dispatches/<id>` is still a real page. Typed, bookmarked or arrived at
 *   from a notification it renders full width, exactly as before.
 * - Back closes it, and the list behind never unmounted.
 * - The list pages did not change. They still link to the same address.
 *
 * Wider than the form dialog: a detail screen is a reading surface with
 * photographs, tables and side panels rather than two columns of inputs, and
 * squeezing one into a form's width is how a page of evidence turns into a
 * column of thumbnails.
 */
export function DetailDialog({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) router.back();
      }}
    >
      {/*
       * One scrolling region rather than the form dialog's pinned footer: a
       * detail screen has nothing to submit, and its header is drawn by the
       * page's own `DetailHeader` from inside - so pinning it would mean
       * reaching into the content to pull the header back out.
       */}
      <DialogContent className="h-[calc(100dvh-2rem)] max-h-none overflow-y-auto p-3 sm:max-w-[min(96vw,90rem)]">
        <FormSurfaceProvider value="dialog">{children}</FormSurfaceProvider>
      </DialogContent>
    </Dialog>
  );
}
