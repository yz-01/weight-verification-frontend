"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
import {
  CrewFields,
  DEFAULT_LINK_RULE,
  EMPTY_CREW,
  LinkRuleFields,
  crewPayload,
  linkRuleIsComplete,
  tripLinkRulePayload,
  type CrewValue,
  type LinkRuleValue,
} from "@/components/tasks/trip-crew";
import { TripLinkShare } from "@/components/tasks/trip-link";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/interfaces/api";
import type { WasteDispatch } from "@/interfaces/contractor";
import type { DriverTaskDetail } from "@/interfaces/recycler";
import { createTask } from "@/services/recycler.service";
import { getSitesOfflineAware } from "@/services/recycler-offline.service";

/**
 * 派车, inside 接单与派车: the one place a driver and lorry are entered.
 *
 * 「确保流程是就简单顺利的」: name, phone, plate - with drivers and plates used
 * before offered as they are typed - and one button. The link for this order
 * comes straight back, ready to copy or WhatsApp. A yard with one site is not
 * asked which; the link rule defaults to the company's own setting.
 */
export function AssignTripPanel({
  load,
  onAssigned,
}: {
  load: Pick<WasteDispatch, "id" | "dispatch_no">;
  onAssigned?: (task: DriverTaskDetail) => void;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const ownerId = user?.id ?? "";
  const [crew, setCrew] = useState<CrewValue>(EMPTY_CREW);
  const [rule, setRule] = useState<LinkRuleValue>(DEFAULT_LINK_RULE);
  const [site, setSite] = useState("");
  const [errors, setErrors] = useState<
    Partial<Record<"driver_name" | "driver_phone" | "vehicle_plate", string>>
  >({});
  const [siteError, setSiteError] = useState<string | undefined>();
  const sites = useQuery({
    queryKey: ["sites", "options"],
    queryFn: () => getSitesOfflineAware(ownerId, { page_size: 100 }),
    enabled: Boolean(ownerId),
  });
  const siteRows = sites.data?.results ?? [];
  const chosenSite = site || (siteRows.length === 1 ? siteRows[0].id : "");

  const assign = useMutation({
    mutationFn: () =>
      createTask({
        dispatch: load.id,
        site: chosenSite,
        ...crewPayload(crew),
        ...tripLinkRulePayload(rule),
      }),
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: ["incoming"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["drivers"] });
      void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      onAssigned?.(task);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.isValidation) {
        setErrors({
          driver_name: error.errors.driver_name ?? error.errors.driver,
          driver_phone: error.errors.driver_phone,
          vehicle_plate: error.errors.vehicle_plate ?? error.errors.vehicle,
        });
      }
    },
  });

  /** Each empty box says so under itself, before any round trip. */
  function submit() {
    const required = t("validation.required");
    const missing = {
      ...(crew.driverName.trim() ? {} : { driver_name: required }),
      ...(crew.driverPhone.trim() ? {} : { driver_phone: required }),
      ...(crew.vehiclePlate.trim() ? {} : { vehicle_plate: required }),
    };
    setErrors(missing);
    setSiteError(chosenSite ? undefined : required);
    if (Object.keys(missing).length > 0 || !chosenSite || !linkRuleIsComplete(rule)) {
      toast.error(t("tasks.crew.incomplete"));
      return;
    }
    assign.mutate();
  }

  const assigned = assign.data;
  if (assigned?.link_url) {
    return <TripLinkShare task={assigned} linkUrl={assigned.link_url} />;
  }

  return (
    <div className="grid gap-4 rounded-lg border p-3 md:grid-cols-2">
      <p className="text-sm font-semibold md:col-span-2">{t("tasks.crew.title")}</p>
      {siteRows.length !== 1 && (
        <FieldWrapper
          label={t("tasks.field.site")}
          required
          error={siteError}
          className="md:col-span-2"
        >
          <Select value={site} onValueChange={setSite}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {siteRows.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {`${row.code} — ${row.name}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
      )}
      <QueryFailedNote query={sites} what={t("tasks.what.sites")} className="md:col-span-2" />
      <CrewFields value={crew} onChange={setCrew} errors={errors} />
      <LinkRuleFields value={rule} onChange={setRule} />
      <Button className="md:col-span-2" disabled={assign.isPending} onClick={submit}>
        {assign.isPending ? <Loader2 className="animate-spin" /> : <Truck />}
        {t("tasks.crew.assign")}
      </Button>
    </div>
  );
}
