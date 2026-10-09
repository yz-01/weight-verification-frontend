"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
import { useAuth } from "@/components/providers/auth-provider";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DriverTaskPayload } from "@/interfaces/recycler";
import {
  DRIVER_LINK_CLOSE_RULES,
  matchDriverByName,
  parseIdleDays,
  plateKey,
  type DriverLinkCloseRule,
} from "@/lib/driver-link";
import {
  getDriversOfflineAware,
  getVehiclesOfflineAware,
} from "@/services/recycler-offline.service";

/**
 * Who drives, and which lorry: typed, not picked from a register.
 *
 * 「不需要新增司机账号或者车辆了」 and 「还有新增司机和新增车辆也是可以移除了」:
 * there is no driver or lorry to set up first. The office types a name, a
 * phone and a plate; drivers and plates used before are offered as the
 * office types, and picking a known driver fills in their phone and usual
 * lorry, so a repeat crew is one tap. The server matches what is typed to
 * the rows it already has (phone, plate) so history, reports and the
 * weighbridge's plate match carry on.
 */
export interface CrewValue {
  driverName: string;
  driverPhone: string;
  vehiclePlate: string;
}

export const EMPTY_CREW: CrewValue = { driverName: "", driverPhone: "", vehiclePlate: "" };

export function crewPayload(crew: CrewValue): Pick<
  DriverTaskPayload,
  "driver_name" | "driver_phone" | "vehicle_plate"
> {
  return {
    driver_name: crew.driverName.trim(),
    driver_phone: crew.driverPhone.trim(),
    vehicle_plate: crew.vehiclePlate.trim(),
  };
}

export function CrewFields({
  value,
  onChange,
  errors = {},
}: {
  value: CrewValue;
  onChange: (next: CrewValue) => void;
  /** The server's refusals, keyed by the payload field. */
  errors?: Partial<Record<"driver_name" | "driver_phone" | "vehicle_plate", string>>;
}) {
  const t = useTranslations("tasks.crew");
  const listId = useId();
  const { user } = useAuth();
  const ownerId = user?.id ?? "";
  const drivers = useQuery({
    queryKey: ["drivers", "options"],
    queryFn: () => getDriversOfflineAware(ownerId, { page_size: 100, is_active: "true" }),
    enabled: Boolean(ownerId),
  });
  const vehicles = useQuery({
    queryKey: ["vehicles", "options"],
    queryFn: () => getVehiclesOfflineAware(ownerId, { page_size: 100, is_active: "true" }),
    enabled: Boolean(ownerId),
  });
  const knownDrivers = drivers.data?.results ?? [];
  const knownPlates = vehicles.data?.results ?? [];

  function typeName(name: string) {
    const known = matchDriverByName(knownDrivers, name);
    onChange({
      ...value,
      driverName: name,
      // A driver used before: their phone and usual lorry come with them,
      // unless the office already typed something else.
      driverPhone: known && !value.driverPhone ? known.phone : value.driverPhone,
      vehiclePlate:
        known?.default_vehicle_plate && !value.vehiclePlate
          ? known.default_vehicle_plate
          : value.vehiclePlate,
    });
  }

  const plateIsKnown = knownPlates.some(
    (vehicle) => plateKey(vehicle.plate_no) === plateKey(value.vehiclePlate),
  );

  return (
    <>
      <FieldWrapper label={t("driverName")} required error={errors.driver_name}>
        <Input
          list={`${listId}-drivers`}
          autoComplete="off"
          value={value.driverName}
          onChange={(event) => typeName(event.target.value)}
        />
        <datalist id={`${listId}-drivers`}>
          {knownDrivers.map((driver) => (
            <option key={driver.id} value={driver.full_name}>
              {driver.phone}
            </option>
          ))}
        </datalist>
      </FieldWrapper>
      <FieldWrapper label={t("driverPhone")} required error={errors.driver_phone} hint={t("driverPhoneHint")}>
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={value.driverPhone}
          onChange={(event) => onChange({ ...value, driverPhone: event.target.value })}
        />
      </FieldWrapper>
      <FieldWrapper
        label={t("vehiclePlate")}
        required
        error={errors.vehicle_plate}
        hint={value.vehiclePlate && !plateIsKnown ? t("newPlateHint") : undefined}
      >
        <Input
          list={`${listId}-plates`}
          autoComplete="off"
          className="uppercase"
          value={value.vehiclePlate}
          onChange={(event) => onChange({ ...value, vehiclePlate: event.target.value })}
        />
        <datalist id={`${listId}-plates`}>
          {knownPlates.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.plate_no} />
          ))}
        </datalist>
      </FieldWrapper>
      <QueryFailedNote query={drivers} what={t("whatDrivers")} className="md:col-span-2" />
      <QueryFailedNote query={vehicles} what={t("whatPlates")} className="md:col-span-2" />
    </>
  );
}

/** "Use the company setting" in the rule picker; sends no rule at all. */
export const COMPANY_DEFAULT = "COMPANY_DEFAULT";

export interface LinkRuleValue {
  rule: DriverLinkCloseRule | typeof COMPANY_DEFAULT;
  days: string;
}

export const DEFAULT_LINK_RULE: LinkRuleValue = { rule: COMPANY_DEFAULT, days: "7" };

/** The rule as the API takes it: nothing at all for the company's own. */
export function linkRulePayload(value: LinkRuleValue): {
  close_rule?: DriverLinkCloseRule;
  idle_days?: number;
} {
  if (value.rule === COMPANY_DEFAULT) return {};
  if (value.rule === "EXPIRE_AFTER_IDLE_DAYS") {
    return { close_rule: value.rule, idle_days: parseIdleDays(value.days) ?? undefined };
  }
  return { close_rule: value.rule };
}

/** The same choice, as 派车 sends it with the trip. */
export function tripLinkRulePayload(
  value: LinkRuleValue,
): Pick<DriverTaskPayload, "link_close_rule" | "link_idle_days"> {
  const { close_rule, idle_days } = linkRulePayload(value);
  return {
    ...(close_rule ? { link_close_rule: close_rule } : {}),
    ...(idle_days ? { link_idle_days: idle_days } : {}),
  };
}

export function linkRuleIsComplete(value: LinkRuleValue): boolean {
  return value.rule !== "EXPIRE_AFTER_IDLE_DAYS" || parseIdleDays(value.days) !== null;
}

/**
 * When this trip's link stops working. Leaving it on 「按公司设置」 is the
 * normal case; the other two are the office overriding it for one trip.
 */
export function LinkRuleFields({
  value,
  onChange,
}: {
  value: LinkRuleValue;
  onChange: (next: LinkRuleValue) => void;
}) {
  const t = useTranslations("tasks.link");
  const idle = value.rule === "EXPIRE_AFTER_IDLE_DAYS";
  return (
    <>
      <FieldWrapper label={t("ruleLabel")} className={idle ? undefined : "md:col-span-2"}>
        <Select
          value={value.rule}
          onValueChange={(rule) => onChange({ ...value, rule: rule as LinkRuleValue["rule"] })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={COMPANY_DEFAULT}>{t("companyDefault")}</SelectItem>
            {DRIVER_LINK_CLOSE_RULES.map((rule) => (
              <SelectItem key={rule} value={rule}>
                {t(`ruleOption.${rule}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldWrapper>
      {idle && (
        <FieldWrapper label={t("idleDays")} required hint={t("idleDaysHint")}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            value={value.days}
            onChange={(event) => onChange({ ...value, days: event.target.value })}
          />
        </FieldWrapper>
      )}
    </>
  );
}
