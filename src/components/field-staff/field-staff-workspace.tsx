"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeCanvas } from "qrcode.react";
import {
  Camera,
  Clock3,
  Grid2X2,
  House,
  Loader2,
  LogIn,
  LogOut,
  MapPinned,
  MessagesSquare,
  ShieldAlert,
  Smartphone,
  Timer,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import { APP_VERSION } from "@/lib/app-version";
import { useRouter, useSearchParams } from "next/navigation";

import { AnnouncementDialog } from "@/components/announcements/announcement-dialog";
import { VisitorArrivalDialog } from "@/components/site-access/visitor-arrival";
import { useClearSearchParam } from "@/hooks/use-url-selection";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { FieldMyTasksCard } from "@/components/field-staff/field-my-tasks-card";
import { MyTasksPanel } from "@/components/field-staff/my-tasks-panel";
import { AvatarUpload } from "@/components/shared/avatar-upload";
import {
  MySubmissions,
  type HazardHandle,
} from "@/components/field-staff/my-submissions";
import {
  FieldRecordsPanel,
  type FieldRecordMode,
} from "@/components/field-staff/field-records-panel";
import { FieldDraft, useClearDraft, useDraftState } from "@/components/field-staff/field-draft";
import { FieldHazardsPanel } from "@/components/site-operations/field-hazards";
import { FieldCamera } from "@/components/shared/field-camera";
import { LocationField } from "@/components/field-staff/location-field";
import {
  activeFieldNav,
  fieldNavFor,
  fieldStartTab,
  fieldTabsFor,
  phoneRoleOf,
  type FieldNavKey,
} from "@/lib/field-nav";
import { EquipmentOperatePanel } from "@/components/field-staff/equipment-operate-panel";
import { FieldTalkPanel, fieldTalkUnreadQuery } from "@/components/field-staff/field-talk-panel";
import { taskRecordMode } from "@/lib/field-task-mode";
import { FIELD_OPEN_EVENT, fieldNoticeHref } from "@/lib/field-notification";
import { NoticeOpener } from "@/components/notifications/notice-opener";
import {
  asFix,
  type LocationFix,
  LocationRefused,
  requestLocation as locate,
} from "@/lib/field-location";
import { attendanceEventLabel, fenceDistanceShown, fixIsFresh } from "@/lib/attendance-fence";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { FieldWrapper, StatusBadge } from "@/components/shared/page-primitives";
import { FieldLoadNote } from "@/components/field-staff/field-load-note";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { FieldTask } from "@/interfaces/contractor-ops";
import type { AttendanceEvent, SafetyIncident } from "@/interfaces/site-operations";
import { ApiError } from "@/interfaces/api";
import { getFieldTask } from "@/services/contractor-ops.service";
import { getProjects } from "@/services/contractor.service";
import { submitAttendanceOfflineAware } from "@/services/offline-sync.service";
import { getAttendance, getSafetyIncident } from "@/services/site-operations.service";
import { createFieldPwaBootstrap } from "@/services/field-access.service";
import { useRoleLabel } from "@/lib/role-labels";
import { fieldBellCount } from "@/lib/conversation-notices";
import { fieldTodoCountQuery } from "@/services/platform-ops.service";

// 「位置」 is gone (T-321, customer item 43): the coordinates were only ever
// useful to the office, and the customer asked for four entries at the bottom.
// Reporting itself is untouched - D-226 keeps automatic positioning, the
// geofence check, arrival time and the position on every record.
// 「沟通」 and 「设备操作」 since JB104 (客户 11-05 事项 9).
type MobileTab = "home" | "tasks" | "attendance" | "records" | "incidents" | "talk" | "operate";

/**
 * JB104: the record screens each phone may open from a link. The guard's
 * 「拍照」 is the gate's own (「门岗…只保留「拍照」和「沟通」」); the operator
 * has none. Site staff keep every one, as before.
 */
function recordAllowed(role: ReturnType<typeof phoneRoleOf>, mode: FieldRecordMode | null): boolean {
  if (!mode) return true;
  if (role === "gate_guard") return mode === "gate" || mode === "visitor";
  return role === "site_staff" || role === "all_pages";
}

const NAV_ICONS: Record<FieldNavKey, typeof Camera> = {
  home: House,
  attendance: Clock3,
  records: Grid2X2,
  hazards: ShieldAlert,
  talk: MessagesSquare,
  operate: Timer,
};

/** Tailwind needs the whole class in the source: one per phone's button count. */
const NAV_COLUMNS: Record<number, string> = {
  2: "grid-cols-2",
  5: "grid-cols-5",
  6: "grid-cols-6",
};
export function FieldStaffWorkspace() {
  const searchParams = useSearchParams();
  const requestedTaskId = searchParams.get("task") ?? "";
  const requestedTab = searchParams.get("tab") as MobileTab | null;
  const requestedRecord = searchParams.get("record") as FieldRecordMode | null;
  const supplierToken = searchParams.get("supplier_token") ?? "";
  // The hazard a notification points at (T-302). The server has always put it
  // in the link - `&incident=<id>` - and nothing here read it, so a worker who
  // tapped the notice landed on an empty "report a hazard" form instead of the
  // hazard they were asked to fix: the customer's #24.
  const requestedIncidentId = searchParams.get("incident") ?? "";
  // 公司公告 (C18): the notice links here; the announcement opens over home.
  const announcement = searchParams.get("announcement");
  // An equipment entry or exit the office accepted or not (Fable B4 #15):
  // it opens under 我提交过的 on home, not the capture form the same old
  // link also names as its `record`.
  const requestedMovement = searchParams.get("movement");
  const clearAnnouncement = useClearSearchParam("announcement");
  // 访客进场确认 (I26): the host's to-do opens 「确认接待」 over home.
  const visitorArrival = searchParams.get("visitor_arrival");
  const clearVisitorArrival = useClearSearchParam("visitor_arrival");
  // JB97: one of the worker's own submissions a notice names - a record
  // corrected, a request decided, a claim paid - opens under 我提交过的 on
  // home (`my-submissions.tsx`), not the capture form, not the bare home.
  const requestedSubmission = searchParams.get("submission");
  // JB97: a push about something with no phone screen of its own names the
  // notice itself; it goes on to its item as the bell does, or opens whole.
  const notice = searchParams.get("notice");
  const clearNotice = useClearSearchParam("notice");
  const router = useRouter();
  const openNoticeHref = useCallback((href: string) => router.replace(href), [router]);

  return (
    <>
    {announcement && (
      <AnnouncementDialog id={announcement} onClose={clearAnnouncement} />
    )}
    {visitorArrival && (
      <VisitorArrivalDialog id={visitorArrival} onClose={clearVisitorArrival} />
    )}
    {notice && (
      <NoticeOpener
        id={notice}
        resolve={fieldNoticeHref}
        navigate={openNoticeHref}
        onClose={clearNotice}
      />
    )}
    <FieldStaffWorkspaceContent
      requestedTaskId={requestedTaskId}
      requestedTab={
        requestedIncidentId ? "incidents" : requestedMovement || requestedSubmission ? "home" : requestedTab
      }
      // A link to a particular hazard means that hazard, not the report form
      // the same link also names as its `record`; the same for a movement.
      requestedRecord={
        requestedIncidentId || requestedMovement || requestedSubmission ? null : requestedRecord
      }
      requestedIncidentId={requestedIncidentId}
      supplierToken={supplierToken}
    />
    </>
  );
}

function FieldStaffWorkspaceContent({
  requestedTaskId: linkedTaskId,
  requestedTab,
  requestedRecord: linkedRecord,
  requestedIncidentId: linkedIncidentId,
  supplierToken,
}: {
  requestedTaskId: string;
  requestedTab: MobileTab | null;
  requestedRecord: FieldRecordMode | null;
  requestedIncidentId: string;
  supplierToken: string;
}) {
  const t = useTranslations("fieldStaffPwa");
  const roleOf = useRoleLabel();
  const { user } = useAuth();
  // JB104: which phone this is, and so which tabs a link or a tap may open.
  const phoneRole = phoneRoleOf(user);
  const tabs = fieldTabsFor(phoneRole);
  const startTab = fieldStartTab(phoneRole) as MobileTab;
  const allowedTab = (next: string | null | undefined): next is MobileTab =>
    Boolean(next) && tabs.includes(next as string);
  // The guard's 「拍照」 is the gate's capture itself (JB104).
  const guardRecord: FieldRecordMode | null = phoneRole === "gate_guard" ? "gate" : null;
  // What a link asked for, narrowed to what this phone has.
  const requestedRecord = recordAllowed(phoneRole, linkedRecord) ? linkedRecord : null;
  const requestedTaskId = allowedTab("tasks") ? linkedTaskId : "";
  const requestedIncidentId = allowedTab("incidents") ? linkedIncidentId : "";
  const [tab, setTab] = useState<MobileTab>(
    allowedTab(requestedTab)
      ? requestedTab
      : requestedRecord && allowedTab("records")
        ? "records"
        : requestedTaskId
        ? "tasks"
        : startTab,
  );
  // Back from a hazard opened from My Tasks goes back to My Tasks.
  const [hazardFromTasks, setHazardFromTasks] = useState(false);
  const [focusedTaskId, setFocusedTaskId] = useState(requestedTaskId);
  const [activeTask, setActiveTask] = useState<FieldTask | null>(null);
  const [recordMode, setRecordMode] = useState<FieldRecordMode | null>(
    requestedRecord ?? guardRecord,
  );
  // Set two ways: by reporting one (F-277), and by tapping a hazard in
  // 「我提交过的」 (T-210). The second only ever has a history row, which is
  // why the hazards panel takes the three fields it reads rather than a whole
  // incident.
  const [openedHazard, setOpenedHazard] = useState<
    Pick<SafetyIncident, "id" | "title" | "incident_no"> | null
  >(null);
  const requestedIncident = useQuery({
    queryKey: ["field-staff", "incident", requestedIncidentId],
    // Silent (Lucas 10-30): a hazard the link cannot open - gone, or not
    // this worker's - is simply not shown; no toast, no card.
    queryFn: () => getSafetyIncident(requestedIncidentId, { silent: true }),
    enabled: Boolean(requestedIncidentId),
  });
  // Derived, not copied into state from an effect: the linked hazard is shown
  // until the worker closes it, and after that only a hazard they choose is.
  const [linkedHazardClosed, setLinkedHazardClosed] = useState(false);
  const linkedHazard =
    requestedIncident.data && !linkedHazardClosed
      ? {
          id: requestedIncident.data.id,
          title: requestedIncident.data.title,
          incident_no: requestedIncident.data.incident_no,
        }
      : null;
  const shownHazard = openedHazard ?? linkedHazard;
  const requestedTask = useQuery({
    queryKey: ["field-staff", "task", requestedTaskId],
    queryFn: () => getFieldTask(requestedTaskId),
    enabled: Boolean(requestedTaskId),
  });
  /*
   * The task a link named, for as long as it is still the one in focus.
   *
   * The `task=` in the address outlives the worker's next move - it was still
   * there after they tapped 隐患 - and the record screens fell back to it, so
   * a hazard report opened by itself, filed against the material task they
   * had looked at a moment before. Leaving the task (another tab, another
   * record, back to the grid) clears the focus, and with it this. It matters
   * more since L1: My Tasks opens every task through that link.
   */
  const linkedTask =
    requestedTask.data && requestedTask.data.id === focusedTaskId
      ? requestedTask.data
      : null;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (requestedRecord) {
        setRecordMode(requestedRecord);
        setTab("records");
        return;
      }
      if (requestedTaskId) {
        setFocusedTaskId(requestedTaskId);
        setTab("tasks");
        return;
      }
      if (allowedTab(requestedTab)) {
        setTab(requestedTab);
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `allowedTab` reads `tabs`, which follows the account
  }, [requestedRecord, requestedTab, requestedTaskId]);

  const replaceFieldUrl = (
    nextTab: MobileTab,
    nextRecord?: FieldRecordMode | null,
    nextTaskId?: string | null,
  ) => {
    const url = new URL(window.location.href);
    url.searchParams.delete("task");
    url.searchParams.delete("record");
    url.searchParams.delete("supplier_token");
    // The hazard a link named is left behind too, or the report form read it
    // again and said 「无法载入链接中的事故」 (JB75).
    url.searchParams.delete("incident");
    // A conversation a link opened is left behind with its tab (JB104).
    url.searchParams.delete("chat");
    if (nextTab === startTab) url.searchParams.delete("tab");
    else url.searchParams.set("tab", nextTab);
    if (nextRecord) url.searchParams.set("record", nextRecord);
    if (nextTaskId) url.searchParams.set("task", nextTaskId);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  };

  const openTab = (nextTab: MobileTab) => {
    setFocusedTaskId("");
    setRecordMode(null);
    setActiveTask(null);
    setTab(nextTab);
    replaceFieldUrl(nextTab);
  };

  const openRecord = (mode: FieldRecordMode) => {
    setFocusedTaskId("");
    setActiveTask(null);
    setRecordMode(mode);
    setTab("records");
    replaceFieldUrl("records", mode);
  };

  /*
   * A tap on a field link (`openFieldHref`): the address is written and the
   * screen switched here, in the same tap, the way the bottom bar does it.
   * Leaving it to the effect above did nothing when the link named the address
   * already showing - the same task tapped twice - and otherwise waited for the
   * server before anything moved, so taps on site looked dead.
   */
  useEffect(() => {
    const follow = (event: Event) => {
      event.preventDefault();
      const href = (event as CustomEvent<string>).detail;
      window.history.pushState(null, "", href);
      const params = new URL(href, window.location.origin).searchParams;
      const incident = params.get("incident");
      const movement = params.get("movement") || params.get("submission");
      const record = incident || movement ? null : (params.get("record") as FieldRecordMode | null);
      const taskId = params.get("task") ?? "";
      const named = incident ? "incidents" : movement ? "home" : (params.get("tab") as MobileTab | null);
        setActiveTask(null);
      setOpenedHazard(null);
      if (incident) setLinkedHazardClosed(false);
      // JB104: a link to a page this phone does not have opens its first page.
      const allowedRecord = recordAllowed(phoneRole, record) ? record : null;
      setFocusedTaskId(allowedTab("tasks") ? taskId : "");
      setRecordMode(allowedRecord ?? guardRecord);
      setTab(
        allowedRecord && allowedTab("records")
          ? "records"
          : taskId && allowedTab("tasks")
            ? "tasks"
            : allowedTab(named)
              ? named
              : startTab,
      );
    };
    window.addEventListener(FIELD_OPEN_EVENT, follow);
    return () => window.removeEventListener(FIELD_OPEN_EVENT, follow);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the phone's role does not change while it is open
  }, []);
  /*
   * `?tab=incidents` with no hazard to show means somebody arrived from a
   * bookmark or from one of the old 事故上报 notifications, which still build
   * `/field-staff?tab=incidents&thread=...` (F-317). Since T-211 that tab
   * renders one thing - a hazard's conversation - so on its own it would be a
   * blank screen. It falls through to the reporting form instead, the same
   * place the nav button goes.
   *
   * Derived rather than redirected. The first version of this called
   * `openRecord` from an effect and eslint was right to refuse it: setting
   * four pieces of state during an effect makes the screen render twice for
   * one decision that was already knowable. Nothing is written here, so the
   * URL stays as the link left it - honest about where the worker came from.
   *
   * What this cannot do is open the conversation the notification is about:
   * the `thread` in that link is an `IncidentReportThread` id and this room is
   * keyed by `SafetyIncident`. Resolving one to the other is T-217's job.
   */
  /*
   * JB75 (客户 10-29 晚 事项 3、7-2、7-5): a link names one hazard, so while
   * it opens the screen shows nothing else. It used to fall through to the
   * reporting form below, with this phone's draft, as if the link meant
   * 「上报工地事故」. One it cannot open is not shown at all (Lucas 10-30):
   * the worker is on the home screen, with no reason given.
   */
  const linkedHazardOpening =
    tab === "incidents" &&
    !shownHazard &&
    Boolean(requestedIncidentId) &&
    !linkedHazardClosed &&
    !requestedIncident.isError;
  const linkedHazardRefused =
    tab === "incidents" &&
    !shownHazard &&
    Boolean(requestedIncidentId) &&
    !linkedHazardClosed &&
    requestedIncident.isError;
  const hazardTabWithoutRoom =
    tab === "incidents" && !shownHazard && !linkedHazardOpening && !linkedHazardRefused;
  const shownTab: MobileTab = linkedHazardRefused ? "home" : hazardTabWithoutRoom ? "records" : tab;
  const shownRecordMode = hazardTabWithoutRoom ? "safety" : recordMode;
  /*
   * Which button the bottom navigation should light, decided once (D-166).
   * It reads the screen actually on show rather than the raw state: a
   * `?tab=incidents` link with no hazard falls through to the reporting
   * form above, and the navigation has to follow it there.
   */
  const activeNav = activeFieldNav(shownTab, shownRecordMode);
  const navKeys = fieldNavFor(phoneRole);
  // The guard's 拍照 is the gate: the client's own word for it (JB104).
  const navLabel = (key: FieldNavKey) =>
    key === "records" && phoneRole === "gate_guard" ? "nav.gatePhoto" : (`nav.${key}` as const);
  // J4: the bell's number beside 首页 - the same query, under the same key,
  // as the bell's red dot, so they are one answer.
  // query-failure: the bell says when its count fails; the menu then shows no number.
  const bellCount = useQuery({ ...fieldTodoCountQuery });
  const homeCount = fieldBellCount(bellCount.data)?.total ?? 0;
  // 沟通's own number: what is unread across my conversations (JB104).
  // query-failure: only the button's number; 沟通 itself says when its list fails.
  const talk = useQuery({ ...fieldTalkUnreadQuery });
  const talkCount = talk.data?.unread ?? 0;
  const navCounts: Partial<Record<FieldNavKey, number>> = { home: homeCount, talk: talkCount };
  const openNav = (key: FieldNavKey) => {
    if (key === "hazards") openRecord("safety");
    else if (key === "records" && guardRecord) openRecord(guardRecord);
    else openTab(key);
  };

  const projects = useQuery({
    queryKey: ["projects", "options"],
    queryFn: () => getProjects({ page_size: 100, sort_by: "name" }),
    staleTime: 60_000,
  });
  const projectNames = (projects.data?.results ?? []).map((project) => project.name);
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] min-w-0 flex-col gap-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
      <section className="-mx-4 -mt-5 border-b border-sidebar-border bg-card/60 px-4 py-5">
        <p className="text-xs font-medium text-muted-foreground">
          {t("today", { date: new Date().toLocaleDateString() })}
        </p>
        <h1 className="mt-1 text-xl font-bold leading-tight">
          {t("greeting", { name: user?.full_name ?? "" })}
        </h1>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-panel-border bg-muted/40 px-3 py-1.5 font-medium">
            {t("identity.company", { company: user?.company_name ?? "-" })}
          </span>
          <span className="rounded-full border border-panel-border bg-muted/40 px-3 py-1.5 font-medium">
            {t("identity.role", { role: user?.role_name ? roleOf(null, user.role_name) : "-" })}
          </span>
        </div>
        {projects.isError ? (
          <FieldLoadNote className="mt-3" query={projects} what={t("what.projects")} />
        ) : (
          <p className="mt-3 text-sm leading-5 text-muted-foreground">
            {t("identity.projects", {
              projects: projectNames.length
                ? projectNames.join(", ")
                : t("identity.noProject"),
            })}
          </p>
        )}
      </section>
      <FieldLoadNote query={requestedTask} what={t("what.linkedTask")} />

      {shownTab === "home" && (
        <FieldHomePanel
          onOpenHazard={(hazard) => {
            // `openTab` clears the record state first, then the hazard is set:
            // the other order loses it, because `openTab` resets everything
            // the tab switch is supposed to leave behind.
            openTab("incidents");
            setOpenedHazard(hazard);
          }}
        />
      )}
      {/*
        我的任务 / My Tasks (I1, ID14): the field tasks assigned to me and the
        EHS items I fix, one list. A hazard opens in its own room below; a
        task whose result is another record opens that form, as before.
      */}
      {shownTab === "tasks" && (
        <MyTasksPanel
          requestedTaskId={focusedTaskId}
          onOpenHazard={(hazard) => {
            openTab("incidents");
            setOpenedHazard(hazard);
            setHazardFromTasks(true);
          }}
          workflow={{
            has: (task) => taskRecordMode(task) !== null,
            open: (task) => {
              const mode = taskRecordMode(task);
              if (!mode) return;
              setActiveTask(task);
              setRecordMode(mode);
              setTab("records");
              replaceFieldUrl("records", mode, task.id);
            },
          }}
        />
      )}
      {shownTab === "attendance" && <FieldDraft scope="attendance"><FieldAttendancePanel /></FieldDraft>}
      {/* 「沟通」 on every phone, 「设备操作」 on the operator's (JB104). */}
      {shownTab === "talk" && <FieldTalkPanel />}
      {shownTab === "operate" && <EquipmentOperatePanel />}
      {shownTab === "records" && (
        <FieldRecordsPanel
          initialMode={shownRecordMode}
          initialSupplierToken={supplierToken}
          task={activeTask ?? linkedTask}
          onModeChange={(mode) => {
            setRecordMode(mode);
            if (!mode) {
              setActiveTask(null);
              setFocusedTaskId("");
            }
            replaceFieldUrl("records", mode);
          }}
          onWorkflowSaved={(mode, result) => {
            if (mode === "safety") {
              if (result?.status === "uploaded") setOpenedHazard(result.incident);
              openTab("incidents");
            }
          }}
        />
      )}
      {/*
        `incidents` is now one thing: a hazard's conversation. It is reached by
        reporting one, or by tapping a hazard in 「我提交过的」 (T-210). The tab
        key is kept because the old 事故上报 notifications still link to it -
        reaching it with no hazard falls through to the reporting form, handled
        by the effect above.
      */}
      {tab === "incidents" && shownHazard && (
        <FieldHazardsPanel
          hazard={shownHazard}
          onBack={() => {
            setOpenedHazard(null);
            setLinkedHazardClosed(true);
            openTab(hazardFromTasks ? "tasks" : "home");
            setHazardFromTasks(false);
          }}
        />
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-sidebar-border bg-background/95 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-panel backdrop-blur">
        {/*
          Each phone its own buttons (JB104, 客户 11-05 事项 9): site staff the
          four they had and 沟通; the operator 设备操作 and 沟通; the guard 拍照
          and 沟通. The column count has to match or the icons bunch to the
          left of an empty cell (T-321).

          隐患 is one tap to the reporting form (T-211), which lives inside the
          拍照 tab - which is why every button is lit by `activeFieldNav`
          alone: for one tap here, both buttons used to light (F-374).
        */}
        <div className={`mx-auto grid max-w-2xl ${NAV_COLUMNS[navKeys.length] ?? "grid-cols-5"} gap-1 px-3`}>
          {navKeys.map((key) => (
            <MobileNavButton key={key} active={activeNav === key} icon={NAV_ICONS[key]} label={t(navLabel(key))} count={navCounts[key] ?? 0} onClick={() => openNav(key)} />
          ))}
        </div>
      </nav>
      {shownTab === "home" && (
        <p className="text-center text-xs text-muted-foreground">
          {t("identity.version", {
            version: APP_VERSION,
          })}
        </p>
      )}
    </div>
  );
}

