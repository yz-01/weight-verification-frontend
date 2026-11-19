"use client";

/**
 * 设备绑定司机 (JB227, 客户 11-19 事项 7): 「只有绑定了对应设备的司机手机端，才允许
 * 进行设备工时打卡。没有绑定设备的手机，一律不允许打卡。」
 *
 * One row per working machine of the project, with the driver phones bound to
 * it - a driver's link or a 设备操作人员 account - and 【设定司机】, a tick list
 * of the project's drivers. A machine may have several drivers (shifts), a
 * driver several machines; a day's replacement is ticked, then unticked.
 * Machines nobody can clock come first and say so. The bindings the release
 * put in from the last 30 days of clock-ins carry 「按最近打卡先绑」 until the
 * office presses 【确认】 (or saves the row), and the page says how many are
 * still to check. The server checks every 开工 / 收工 against these.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/interfaces/api";
import { useDateFormat } from "@/lib/dates";
import {
  listDriverBindings,
  setMachineDrivers,
  type BindingDriverKind,
  type BindingMachine,
  type BindingRunning,
} from "@/services/driver-clock.service";

export const DRIVER_BINDINGS_KEY = "driver-bindings";

/** One driver phone's key in a tick list: 「link:<id>」 or 「account:<id>」. */
export function driverKey(driver: { kind: BindingDriverKind; id: string }): string {
  return `${driver.kind}:${driver.id}`;
}

/** A tick list's keys back into what the server takes. */
export function driversOf(keys: readonly string[]): { kind: BindingDriverKind; id: string }[] {
  return keys.map((key) => {
    const at = key.indexOf(":");
    return { kind: key.slice(0, at) as BindingDriverKind, id: key.slice(at + 1) };
  });
}

/** Whether the ticks differ from the drivers the machine has now. */
export function ticksChanged(machine: Pick<BindingMachine, "drivers">, ticked: readonly string[]): boolean {
  const now = new Set(machine.drivers.map(driverKey));
  return now.size !== new Set(ticked).size || ticked.some((key) => !now.has(key));
}

/** Whether a machine still has a driver the release bound, not yet checked. */
export function hasSeeded(machine: Pick<BindingMachine, "drivers">): boolean {
  return machine.drivers.some((driver) => driver.source === "SEEDED");
}

/**
 * The driver these ticks would untick while his 开工 on this machine is still
 * open (audit F1) - his phone could no longer take the 收工 - or null.
 */
export function strandedDriver(
  machine: Pick<BindingMachine, "drivers" | "running">,
  ticked: readonly string[],
): BindingRunning | null {
  const running = machine.running;
  if (!running) return null;
  const key = driverKey(running);
  const boundNow = machine.drivers.some((driver) => driverKey(driver) === key);
  return boundNow && !ticked.includes(key) ? running : null;
}

/**
 * Said under the tick list before 【保存】 when the save would untick the
 * driver who is running the machine: who, since when, and what will happen.
 */
export function RunningUnbindWarning({ running }: { running: BindingRunning }) {
  const t = useTranslations("driverBinding");
  const df = useDateFormat();
  return (
    <p
      role="alert"
      data-testid="binding-running-warning"
      className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium"
    >
      {t("runningWarn", { name: running.name, time: df.dateTime(running.since) })}
    </p>
  );
}

function useDriverBindings(project: string) {
  return useQuery({
    queryKey: [DRIVER_BINDINGS_KEY, project],
    queryFn: () => listDriverBindings(project),
    enabled: Boolean(project),
  });
}

/**
 * The page's own lines, under its header: the pre-bound machines to check,
 * and the machines nobody can clock. Nothing when all is in order.
 */
export function DriverBindingHints({ project }: { project: string }) {
  const t = useTranslations("driverBinding");
  const query = useDriverBindings(project);
  const data = query.data;
  // A failed read says so: no line would read as "every machine has a driver".
  if (project && query.isError) return <QueryFailedNote query={query} what={t("title")} />;
  if (!project || !data || (!data.unbound_machines && !data.seeded_machines)) return null;
  return (
    <div className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2" data-testid="driver-binding-hints">
      {data.seeded_machines > 0 ? (
        <p role="status" className="text-sm font-medium">
          {t("seededLine", { count: data.seeded_machines })}
        </p>
      ) : null}
      {data.unbound_machines > 0 ? (
        <p role="status" className="text-sm font-medium">
          {t("unboundLine", { count: data.unbound_machines })}
        </p>
      ) : null}
    </div>
  );
}

