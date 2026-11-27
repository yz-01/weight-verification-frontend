"use client";

/**
 * 「所属公司」 on 编辑用户 (JB295, Lucas 11-27 final 「客户的意思是app账号的人员
 * 也做，因为是自动打卡所以会自动计算」): the company an account's person works
 * for, so 人工费用 and 人工结算单 can go by 所属公司 for App 账号 too. A company
 * from the list, or a name typed in when it is not on the list; left empty it
 * is 本公司.
 *
 * The value sent is `employer_company_key`: `""` (本公司), `<supplier uuid>`
 * or `note:<text>` - the 人员名单 convention.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { OptionCombobox } from "@/components/material-requests/option-combobox";
import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { getWorkerCompanyOptions } from "@/services/site-workers.service";

const SELF = "__self__";
export const NOTE_PREFIX = "note:";

/** What the two boxes hold: a company from the list, or a typed name. */
export interface EmployerDraft {
  supplier: string;
  supplierName: string;
  note: string;
}

/** The boxes as they open, from the saved key and name. */
export function employerDraftOf(key: string | null | undefined, name: string | null | undefined): EmployerDraft {
  const value = (key ?? "").trim();
  if (!value) return { supplier: "", supplierName: "", note: "" };
  if (value.startsWith(NOTE_PREFIX)) return { supplier: "", supplierName: "", note: value.slice(NOTE_PREFIX.length) };
  return { supplier: value, supplierName: name ?? "", note: "" };
}

/** The key the server is sent: a listed company wins over a typed name; both empty = 本公司. */
export function employerKeyOf(draft: EmployerDraft): string {
  if (draft.supplier) return draft.supplier;
  const typed = draft.note.trim();
  return typed ? `${NOTE_PREFIX}${typed}` : "";
}

export function EmployerCompanyField({
  draft,
  onChange,
  disabled,
}: {
  draft: EmployerDraft;
  onChange: (next: EmployerDraft) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("jb295");
  const common = useTranslations("common");
  const [term, setTerm] = useState("");
  const search = useDebounce(term.trim(), 300);
  const companies = useQuery({
    queryKey: ["users", "employer-options", search],
    queryFn: () => getWorkerCompanyOptions(search ? { search } : {}),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const options = [
    { value: SELF, label: t("employer.self") },
    ...(companies.data ?? [])
      .filter((option) => option.kind === "SUPPLIER")
      .map((option) => ({ value: option.value, label: option.label })),
  ];
  return (
    <div className="space-y-3 md:col-span-2" data-slot="employer-company">
      <FieldWrapper label={t("employer.label")} optional={common("optional")} hint={t("employer.hint")}>
        <OptionCombobox
          value={draft.supplier || SELF}
          onChange={(value) => {
            const picked = options.find((option) => option.value === value);
            onChange({
              ...draft,
              supplier: value === SELF ? "" : value,
              supplierName: value === SELF ? "" : (picked?.label ?? ""),
            });
          }}
          options={options}
          onSearch={setTerm}
          selectedLabel={draft.supplier ? draft.supplierName : t("employer.self")}
          placeholder={t("employer.pick")}
          searchPlaceholder={t("employer.search")}
          emptyLabel={t("employer.noMatch")}
          ariaLabel={t("employer.label")}
          disabled={disabled}
        />
        <QueryFailedNote query={companies} what={t("employer.what")} />
      </FieldWrapper>
      {!draft.supplier ? (
        <FieldWrapper label={t("employer.noteLabel")} optional={common("optional")} hint={t("employer.noteHint")}>
          <Input
            value={draft.note}
            maxLength={200}
            disabled={disabled}
            onChange={(event) => onChange({ ...draft, note: event.target.value })}
          />
        </FieldWrapper>
      ) : null}
    </div>
  );
}
