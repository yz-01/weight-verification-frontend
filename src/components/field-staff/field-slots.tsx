"use client";

/**
 * 挂号 on the phone: a queue-ticket strip, one draft per 挂号 (D-259, T-376;
 * reworked by D-279, T-400).
 *
 * Wraps a capture screen in place of `FieldDraft`. Every 挂号 is its own
 * `FieldDraft` scope, so the photos of lorry 01 and lorry 02 live in two
 * separate drafts and cannot overwrite each other; the list of 挂号 is kept
 * beside them. The rules themselves are in `lib/field-slots.ts`.
 *
 * Nothing opens by itself. With no 挂号 held the strip says 0 and the form is
 * not shown - only 【挂号】, which opens the next number. Pressed while the 挂号
 * being worked on is still empty, it hands out nothing (an empty number would
 * only vanish again) and says so: silently doing nothing read as a broken
 * button (Lucas, 2026-09-26: 「为什么每个模块我点了挂号不会新增的」). There is no delete: a
 * 挂号 goes when its record is uploaded, or, if nothing was ever put in it,
 * when the worker switches away or opens another.
 *
 * The form inside does not know about any of this. When it submits it calls
 * `useClearDraft()` as it always has; inside a 挂号 that also settles the 挂号
 * (`SlotSettleContext`): uploaded → the 挂号 goes; queued offline → it stays,
 * marked waiting, until the offline queue reports that job uploaded.
 *
 * 「使用挂号」 off: the screen is one plain `FieldDraft` on the base scope, with
 * no settle context - exactly the single draft every other screen has.
 *
 * One component for the four capture screens the rule covers (D-260):
 * 材料进场、设备进出场、工地清运、环保材料出场 - 「这套挂号保留的操作规则…全部
 * 统一这样做，不要分别做不同逻辑」. The other capture screens keep a single
 * `FieldDraft`.
 */

