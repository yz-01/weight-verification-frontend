"use client";

import { useRouter } from "next/navigation";

import { FormSurfaceProvider } from "@/components/shared/form-surface";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/**
 * The dialog an intercepted create or edit route renders into (T-216).
 *
 * 客户：「所有 form 的东西可以弄成 pop out card，比如说材料进场（图4）太大了
 * 可以弄小一点他们不用滑那么多下去」.
 *
 * Three things this shape gets for free, which a dialog opened from component
 * state would not:
 *
 * - **The old addresses still work.** `/receipts/create` is still a real page.
 *   Typed, bookmarked or arrived at from a notification (F-293), it renders
 *   full width exactly as before; only a click from inside the app is
 *   intercepted into this dialog. Nothing had to be kept working by hand.
 * - **Back closes it**, and the list behind never unmounted, so it comes back
 *   with its filters, its page and its scroll position intact.
 * - **The list pages did not change.** They still link to the same address.
 *
 * Dismissing goes through `router.back()` rather than a push to the list: the
 * only way to be inside this component is to have navigated here from
 * somewhere in the app, and that somewhere is where the person was.
 */
export function FormDialog({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) router.back();
      }}
    >
      {/*
       * Wider than the default dialog because these are real forms with two
       * columns of fields, and taller only up to the window. `overflow-hidden`
       * with a three-row grid puts the scrollbar on the fields rather than on
       * the whole dialog - otherwise the submit button sits below the fold on
       * a long form and the person has to scroll to it, which is the complaint
       * this task exists to answer.
       */}
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-3xl">
        <FormSurfaceProvider value="dialog">{children}</FormSurfaceProvider>
      </DialogContent>
    </Dialog>
  );
}
