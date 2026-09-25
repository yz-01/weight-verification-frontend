"use client";

/**
 * 挂号保留 on the phone: one strip of 挂号, one draft per 挂号 (D-259, T-376).
 *
 * Wraps a capture screen in place of `FieldDraft`. Every 挂号 is its own
 * `FieldDraft` scope, so the photos of lorry 1 and lorry 2 live in two
 * separate drafts and cannot overwrite each other; the list of 挂号 is kept
 * beside them. The rules themselves are in `lib/field-slots.ts`.
 *
 * The form inside does not know about any of this. When it submits it calls
 * `useClearDraft()` as it always has; inside a 挂号 that also settles the 挂号
 * (`SlotSettleContext`): uploaded → the 挂号 goes; queued offline → it stays,
 * marked waiting, until the offline queue reports that job uploaded.
 *
 * One component for the four capture screens the rule covers (D-260):
 * 材料进场、设备进出场、建筑垃圾清运、废料出场 - 「这套挂号保留的操作规则…全部
 * 统一这样做，不要分别做不同逻辑」. The other capture screens keep a single
 * `FieldDraft`.
 */

import { Clock3, CloudOff, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { FieldDraft, SlotSettleContext } from "@/components/field-staff/field-draft";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import type { OfflineJob } from "@/lib/offline-db";
import {
  activateSlot,
  addSlot,
  countDraftFiles,
  ensureActive,
  isQueued,
  loadRegistry,
  releaseUploaded,
  removeEmptySlot,
  saveRegistry,
  settleSlot,
  slotDraftScope,
  type FieldSlot,
  type SlotRegistry,
} from "@/lib/field-slots";
import { formDraftKey, getFormDraftStore } from "@/lib/form-draft-store";
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
  // The first render may open 挂号 1, so it is written down at once.
  const [initial] = useState(() => {
    const opened = ensureActive(loadRegistry(registryKey));
    return { opened, stored: saveRegistry(registryKey, opened) };
  });
  const [registry, setRegistry] = useState<SlotRegistry>(initial.opened);
  const [stored, setStored] = useState(initial.stored);
  const [waiting, setWaiting] = useState<Record<string, { attempts: number; lastError: string }>>({});

  const commit = useCallback(
    (next: SlotRegistry) => {
      setRegistry(next);
      setStored(saveRegistry(registryKey, next));
    },
    [registryKey],
  );

  // Rule 6: a waiting 挂号 goes only when the queue no longer holds its job.
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
      let next = loadRegistry(registryKey);
      const failures: Record<string, { attempts: number; lastError: string }> = {};
      for (const [id, state] of states) {
        if (state.waiting) failures[id] = { attempts: state.attempts, lastError: state.lastError };
        else next = releaseUploaded(next, id);
      }
      setWaiting(failures);
      commit(ensureActive(next));
    };
    void check();
    window.addEventListener(OFFLINE_QUEUE_CHANGED, check);
    window.addEventListener("online", check);
    return () => {
      cancelled = true;
      window.removeEventListener(OFFLINE_QUEUE_CHANGED, check);
      window.removeEventListener("online", check);
    };
  }, [queuedKey, registryKey, userId, commit]);

  const active = registry.active;
  const settle = useCallback(() => {
    const jobId = claimQueuedJob(jobKinds);
    commit(ensureActive(settleSlot(loadRegistry(registryKey), active, jobId)));
  }, [active, commit, jobKinds, registryKey]);

  const draftIdFor = useCallback(
    (n: number) => formDraftKey(company, userId, slotDraftScope(scope, n)),
    [company, scope, userId],
  );

  return (
    <div className="space-y-3">
      <section aria-label={t("title")} className="rounded-lg border bg-card p-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold">{t("title")}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => commit(addSlot(registry))}>
            <Plus className="size-4" />
            {t("add")}
          </Button>
        </div>
        <ul className="flex gap-1.5 overflow-x-auto pb-1">
          {registry.slots.map((slot) => (
            <SlotChip
              key={slot.n}
              slot={slot}
              active={slot.n === active}
              draftId={draftIdFor(slot.n)}
              failure={slot.jobId ? waiting[slot.jobId] : undefined}
              onOpen={() => commit(activateSlot(registry, slot.n))}
              onRemove={(isEmpty) => commit(ensureActive(removeEmptySlot(registry, slot.n, isEmpty)))}
            />
          ))}
        </ul>
        <p className="mt-1 text-[11px] text-muted-foreground">{t("help")}</p>
        {!stored && (
          <p role="alert" className="mt-1 text-xs font-medium text-destructive">{t("notStored")}</p>
        )}
      </section>
      {active ? (
        <SlotSettleContext.Provider value={settle}>
          <FieldDraft key={active} scope={slotDraftScope(scope, active)}>
            <p className="mb-2 text-sm font-semibold">{t("working", { n: active })}</p>
            {children}
          </FieldDraft>
        </SlotSettleContext.Provider>
      ) : null}
    </div>
  );
}

function SlotChip({
  slot,
  active,
  draftId,
  failure,
  onOpen,
  onRemove,
}: {
  slot: FieldSlot;
  active: boolean;
  draftId: string;
  failure?: { attempts: number; lastError: string };
  onOpen: () => void;
  onRemove: (isEmpty: boolean) => void;
}) {
  const t = useTranslations("fieldSlots");
  const store = useMemo(() => getFormDraftStore(draftId), [draftId]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    void store.load();
  }, [store]);
  const photos = countDraftFiles(snapshot.values);
  const empty = snapshot.ready && Object.keys(snapshot.values).length === 0;
  const queued = isQueued(slot);
  return (
    <li className="shrink-0">
      <div
        className={cn(
          "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
          active && "border-primary bg-primary/10 font-semibold text-primary",
          queued && "border-dashed bg-muted/40 text-muted-foreground",
          failure && failure.attempts > 0 && "border-destructive/50 text-destructive",
        )}
      >
        <button
          type="button"
          onClick={onOpen}
          aria-pressed={active}
          disabled={queued}
          title={queued ? (failure?.lastError || t("waitingHelp")) : undefined}
          className="flex items-center gap-1 disabled:cursor-default"
        >
          {queued ? (
            failure && failure.attempts > 0 ? <CloudOff className="size-3.5" /> : <Clock3 className="size-3.5" />
          ) : null}
          <span>{t("slot", { n: slot.n })}</span>
          <span className="tabular-nums opacity-80">
            {queued
              ? failure && failure.attempts > 0
                ? t("failed")
                : t("waiting")
              : t("photos", { count: photos })}
          </span>
        </button>
        {/* Only an empty 挂号 can be taken off the list; one holding photos
            is cleared by uploading it (rule 6). */}
        {!queued && empty && !active && (
          <button
            type="button"
            title={t("remove")}
            aria-label={t("remove")}
            onClick={() => onRemove(true)}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}
