"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleDot, LocateFixed, MapPinned, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import { LocationMap, type LocationMapZone } from "@/components/shared/location-map";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FieldWrapper, ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Project } from "@/interfaces/contractor";
import type { SiteGeofence, SiteGeofencePayload } from "@/interfaces/site-access";
import { getProjects } from "@/services/contractor.service";
import { createSiteGeofence, deleteSiteGeofence, getSiteGeofences, updateSiteGeofence } from "@/services/site-access.service";
import { GeofenceMapEditor } from "./geofence-map-editor";

const EMPTY: SiteGeofencePayload = {
  project: "", name: "", shape: "CIRCLE", address: "", latitude: null,
  longitude: null, radius_m: 150, polygon: [], is_primary: false, is_active: true,
};

export function GeofenceWorkspace() {
  const t = useTranslations("siteControl");
  const { can } = useAuth();
  const qc = useQueryClient();
  const [project, setProject] = useState("all");
  const [editing, setEditing] = useState<SiteGeofence | "new" | null>(null);
  const [removing, setRemoving] = useState<SiteGeofence | null>(null);
  const rows = useQuery({
    queryKey: ["site-geofences", project],
    queryFn: () => getSiteGeofences({ page_size: 200, ...(project !== "all" ? { project } : {}) }),
  });
  const projects = useQuery({
    queryKey: ["projects", "options"],
    queryFn: () => getProjects({ page_size: 100, sort_by: "name" }),
    staleTime: 60_000,
  });
  const projectOptions = useMemo(() => projects.data?.results ?? [], [projects.data?.results]);
  const remove = useMutation({
    mutationFn: deleteSiteGeofence,
    onSuccess: async () => { setRemoving(null); await qc.invalidateQueries({ queryKey: ["site-geofences"] }); },
  });
  const defaultGeofences = useMemo<Project[]>(() => {
    const activeSiteGeofences = new Set(
      (rows.data?.results ?? [])
        .filter((row) => row.is_active)
        .map((row) => row.project),
    );
    return projectOptions.filter(
      (row) =>
        (project === "all" || row.id === project) &&
        !activeSiteGeofences.has(row.id) &&
        row.latitude != null &&
        row.longitude != null &&
        row.geofence_radius_m != null &&
        row.geofence_radius_m > 0,
    );
  }, [project, projectOptions, rows.data?.results]);
  const zones = useMemo<LocationMapZone[]>(
    () => [
      ...(rows.data?.results ?? [])
        .filter((row) => row.is_active)
        .map(toMapZone),
      ...defaultGeofences.map(toDefaultMapZone),
    ],
    [defaultGeofences, rows.data?.results],
  );
  const center = useMemo<[number, number] | undefined>(() => {
    const selected = projects.data?.results.find((row) => row.id === project);
    if (selected?.latitude && selected.longitude) return [Number(selected.latitude), Number(selected.longitude)];
    const first = rows.data?.results[0];
    if (first?.latitude && first.longitude) return [Number(first.latitude), Number(first.longitude)];
    if (first?.polygon[0]) return first.polygon[0];
    const firstDefault = defaultGeofences[0];
    return firstDefault ? [Number(firstDefault.latitude), Number(firstDefault.longitude)] : undefined;
  }, [defaultGeofences, project, projects.data?.results, rows.data?.results]);

  const hasDisplayedRows = Boolean(rows.data?.count || defaultGeofences.length);

  return <div className="space-y-5">
    <ListHeader title={t("geofence.title")} subtitle={t("geofence.subtitle")} action={can("geofence.manage") ? <Button size="sm" onClick={() => setEditing("new")}><Plus />{t("geofence.new")}</Button> : undefined} />
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
      <FieldWrapper label={t("field.project")} className="min-w-64 flex-1" error={projects.isError ? t("state.projectLoadError") : undefined} hint={!projects.isLoading && !projects.isError && !projectOptions.length ? t("noProjects") : undefined}>
        <ProjectPicker value={project} onValueChange={setProject} placeholder={t("field.chooseProject")} allowAll allLabel={t("field.allProjects")} projects={projectOptions} projectsLoading={projects.isLoading} projectsError={projects.isError} />
      </FieldWrapper>
      <div className="rounded-lg bg-muted/40 px-4 py-2 text-sm"><span className="text-muted-foreground">{t("geofence.activeZones")}</span><strong className="ml-2 tabular-nums">{zones.length}</strong></div>
    </div>
    <LocationMap center={center} markers={[]} zones={zones} className="rounded-lg" />
    {rows.isLoading ? <State text={t("state.loading")} /> : rows.isError ? <State text={t("state.loadError")} danger /> : !hasDisplayedRows ? <State text={t("geofence.empty")} /> : <div className="grid gap-3 lg:grid-cols-2">
      {rows.data?.results.map((row) => <article key={row.id} className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{row.name}</h3>{row.is_primary && <StatusBadge label={t("geofence.primary")} tone="info" />}<StatusBadge label={t(row.is_active ? "status.active" : "status.inactive")} tone={row.is_active ? "positive" : "neutral"} /></div><p className="mt-1 text-sm text-muted-foreground">{row.project_name} · {t(`shape.${row.shape}`)}</p></div>{can("geofence.manage") && <div className="flex shrink-0"><Button size="icon-sm" variant="ghost" title={t("action.edit")} onClick={() => setEditing(row)}><Pencil /></Button><Button size="icon-sm" variant="ghost" title={t("action.remove")} className="text-destructive" onClick={() => setRemoving(row)}><Trash2 /></Button></div>}</div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><Info label={t("field.location")} value={row.shape === "CIRCLE" ? `${row.latitude}, ${row.longitude}` : t("geofence.pointCount", { count: row.polygon.length })} /><Info label={t("field.radius")} value={row.radius_m ? `${row.radius_m} m` : "-"} /></div>
        {row.address && <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">{row.address}</p>}
      </article>)}
      {defaultGeofences.map((defaultGeofence) => <article key={`project-default-${defaultGeofence.id}`} className="rounded-lg border border-dashed bg-muted/20 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{defaultGeofence.name}</h3><StatusBadge label={t("field.defaultRadius")} tone="info" /></div><p className="mt-1 text-sm text-muted-foreground">{defaultGeofence.code} · {t("field.project")}</p></div>{can("project.update") && <Button asChild size="icon-sm" variant="ghost" title={t("action.edit")}><Link href={`/projects/${defaultGeofence.id}/edit`}><Pencil /></Link></Button>}</div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><Info label={t("field.location")} value={`${defaultGeofence.latitude}, ${defaultGeofence.longitude}`} /><Info label={t("field.radius")} value={`${defaultGeofence.geofence_radius_m} m`} /></div>
        <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">{t("field.defaultRadius")}</p>
      </article>)}
    </div>}
    {editing && <GeofenceDialog row={editing === "new" ? null : editing} defaultProject={project === "all" ? "" : project} projects={projectOptions} projectsLoading={projects.isLoading} projectsError={projects.isError} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await qc.invalidateQueries({ queryKey: ["site-geofences"] }); }} />}
    <ConfirmDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)} title={t("geofence.removeTitle")} description={t("geofence.removeBody")} confirmLabel={t("action.remove")} isPending={remove.isPending} onConfirm={() => removing && remove.mutate(removing.id)} />
  </div>;
}

