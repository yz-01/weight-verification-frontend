export type OfflineJobKind =
  | "ATTENDANCE"
  | "TASK_TRANSITION"
  | "TASK_PHOTO"
  | "TASK_POSITION"
  | "FIELD_TASK_TRANSITION"
  | "FIELD_TASK_PHOTO"
  | "MATERIAL_RECEIPT"
  | "EQUIPMENT_MOVEMENT"
  | "SITE_PROGRESS"
  | "MATERIAL_OUTGOING"
  | "WASTE_OUTGOING"
  | "DISPOSAL_REQUEST"
  | "SAFETY_INCIDENT"
  | "CONSULTANT_SUBMISSION"
  | "CATEGORY_EVIDENCE"
  | "DISPATCH_ACCEPT"
  | "DISPATCH_COLLECT"
  | "TRIP_ASSIGN";

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
    latitude?: string;
    longitude?: string;
    file: StoredFile;
  };
}

export interface TaskPositionOfflineJob extends OfflineJobBase {
  kind: "TASK_POSITION";
  payload: {
    taskId: string;
    eventType:
      | "POSITION"
      | "ARRIVAL"
      | "GEOFENCE_ENTER"
      | "GEOFENCE_EXIT"
      | "NAVIGATION_START"
      | "NAVIGATION_RETURN";
    latitude: string;
    longitude: string;
    accuracyM?: string;
    originalOccurredAt: string;
    clientEventId: string;
  };
}

export interface FieldTaskTransitionOfflineJob extends OfflineJobBase {
  kind: "FIELD_TASK_TRANSITION";
  payload: {
    taskId: string;
    status: "IN_PROGRESS" | "SUBMITTED";
    note: string;
    latitude?: string;
    longitude?: string;
    accuracyM?: string;
    originalOccurredAt: string;
    clientEventId: string;
  };
}

export interface FieldTaskPhotoOfflineJob extends OfflineJobBase {
  kind: "FIELD_TASK_PHOTO";
  payload: {
    taskId: string;
    caption: string;
    capturedAt: string;
    latitude?: string;
    longitude?: string;
    accuracyM?: string;
    deviceId?: string;
    clientEventId: string;
    file: StoredFile;
  };
}

export interface MaterialReceiptOfflineJob extends OfflineJobBase {
  kind: "MATERIAL_RECEIPT";
  payload: {
    receipt: {
      project: string;
      supplier: string;
      qr_code?: string | null;
      movement_type?: "ENTRY" | "RETURN";
      return_reason?: string;
      material_name: string;
      material_specification?: string;
      quantity: string;
      unit: "TONNE" | "KG" | "M3" | "PIECE" | "LOAD" | "BAG";
      total_weight_kg?: string | null;
      /** The material column, or null for a delivery taken unfiled. */
      category?: string | null;
      unit_price?: string | null;
      vehicle_plate?: string;
      delivery_note_no?: string;
      notes?: string;
      received_by_name: string;
      original_captured_at?: string;
      client_event_id?: string;
      field_task?: string;
      latitude?: string | null;
      longitude?: string | null;
      location_accuracy_m?: string | null;
      ocr_proof?: string;
    };
    signature: StoredFile;
    supplierSignature: StoredFile;
    deliveryNotePhoto?: StoredFile;
    sitePhotos: StoredFile[];
    deviceId: string;
  };
}

export interface EquipmentMovementOfflineJob extends OfflineJobBase {
  kind: "EQUIPMENT_MOVEMENT";
  payload: {
    project: string;
    equipment: string;
    direction: "ENTRY" | "EXIT";
    quantity?: string;
    unit?: "UNIT" | "PIECE" | "SET" | "LOAD" | "TONNE" | "KG" | "M3" | "OTHER";
    delivery_note_no?: string;
    vehicle_plate?: string;
    operator_name: string;
    latitude?: string;
    longitude?: string;
    accuracy_m?: string;
    notes?: string;
    ocr_confirmed?: boolean;
    original_occurred_at: string;
    client_event_id: string;
    field_task?: string;
    photos: StoredFile[];
    delivery_note_photo?: StoredFile;
  };
}

export interface SiteProgressOfflineJob extends OfflineJobBase {
  kind: "SITE_PROGRESS";
  payload: {
    project: string;
    phase: string;
    percent_complete: string;
    description?: string;
    captured_at: string;
    latitude?: string;
    longitude?: string;
    client_event_id: string;
    field_task?: string;
    photos: StoredFile[];
  };
}