function FieldHomePanel({
  onOpenHazard,
}: {
  onOpenHazard: (hazard: HazardHandle) => void;
}) {
  const t = useTranslations("fieldStaffPwa");
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold leading-tight">{t("home.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("home.subtitle")}</p>
        </div>
      </div>
      {/*
        待办 first (T-287 / D-226): 「【我的待办】不放底部导航，放首页上方以卡片
        显示未完成数量和内容」 - and only once (L1). The task list used to
        follow it here under the same 「My tasks」 title with a count of its
        own, and the two numbers disagreed. D04 asks for one My Tasks, so the
        card is it: its rows include the tasks, each opening on the task
        screen (`?tab=tasks&task=…`), which keeps the start, photo and submit
        controls exactly where they were.

        Then the customer's own order: 「首页只需要放任务，上传头像和图2就好」 -
        tasks, then the avatar, then what I sent (T-209).
      */}
      <FieldMyTasksCard />
      {/* Field staff have no profile screen and cannot open `/profile`, and
          theirs is the picture a delivery record shows - so this is their only
          way to set it. On the home panel rather than the workspace header,
          which renders above every tab. */}
      <div className="surface-panel rounded-xl p-4">
        <AvatarUpload />
      </div>
      {/*
        Put back, not written again (T-209). This is the customer's 图2, and it
        was removed from the home along with the tile grid in `e754025`; the
        component itself survived and the driver dashboard has been rendering
        it the whole time. `field-home-composition.test.ts` guards the three
        blocks and their order, because losing this one is not a visible
        breakage - the home simply stops answering "did my work arrive".
      */}
      <MySubmissions onOpenHazard={onOpenHazard} />
      {/*
        Last, and kept although the customer did not name it: it is the only
        way to move a field session to another phone, and field staff have no
        profile screen to reach it from. Below the three named blocks rather
        than removed - see the note on the component.
      */}
      <FieldDeviceHandoff />
    </section>
  );
}