function GeofenceDialog({ row, defaultProject, projects, projectsLoading, projectsError, onClose, onSaved }: { row: SiteGeofence | null; defaultProject: string; projects: Project[]; projectsLoading: boolean; projectsError: boolean; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("siteControl");
  const [form, setForm] = useState<SiteGeofencePayload>(() => row ? { project: row.project, name: row.name, shape: row.shape, address: row.address, latitude: row.latitude, longitude: row.longitude, radius_m: row.radius_m, polygon: row.polygon, is_primary: row.is_primary, is_active: row.is_active } : { ...EMPTY, project: defaultProject });
  const [locationError, setLocationError] = useState("");
  const save = useMutation({ mutationFn: () => row ? updateSiteGeofence(row.id, form) : createSiteGeofence(form), onSuccess: onSaved });
  const selectedProject = projects.find((project) => project.id === form.project);
  const center = form.latitude && form.longitude ? [Number(form.latitude), Number(form.longitude)] as [number, number] : undefined;
  const setCenter = useCallback((point: [number, number]) => setForm((current) => ({ ...current, latitude: point[0].toFixed(7), longitude: point[1].toFixed(7) })), []);
  const setPoints = useCallback((points: Array<[number, number]>) => setForm((current) => ({ ...current, polygon: points })), []);
  const valid = Boolean(form.project && form.name.trim() && (form.shape === "CIRCLE" ? center && form.radius_m : form.polygon.length >= 3));
  function useProjectLocation() {
    if (!selectedProject?.latitude || !selectedProject.longitude) { setLocationError(t("geofence.noProjectLocation")); return; }
    setLocationError(""); setCenter([Number(selectedProject.latitude), Number(selectedProject.longitude)]);
    if (selectedProject.geofence_radius_m) setForm((current) => ({ ...current, radius_m: selectedProject.geofence_radius_m }));
  }
  function useGps() {
    setLocationError("");
    navigator.geolocation?.getCurrentPosition((position) => setCenter([position.coords.latitude, position.coords.longitude]), () => setLocationError(t("geofence.gpsError")), { enableHighAccuracy: true, timeout: 15000 });
  }
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="flex max-h-[calc(100dvh-1rem)] min-w-0 flex-col overflow-hidden sm:max-w-3xl"><DialogHeader className="min-w-0 shrink-0"><DialogTitle>{t(row ? "geofence.editTitle" : "geofence.createTitle")}</DialogTitle><DialogDescription>{t("geofence.formHelp")}</DialogDescription></DialogHeader>
    <div className="min-h-0 w-0 min-w-full max-w-full flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-1">
    <div className="grid w-full min-w-0 max-w-full gap-4 sm:grid-cols-2"><FieldWrapper label={t("field.project")} required error={projectsError ? t("state.projectLoadError") : undefined} hint={!projectsLoading && !projectsError && !projects.length ? t("noProjects") : undefined}><ProjectPicker value={form.project} onValueChange={(value) => setForm({ ...form, project: value })} placeholder={t("field.chooseProject")} disabled={Boolean(row)} projects={projects} projectsLoading={projectsLoading} projectsError={projectsError} /></FieldWrapper><FieldWrapper label={t("field.name")} required><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></FieldWrapper><FieldWrapper label={t("field.shape")}><Select value={form.shape} onValueChange={(value: "CIRCLE" | "POLYGON") => setForm({ ...form, shape: value, polygon: value === "POLYGON" ? form.polygon : [] })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CIRCLE">{t("shape.CIRCLE")}</SelectItem><SelectItem value="POLYGON">{t("shape.POLYGON")}</SelectItem></SelectContent></Select></FieldWrapper><FieldWrapper label={t("field.address")}><Input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></FieldWrapper></div>
    <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={useProjectLocation}><MapPinned />{t("geofence.useProject")}</Button><Button type="button" size="sm" variant="outline" onClick={useGps}><LocateFixed />{t("geofence.useGps")}</Button>{form.shape === "POLYGON" && <><Button type="button" size="sm" variant="outline" disabled={!form.polygon.length} onClick={() => setForm({ ...form, polygon: form.polygon.slice(0, -1) })}><RotateCcw />{t("geofence.undoPoint")}</Button><Button type="button" size="sm" variant="ghost" disabled={!form.polygon.length} onClick={() => setForm({ ...form, polygon: [] })}>{t("geofence.clearPoints")}</Button></>}</div>
    {locationError && <p className="text-sm text-destructive">{locationError}</p>}
    <div className="geofence-map-viewport block w-full min-w-0 max-w-full overflow-hidden"><GeofenceMapEditor shape={form.shape} center={center} radiusM={form.radius_m ?? 150} points={form.polygon} onCenter={setCenter} onPoints={setPoints} /></div>
    {form.shape === "CIRCLE" ? <div className="grid gap-4 sm:grid-cols-3"><FieldWrapper label={t("field.latitude")} required><Input inputMode="decimal" value={form.latitude ?? ""} onChange={(event) => setForm({ ...form, latitude: event.target.value })} /></FieldWrapper><FieldWrapper label={t("field.longitude")} required><Input inputMode="decimal" value={form.longitude ?? ""} onChange={(event) => setForm({ ...form, longitude: event.target.value })} /></FieldWrapper><FieldWrapper label={t("field.radius")} required><Input type="number" min={1} value={form.radius_m ?? ""} onChange={(event) => setForm({ ...form, radius_m: Number(event.target.value) })} /></FieldWrapper></div> : <p className="rounded-lg bg-muted/40 p-3 text-sm">{t("geofence.pointInstruction", { count: form.polygon.length })}</p>}
    <div className="grid gap-3 sm:grid-cols-2"><Toggle label={t("geofence.primary")} checked={form.is_primary} onChange={(checked) => setForm({ ...form, is_primary: checked })} /><Toggle label={t("status.active")} checked={form.is_active} onChange={(checked) => setForm({ ...form, is_active: checked })} /></div>
    </div>
    <DialogFooter className="shrink-0"><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button disabled={!valid || save.isPending} onClick={() => save.mutate()}><CircleDot />{t("action.save")}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function toMapZone(row: SiteGeofence): LocationMapZone { return row.shape === "POLYGON" ? { id: row.id, label: `${row.project_name} · ${row.name}`, points: row.polygon } : { id: row.id, label: `${row.project_name} · ${row.name}`, center: [Number(row.latitude), Number(row.longitude)], radiusM: row.radius_m ?? 1 }; }
function toDefaultMapZone(row: Project): LocationMapZone { return { id: `project-default-${row.id}`, label: `${row.name} · ${row.geofence_radius_m} m`, center: [Number(row.latitude), Number(row.longitude)], radiusM: row.geofence_radius_m ?? 1, color: "#64748b" }; }
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words font-medium">{value}</p></div>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="flex items-center justify-between rounded-lg border px-3 py-3 text-sm font-medium"><span>{label}</span><Switch checked={checked} onCheckedChange={onChange} /></label>; }
function State({ text, danger = false }: { text: string; danger?: boolean }) { return <div className={`grid min-h-36 place-items-center rounded-lg border border-dashed p-6 text-center text-sm ${danger ? "text-destructive" : "text-muted-foreground"}`}>{text}</div>; }