export interface MaterialOutgoingOfflineJob extends OfflineJobBase {
  kind: "MATERIAL_OUTGOING";
  payload: {
    project: string;
    material_name: string;
    quantity: string;
    unit: string;
    destination: string;
    executor_name: string;
    vehicle_plate?: string;
    delivery_note_no?: string;
    reason: string;
    latitude?: string;
    longitude?: string;
    client_event_id: string;
    field_task?: string;
    photos: StoredFile[];
    photo_captions?: string[];
  };
}

export interface WasteOutgoingOfflineJob extends OfflineJobBase {
  kind: "WASTE_OUTGOING";
  payload: {
    project: string;
    category: string;
    quantity?: string;
    unit?: string;
    note?: string;
    pickup_address?: string;
    latitude: string;
    longitude: string;
    device_id?: string;
    client_event_id: string;
    field_task?: string;
    photos: StoredFile[];
  };
}

export interface DisposalRequestOfflineJob extends OfflineJobBase {
  kind: "DISPOSAL_REQUEST";
  payload: {
    project: string;
    waste_description: string;
    location_description: string;
    estimated_volume_m3?: string;
    estimated_weight_kg?: string;
    preferred_at?: string;
    request_note?: string;
    captured_at: string;
    latitude: string;
    longitude: string;
    accuracy_m: string;
    client_event_id: string;
    field_task?: string;
    photos: StoredFile[];
  };
}

export interface SafetyIncidentOfflineJob extends OfflineJobBase {
  kind: "SAFETY_INCIDENT";
  payload: {
    project: string;
    /** Optional since T-189: the field app no longer asks for a column. */
    category?: string;
    title: string;
    description: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    occurred_at?: string;
    client_event_id: string;
    field_task?: string;
    latitude?: string;
    longitude?: string;
    photos: StoredFile[];
    notify_users?: string[];
  };
}

export interface ConsultantSubmissionOfflineJob extends OfflineJobBase {
  kind: "CONSULTANT_SUBMISSION";
  payload: {
    project: string;
    note?: string;
    application_category: string;
    description: string;
    work_location?: string;
    captured_at: string;
    latitude: string;
    longitude: string;
    accuracy_m?: string;
    device_id?: string;
    client_event_id: string;
    field_task?: string;
    photos: StoredFile[];
  };
}

export interface CategoryEvidenceOfflineJob extends OfflineJobBase {
  kind: "CATEGORY_EVIDENCE";
  payload: {
    category: string;
    project: string;
    note?: string;
    captured_at: string;
    latitude: string;
    longitude: string;
    accuracy_m?: string;
    device_id: string;
    client_event_id: string;
    photos: StoredFile[];
  };
}

export interface DispatchAcceptOfflineJob extends OfflineJobBase {
  kind: "DISPATCH_ACCEPT";
  payload: {
    dispatchId: string;
    dispatchNo: string;
    recyclerReference: string;
    proposedCollectionAt: string;
    proposedCollectionNote: string;
    clientEventId: string;
  };
}

export interface DispatchCollectOfflineJob extends OfflineJobBase {
  kind: "DISPATCH_COLLECT";
  payload: {
    dispatchId: string;
    dispatchNo: string;
    recyclerReference: string;
    clientEventId: string;
  };
}

export interface TripAssignOfflineJob extends OfflineJobBase {
  kind: "TRIP_ASSIGN";
  payload: {
    dispatchId: string;
    dispatchNo: string;
    site: string;
    vehicle: string;
    driver: string;
    scheduledFor: string | null;
    notes: string;
    clientEventId: string;
  };
}

export type OfflineJob =
  | AttendanceOfflineJob
  | TaskTransitionOfflineJob
  | TaskPhotoOfflineJob
  | TaskPositionOfflineJob
  | FieldTaskTransitionOfflineJob
  | FieldTaskPhotoOfflineJob
  | MaterialReceiptOfflineJob
  | EquipmentMovementOfflineJob
  | SiteProgressOfflineJob
  | MaterialOutgoingOfflineJob
  | WasteOutgoingOfflineJob
  | DisposalRequestOfflineJob
  | SafetyIncidentOfflineJob
  | ConsultantSubmissionOfflineJob
  | CategoryEvidenceOfflineJob
  | DispatchAcceptOfflineJob
  | DispatchCollectOfflineJob
  | TripAssignOfflineJob;

const DB_NAME = "mse-trace-offline";
const STORE_NAME = "jobs";
const DRIVER_SNAPSHOT_STORE = "driverSnapshots";
const RECYCLER_SNAPSHOT_STORE = "recyclerSnapshots";
const DB_VERSION = 3;

