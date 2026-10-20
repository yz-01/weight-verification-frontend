"use client";

/**
 * 「选整条记录」 (J12-1, J12-2, Q12-1): whole business records to file into a
 * document - linked, never copied. One kind at a time, narrowed by project,
 * date, number, material, specification and supplier; several can be ticked,
 * across kinds, all of one project.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
import { SupplierPicker } from "@/components/shared/supplier-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDebounce } from "@/hooks/use-debounce";
import type { LinkableRecord } from "@/interfaces/document-workflow";
import type { Project } from "@/interfaces/contractor";
import { useDateFormat } from "@/lib/dates";
import { searchLinkableRecords } from "@/services/document-workflow.service";

/** The kinds a document may hold whole (the archive queue's, J12). */
export const LINKABLE_KINDS = [
  "MATERIAL_RECEIPT",
  "MATERIAL_OUTGOING",
  "EQUIPMENT_MOVEMENT",
  "HAZARD",
  "WASTE_OUTGOING",
  "DISPOSAL_REQUEST",
  "PROGRESS",
  "SUNDRY_CLAIM",
] as const;

const ALL = "__all__";

export function recordKey(record: Pick<LinkableRecord, "kind" | "id">): string {
  return `${record.kind}:${record.id}`;
}

export function RecordLinkPicker({
  projects,
  initialProject,
  selected,
  onSelectedChange,
}: {
  projects: Project[];
  initialProject?: string;
  selected: Record<string, LinkableRecord>;
  onSelectedChange: (next: Record<string, LinkableRecord>) => void;
}) {
  const t = useTranslations("documents.pickRecords");
  const kinds = useTranslations("archiveQueue.kind");
  const df = useDateFormat();
  const [kind, setKind] = useState<string>(LINKABLE_KINDS[0]);
  const [project, setProject] = useState(initialProject ?? ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [number, setNumber] = useState("");
  const [material, setMaterial] = useState("");
  const [spec, setSpec] = useState("");
  const [supplier, setSupplier] = useState("");
  const search = useDebounce(number.trim(), 300);
  const materialTerm = useDebounce(material.trim(), 300);
  const specTerm = useDebounce(spec.trim(), 300);
  const query = {
    kind,
    ...(project !== ALL ? { project } : {}),
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
    ...(search ? { search } : {}),
    ...(materialTerm ? { material: materialTerm } : {}),
    ...(specTerm ? { specification: specTerm } : {}),
    ...(supplier ? { supplier } : {}),
  };
  const records = useQuery({
    queryKey: ["documents", "linkable-records", query],
    queryFn: () => searchLinkableRecords(query),
    placeholderData: keepPreviousData,
  });
  const rows = records.data?.results ?? [];
  const toggle = (row: LinkableRecord, on: boolean) => {
    const next = { ...selected };
    if (on) next[recordKey(row)] = row;
    else delete next[recordKey(row)];
    onSelectedChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <FieldWrapper label={t("kind")}>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="w-full bg-card" aria-label={t("kind")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LINKABLE_KINDS.map((value) => (
                <SelectItem key={value} value={value}>
                  {kinds(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
        <FieldWrapper label={t("project")}>
          <Select value={project} onValueChange={setProject}>
            <SelectTrigger className="w-full bg-card" aria-label={t("project")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allProjects")}</SelectItem>
              {projects.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} ({item.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
        <FieldWrapper label={t("number")}>
          <Input value={number} onChange={(event) => setNumber(event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("dateFrom")}>
          <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("dateTo")}>
          <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("supplier")}>
          <SupplierPicker
            value={supplier}
            onChange={(id) => setSupplier(id)}
            placeholder={t("allSuppliers")}
            allowNone
            noneLabel={t("allSuppliers")}
          />
        </FieldWrapper>
        <FieldWrapper label={t("material")}>
          <Input value={material} onChange={(event) => setMaterial(event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("specification")}>
          <Input value={spec} onChange={(event) => setSpec(event.target.value)} />
        </FieldWrapper>
      </div>
      <QueryFailedNote query={records} what={t("results")} />
      {records.isSuccess && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border" data-testid="linkable-records">
          {rows.map((row) => {
            const checked = Boolean(selected[recordKey(row)]);
            return (
              <li key={recordKey(row)}>
                <label className="flex cursor-pointer items-start gap-3 p-2.5 hover:bg-muted/40">
                  <Checkbox checked={checked} onCheckedChange={(value) => toggle(row, value === true)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{row.reference}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[kinds(row.kind), row.detail, row.project_name, row.submitted_at ? df.date(row.submitted_at) : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{t("picked", { count: Object.keys(selected).length })}</p>
    </div>
  );
}
