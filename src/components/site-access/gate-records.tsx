"use client";

/**
 * 门岗拍照记录 (C22): what a guard photographs at the gate.
 *
 * 「原门禁流程保留；门岗保安新增拍照记录，可连续多张、不设固定张数」. The pass and
 * scan tabs beside this are untouched. One component for the office's 门禁通行
 * screen and the guard's phone, so a record looks the same from both ends.
 *
 * Every photo carries its own project, gate, guard, time and GPS - shown under
 * the photo, not only on the record - and a photo taken where the phone could
 * not say where it was says so instead of borrowing a position (D09).
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, DoorOpen, Images, Loader2, MapPin, Plus, ScanLine, Send, UserPlus, Users, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { FieldCamera } from "@/components/shared/field-camera";
import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
import { RecordConversationPanel } from "@/components/shared/record-conversation";
import { GateQrScanner } from "@/components/site-access/gate-qr-scanner";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import {
  type GateIncident,
  type GateIncidentDetail,
  type GatePassMatch,
  type GatePhoto,
  type GatePhotoDraft,
} from "@/interfaces/site-access";
import { useDateFormat } from "@/lib/dates";
import { requestLocation, type LocationFix } from "@/lib/field-location";
import {
  addGateIncidentMembers,
  addGateIncidentPhotos,
  createGateIncident,
  findGatePass,
  getGateIncident,
  getGateIncidents,
  getGateMemberOptions,
} from "@/services/site-access.service";

const PAGE_SIZE = 20;

function newEventId() {
  return `gate-${crypto.randomUUID()}`;
}

/** Ask once for where the phone is; a refusal is an answer, not an error. */
function useGateLocation() {
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [failed, setFailed] = useState(false);
  const asked = useRef(false);
  const refresh = () => {
    requestLocation()
      .then((value) => {
        setFix(value);
        setFailed(false);
      })
      .catch(() => {
        setFix(null);
        setFailed(true);
      });
  };
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    refresh();
  }, []);
  return { fix, failed, refresh };
}

