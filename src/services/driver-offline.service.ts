import { ApiError, type Paginated } from "@/interfaces/api";
import type {
  DriverDashboard,
  DriverTask,
  DriverTaskDetail,
  TaskState,
} from "@/interfaces/recycler";
import {
  deleteDriverSnapshot,
  getDriverSnapshot,
  getDriverSnapshots,
  getOfflineJobs,
  putDriverSnapshot,
} from "@/lib/offline-db";
import {
  getDriverDashboard,
  getTask,
  getTasks,
} from "@/services/recycler.service";

const TERMINAL_STATES = new Set<TaskState>([
  "COMPLETED",
  "CANCELLED",
  "FAILED",
]);

function dashboardId(ownerId: string): string {
  return `driver:${ownerId}:dashboard`;
}

function taskListId(ownerId: string): string {
  return `driver:${ownerId}:task-list`;
}

function taskDetailId(ownerId: string, taskId: string): string {
  return `driver:${ownerId}:task:${taskId}`;
}

function isOfflineFailure(error: unknown): boolean {
  return (
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    (error instanceof ApiError && error.isNetwork)
  );
}

function isTerminal(state: TaskState): boolean {
  return TERMINAL_STATES.has(state);
}

function withState<T extends DriverTask>(task: T, state: TaskState): T {
  return {
    ...task,
    state,
    is_running: !isTerminal(state),
    completed_at:
      state === "COMPLETED" ? new Date().toISOString() : task.completed_at,
  };
}

function countBucket(state: TaskState): keyof DriverDashboard["counts"] | null {
  if (state === "ASSIGNED") return "pending";
  if (state === "COMPLETED") return "completed";
  return isTerminal(state) ? null : "in_progress";
}

async function pendingPhotoCount(ownerId: string, taskId: string): Promise<number> {
  const jobs = await getOfflineJobs(ownerId);
  return jobs.filter(
    (job) => job.kind === "TASK_PHOTO" && job.payload.taskId === taskId,
  ).length;
}

async function saveTaskDetail(
  ownerId: string,
  task: DriverTaskDetail,
): Promise<DriverTaskDetail> {
  const data = {
    ...task,
    local_pending_photo_count: await pendingPhotoCount(ownerId, task.id),
  };
  if (isTerminal(task.state)) {
    await deleteDriverSnapshot(taskDetailId(ownerId, task.id));
    return data;
  }
  await putDriverSnapshot({
    id: taskDetailId(ownerId, task.id),
    ownerId,
    kind: "TASK_DETAIL",
    taskId: task.id,
    savedAt: new Date().toISOString(),
    data,
  });
  return data;
}

async function pruneTaskDetails(
  ownerId: string,
  activeTaskIds: Set<string>,
): Promise<void> {
  const snapshots = await getDriverSnapshots(ownerId);
  await Promise.all(
    snapshots
      .filter(
        (snapshot) =>
          snapshot.kind === "TASK_DETAIL" &&
          snapshot.taskId &&
          !activeTaskIds.has(snapshot.taskId),
      )
      .map((snapshot) => deleteDriverSnapshot(snapshot.id)),
  );
}

export async function getDriverDashboardOfflineAware(
  ownerId: string,
): Promise<DriverDashboard> {
  try {
    const dashboard = await getDriverDashboard();
    try {
      const current = dashboard.current_task
        ? await saveTaskDetail(ownerId, dashboard.current_task)
        : null;
      const cached: DriverDashboard = {
        ...dashboard,
        current_task: current && !isTerminal(current.state) ? current : null,
        // Notification history stays in the cloud and is never written to the device.
        latest_notifications: [],
      };
      await putDriverSnapshot({
        id: dashboardId(ownerId),
        ownerId,
        kind: "DASHBOARD",
        savedAt: new Date().toISOString(),
        data: cached,
      });
    } catch {
      // IndexedDB may be unavailable in private browsing; online work still proceeds.
    }
    return dashboard;
  } catch (error) {
    if (!isOfflineFailure(error)) throw error;
    const cached = await getDriverSnapshot<DriverDashboard>(dashboardId(ownerId)).catch(
      () => null,
    );
    if (!cached) throw error;
    return cached.data;
  }
}

export async function getDriverTasksOfflineAware(
  ownerId: string,
): Promise<Paginated<DriverTask>> {
  try {
    const page = await getTasks({ page_size: 50, today: true });
    const active = page.results.filter((task) => !isTerminal(task.state));
    const cached: Paginated<DriverTask> = {
      ...page,
      count: active.length,
      page: 1,
      total_pages: active.length > 0 ? 1 : 0,
      results: active,
    };
    try {
      await putDriverSnapshot({
        id: taskListId(ownerId),
        ownerId,
        kind: "TASK_LIST",
        savedAt: new Date().toISOString(),
        data: cached,
      });
      await pruneTaskDetails(ownerId, new Set(active.map((task) => task.id)));
    } catch {
      // Cache failures must never turn a successful API response into a page error.
    }
    return page;
  } catch (error) {
    if (!isOfflineFailure(error)) throw error;
    const cached = await getDriverSnapshot<Paginated<DriverTask>>(
      taskListId(ownerId),
    ).catch(() => null);
    if (!cached) throw error;
    return cached.data;
  }
}

