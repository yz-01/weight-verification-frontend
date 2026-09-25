"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  FieldWrapper,
  LoadFailed,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type {
  ProjectApplicationOption,
  ProjectOptionCategory,
} from "@/interfaces/consultant-workflow";
import {
  getApplicationOptions,
  updateApplicationOption,
} from "@/services/consultant-workflow.service";

const CATEGORIES: ProjectOptionCategory[] = [
  "APPLICATION_TYPE",
  "DISCIPLINE",
  "WORK_TYPE",
  "PRIORITY",
  "ATTACHMENT_TYPE",
];

/**
 * The wording the application form offers, and the only place to fix it.
 *
 * Every project starts with a seeded list, and the form lets people add to it
 * on the spot while filing - which is why the list drifts: a typo, or two
 * near-identical entries added by two people on the same afternoon. Until now
 * nothing could correct one, so the typo was offered to everyone who filed
 * afterwards.
 *
 * Nothing here deletes. An option already named on a filed application must
 * keep existing or that application stops making sense; turning one off takes
 * it out of the picker and leaves the record intact.
 */
export function ConsultantOptionManager({ project }: { project: string }) {
  const t = useTranslations("consultantWorkflow");
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<ProjectOptionCategory>(
    "APPLICATION_TYPE",
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("");

  const rows = useQuery({
    queryKey: ["consultant-options", project, category, "manage"],
    queryFn: () => getApplicationOptions(project, category),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["consultant-options"] });

  const save = useMutation({
    mutationFn: (payload: {
      id: string;
      label?: string;
      is_active?: boolean;
    }) => updateApplicationOption(payload.id, payload),
    onSuccess: () => {
      setEditingId(null);
      setLabel("");
      refresh();
    },
  });

  const options = rows.data?.results ?? [];

  return (
    <section className="rounded-lg border bg-card shadow-sm">
      <div className="border-b p-4">
        <h2 className="font-semibold">{t("options.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("options.subtitle")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {CATEGORIES.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={value === category ? "default" : "outline"}
              onClick={() => {
                setCategory(value);
                setEditingId(null);
              }}
            >
              {t(`optionCategory.${value}`)}
            </Button>
          ))}
        </div>
      </div>

      {rows.isError ? (
        <LoadFailed onRetry={() => void rows.refetch()} />
      ) : rows.isLoading ? (
        <div className="grid min-h-24 place-items-center">
          <Loader2 className="animate-spin text-primary" />
        </div>
      ) : options.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          {t("options.empty")}
        </p>
      ) : (
        <ul className="divide-y">
          {options.map((row: ProjectApplicationOption) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
            >
              {editingId === row.id ? (
                <>
                  <FieldWrapper label={t("options.rename")} required className="w-full max-w-xs">
                    <Input
                      value={label}
                      autoFocus
                      onChange={(event) => setLabel(event.target.value)}
                    />
                  </FieldWrapper>
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      size="icon-sm"
                      variant="outline"
                      title={t("action.save")}
                      requires={[[label, t("options.rename")]]}
                      disabled={save.isPending}
                      onClick={() =>
                        save.mutate({ id: row.id, label: label.trim() })
                      }
                    >
                      {save.isPending ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Check />
                      )}
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title={t("action.cancel")}
                      onClick={() => setEditingId(null)}
                    >
                      <X />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <span className="font-mono text-xs text-muted-foreground">
                    {row.code}
                  </span>
                  <span
                    className={
                      row.is_active ? "font-medium" : "text-muted-foreground"
                    }
                  >
                    {row.label}
                  </span>
                  {row.is_default && (
                    <StatusBadge label={t("options.seeded")} tone="neutral" />
                  )}
                  <div className="ml-auto flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      {t("options.offered")}
                      <Switch
                        checked={row.is_active}
                        disabled={save.isPending}
                        onCheckedChange={(value) =>
                          save.mutate({ id: row.id, is_active: value })
                        }
                      />
                    </label>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title={t("options.rename")}
                      onClick={() => {
                        setEditingId(row.id);
                        setLabel(row.label);
                      }}
                    >
                      <Pencil />
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