export function GateRecordsPanel({
  initialProject = "",
}: {
  /** The phone's bound project, preselected on a new record. */
  initialProject?: string;
} = {}) {
  const t = useTranslations("siteControl.gateRecords");
  const { can } = useAuth();
  const search = useSearchParams();
  const [project, setProject] = useState("all");
  const [term, setTerm] = useState("");
  const [creating, setCreating] = useState(false);
  // `gate_incident`, not `incident`: the phone already reads `incident` as a
  // hazard, and a gate record's id there would open the wrong thing.
  const [openId, setOpenId] = useState<string | null>(() => search.get("gate_incident"));

  const rows = useInfiniteQuery({
    queryKey: ["gate-incidents", project, term],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      getGateIncidents({
        page: pageParam,
        page_size: PAGE_SIZE,
        sort_by: "occurred_at",
        sort_order: "desc",
        ...(project !== "all" ? { project } : {}),
        ...(term.trim() ? { search: term.trim() } : {}),
      }),
    getNextPageParam: (last, pages) =>
      pages.reduce((sum, page) => sum + page.results.length, 0) < last.count
        ? pages.length + 1
        : undefined,
  });
  const loaded = rows.data?.pages.flatMap((page) => page.results) ?? [];
  const total = rows.data?.pages[0]?.count ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <DoorOpen />
          </span>
          <div>
            <h2 className="text-base font-semibold">{t("title")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
        {can("site_access.scan") && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Camera />
            {t("new")}
          </Button>
        )}
      </div>

      <div className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2">
        <FieldWrapper label={t("field.project")}>
          <ProjectPicker
            value={project}
            onValueChange={setProject}
            placeholder={t("field.chooseProject")}
            allowAll
            allLabel={t("field.allProjects")}
          />
        </FieldWrapper>
        <FieldWrapper label={t("field.search")}>
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t("field.searchPlaceholder")}
          />
        </FieldWrapper>
      </div>

      <QueryFailedNote query={rows} what={t("what")} />
      {rows.isLoading ? (
        <Empty text={t("loading")} />
      ) : !total ? (
        <Empty text={t("empty")} />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t("count", { shown: loaded.length, total })}</p>
          <ul className="grid gap-3 md:grid-cols-2">
            {loaded.map((row) => (
              <li key={row.id}>
                <GateIncidentCard row={row} onOpen={() => setOpenId(row.id)} />
              </li>
            ))}
          </ul>
          {rows.hasNextPage && (
            <Button
              variant="outline"
              className="w-full"
              disabled={rows.isFetchingNextPage}
              onClick={() => void rows.fetchNextPage()}
            >
              {rows.isFetchingNextPage && <Loader2 className="animate-spin" />}
              {t("loadMore")}
            </Button>
          )}
        </>
      )}

      {creating && (
        <GateIncidentForm
          defaultProject={initialProject || (project === "all" ? "" : project)}
          lockProject={Boolean(initialProject)}
          onClose={() => setCreating(false)}
          onSaved={(row) => {
            setCreating(false);
            setOpenId(row.id);
          }}
        />
      )}
      {openId && <GateIncidentDetailDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function GateIncidentCard({ row, onOpen }: { row: GateIncident; onOpen: () => void }) {
  const t = useTranslations("siteControl.gateRecords");
  const df = useDateFormat();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/40"
    >
      <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
        {row.cover_photo ? (
          <img src={row.cover_photo} alt={t("photoAlt")} className="size-full object-cover" />
        ) : (
          <Images className="text-muted-foreground" />
        )}
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block font-semibold tabular-nums">{row.incident_no}</span>
        <span className="block truncate text-sm text-muted-foreground">
          {row.project_name}
          {row.gate_name ? ` · ${row.gate_name}` : ""}
        </span>
        <span className="block text-xs text-muted-foreground">
          {row.guard_name} · {df.dateTime(row.occurred_at)} · {t("photoCount", { count: row.photo_count })}
        </span>
        {row.pass_no && (
          <span className="block truncate text-xs text-muted-foreground">
            {t("linkedPass", { pass: row.pass_no, subject: row.pass_subject_name ?? "" })}
          </span>
        )}
      </span>
    </button>
  );
}

/** Photos taken but not yet saved, each with its own moment and fix. */
function PhotoTray({
  photos,
  onRemove,
}: {
  photos: GatePhotoDraft[];
  onRemove: (eventId: string) => void;
}) {
  const t = useTranslations("siteControl.gateRecords");
  const urls = useMemo(
    () => photos.map((photo) => [photo.client_event_id, URL.createObjectURL(photo.file)] as const),
    [photos],
  );
  useEffect(() => () => urls.forEach(([, url]) => URL.revokeObjectURL(url)), [urls]);
  if (!photos.length) return null;
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {urls.map(([eventId, url], index) => (
        <li key={eventId} className="relative overflow-hidden rounded-md border bg-muted">
          <img src={url} alt={t("photoNumber", { number: index + 1 })} className="aspect-square w-full object-cover" />
          <button
            type="button"
            aria-label={t("removePhoto", { number: index + 1 })}
            className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/60 text-white"
            onClick={() => onRemove(eventId)}
          >
            <X className="size-4" />
          </button>
          <span className="absolute bottom-0 left-0 right-0 bg-black/55 px-1 py-0.5 text-[10px] text-white">
            {photos[index]?.latitude ? t("gpsShort") : t("noGpsShort")}
          </span>
        </li>
      ))}
    </ul>
  );
}

