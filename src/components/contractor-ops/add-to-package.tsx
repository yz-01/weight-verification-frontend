"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Shell } from "@/components/contractor-ops/package-shell";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/providers/auth-provider";
import { useDateFormat } from "@/lib/dates";
import type { ArchiveRecordKind } from "@/interfaces/contractor-ops";
import {
  addPackageItems,
  createEvidencePackage,
  getEvidencePackages,
} from "@/services/contractor-ops.service";

/**
 * "Put this record in a package", from the record rather than from Multi
 * Engine (T-238, D-154).
 *
 * The workspace answers "which records go in this package". This answers the
 * same question from the other end - somebody is looking at a record and knows
 * it belongs in a claim - and the two are not the same screen: here the thing
 * being chosen is the *package*, and there may be none, or ten.
 *
 * One component rather than one per column. Nine copies of the same button are
 * nine places for it to drift, and a record added from a column has to end up
 * identical to one added from the workspace, or the package stops being the
 * record of a single decision.
 *
 * ATTENDANCE_DAY is absent from PACKABLE for the reason it is absent from the
 * backend's SOURCES: a day of attendance is an aggregate with no primary key
 * and no file, and a member that points at nothing is not a member.
 */
const PACKABLE: readonly ArchiveRecordKind[] = [
  "MATERIAL_RECEIPT",
  "MATERIAL_OUTGOING",
  "EQUIPMENT_MOVEMENT",
  "HAZARD",
  "WASTE_OUTGOING",
  "DISPOSAL_REQUEST",
  "PROGRESS",
  "CONSULTANT_APPLICATION",
];

export function canGoInAPackage(kind: ArchiveRecordKind) {
  return PACKABLE.includes(kind);
}

export function AddToPackageButton({
  kind,
  recordId,
  projectId,
  reference,
}: {
  kind: ArchiveRecordKind;
  recordId: string;
  projectId: string | null;
  reference: string;
}) {
  const t = useTranslations("multiEngine");
  const { can } = useAuth();
  const [open, setOpen] = useState(false);

  /*
   * No button at all rather than a disabled one. A record of a kind that
   * cannot be packaged, or one with no project, has no package it could go
   * into - that is not a state to explain beside a grey button, it is a button
   * that does not belong on this record.
   */
  if (!can("package.manage") || !canGoInAPackage(kind) || !projectId) {
    return null;
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FolderPlus className="size-4" />
        {t("addToPackage")}
      </Button>
      {open && (
        <ChoosePackageDialog
          kind={kind}
          recordId={recordId}
          projectId={projectId}
          reference={reference}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** Pick the draft package this record joins, or start one for it. */
function ChoosePackageDialog({
  kind,
  recordId,
  projectId,
  reference,
  onClose,
}: {
  kind: ArchiveRecordKind;
  recordId: string;
  projectId: string;
  reference: string;
  onClose: () => void;
}) {
  const t = useTranslations("multiEngine");
  const common = useTranslations("common");
  const formatter = useDateFormat();
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState("");
  const [name, setName] = useState("");

  /*
   * Drafts of this record's own project only. A confirmed package refuses new
   * members (D-142) and a package belongs to one project (D-143), so any other
   * package would be an option that fails on being chosen.
   */
  const drafts = useQuery({
    queryKey: ["evidence-packages", "drafts", projectId],
    queryFn: () =>
      getEvidencePackages({
        project: projectId,
        state: "DRAFT",
        page: 1,
        page_size: 50,
      }),
  });
  const rows = drafts.data?.results ?? [];
  const starting = drafts.isSuccess && rows.length === 0;

  const done = () => {
    queryClient.invalidateQueries({ queryKey: ["evidence-packages"] });
    onClose();
  };

  const add = useMutation({
    mutationFn: () => addPackageItems(chosen, kind, [recordId]),
    onSuccess: done,
  });
  const startOne = useMutation({
    mutationFn: async () => {
      const created = await createEvidencePackage({
        project: projectId,
        name: name.trim(),
      });
      return addPackageItems(created.id, kind, [recordId]);
    },
    onSuccess: done,
  });

  return (
    <Shell title={t("addToPackage")} onClose={onClose}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
          {t("addToPackageHelp", { reference })}
        </p>

        {drafts.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : drafts.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {t("failed")}
          </p>
        ) : starting ? (
          /* No drafts: the way in is to start one, not a grey button and an
             instruction to go somewhere else and come back. */
          <div className="space-y-1.5">
            <p className="text-sm">{t("noDrafts")}</p>
            <FieldWrapper label={t("field.name")} required>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("field.namePlaceholder")}
              />
            </FieldWrapper>
          </div>
        ) : (
          <FieldWrapper label={t("chooseDraft")} required>
            <fieldset className="space-y-2">
              {rows.map((row) => (
                <label
                  key={row.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm"
                >
                  <input
                    type="radio"
                    name="package"
                    className="mt-1"
                    checked={chosen === row.id}
                    onChange={() => setChosen(row.id)}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{row.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t("itemCount", { count: row.item_count })} ·{" "}
                      {formatter.dateTime(row.created_at)}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          </FieldWrapper>
        )}
      </div>

      <footer className="flex justify-end gap-2 border-t px-4 py-3">
        <Button variant="outline" onClick={onClose}>
          {common("cancel")}
        </Button>
        {starting ? (
          <Button
            requires={[[name.trim(), t("field.name")]]}
            disabled={startOne.isPending}
            onClick={() => startOne.mutate()}
          >
            {t("startAndAdd")}
          </Button>
        ) : (
          <Button
            requires={[[chosen, t("chooseDraft")]]}
            disabled={add.isPending}
            onClick={() => add.mutate()}
          >
            {t("addToPackage")}
          </Button>
        )}
      </footer>
    </Shell>
  );
}
