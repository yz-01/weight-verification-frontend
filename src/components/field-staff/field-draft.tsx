"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { formDraftKey, getFormDraftStore, type FormDraftStore } from "@/lib/form-draft-store";

const DraftContext = createContext<FormDraftStore | null>(null);
const noDraft = () => {};

/** Scope includes the workflow and task/record; identity comes from the real session. */
export function FieldDraft({ scope, children }: { scope: string; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  return <DraftBoundary key={formDraftKey(user.company, user.id, scope)} id={formDraftKey(user.company, user.id, scope)}>{children}</DraftBoundary>;
}

function DraftBoundary({ id, children }: { id: string; children: React.ReactNode }) {
  const t = useTranslations("fieldDraft");
  const store = useMemo(() => getFormDraftStore(id), [id]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  useEffect(() => { void store.load(); }, [store]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const current = store.getSnapshot();
      if (current.status === "saving" || current.status === "error") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [store]);
  return <DraftContext.Provider value={store}>
    <div className="mb-3 rounded-lg border bg-muted/30 px-3 py-2 text-xs" data-draft-status={snapshot.status}>
      <p role={snapshot.status === "error" ? "alert" : "status"}>{t(snapshot.status)}</p>
      {snapshot.status === "error" && <Button type="button" variant="outline" size="sm" className="mt-2" onClick={store.retry}>{t("retry")}</Button>}
      {snapshot.ready && Object.keys(snapshot.values).length > 0 && (
        confirmDiscard ? <div className="mt-2 flex flex-wrap items-center gap-2"><span>{t("confirmDiscard")}</span><Button type="button" size="sm" variant="destructive" onClick={() => { store.clear(); setConfirmDiscard(false); }}>{t("discard")}</Button><Button type="button" size="sm" variant="outline" onClick={() => setConfirmDiscard(false)}>{t("keep")}</Button></div>
          : <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => setConfirmDiscard(true)}>{t("discard")}</Button>
      )}
    </div>
    {snapshot.ready && children}
  </DraftContext.Provider>;
}

export function useDraftState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>];
export function useDraftState<T = undefined>(key: string): [T | undefined, Dispatch<SetStateAction<T | undefined>>];
export function useDraftState<T>(key: string, initial?: T | (() => T)) {
  const store = useContext(DraftContext);
  const [fallback, setFallback] = useState(initial);
  const subscribe = store?.subscribe ?? (() => noDraft);
  const getSnapshot = store?.getSnapshot ?? (() => null);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const value = snapshot && Object.hasOwn(snapshot.values, key) ? snapshot.values[key] as T : fallback as T;
  const set = useCallback((action: SetStateAction<T | undefined>) => {
    if (!store) { setFallback(action); return; }
    const values = store.getSnapshot().values;
    const current = Object.hasOwn(values, key) ? values[key] as T : fallback;
    store.set(key, typeof action === "function" ? (action as (value: T | undefined) => T)(current) : action);
  }, [fallback, key, store]);
  return [value, set];
}

/** Call only after the server accepted, or after the offline queue committed. */
export function useClearDraft() { return useContext(DraftContext)?.clear ?? noDraft; }