export type DriverSnapshotKind = "DASHBOARD" | "TASK_LIST" | "TASK_DETAIL";

export interface DriverSnapshot<T = unknown> {
  id: string;
  ownerId: string;
  kind: DriverSnapshotKind;
  taskId?: string;
  savedAt: string;
  data: T;
}

export type RecyclerSnapshotKind =
  | "INCOMING"
  | "INCOMING_SUMMARY"
  | "TASK_LIST"
  | "SITES"
  | "VEHICLES"
  | "DRIVERS";

export interface RecyclerSnapshot<T = unknown> {
  id: string;
  ownerId: string;
  kind: RecyclerSnapshotKind;
  savedAt: string;
  data: T;
}

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
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("ownerId", "ownerId", { unique: false });
        store.createIndex("queuedAt", "queuedAt", { unique: false });
      }
      if (!database.objectStoreNames.contains(DRIVER_SNAPSHOT_STORE)) {
        const store = database.createObjectStore(DRIVER_SNAPSHOT_STORE, {
          keyPath: "id",
        });
        store.createIndex("ownerId", "ownerId", { unique: false });
        store.createIndex("taskId", "taskId", { unique: false });
      }
      if (!database.objectStoreNames.contains(RECYCLER_SNAPSHOT_STORE)) {
        const store = database.createObjectStore(RECYCLER_SNAPSHOT_STORE, {
          keyPath: "id",
        });
        store.createIndex("ownerId", "ownerId", { unique: false });
      }
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

export async function putDriverSnapshot<T>(
  snapshot: DriverSnapshot<T>,
): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(DRIVER_SNAPSHOT_STORE, "readwrite");
    transaction.objectStore(DRIVER_SNAPSHOT_STORE).put(snapshot);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function getDriverSnapshot<T>(
  id: string,
): Promise<DriverSnapshot<T> | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(DRIVER_SNAPSHOT_STORE, "readonly");
    const snapshot = await requestResult(
      transaction.objectStore(DRIVER_SNAPSHOT_STORE).get(id) as IDBRequest<
        DriverSnapshot<T> | undefined
      >,
    );
    await transactionDone(transaction);
    return snapshot ?? null;
  } finally {
    database.close();
  }
}

export async function getDriverSnapshots(
  ownerId: string,
): Promise<DriverSnapshot[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(DRIVER_SNAPSHOT_STORE, "readonly");
    const index = transaction.objectStore(DRIVER_SNAPSHOT_STORE).index("ownerId");
    const snapshots = await requestResult(
      index.getAll(ownerId) as IDBRequest<DriverSnapshot[]>,
    );
    await transactionDone(transaction);
    return snapshots;
  } finally {
    database.close();
  }
}

export async function deleteDriverSnapshot(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(DRIVER_SNAPSHOT_STORE, "readwrite");
    transaction.objectStore(DRIVER_SNAPSHOT_STORE).delete(id);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function clearDriverSnapshots(ownerId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(DRIVER_SNAPSHOT_STORE, "readwrite");
    const index = transaction.objectStore(DRIVER_SNAPSHOT_STORE).index("ownerId");
    const keys = await requestResult(index.getAllKeys(ownerId));
    for (const key of keys) {
      transaction.objectStore(DRIVER_SNAPSHOT_STORE).delete(key);
    }
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function putRecyclerSnapshot<T>(
  snapshot: RecyclerSnapshot<T>,
): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(
      RECYCLER_SNAPSHOT_STORE,
      "readwrite",
    );
    transaction.objectStore(RECYCLER_SNAPSHOT_STORE).put(snapshot);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function getRecyclerSnapshot<T>(
  id: string,
): Promise<RecyclerSnapshot<T> | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(
      RECYCLER_SNAPSHOT_STORE,
      "readonly",
    );
    const snapshot = await requestResult(
      transaction.objectStore(RECYCLER_SNAPSHOT_STORE).get(id) as IDBRequest<
        RecyclerSnapshot<T> | undefined
      >,
    );
    await transactionDone(transaction);
    return snapshot ?? null;
  } finally {
    database.close();
  }
}

export async function clearRecyclerSnapshots(ownerId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(
      RECYCLER_SNAPSHOT_STORE,
      "readwrite",
    );
    const index = transaction
      .objectStore(RECYCLER_SNAPSHOT_STORE)
      .index("ownerId");
    const keys = await requestResult(index.getAllKeys(ownerId));
    for (const key of keys) {
      transaction.objectStore(RECYCLER_SNAPSHOT_STORE).delete(key);
    }
    await transactionDone(transaction);
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