/**
 * Move this field session onto another phone.
 *
 * The API issues the link from the *bound* device only, which is the whole
 * security property: whoever is already signed in on the old phone is the one
 * saying the new phone is theirs. So this lives here, on the field portal,
 * rather than in the admin screens - an administrator has no field session to
 * call it with, and giving them the button would put a control on the screen
 * that answers 403 every time.
 *
 * The link is shown once and is short-lived. It is not stored anywhere this
 * screen can read it back, so if it is lost the answer is to issue another,
 * not to hunt for it.
 */
function FieldDeviceHandoff() {
  const t = useTranslations("fieldStaffPwa");
  const [handoff, setHandoff] = useState<{
    url: string;
    expiresAt: string;
  } | null>(null);

  const issue = useMutation({
    mutationFn: createFieldPwaBootstrap,
    // The API answers with the token, not a link. The new phone opens the same
    // deployment, so the origin this page is already served from is the right
    // one to build with - hardcoding a host would break every environment but
    // the one it was written in.
    onSuccess: (result) =>
      setHandoff({
        url: `${window.location.origin}/field-pwa-bootstrap?token=${encodeURIComponent(result.token)}`,
        expiresAt: result.expires_at,
      }),
  });

  return (
    <section className="surface-panel rounded-xl p-4">
      <p className="panel-title">{t("handoff.title")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("handoff.help")}</p>

      {handoff ? (
        <div className="mt-3 space-y-2">
          <div className="grid place-items-center rounded-lg border bg-paper p-3">
            <QRCodeCanvas value={handoff.url} size={168} />
          </div>
          <p className="break-all rounded-lg border bg-muted/30 p-3 font-mono text-xs">
            {handoff.url}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("handoff.expires", {
              at: new Date(handoff.expiresAt).toLocaleString(),
            })}
          </p>
          <p className="text-xs text-muted-foreground">{t("handoff.once")}</p>
        </div>
      ) : (
        <Button
          className="mt-3"
          variant="outline"
          disabled={issue.isPending}
          onClick={() => issue.mutate()}
        >
          <Smartphone className="size-4" />
          {t("handoff.action")}
        </Button>
      )}

      {issue.isError && (
        <p className="mt-2 text-xs text-destructive">{t("handoff.failed")}</p>
      )}
    </section>
  );
}