export async function getDriverTaskOfflineAware(
  ownerId: string,
  taskId: string,
): Promise<DriverTaskDetail> {
  try {
    const task = await getTask(taskId);
    return await saveTaskDetail(ownerId, task).catch(() => task);
  } catch (error) {
    if (!isOfflineFailure(error)) throw error;
    const cached = await getDriverSnapshot<DriverTaskDetail>(
      taskDetailId(ownerId, taskId),
    ).catch(() => null);
    if (!cached) throw error;
    const queuedPhotos = await pendingPhotoCount(ownerId, taskId).catch(
      () => cached.data.local_pending_photo_count ?? 0,
    );
    return {
      ...cached.data,
      local_pending_photo_count: queuedPhotos,
    };
  }
}

export async function recordDriverTaskTransitionLocally(
  ownerId: string,
  taskId: string,
  state: TaskState,
): Promise<void> {
  const detail = await getDriverSnapshot<DriverTaskDetail>(
    taskDetailId(ownerId, taskId),
  );
  if (detail) {
    await putDriverSnapshot({
      ...detail,
      savedAt: new Date().toISOString(),
      data: withState(detail.data, state),
    });
  }

  const list = await getDriverSnapshot<Paginated<DriverTask>>(taskListId(ownerId));
  if (list) {
    await putDriverSnapshot({
      ...list,
      savedAt: new Date().toISOString(),
      data: {
        ...list.data,
        results: list.data.results.map((task) =>
          task.id === taskId ? withState(task, state) : task,
        ),
      },
    });
  }

  const dashboard = await getDriverSnapshot<DriverDashboard>(dashboardId(ownerId));
  if (dashboard) {
    const current = dashboard.data.current_task;
    const previousState = current?.id === taskId ? current.state : null;
    const counts = { ...dashboard.data.counts };
    if (previousState && previousState !== state) {
      const previousBucket = countBucket(previousState);
      const nextBucket = countBucket(state);
      if (previousBucket) counts[previousBucket] = Math.max(0, counts[previousBucket] - 1);
      if (nextBucket) counts[nextBucket] += 1;
    }
    await putDriverSnapshot({
      ...dashboard,
      savedAt: new Date().toISOString(),
      data: {
        ...dashboard.data,
        counts,
        current_task:
          current?.id === taskId
            ? isTerminal(state)
              ? null
              : withState(current, state)
            : current,
      },
    });
  }
}

export async function recordDriverTaskPhotoLocally(
  ownerId: string,
  taskId: string,
): Promise<void> {
  const detail = await getDriverSnapshot<DriverTaskDetail>(
    taskDetailId(ownerId, taskId),
  );
  if (detail) {
    await putDriverSnapshot({
      ...detail,
      savedAt: new Date().toISOString(),
      data: {
        ...detail.data,
        local_pending_photo_count:
          (detail.data.local_pending_photo_count ?? 0) + 1,
      },
    });
  }

  const list = await getDriverSnapshot<Paginated<DriverTask>>(taskListId(ownerId));
  if (list) {
    await putDriverSnapshot({
      ...list,
      savedAt: new Date().toISOString(),
      data: {
        ...list.data,
        results: list.data.results.map((task) =>
          task.id === taskId
            ? { ...task, photo_count: (task.photo_count ?? 0) + 1 }
            : task,
        ),
      },
    });
  }
}

async function removeTaskFromSnapshots(
  ownerId: string,
  taskId: string,
): Promise<void> {
  await deleteDriverSnapshot(taskDetailId(ownerId, taskId));

  const list = await getDriverSnapshot<Paginated<DriverTask>>(taskListId(ownerId));
  if (list) {
    const results = list.data.results.filter((task) => task.id !== taskId);
    await putDriverSnapshot({
      ...list,
      savedAt: new Date().toISOString(),
      data: { ...list.data, count: results.length, results },
    });
  }

  const dashboard = await getDriverSnapshot<DriverDashboard>(dashboardId(ownerId));
  if (dashboard?.data.current_task?.id === taskId) {
    await putDriverSnapshot({
      ...dashboard,
      savedAt: new Date().toISOString(),
      data: { ...dashboard.data, current_task: null },
    });
  }
}

export async function cleanupSettledDriverSnapshots(ownerId: string): Promise<void> {
  const jobs = await getOfflineJobs(ownerId);
  const pendingTaskIds = new Set(
    jobs.flatMap((job) => {
      if (
        job.kind === "TASK_TRANSITION" ||
        job.kind === "TASK_PHOTO" ||
        job.kind === "TASK_POSITION"
      ) {
        return [job.payload.taskId];
      }
      return [];
    }),
  );
  const snapshots = await getDriverSnapshots(ownerId);
  const settledTaskIds = snapshots.flatMap((snapshot) => {
    if (snapshot.kind !== "TASK_DETAIL" || !snapshot.taskId) return [];
    const task = snapshot.data as DriverTaskDetail;
    return isTerminal(task.state) && !pendingTaskIds.has(snapshot.taskId)
      ? [snapshot.taskId]
      : [];
  });
  await Promise.all(
    settledTaskIds.map((taskId) => removeTaskFromSnapshots(ownerId, taskId)),
  );
}
