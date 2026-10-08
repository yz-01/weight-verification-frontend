"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef } from "react";

import { useFormSurface, type FormSurface } from "@/components/shared/form-surface";

/**
 * How a dialog drawn by an intercepted route leaves the screen.
 *
 * Lucas, of 编辑用户: 「为什么我保存了不会自动关掉，然后要点两次取消才可以关掉？」
 *
 * The forms used to `router.push(listHref)` after a save, which is right on a
 * full page and wrong in the dialog. On a soft navigation Next keeps a
 * parallel slot's previous content when the new address does not match it
 * (`@modal/default.tsx` only applies on a hard load), so the dialog stayed
 * open over the list it had just pushed. Each 取消 was then a `router.back()`
 * through the extra history entry: once to the edit address, once more to the
 * list. Two clicks.
 *
 * So the forms no longer talk to the router themselves. They say where they
 * would go - `useFinishForm()(href)` - and this file decides how:
 *
 * - On a page, forward to `href`, as before.
 * - In a dialog, when `href` is the screen the dialog was opened from, go
 *   *back* to it: the dialog closes once, the list behind keeps its filters,
 *   its page and its scroll position, and the browser's Back no longer
 *   reopens a form for a record that was already saved.
 * - In a dialog opened from somewhere else (a create form that lands on the
 *   record it made; an edit opened from a detail that lands on the list),
 *   *replace* the dialog's history entry with `href`: the next screen takes the
 *   form's place, so closing it never shows the form again.
 * - With nothing to go back to, replace with `href` rather than leaving the
 *   app.
 *
 * `useDismissDialog()` is the same decision for 取消, Escape and the X: back
 * when there is somewhere to go, otherwise the module's list.
 */

/**
 * The pathnames this tab has visited, oldest first. Module state on purpose:
 * the router does not say what came before the current entry, and the thing
 * that needs to know (a dialog) mounts after the thing that knew (the layout).
 */
const trail: string[] = [];
const TRAIL_LIMIT = 50;

/** Mounted once in the dashboard layout; records every soft navigation. */
export function InAppNavigationTracker() {
  const pathname = usePathname();
  useEffect(() => {
    recordVisit(pathname);
  }, [pathname]);
  return null;
}

export function recordVisit(pathname: string) {
  if (trail[trail.length - 1] === pathname) return;
  trail.push(pathname);
  if (trail.length > TRAIL_LIMIT) trail.shift();
}

/** For tests. */
export function resetTrail(entries: string[] = []) {
  trail.splice(0, trail.length, ...entries);
}

export type DialogExit =
  | { action: "back" }
  | { action: "push" | "replace"; href: string };

function pathOf(href: string): string {
  const end = href.search(/[?#]/);
  return end === -1 ? href : href.slice(0, end);
}

/** `/users/42/edit` → `/users`: the module's own list, for when nothing better is known. */
export function sectionRoot(pathname: string): string {
  const [first] = pathname.split("/").filter(Boolean);
  return first ? `/${first}` : "/";
}

/** Where a saved form goes. Pure, so the rule can be tested without a router. */
export function decideFormExit({
  surface,
  href,
  visited = trail,
}: {
  surface: FormSurface;
  href: string;
  visited?: readonly string[];
}): DialogExit {
  if (surface !== "dialog") return { action: "push", href };
  if (visited.length < 2) return { action: "replace", href };
  const previous = visited[visited.length - 2];
  if (previous === pathOf(href)) return { action: "back" };
  return { action: "replace", href };
}

/** Where 取消 / Escape / X go. */
export function decideDismiss({
  surface,
  fallbackHref,
  visited = trail,
}: {
  surface: FormSurface;
  fallbackHref: string;
  visited?: readonly string[];
}): DialogExit {
  if (visited.length >= 2) return { action: "back" };
  return { action: surface === "dialog" ? "replace" : "push", href: fallbackHref };
}

type Router = ReturnType<typeof useRouter>;

function perform(router: Router, exit: DialogExit) {
  if (exit.action === "back") router.back();
  else if (exit.action === "replace") router.replace(exit.href);
  else router.push(exit.href);
}

/**
 * `finish(href)`: leave the form after a successful save.
 *
 * `surface` is read from context unless the caller draws its own dialog
 * without the provider (a record detail in the shared record-detail frame
 * knows it from its `presentation`) and says so.
 */
export function useFinishForm(surfaceOverride?: FormSurface): (href: string) => void {
  const router = useRouter();
  const contextSurface = useFormSurface();
  const surface = surfaceOverride ?? contextSurface;
  return (href: string) => perform(router, decideFormExit({ surface, href }));
}

/**
 * The dialog's own idea of where "cancel" lands when there is no history: the
 * form inside tells it (`FormShell` knows its `backHref`); until then, the
 * module's list.
 */
const DismissFallbackContext = createContext<React.RefObject<string | null> | null>(null);

export function DismissFallbackProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<string | null>(null);
  return (
    <DismissFallbackContext.Provider value={ref}>{children}</DismissFallbackContext.Provider>
  );
}

/** A form or detail inside the dialog says where its list is. */
export function useRegisterDismissFallback(href: string | undefined) {
  const ref = useContext(DismissFallbackContext);
  useEffect(() => {
    if (ref && href) ref.current = href;
  }, [ref, href]);
}

/**
 * `dismiss()`: close without saving.
 *
 * `surface` is read from context unless the caller draws its own dialog
 * without the provider (the shared record-detail frame) and says so.
 */
export function useDismissDialog(
  fallbackHref?: string,
  surfaceOverride?: FormSurface,
): () => void {
  const router = useRouter();
  const contextSurface = useFormSurface();
  const surface = surfaceOverride ?? contextSurface;
  const pathname = usePathname();
  const registered = useContext(DismissFallbackContext);
  // No manual memoization: the React Compiler does it, and a `useCallback`
  // that reads `ref.current` is one it refuses to preserve.
  return () => {
    const href = fallbackHref ?? registered?.current ?? sectionRoot(pathname);
    perform(router, decideDismiss({ surface, fallbackHref: href }));
  };
}