function useContinuousCamera(fix: LocationFix | null) {
  const [photos, setPhotos] = useState<GatePhotoDraft[]>([]);
  const add = (file: File) =>
    setPhotos((items) => [
      ...items,
      {
        file,
        captured_at: new Date().toISOString(),
        client_event_id: newEventId(),
        ...(fix
          ? { latitude: fix.latitude, longitude: fix.longitude, accuracy_m: fix.accuracy }
          : {}),
      },
    ]);
  const remove = (eventId: string) =>
    setPhotos((items) => items.filter((item) => item.client_event_id !== eventId));
  return { photos, add, remove, clear: () => setPhotos([]) };
}

function LocationLine({ fix, failed, onRetry }: { fix: LocationFix | null; failed: boolean; onRetry: () => void }) {
  const t = useTranslations("siteControl.gateRecords");
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <MapPin className={fix ? "size-4 text-success" : "size-4 text-muted-foreground"} />
      <span className={failed ? "text-destructive" : "text-muted-foreground"}>
        {fix
          ? t("locationReady", { latitude: fix.latitude, longitude: fix.longitude })
          : failed
            ? t("locationFailed")
            : t("locating")}
      </span>
      {!fix && (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          {t("retryLocation")}
        </Button>
      )}
    </div>
  );
}

/**
 * The guard's form (Q18, 7/10): photos, then scan a pass (optional), then who
 * to talk to and the first words (optional), then send. Nothing else.
 *
 * 「门岗手机不应该有可疑人员、偷窃…这些分类，只要拍照、扫二维码、沟通、发送」.
 * The send button used to wait for a 事项类别 the customer had decided a guard
 * should not choose; it stayed grey after the photo was taken, and the reason
 * lived in a hover tooltip a phone never shows (F1). The only thing it waits
 * for now is a photo, and that is said on the form, not only in a tooltip.
 */
