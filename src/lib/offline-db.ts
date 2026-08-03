export type OfflineJobKind =
  | "ATTENDANCE"
  | "TASK_TRANSITION"
  | "TASK_PHOTO"
  | "TASK_POSITION";

export interface StoredFile {
  blob: Blob;
  name: string;
  type: string;
  lastModified: number;
}

interface OfflineJobBase {
  id: string;
  ownerId: string;
  kind: OfflineJobKind;
  queuedAt: string;
  attempts: number;
  lastError: string;
}

export interface AttendanceOfflineJob extends OfflineJobBase {
  kind: "ATTENDANCE";
  payload: {
    project: string;
    event: "CLOCK_IN" | "CLOCK_OUT";
    note: string;
    latitude?: string;
    longitude?: string;
    locationAccuracyM?: string;
    originalOccurredAt: string;
    clientEventId: string;
    photo?: StoredFile;
  };
}

export interface TaskTransitionOfflineJob extends OfflineJobBase {
  kind: "TASK_TRANSITION";
  payload: {
    taskId: string;
    state: string;
    latitude?: string;
    longitude?: string;
    notes?: string;
    reason?: string;
    originalOccurredAt: string;
    clientEventId: string;
  };
}

export interface TaskPhotoOfflineJob extends OfflineJobBase {
  kind: "TASK_PHOTO";
  payload: {
    taskId: string;
    kind: string;
    originalOccurredAt: string;
    clientEventId: string;
    file: StoredFile;
  };
}

export interface TaskPositionOfflineJob extends OfflineJobBase {
  kind: "TASK_POSITION";
  payload: {
    taskId: string;
    eventType: "POSITION" | "ARRIVAL" | "GEOFENCE_ENTER" | "GEOFENCE_EXIT";
    latitude: string;
    longitude: string;
    accuracyM?: string;
    originalOccurredAt: string;
    clientEventId: string;
  };
}

export type OfflineJob =
  | AttendanceOfflineJob
  | TaskTransitionOfflineJob
  | TaskPhotoOfflineJob
  | TaskPositionOfflineJob;

const DB_NAME = "mse-trace-offline";
const STORE_NAME = "jobs";
const DB_VERSION = 1;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (database.objectStoreNames.contains(STORE_NAME)) return;
      const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex("ownerId", "ownerId", { unique: false });
      store.createIndex("queuedAt", "queuedAt", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putOfflineJob(job: OfflineJob): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(job);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function deleteOfflineJob(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function getOfflineJobs(ownerId: string): Promise<OfflineJob[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const index = transaction.objectStore(STORE_NAME).index("ownerId");
    const jobs = await requestResult(index.getAll(ownerId) as IDBRequest<OfflineJob[]>);
    await transactionDone(transaction);
    return jobs.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  } finally {
    database.close();
  }
}

export async function countOfflineJobs(ownerId: string): Promise<number> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const index = transaction.objectStore(STORE_NAME).index("ownerId");
    const count = await requestResult(index.count(ownerId));
    await transactionDone(transaction);
    return count;
  } finally {
    database.close();
  }
}

export function storeFile(file: File): StoredFile {
  return {
    blob: file,
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
  };
}

export function restoreFile(file: StoredFile): File {
  return new File([file.blob], file.name, {
    type: file.type,
    lastModified: file.lastModified,
  });
}