export function DriverBindingsDialog({ project, onClose }: { project: string; onClose: () => void }) {
  const t = useTranslations("driverBinding");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" data-testid="driver-bindings">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("help")}</DialogDescription>
        </DialogHeader>
        <DriverBindingsBody project={project} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** What the dialog holds: the machines, their drivers, the tick lists. */
export function DriverBindingsBody({ project }: { project: string }) {
  const t = useTranslations("driverBinding");
  const queryClient = useQueryClient();
  const query = useDriverBindings(project);
  // The machine whose tick list is open, and its ticks.
  const [editing, setEditing] = useState<string | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: ({ machine, keys, confirmRunning }: { machine: BindingMachine; keys: string[]; confirmRunning?: boolean }) =>
      setMachineDrivers({
        project,
        equipment: machine.id,
        drivers: driversOf(keys),
        ...(confirmRunning ? { confirm_running: true } : {}),
      }),
    onSuccess: () => {
      setEditing(null);
      setError("");
      void queryClient.invalidateQueries({ queryKey: [DRIVER_BINDINGS_KEY] });
      void queryClient.invalidateQueries({ queryKey: ["driver-clock-links"] });
    },
    onError: (reason) => {
      setError(reason instanceof ApiError ? reason.message : t("failed"));
      // He started the machine after this list was read: read it again, so
      // the warning and its 【确定取消绑定并保存】 show under the ticks.
      if (reason instanceof ApiError && reason.code === "equipment_binding_driver_running") {
        void queryClient.invalidateQueries({ queryKey: [DRIVER_BINDINGS_KEY] });
      }
    },
  });

  const data = query.data;
  const drivers = data?.drivers ?? [];
  const machineTitle = (machine: BindingMachine) =>
    [t("machineLine", { number: machine.number, name: machine.name }), machine.plate].filter(Boolean).join(" · ");

  return (
    <div className="space-y-3">
      {!project ? <p className="text-sm text-muted-foreground">{t("chooseProject")}</p> : null}
      <QueryFailedNote query={query} what={t("title")} />

      {data && data.seeded_machines > 0 ? (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium">
          {t("seededHelp", { count: data.seeded_machines })}
        </p>
      ) : null}
      {data && drivers.length === 0 ? (
        <p role="status" className="rounded-lg border px-3 py-2 text-sm">
          {t("noDrivers")}
        </p>
      ) : null}
      {data && data.machines.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noMachines")}</p>
      ) : null}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {data && data.machines.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {data.machines.map((machine) => {
            const stranded = editing === machine.id ? strandedDriver(machine, ticked) : null;
            return (
              <li key={machine.id} className="space-y-2 p-3" data-testid="binding-machine">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{machineTitle(machine)}</p>
                    {machine.drivers.length === 0 ? (
                      <p className="text-sm font-medium text-warning">{t("nobody")}</p>
                    ) : (
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {machine.drivers.map((driver) => (
                          <li
                            key={driver.binding}
                            className="flex flex-wrap items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm"
                          >
                            <span className="font-medium">{driver.name}</span>
                            <span className="text-muted-foreground">{t(`kind.${driver.kind}`)}</span>
                            {driver.source === "SEEDED" ? <StatusBadge label={t("seeded")} tone="warning" /> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {editing !== machine.id ? (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {hasSeeded(machine) ? (
                        <Button
                          size="sm"
                          disabled={save.isPending}
                          onClick={() => save.mutate({ machine, keys: machine.drivers.map(driverKey) })}
                        >
                          <Check />
                          {t("confirm")}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={drivers.length === 0}
                        disabledReason={t("noDrivers")}
                        onClick={() => {
                          setEditing(machine.id);
                          setTicked(machine.drivers.map(driverKey));
                          setError("");
                        }}
                      >
                        <Pencil />
                        {t("edit")}
                      </Button>
                    </div>
                  ) : null}
                </div>

                {editing === machine.id ? (
                  <fieldset className="space-y-1 rounded-lg border bg-muted/30 p-3">
                    <legend className="sr-only">{t("edit")}</legend>
                    <p className="text-xs text-muted-foreground">{t("pickHelp")}</p>
                    {drivers.map((driver) => {
                      const key = driverKey(driver);
                      return (
                        <label key={key} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                          <Checkbox
                            checked={ticked.includes(key)}
                            onCheckedChange={(on) =>
                              setTicked((current) =>
                                on === true ? [...current.filter((item) => item !== key), key] : current.filter((item) => item !== key),
                              )
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="font-medium">{driver.name}</span>
                            <span className="text-muted-foreground">
                              {" · "}
                              {[t(`kind.${driver.kind}`), driver.cidb_no ? `CIDB ${driver.cidb_no}` : "", driver.company_name]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                    {stranded ? <RunningUnbindWarning running={stranded} /> : null}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {/* Unticking the driver who is running it: the explicit
                          「确定」 of a risky save (audit F1), not the plain 保存. */}
                      <Button
                        size="sm"
                        variant={stranded ? "destructive" : "default"}
                        disabled={save.isPending || !ticksChanged(machine, ticked)}
                        disabledReason={!ticksChanged(machine, ticked) ? t("unchanged") : undefined}
                        onClick={() => save.mutate({ machine, keys: ticked, confirmRunning: Boolean(stranded) })}
                      >
                        {save.isPending ? <Loader2 className="animate-spin" /> : <Check />}
                        {stranded ? t("saveUnbindRunning") : t("save")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                        {t("cancel")}
                      </Button>
                    </div>
                  </fieldset>
                ) : null}
              </li>
              );
          })}
        </ul>
      ) : null}
    </div>
  );
}