function MobileNavButton({ active, icon: Icon, label, onClick, count = 0 }: { active: boolean; icon: typeof Camera; label: string; onClick: () => void; count?: number }) {
  return <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className={`relative z-10 flex min-h-12 min-w-0 touch-manipulation select-none flex-col items-center justify-center gap-1 rounded-md px-1 text-xs font-medium transition-colors ${active ? "bg-primary/12 text-tone-cyan-fg" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}><span className="relative"><Icon className="size-5" />{count > 0 ? <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-destructive px-1 text-center text-2xs font-semibold leading-4 text-destructive-foreground tabular-nums" data-nav-count>{count > 99 ? "99+" : count}</span> : null}</span><span className="max-w-full truncate">{label}</span></button>;
}

function FieldAttendancePanel() {
  const t = useTranslations("fieldStaffPwa");
  const { user } = useAuth();
  const qc = useQueryClient();
  const [project, setProject] = useDraftState("project", "");
  const [event, setEvent] = useDraftState<AttendanceEvent>("event", "CLOCK_IN");
  const [selfie, setSelfie] = useDraftState<File | undefined>("selfie");
  // The position is held while the form is open, never in the saved draft: a
  // fix restored from the draft is where the phone *was*, and a 进场 went
  // through on one (2026-10-10). Older than a minute at submit, it is taken
  // again; after each submission the field asks afresh (`fixRound`).
  const [fix, setFixValue] = useState<LocationFix | null>(null);
  const [fixAt, setFixAt] = useState(0);
  const [fixRound, setFixRound] = useState(0);
  const setFix = useCallback((next: LocationFix | null) => {
    setFixValue(next);
    setFixAt(next ? Date.now() : 0);
  }, []);
  const [note, setNote] = useDraftState("note", "");
  const clearDraft = useClearDraft();
  const [error, setError] = useState("");
  const attendance = useQuery({ queryKey: ["field-staff", "attendance"], queryFn: () => getAttendance({ page_size: 30, sort_by: "occurred_at", sort_order: "desc" }) });
  const today = useMemo(() => (attendance.data?.results ?? []).filter((row) => row.user === user?.id && new Date(row.occurred_at).toDateString() === new Date().toDateString()), [attendance.data, user?.id]);
  const selectedProject = project || today[0]?.project || "";
  const submit = useMutation({
    mutationFn: async () => {
      if (!user || !selfie || !fix) throw new Error("missing");
      const current = fixIsFresh(fixAt) ? fix : await locate();
      if (current !== fix) setFix(current);
      return submitAttendanceOfflineAware(user.id, { project: selectedProject, event, note, photo: selfie, latitude: current.latitude, longitude: current.longitude, locationAccuracyM: current.accuracy });
    },
    onSuccess: () => { clearDraft(); setSelfie(undefined); setFix(null); setFixRound((round) => round + 1); setNote(""); setError(""); void qc.invalidateQueries({ queryKey: ["field-staff", "attendance"] }); },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : reason instanceof LocationRefused ? t("error.location") : t("error.action")),
  });
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold leading-tight">{t("attendance.title")}</h2>
        {attendance.isError ? (
          <FieldLoadNote query={attendance} what={t("what.attendance")} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("attendance.todayCount", { count: today.length })}</p>
        )}
      </div>
      <div className="surface-panel rounded-xl p-4">
        <FieldWrapper label={t("attendance.selectProject")} required>
          <ProjectPicker value={selectedProject} onValueChange={setProject} placeholder={t("attendance.selectProject")} className="h-11 w-full" />
        </FieldWrapper>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button className="h-12" variant={event === "CLOCK_IN" ? "default" : "outline"} onClick={() => setEvent("CLOCK_IN")}><LogIn />{t("attendance.clockIn")}</Button>
          <Button className="h-12" variant={event === "CLOCK_OUT" ? "default" : "outline"} onClick={() => setEvent("CLOCK_OUT")}><LogOut />{t("attendance.clockOut")}</Button>
        </div>
        <FieldWrapper className="mt-4" label={t("attendance.takeSelfie")} required>
          <FieldCamera label={selfie ? t("attendance.selfieReady") : t("attendance.takeSelfie")} file={selfie} fileCount={selfie ? 1 : 0} facingMode="user" onCapture={setSelfie} onClear={() => setSelfie(undefined)} />
        </FieldWrapper>
        <LocationField
          key={fixRound}
          className="mt-3"
          label={t("attendance.getLocation")}
          readyLabel={t("attendance.locationReady")}
          value={fix}
          onChange={(next) => setFix(asFix(next))}
          required
        />
        <Textarea className="mt-3" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("attendance.note")} />
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <Button className="mt-4 h-12 w-full text-sm" requires={[[selectedProject, t("attendance.selectProject")], [selfie, t("attendance.takeSelfie")], [fix, t("attendance.getLocation")]]}
                                                       disabled={submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? <Loader2 className="animate-spin" /> : event === "CLOCK_IN" ? <LogIn /> : <LogOut />}{t("attendance.submit")}</Button>
      </div>
      <div className="space-y-3">
        {attendance.isSuccess && today.length === 0 && <p className="rounded-xl border border-dashed border-panel-border p-6 text-center text-sm text-muted-foreground">{t("attendance.noRecords")}</p>}
        {today.map((row) => {
          const photoUrl = row.watermarked_photo || row.photo;
          const outsideBy = fenceDistanceShown(row);
          const mapUrl = row.latitude && row.longitude
            ? `https://www.google.com/maps?q=${row.latitude},${row.longitude}`
            : "";
          return (
            <article key={row.id} className="surface-panel rounded-xl p-4">
              <div className="flex items-start gap-3">
                {photoUrl ? (
                  <a href={photoUrl} target="_blank" rel="noreferrer" title={t("attendance.openPhoto")}>
                    <Image src={photoUrl} alt="" width={160} height={160} unoptimized className="size-16 rounded-lg object-cover" />
                  </a>
                ) : <span className="photo-hatch grid size-16 place-items-center rounded-lg"><Camera className="size-6 text-muted-foreground" /></span>}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge label={t(`attendance.${attendanceEventLabel(row)}`)} tone={row.event === "CLOCK_IN" ? "positive" : "neutral"} />
                    <StatusBadge label={t(`attendance.geofence.${row.geofence_result}`)} tone={row.geofence_result === "INSIDE" ? "positive" : row.geofence_result === "OUTSIDE" ? "danger" : "neutral"} />
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold">{row.project_name}</p>
                  <p className="text-xs text-muted-foreground">{new Date(row.occurred_at).toLocaleString()}</p>
                  {row.matched_geofence_name && <p className="mt-1 text-xs text-muted-foreground">{row.matched_geofence_name}</p>}
                  {outsideBy !== null && <p className="mt-1 text-xs text-muted-foreground">{t("attendance.distance", { distance: outsideBy })}</p>}
                </div>
              </div>
              {mapUrl && (
                <a href={mapUrl} target="_blank" rel="noreferrer" className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-lg border bg-background text-sm font-semibold text-primary">
                  <MapPinned className="size-5" />
                  {t("attendance.viewMap")}
                </a>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
