"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronRight,
  Folder,
  FolderOpen,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Send,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import {
  completedFieldEvidence,
  createEmptyFieldEvidence,
  FIELD_EVIDENCE_PHOTO_COUNT,
  FieldEvidenceGrid,
  hasRequiredFieldEvidence,
} from "@/components/field-staff/field-evidence-grid";
import { LocationField } from "@/components/field-staff/location-field";
import { useAuth } from "@/components/providers/auth-provider";
import { useClearDraft, useDraftState } from "@/components/field-staff/field-draft";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import type { ProjectCategory } from "@/interfaces/contractor-ops";
import type { LocationFix } from "@/lib/field-location";
import { getProjectCategories } from "@/services/contractor-ops.service";
import { getOrCreateFieldDeviceId } from "@/services/field-access.service";
import { submitCategoryEvidenceOfflineAware } from "@/services/offline-sync.service";


export function CategoryEvidenceCapture({
  initialProject = "",
  onSaved,
}: {
  initialProject?: string;
  onSaved: () => void;
}) {
  const t = useTranslations("fieldStaffPwa.categoryEvidence");
  const commonT = useTranslations("fieldStaffPwa");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [project, setProject] = useDraftState("project", initialProject);
  const [trail, setTrail] = useState<ProjectCategory[]>([]);
  const [selected, setSelected] = useState<ProjectCategory | null>(null);
  const [evidence, setEvidence] = useDraftState("evidence", createEmptyFieldEvidence);
  const [note, setNote] = useDraftState("note", "");
  const [location, setLocation] = useDraftState<LocationFix | null>("location", null);
  const clearDraft = useClearDraft();
  const [error, setError] = useState("");

  const categories = useQuery({
    queryKey: ["project-categories", "field-staff", project],
    queryFn: () =>
      getProjectCategories({
        project,
        pwa: true,
        // Site records go in site-record columns. A material column holds a
        // delivery and its money; a photograph filed there would show on the
        // material screen as spending with no delivery order behind it.
        kind: "FIELD",
        page_size: 200,
        sort_by: "sort_order",
        sort_order: "asc",
      }),
    enabled: Boolean(project),
    staleTime: 30_000,
  });

  const rows = useMemo(() => categories.data?.results ?? [], [categories.data]);
  const rowsByParent = useMemo(() => {
    const result = new Map<string | null, ProjectCategory[]>();
    const ids = new Set(rows.map((row) => row.id));
    for (const row of rows) {
      const parent = row.parent && ids.has(row.parent) ? row.parent : null;
      result.set(parent, [...(result.get(parent) ?? []), row]);
    }
    return result;
  }, [rows]);
  const currentParent = trail.at(-1) ?? null;
  const currentRows = rowsByParent.get(currentParent?.id ?? null) ?? [];
  const photos = completedFieldEvidence(evidence);
  const labels = [
    t("photo.overview"),
    t("photo.detail"),
    t("photo.peopleEquipment"),
    t("photo.completion"),
  ];

  function resetCapture() {
    setSelected(null);
    setEvidence(createEmptyFieldEvidence());
    setNote("");
    setLocation(null);
    setError("");
  }

  function chooseProject(nextProject: string) {
    setProject(nextProject);
    setTrail([]);
    resetCapture();
  }

  function openCategory(category: ProjectCategory) {
    setError("");
    if ((rowsByParent.get(category.id) ?? []).length > 0) {
      setTrail((current) => [...current, category]);
      return;
    }
    if (!category.can_upload) {
      setError(t("uploadNotAllowed"));
      return;
    }
    // Refused here, before a single photograph is taken.
    //
    // The server checks this too and has to, but a site record submits
    // through the offline queue - so "submit" can be minutes or days after
    // "pick", and the refusal used to arrive after the photographs were
    // taken and the form was filled in. That was the customer's complaint
    // about this screen, in those words (F-230). The list already carries
    // `kind`, so this costs one comparison and moves the answer to the
    // moment the choice is made.
    if (category.kind === "MATERIAL") {
      setError(t("materialColumnRefused", { column: category.name }));
      return;
    }
    setSelected(category);
    setEvidence(createEmptyFieldEvidence());
    setNote("");
    setLocation(null);
  }

  function goUp() {
    setTrail((current) => current.slice(0, -1));
    setError("");
  }

  const save = useMutation({
    mutationFn: () => {
      if (!user || !selected || !location) throw new Error("missing_evidence");
      return submitCategoryEvidenceOfflineAware(user.id, {
        category: selected.id,
        project,
        note: note.trim(),
        captured_at: new Date().toISOString(),
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy_m: location.accuracy,
        device_id: getOrCreateFieldDeviceId(),
        client_event_id: crypto.randomUUID(),
        photos,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["field-tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["evidence"] });
      clearDraft();
      onSaved();
    },
    onError: (reason) =>
      setError(reason instanceof ApiError ? reason.message : t("submitError")),
  });

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold">{t("title")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <FieldWrapper label={t("project")} required>
        <ProjectPicker
          value={project}
          onValueChange={chooseProject}
          placeholder={t("chooseProject")}
          className="h-12 w-full"
        />
      </FieldWrapper>

      {project && !selected ? (
        <section className="space-y-3" aria-label={t("chooseCategory")}>
          <div className="flex min-h-11 items-center gap-2">
            {trail.length > 0 ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                title={commonT("action.back")}
                onClick={goUp}
              >
                <ArrowLeft />
              </Button>
            ) : (
              <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <FolderOpen className="size-5" />
              </span>
            )}
            <div className="min-w-0">
              <p className="font-semibold">
                {currentParent?.name ?? t("chooseCategory")}
              </p>
              {trail.length > 0 ? (
                <p className="truncate text-xs text-muted-foreground">
                  {trail.map((item) => item.name).join(" / ")}
                </p>
              ) : null}
            </div>
          </div>

          {categories.isLoading ? (
            <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              {t("loading")}
            </div>
          ) : categories.isError ? (
            <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">{t("loadError")}</p>
              <Button type="button" variant="outline" onClick={() => void categories.refetch()}>
                <RefreshCw />
                {commonT("action.retry")}
              </Button>
            </div>
          ) : currentRows.length === 0 ? (
            <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
              {t("noCategories")}
            </div>
          ) : (
            <div className="grid gap-3">
              {currentRows.map((category) => {
                const hasChildren = (rowsByParent.get(category.id) ?? []).length > 0;
                const disabled = !hasChildren && !category.can_upload;
                return (
                  <button
                    key={category.id}
                    type="button"
                    disabled={disabled}
                    className="flex min-h-20 w-full items-center gap-3 rounded-lg border bg-card p-4 text-left shadow-sm transition-colors active:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => openCategory(category)}
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      {disabled ? <LockKeyhole className="size-5" /> : <Folder className="size-5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold leading-5">{category.name}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {disabled
                          ? t("readOnly")
                          : hasChildren
                            ? t("openSubcategory")
                            : t("takePhotos")}
                      </span>
                    </span>
                    {!disabled ? <ChevronRight className="size-5 shrink-0 text-muted-foreground" /> : null}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {selected ? (
        <section className="space-y-5">
          <FieldWrapper label={t("chooseCategory")} required>
          <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <FolderOpen className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{selected.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[...trail, selected].map((item) => item.name).join(" / ")}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={resetCapture}>
              {t("changeCategory")}
            </Button>
          </div>
          </FieldWrapper>

          <FieldWrapper label={t("evidenceTitle")} required>
            <FieldEvidenceGrid
              labels={labels}
              files={evidence}
              progressLabel={commonT("evidenceProgress", {
                current: photos.length,
                required: FIELD_EVIDENCE_PHOTO_COUNT,
              })}
              onChange={setEvidence}
            />
          </FieldWrapper>

          {/* Compulsory, and it did not say so. The submit button refuses
              without a fix, but the only red asterisk on this screen was on
              the photos, so a worker who had taken four photos could not see
              why submit still would not go (F-202). */}
          <LocationField
            label={t("getLocation")}
            actionLabel={t("getLocation")}
            readyLabel={t("locationReady")}
            value={location}
            onChange={setLocation}
            required
          />

          <FieldWrapper label={t("note")}>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("notePlaceholder")}
              className="min-h-24"
            />
          </FieldWrapper>

          <Button
            type="button"
            className="h-12 w-full text-sm"
            requires={[[project, t("project")], [selected && selected.can_upload, t("chooseCategory")], [hasRequiredFieldEvidence(evidence), t("evidenceTitle")], [location, t("getLocation")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            {t(`submitMode.${selected.submission_mode}`)}
          </Button>
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
