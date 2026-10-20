"use client";

/**
 * 「规格」 filter (J2-3, Q2-2): the specifications of the material chosen
 * beside it, from Category Management - every list and report that shows
 * the 规格 column can be narrowed to one. Until a material is chosen there is
 * nothing to choose from, and it says so.
 *
 * The server counts a specification as a material target does (I18): the
 * records naming it, and the older ones whose typed words are the same.
 */

import { useTranslations } from "next-intl";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { offeredSpecs, type MaterialWithSpecs } from "@/lib/material-catalogue";
import { cn } from "@/lib/utils";

const ALL = "__all_specs__";

export function SpecFilterSelect({
  material,
  value,
  onChange,
  className,
}: {
  /** The chosen material (with its specifications), or nothing yet. */
  material: MaterialWithSpecs | null | undefined;
  value: string | undefined;
  onChange: (spec: string | undefined) => void;
  className?: string;
}) {
  const t = useTranslations("specFilter");
  // 「其他」 is not one specification: what was typed under it differs.
  const specs = offeredSpecs(material, value ?? "").filter((spec) => !spec.is_other);
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === ALL ? undefined : next)}
      disabled={!material || specs.length === 0}
    >
      <SelectTrigger className={cn("w-full sm:w-40", className)} aria-label={t("label")}>
        <SelectValue placeholder={material ? t("all") : t("materialFirst")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{material ? t("all") : t("materialFirst")}</SelectItem>
        {specs.map((spec) => (
          <SelectItem key={spec.id} value={spec.id}>
            {spec.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