import { Clock3, CloudOff, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { FieldDraft, SlotSettleContext } from "@/components/field-staff/field-draft";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { OfflineJob } from "@/lib/offline-db";
import {
  activateSlot,
  canDisableSlots,
  countDraftFiles,
  dropEmptySlots,
  formatSlotNumber,
  heldCount,
  isDraftEmpty,
  isQueued,
  loadRegistry,
  openSlot,
  releaseUploaded,
  saveRegistry,
  setSlotsEnabled,
  settleSlot,
  slotDraftScope,
  type FieldSlot,
  type SlotIsEmpty,
  type SlotRegistry,
} from "@/lib/field-slots";
import { formDraftKey, getFormDraftStore, type FormDraftStore } from "@/lib/form-draft-store";
import { cn } from "@/lib/utils";
import {
  OFFLINE_QUEUE_CHANGED,
  claimQueuedJob,
  queuedJobState,
} from "@/services/offline-sync.service";

export function FieldSlots({
  scope,
  jobKinds,
  children,
}: {
  /** The capture screen's draft scope, e.g. `material:new`. */
  scope: string;
  /** Which offline-queue jobs this screen's submissions become. */
  jobKinds: readonly OfflineJob["kind"][];
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  if (!user) return null;
  const key = formDraftKey(user.company, user.id, scope);
  return (
    <SlotBoundary key={key} registryKey={key} scope={scope} jobKinds={jobKinds} company={user.company} userId={user.id}>
      {children}
    </SlotBoundary>
  );
}

const noop = () => {};
const subscribeNothing = () => noop;

/** Subscribe to several draft stores at once. */
function subscribeAll(stores: FormDraftStore[]) {
  return (listener: () => void) => {
    const unsubscribe = stores.map((store) => store.subscribe(listener));
    return () => unsubscribe.forEach((off) => off());
  };
}

function SlotBoundary({
  registryKey,
  scope,
  jobKinds,
  company,
  userId,
  children,
}: {
  registryKey: string;
  scope: string;
  jobKinds: readonly OfflineJob["kind"][];
  company: string | null;
  userId: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("fieldSlots");
  const [initial] = useState(() => loadRegistry(registryKey));
  const [registry, setRegistry] = useState<SlotRegistry>(initial);
  // Written back at once: a list from before T-400 is stored in today's shape,
  // and a browser that refuses storage is found out before anything is lost.
  const [stored, setStored] = useState(() => saveRegistry(registryKey, initial));
  const [waiting, setWaiting] = useState<Record<string, { attempts: number; lastError: string }>>({});
  const [refused, setRefused] = useState<"off" | "on" | null>(null);
  // Which 挂号 【挂号】 was pressed on while it was still empty.
  const [emptyPressed, setEmptyPressed] = useState<number | null>(null);
  // The list as last written. Callbacks read this rather than localStorage,
  // which is exactly what a browser refusing storage cannot give back.
  const latest = useRef(initial);

  const commit = useCallback(
    (next: SlotRegistry) => {
      latest.current = next;
      setRegistry(next);
      setStored(saveRegistry(registryKey, next));
    },
    [registryKey],
  );

  const storeFor = useCallback(
    (slot: Pick<FieldSlot, "n" | "draft">) =>
      getFormDraftStore(formDraftKey(company, userId, slotDraftScope(scope, slot))),
    [company, scope, userId],
  );
  /** Empty means known empty: a draft not read back yet is never empty. */
  const emptyIn = useCallback(
    (list: SlotRegistry): SlotIsEmpty =>
      (n) => {
        const slot = list.slots.find((entry) => entry.n === n);
        return slot ? isDraftEmpty(storeFor(slot).getSnapshot()) : false;
      },
    [storeFor],
  );

  // Read every held 挂号's draft, then let go of the ones with nothing in
  // them - including one left open by the old strip, which opened a 挂号 by
  // itself (that is how 「挂号 3」 appeared with no lorry there). Only the
  // ones held when the screen opened, and never one the worker has since
  // opened or moved to.
  useEffect(() => {
    let cancelled = false;
    void Promise.all(initial.slots.map((slot) => storeFor(slot).load())).then(() => {
      if (cancelled) return;
      const current = latest.current;
      const isEmpty = emptyIn(current);
      const wasHeld = new Set(initial.slots.map((slot) => `${slot.n}|${slot.createdAt}`));
      const keep = current.active === initial.active ? 0 : current.active;
      const swept = dropEmptySlots(
        current,
        (n) => current.slots.some((slot) => slot.n === n && wasHeld.has(`${slot.n}|${slot.createdAt}`)) && isEmpty(n),
        keep,
      );
      if (swept !== current) commit(swept);
    });
    return () => {
      cancelled = true;
    };
  }, [commit, emptyIn, initial, storeFor]);

  // A waiting 挂号 goes only when the queue no longer holds its job.
  const queuedIds = registry.slots.filter(isQueued).map((slot) => slot.jobId as string);
  const queuedKey = queuedIds.join(",");
  useEffect(() => {
    if (!queuedKey) return;
    let cancelled = false;
    const check = async () => {
      const states = await Promise.all(
        queuedKey.split(",").map(async (id) => [id, await queuedJobState(userId, id)] as const),
      );
      if (cancelled) return;
      let next = latest.current;
      const failures: Record<string, { attempts: number; lastError: string }> = {};
      for (const [id, state] of states) {
        if (state.waiting) failures[id] = { attempts: state.attempts, lastError: state.lastError };
        else next = releaseUploaded(next, id);
      }
      setWaiting(failures);
      if (next !== latest.current) commit(next);
    };
    void check();
    window.addEventListener(OFFLINE_QUEUE_CHANGED, check);
    window.addEventListener("online", check);
    return () => {
      cancelled = true;
      window.removeEventListener(OFFLINE_QUEUE_CHANGED, check);
      window.removeEventListener("online", check);
    };
  }, [queuedKey, userId, commit]);

  const active = registry.active;
  const activeSlot = registry.slots.find((slot) => slot.n === active && !isQueued(slot));
  const settle = useCallback(() => {
    const jobId = claimQueuedJob(jobKinds);
    commit(settleSlot(latest.current, active, jobId));
  }, [active, commit, jobKinds]);

  // Whether 「使用挂号」 may go off right now, kept live as drafts change.
  const slotStores = useMemo(() => registry.slots.map(storeFor), [registry.slots, storeFor]);
  const subscribeSlots = useMemo(() => subscribeAll(slotStores), [slotStores]);
  const canTurnOff = useSyncExternalStore(
    subscribeSlots,
    () => canDisableSlots(registry, emptyIn(registry)),
    () => false,
  );
  // With it off, the single form's draft must be empty before it goes back on,
  // or what was typed there would vanish behind the 挂号 strip.
  const baseStore = useMemo(
    () => getFormDraftStore(formDraftKey(company, userId, scope)),
    [company, scope, userId],
  );
  const canTurnOn = useSyncExternalStore(
    registry.enabled ? subscribeNothing : baseStore.subscribe,
    () => registry.enabled || isDraftEmpty(baseStore.getSnapshot()),
    () => false,
  );

  // Kept live, so the hint goes the moment a photo lands in the 挂号.
  const activeEmpty = useSyncExternalStore(
    subscribeSlots,
    () => (activeSlot ? emptyIn(registry)(activeSlot.n) : false),
    () => false,
  );
  const open = () => {
    const current = latest.current;
    const isEmpty = emptyIn(current);
    const working = current.slots.find((slot) => slot.n === current.active && !isQueued(slot));
    setEmptyPressed(working && isEmpty(working.n) ? working.n : null);
    commit(openSlot(current, isEmpty));
  };
  const toggle = (on: boolean) => {
    if (on ? !canTurnOn : !canTurnOff) {
      setRefused(on ? "on" : "off");
      return;
    }
    setRefused(null);
    commit(setSlotsEnabled(latest.current, on, emptyIn(latest.current)));
  };
  const reason =
    refused === "off" && registry.enabled && !canTurnOff
      ? t("cannotTurnOff")
      : refused === "on" && !registry.enabled && !canTurnOn
        ? t("cannotTurnOn")
        : null;

  return (
    <div className="space-y-3">
      <section aria-label={t("title")} className="rounded-lg border bg-card p-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold">{t("title")}</p>
          <label className="flex items-center gap-2 text-xs">
            <Switch checked={registry.enabled} onCheckedChange={toggle} />
            {t("use")}
          </label>
        </div>
        {reason && (
          <p role="status" className="mt-1 text-xs font-medium text-destructive">{reason}</p>
        )}
        {registry.enabled ? (
          <>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <p className="text-sm font-medium tabular-nums" aria-live="polite">
                {t("held", { count: heldCount(registry) })}
              </p>
              {activeSlot && (
                <Button type="button" size="sm" variant="outline" onClick={open}>
                  <Plus className="size-4" />
                  {t("open")}
                </Button>
              )}
            </div>
            {activeSlot && emptyPressed === activeSlot.n && activeEmpty && (
              <p role="status" className="mt-1.5 rounded-md bg-warning/10 px-2 py-1.5 text-xs font-medium text-warning">
                {t("fillFirst", { n: formatSlotNumber(activeSlot.n) })}
              </p>
            )}
            {registry.slots.length > 0 && (
              <ul className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
                {registry.slots.map((slot) => (
                  <SlotChip
                    key={`${slot.n}|${slot.createdAt}`}
                    slot={slot}
                    active={slot.n === active}
                    store={storeFor(slot)}
                    failure={slot.jobId ? waiting[slot.jobId] : undefined}
                    onOpen={() => commit(activateSlot(latest.current, slot.n, emptyIn(latest.current)))}
                  />
                ))}
              </ul>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">{t("help")}</p>
          </>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground">{t("offHelp")}</p>
        )}
        {!stored && (
          <p role="alert" className="mt-1 text-xs font-medium text-destructive">{t("notStored")}</p>
        )}
      </section>
      {!registry.enabled ? (
        <FieldDraft scope={scope}>{children}</FieldDraft>
      ) : activeSlot ? (
        <SlotSettleContext.Provider value={settle}>
          <FieldDraft key={slotDraftScope(scope, activeSlot)} scope={slotDraftScope(scope, activeSlot)}>
            <p className="mb-2 text-sm font-semibold">{t("working", { n: formatSlotNumber(activeSlot.n) })}</p>
            {children}
          </FieldDraft>
        </SlotSettleContext.Provider>
      ) : (
        <div className="space-y-3 rounded-lg border border-dashed p-4 text-center">
          <p className="text-sm text-muted-foreground">{t("none")}</p>
          <Button type="button" size="lg" className="w-full" onClick={open}>
            <Plus className="size-4" />
            {t("open")}
          </Button>
        </div>
      )}
    </div>
  );
}

function SlotChip({
  slot,
  active,
  store,
  failure,
  onOpen,
}: {
  slot: FieldSlot;
  active: boolean;
  store: FormDraftStore;
  failure?: { attempts: number; lastError: string };
  onOpen: () => void;
}) {
  const t = useTranslations("fieldSlots");
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    void store.load();
  }, [store]);
  const photos = countDraftFiles(snapshot.values);
  const queued = isQueued(slot);
  return (
    <li className="shrink-0">
      <button
        type="button"
        onClick={onOpen}
        aria-pressed={active}
        disabled={queued}
        title={queued ? (failure?.lastError || t("waitingHelp")) : undefined}
        className={cn(
          "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs disabled:cursor-default",
          active && "border-primary bg-primary/10 font-semibold text-primary",
          queued && "border-dashed bg-muted/40 text-muted-foreground",
          failure && failure.attempts > 0 && "border-destructive/50 text-destructive",
        )}
      >
        {queued ? (
          failure && failure.attempts > 0 ? <CloudOff className="size-3.5" /> : <Clock3 className="size-3.5" />
        ) : null}
        <span>{t("slot", { n: formatSlotNumber(slot.n) })}</span>
        <span className="tabular-nums opacity-80">
          {queued
            ? failure && failure.attempts > 0
              ? t("failed")
              : t("waiting")
            : t("photos", { count: photos })}
        </span>
      </button>
    </li>
  );
}