function GateIncidentForm({
  defaultProject,
  lockProject,
  onClose,
  onSaved,
}: {
  defaultProject: string;
  /** The phone is bound to its project; only the office chooses one. */
  lockProject: boolean;
  onClose: () => void;
  onSaved: (row: GateIncidentDetail) => void;
}) {
  const t = useTranslations("siteControl.gateRecords");
  const queryClient = useQueryClient();
  const { fix, failed, refresh } = useGateLocation();
  const camera = useContinuousCamera(fix);
  const [project, setProject] = useState(defaultProject);
  const [scanning, setScanning] = useState(false);
  const [linkedPass, setLinkedPass] = useState<GatePassMatch | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [firstMessage, setFirstMessage] = useState("");
  const eventId = useRef(newEventId());
  const showProject = !lockProject || !defaultProject;

  const people = useQuery({
    queryKey: ["gate-member-options", project],
    queryFn: () => getGateMemberOptions(project),
    enabled: Boolean(project),
  });

  const lookup = useMutation({
    mutationFn: (token: string) => findGatePass(project, token),
    onSuccess: setLinkedPass,
  });

  const save = useMutation({
    mutationFn: () =>
      createGateIncident({
        project,
        ...(linkedPass ? { access_pass: linkedPass.id } : {}),
        members,
        ...(firstMessage.trim() ? { first_message: firstMessage.trim() } : {}),
        ...(fix
          ? { latitude: fix.latitude, longitude: fix.longitude, accuracy_m: fix.accuracy }
          : {}),
        client_event_id: eventId.current,
        photos: camera.photos,
      }),
    onSuccess: (row) => {
      void queryClient.invalidateQueries({ queryKey: ["gate-incidents"] });
      onSaved(row);
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("newTitle")}</DialogTitle>
          <DialogDescription>{t("newHelp")}</DialogDescription>
        </DialogHeader>
        <QueryFailedNote query={people} what={t("whatPeople")} />
        <div className="grid gap-4">
          {showProject && (
            <FieldWrapper label={t("field.project")} required>
              <ProjectPicker
                value={project}
                onValueChange={(value) => {
                  setProject(value);
                  setLinkedPass(null);
                  lookup.reset();
                  setMembers([]);
                }}
                placeholder={t("field.chooseProject")}
              />
            </FieldWrapper>
          )}
          <FieldWrapper label={t("field.photos")} required hint={t("field.photosHint")}>
            <div className="space-y-2">
              <FieldCamera
                label={camera.photos.length ? t("takeAnother", { count: camera.photos.length }) : t("takePhoto")}
                fileCount={camera.photos.length}
                onCapture={camera.add}
                onClear={camera.clear}
              />
              <PhotoTray photos={camera.photos} onRemove={camera.remove} />
              <LocationLine fix={fix} failed={failed} onRetry={refresh} />
            </div>
          </FieldWrapper>
          <FieldWrapper label={t("scanPass")} optional={t("optional")} hint={t("scanPassHint")}>
            {linkedPass ? (
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium">{linkedPass.pass_no}</span>
                  <span className="block truncate text-muted-foreground">
                    {linkedPass.subject_name}
                    {linkedPass.vehicle_plate ? ` · ${linkedPass.vehicle_plate}` : ""}
                  </span>
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("unlinkPass")}
                  onClick={() => setLinkedPass(null)}
                >
                  <X />
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabledReason={!project ? t("chooseProjectFirst") : undefined}
                  disabled={!project || lookup.isPending}
                  onClick={() => setScanning(true)}
                >
                  {lookup.isPending ? <Loader2 className="animate-spin" /> : <ScanLine />}
                  {t("scanPassButton")}
                </Button>
                {lookup.isError && (
                  <p role="alert" className="text-sm text-destructive">
                    {lookup.error instanceof ApiError && lookup.error.status === 404
                      ? t("scanPassNotFound")
                      : lookup.error instanceof Error
                        ? lookup.error.message
                        : t("saveError")}
                  </p>
                )}
              </div>
            )}
          </FieldWrapper>
          <FieldWrapper label={t("field.members")} optional={t("optional")} hint={t("field.membersHint")}>
            <MemberChecklist
              options={people.data ?? []}
              loading={people.isLoading && Boolean(project)}
              selected={members}
              onChange={setMembers}
            />
          </FieldWrapper>
          <FieldWrapper label={t("firstMessage")} optional={t("optional")} hint={t("firstMessageHint")}>
            <Textarea
              value={firstMessage}
              maxLength={2000}
              onChange={(event) => setFirstMessage(event.target.value)}
              placeholder={t("firstMessagePlaceholder")}
            />
          </FieldWrapper>
        </div>
        {save.isError && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {save.error instanceof Error ? save.error.message : t("saveError")}
          </p>
        )}
        {!camera.photos.length && (
          <p className="text-sm text-muted-foreground">{t("photoFirst")}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            requires={[
              [project, t("field.project")],
              [camera.photos.length > 0, t("field.photos")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            {t("send", { count: camera.photos.length })}
          </Button>
        </DialogFooter>
        <GateQrScanner
          open={scanning}
          onClose={() => setScanning(false)}
          onDetected={(token) => {
            setScanning(false);
            lookup.mutate(token);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function GateEventLabel({ direction, at, gate }: { direction: string; at: string; gate: string }) {
  const t = useTranslations("siteControl");
  const df = useDateFormat();
  return (
    <>
      {t(`direction.${direction}`)} · {df.dateTime(at)}
      {gate ? ` · ${gate}` : ""}
    </>
  );
}

function MemberChecklist({
  options,
  loading,
  selected,
  onChange,
}: {
  options: { id: string; full_name: string; role_name: string }[];
  loading: boolean;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useTranslations("siteControl.gateRecords");
  if (loading) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  if (!options.length) return <p className="text-sm text-muted-foreground">{t("noMembers")}</p>;
  return (
    <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
      {options.map((person) => {
        const checked = selected.includes(person.id);
        return (
          <li key={person.id}>
            <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded px-2 hover:bg-muted/50">
              <Checkbox
                checked={checked}
                onCheckedChange={(value) =>
                  onChange(
                    value
                      ? [...selected, person.id]
                      : selected.filter((id) => id !== person.id),
                  )
                }
              />
              <span className="text-sm font-medium">{person.full_name}</span>
              {person.role_name && (
                <span className="text-xs text-muted-foreground">{person.role_name}</span>
              )}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function GateIncidentDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("siteControl.gateRecords");
  const category = useTranslations("siteControl.gateCategory");
  const df = useDateFormat();
  const { can } = useAuth();
  const detail = useQuery({
    queryKey: ["gate-incident", id],
    queryFn: () => getGateIncident(id),
  });
  const row = detail.data;
  const [adding, setAdding] = useState<"photos" | "members" | null>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{row?.incident_no ?? t("title")}</DialogTitle>
          <DialogDescription>{t("detailHelp")}</DialogDescription>
        </DialogHeader>
        <QueryFailedNote query={detail} what={t("whatOne")} />
        {detail.isLoading && <Empty text={t("loading")} />}
        {row && (
          <div className="space-y-5">
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              {/* Q18: new records carry no category; an older one keeps the one it was given. */}
              {row.category !== "OTHER" && (
                <Fact label={t("field.category")} value={category(row.category)} />
              )}
              <Fact label={t("field.project")} value={row.project_name} />
              {row.gate_name && <Fact label={t("field.gate")} value={row.gate_name} />}
              <Fact label={t("field.guard")} value={row.guard_name} />
              <Fact label={t("field.time")} value={df.dateTime(row.occurred_at)} />
              <Fact
                label={t("field.pass")}
                value={
                  row.pass_no
                    ? `${row.pass_no} · ${row.pass_subject_name ?? ""}`
                    : t("field.standalone")
                }
              />
              {row.access_event_direction && row.access_event_at && (
                <Fact
                  label={t("field.event")}
                  value={<GateEventLabel direction={row.access_event_direction} at={row.access_event_at} gate="" />}
                />
              )}
              {row.description && (
                <Fact label={t("field.description")} value={row.description} wide />
              )}
            </div>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{t("photosTitle", { count: row.photos.length })}</h3>
                {can("site_access.scan") && (
                  <Button size="sm" variant="outline" onClick={() => setAdding("photos")}>
                    <Plus />
                    {t("addPhotos")}
                  </Button>
                )}
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {row.photos.map((photo, index) => (
                  <li key={photo.id}>
                    <GatePhotoCard photo={photo} number={index + 1} projectName={row.project_name} />
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Users className="size-4" />
                  {t("membersTitle")}
                </h3>
                {can("site_access.scan") && (
                  <Button size="sm" variant="outline" onClick={() => setAdding("members")}>
                    <UserPlus />
                    {t("addMembers")}
                  </Button>
                )}
              </div>
              {row.members.length ? (
                <ul className="flex flex-wrap gap-2">
                  {row.members.map((member) => (
                    <li key={member.id} className="rounded-full border px-3 py-1 text-sm">
                      {member.full_name}
                      {member.role_name ? (
                        <span className="text-muted-foreground"> · {member.role_name}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noMembersYet")}</p>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold">{t("conversationTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("conversationHelp")}</p>
              <RecordConversationPanel kind="GATE_INCIDENT" recordId={row.id} />
            </section>
          </div>
        )}
        {row && adding === "photos" && (
          <AddPhotosDialog incident={row} onClose={() => setAdding(null)} />
        )}
        {row && adding === "members" && (
          <AddMembersDialog incident={row} onClose={() => setAdding(null)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Fact({ label, value, wide = false }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 rounded-md border bg-muted/20 p-2.5 ${wide ? "sm:col-span-3" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 whitespace-pre-wrap break-words font-medium">{value}</div>
    </div>
  );
}

function GatePhotoCard({ photo, number, projectName }: { photo: GatePhoto; number: number; projectName: string }) {
  const t = useTranslations("siteControl.gateRecords");
  const df = useDateFormat();
  const src = photo.watermarked_image || photo.image;
  return (
    <figure className="overflow-hidden rounded-lg border bg-card">
      <a href={src} target="_blank" rel="noreferrer">
        <img src={src} alt={t("photoNumber", { number })} className="aspect-[4/3] w-full bg-muted object-cover" />
      </a>
      <figcaption className="space-y-0.5 p-2 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">{projectName}</p>
        <p>
          {photo.gate_name ? `${t("field.gate")}: ${photo.gate_name} · ` : ""}
          {t("field.guard")}: {photo.guard_name}
        </p>
        <p>{df.dateTime(photo.captured_at)}</p>
        <p>
          {photo.latitude && photo.longitude
            ? t("gpsValue", { latitude: photo.latitude, longitude: photo.longitude })
            : t("gpsUnavailable")}
        </p>
      </figcaption>
    </figure>
  );
}

function AddPhotosDialog({ incident, onClose }: { incident: GateIncidentDetail; onClose: () => void }) {
  const t = useTranslations("siteControl.gateRecords");
  const queryClient = useQueryClient();
  const { fix, failed, refresh } = useGateLocation();
  const camera = useContinuousCamera(fix);
  const save = useMutation({
    mutationFn: () =>
      addGateIncidentPhotos(
        incident.id,
        camera.photos,
        fix ? { latitude: fix.latitude, longitude: fix.longitude, accuracy_m: fix.accuracy } : undefined,
      ),
    onSuccess: (row) => {
      queryClient.setQueryData(["gate-incident", incident.id], row);
      void queryClient.invalidateQueries({ queryKey: ["gate-incidents"] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("addPhotos")}</DialogTitle>
          <DialogDescription>{incident.incident_no}</DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("field.photos")} required hint={t("field.photosHint")}>
          <div className="space-y-2">
            <FieldCamera
              label={camera.photos.length ? t("takeAnother", { count: camera.photos.length }) : t("takePhoto")}
              fileCount={camera.photos.length}
              onCapture={camera.add}
              onClear={camera.clear}
            />
            <PhotoTray photos={camera.photos} onRemove={camera.remove} />
            <LocationLine fix={fix} failed={failed} onRetry={refresh} />
          </div>
        </FieldWrapper>
        {save.isError && (
          <p role="alert" className="text-sm text-destructive">
            {save.error instanceof Error ? save.error.message : t("saveError")}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            requires={[[camera.photos.length > 0, t("field.photos")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending && <Loader2 className="animate-spin" />}
            {t("save", { count: camera.photos.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddMembersDialog({ incident, onClose }: { incident: GateIncidentDetail; onClose: () => void }) {
  const t = useTranslations("siteControl.gateRecords");
  const queryClient = useQueryClient();
  const [members, setMembers] = useState<string[]>([]);
  const people = useQuery({
    queryKey: ["gate-member-options", incident.project],
    queryFn: () => getGateMemberOptions(incident.project),
  });
  const already = new Set(incident.members.map((member) => member.user));
  const options = (people.data ?? []).filter((person) => !already.has(person.id));
  const save = useMutation({
    mutationFn: () => addGateIncidentMembers(incident.id, members),
    onSuccess: (row) => {
      queryClient.setQueryData(["gate-incident", incident.id], row);
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("addMembers")}</DialogTitle>
          <DialogDescription>{t("field.membersHint")}</DialogDescription>
        </DialogHeader>
        <QueryFailedNote query={people} what={t("whatPeople")} />
        <FieldWrapper label={t("field.members")} required>
          <MemberChecklist
            options={options}
            loading={people.isLoading}
            selected={members}
            onChange={setMembers}
          />
        </FieldWrapper>
        {save.isError && (
          <p role="alert" className="text-sm text-destructive">
            {save.error instanceof Error ? save.error.message : t("saveError")}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            requires={[[members.length > 0, t("field.members")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending && <Loader2 className="animate-spin" />}
            {t("addMembers")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
