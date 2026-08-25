"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronRight,
  Folder,
  FolderOpen,
  Loader2,
  LocateFixed,
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
import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import type { ProjectCategory } from "@/interfaces/contractor-ops";
import { getProjectCategories } from "@/services/contractor-ops.service";
import { getOrCreateFieldDeviceId } from "@/services/field-access.service";
import { submitCategoryEvidenceOfflineAware } from "@/services/offline-sync.service";

type Coordinates = { latitude: string; longitude: string; accuracy: string };

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
  const [project, setProject] = useState(initialProject);
  const [trail, setTrail] = useState<ProjectCategory[]>([]);
  const [selected, setSelected] = useState<ProjectCategory | null>(null);
  const [evidence, setEvidence] = useState(createEmptyFieldEvidence);
  const [note, setNote] = useState("");
  const [location, setLocation] = useState<Coordinates>();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  const categories = useQuery({
    queryKey: ["project-categories", "field-staff", project],
    queryFn: () =>
      getProjectCategories({
        project,
        pwa: true,
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
    setLocation(undefined);
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
    setSelected(category);
    setEvidence(createEmptyFieldEvidence());
    setNote("");
    setLocation(undefined);
  }

  function goUp() {
    setTrail((current) => current.slice(0, -1));
    setError("");
  }

  async function locate() {
    setLocating(true);
    setError("");
    try {
      const fix = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15_000,
          maximumAge: 0,
        }),
      );
      setLocation({
        latitude: fix.coords.latitude.toFixed(7),
        longitude: fix.coords.longitude.toFixed(7),
        accuracy: fix.coords.accuracy.toFixed(2),
      });
    } catch {
      setError(t("locationError"));
    } finally {
      setLocating(false);
    }
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
      onSaved();
    },
    onError: (reason) =>
      setError(reason instanceof ApiError ? reason.message : t("submitError")),
  });

  const ready = Boolean(
    project &&
      selected &&
      selected.can_upload &&
      hasRequiredFieldEvidence(evidence) &&
      location,
  );

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

          <Button
            type="button"
            className="h-12 w-full"
            variant="outline"
            disabled={locating}
            onClick={() => void locate()}
          >
            {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
            {location ? t("locationReady") : t("getLocation")}
          </Button>

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
            className="h-14 w-full text-base"
            disabled={!ready || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            {t("submit")}
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
