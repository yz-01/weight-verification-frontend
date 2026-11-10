"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { formDraftKey, getFormDraftStore, type FormDraftStore } from "@/lib/form-draft-store";
import { keptEventId } from "@/lib/kept-event-id";
import { newClientEventId } from "@/services/offline-sync.service";

const DraftContext = createContext<FormDraftStore | null>(null);
const noDraft = () => {};

/** Scope includes the workflow and task/record; identity comes from the real session. */
/**
 * `fill`: a full-height chat (JB127). The status line only shows when
 * something is wrong, and the content takes the rest of the height so the
 * message box stays on screen.
 *
 * `quiet`: nothing here can be typed (a read-only conversation, JB159), so the
 * line 「你填写的内容会保存在这台设备上。」 and the rest of the draft box are not
 * shown.
 */
export function FieldDraft({ scope, children, fill = false, quiet = false }: { scope: string; children: React.ReactNode; fill?: boolean; quiet?: boolean }) {
  const { user } = useAuth();
  if (!user) return null;
  return <DraftBoundary key={formDraftKey(user.company, user.id, scope)} id={formDraftKey(user.company, user.id, scope)} fill={fill} quiet={quiet}>{children}</DraftBoundary>;
}

function DraftBoundary({ id, children, fill, quiet }: { id: string; children: React.ReactNode; fill: boolean; quiet: boolean }) {
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
  const troubled = snapshot.status === "error" || snapshot.missingAttachments.length > 0;
  const box = !quiet && (!fill || troubled) && (
    <div className={fill ? "m-3 mb-0 shrink-0 rounded-lg border bg-muted/30 px-3 py-2 text-xs" : "mb-3 rounded-lg border bg-muted/30 px-3 py-2 text-xs"} data-draft-status={snapshot.status}>
      <p role={snapshot.status === "error" ? "alert" : "status"}>{t(snapshot.status)}</p>
      {snapshot.status === "error" && <Button type="button" variant="outline" size="sm" className="mt-2" onClick={store.retry}>{t("retry")}</Button>}
      {/* The typing came back but a photo did not. Name the count so the worker
          re-takes one photo instead of wondering what is broken (F-264). */}
      {snapshot.missingAttachments.length > 0 && (
        <p role="alert" className="mt-2 font-medium text-destructive">{t("photoMissing", { count: snapshot.missingAttachments.length })}</p>
      )}
      {snapshot.ready && Object.keys(snapshot.values).length > 0 && (
        confirmDiscard ? <div className="mt-2 flex flex-wrap items-center gap-2"><span>{t("confirmDiscard")}</span><Button type="button" size="sm" variant="destructive" onClick={() => { store.clear(); setConfirmDiscard(false); }}>{t("discard")}</Button><Button type="button" size="sm" variant="outline" onClick={() => setConfirmDiscard(false)}>{t("keep")}</Button></div>
          : <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => setConfirmDiscard(true)}>{t("discard")}</Button>
      )}
    </div>
  );
  if (fill) {
    return <DraftContext.Provider value={store}>
      <div className="flex h-full min-h-0 flex-col">
        {box}
        <div className="min-h-0 flex-1">{snapshot.ready && children}</div>
      </div>
    </DraftContext.Provider>;
  }
  return <DraftContext.Provider value={store}>
    {box}
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

/**
 * The submission's one ``client_event_id``, kept with the draft (P-phonefix).
 *
 * A tap that failed on something other than the network - a 502 / 504 from
 * the gateway, a 413 - may still have reached the server. A new id on the
 * next tap made that a second record; the kept one is answered with the
 * record the server already has. Cleared with the draft on success, so the
 * next submission gets its own.
 */
export function useDraftEventId(prefix: string): () => string {
  const [kept, setKept] = useDraftState("clientEventId", "");
  return useCallback(() => {
    const id = keptEventId(kept, () => newClientEventId(prefix));
    if (id !== kept) setKept(id);
    return id;
  }, [kept, prefix, setKept]);
}

/**
 * Set by `FieldSlots` around one 挂号's draft (D-259). Called after the draft
 * is cleared on a successful submission, so the 挂号 knows its record left -
 * uploaded, or into the offline queue - without every form being rewritten to
 * tell it.
 */
export const SlotSettleContext = createContext<(() => void) | null>(null);

/** Call only after the server accepted, or after the offline queue committed. */
export function useClearDraft() {
  const clear = useContext(DraftContext)?.clear;
  const settle = useContext(SlotSettleContext);
  return useCallback(() => {
    clear?.();
    settle?.();
  }, [clear, settle]);
}
