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
  | "MATERIAL_OUTGOING_EXIT"
  | "SUNDRY_CLAIM"
  | "WASTE_OUTGOING"
  | "DISPOSAL_REQUEST"
  | "SAFETY_INCIDENT"
  | "CONSULTANT_SUBMISSION"
  | "CATEGORY_EVIDENCE"
  | "EQUIPMENT_HOURS_PHOTO"
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
  /** HTTP status of the last refusal, so the queue can say what kind it was (F-463). */
  lastErrorStatus?: number;
  /** The server's code for the last refusal, e.g. `task_already_running`. */
  lastErrorCode?: string;
  /**
   * The server refused it (a 4xx), so sending the same thing again cannot
   * succeed: the automatic passes leave it alone and it shows 「需要处理」
   * until the worker presses 立即重试 or discards it (A9).
   */
  needsAttention?: boolean;
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
      acceptance_status?: "REJECTED";
      rejection_reason?: string;
      material_name: string;
      material_specification?: string;
      quantity: string;
      /** A code from the company's unit list (2026-10 A4). */
      unit: string;
      /** The factory that made it (2026-10 D1). Absent on jobs queued before it. */
      manufacturer?: string | null;
      total_weight_kg?: string | null;
      /** The material column, or null for a delivery taken unfiled. */
      category?: string | null;
      unit_price?: string | null;
      document_amount?: string | null;
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
    signature?: StoredFile;
    supplierSignature?: StoredFile;
    deliveryNotePhoto?: StoredFile;
    sitePhotos: StoredFile[];
    deviceId: string;
  };
}

export interface EquipmentMovementOfflineJob extends OfflineJobBase {
  kind: "EQUIPMENT_MOVEMENT";
  payload: {
    /**
     * 设备进场 in one step (2026-10 X2, C8): sent to `record_entry`, not to
     * the handover of an application. Absent on older queued jobs.
     */
    entry?: boolean;
    /**
     * 设备退场 in one step (2026-10 Q27): sent to `record_exit`. Like the
     * entry, no quantity, unit or application.
     */
    exit?: boolean;
    /** A 「新设备」 reported from the phone: its name, `equipment` empty. */
    equipment_name?: string;
    /** …and its plate, if it has one (optional). */
    registration_no?: string;
    /** The supplier whose QR was scanned at the gate (F3). */
    supplier?: string;
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
    /**
     * The signed read the phone made of the DO photo. The handover keeps it
     * instead of running OCR inside the upload (A9).
     */
    ocr_proof?: string;
    original_occurred_at: string;
    client_event_id: string;
    field_task?: string;
    /** The approved application this handover completes (B13). */
    movement?: string;
    photos: StoredFile[];
    delivery_note_photo?: StoredFile;
    /** Both sides at the handover: the site person and the supplier / driver. */
    receiver_signature?: StoredFile;
    supplier_signature?: StoredFile;
  };
}

export interface SiteProgressOfflineJob extends OfflineJobBase {
  kind: "SITE_PROGRESS";
  payload: {
    project: string;
    category?: string;
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
    /**
     * Since 2026-10 C9 the supplier is optional and no delivery is chosen
     * (X20); `source_receipt` stays for a job an older build queued.
     */
    supplier?: string;
    source_receipt?: string;
    category?: string;
    /** Whose make (2026-10 D1); the delivery's own when absent. */
    manufacturer?: string;
    material_name?: string;
    quantity: string;
    unit?: string;
    destination?: string;
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

/**
 * 现场实际退场 of an approved return (2026-10 C9, Q29.3): the photos, how
 * much actually left, the plate, the DO, the supplier and both signatures,
 * sent to `return_processing`. `client_event_id` is minted once on the phone
 * and sent on every try, so a replay of an exit that already arrived gets
 * that exit back instead of a refusal.
 */
export interface MaterialOutgoingExitOfflineJob extends OfflineJobBase {
  kind: "MATERIAL_OUTGOING_EXIT";
  payload: {
    /** The approved application this exit belongs to. */
    outgoing: string;
    /** Its number, so the queue says which return is waiting. */
    reference_no: string;
    returned_quantity: string;
    note?: string;
    latitude?: string;
    longitude?: string;
    vehicle_plate?: string;
    delivery_note_no?: string;
    supplier?: string;
    category?: string;
    client_event_id: string;
    photos: StoredFile[];
    site_signature: StoredFile;
    supplier_signature: StoredFile;
  };
}

/** 杂费报销 from the phone (T-379), queued like every other capture. */
export interface SundryClaimOfflineJob extends OfflineJobBase {
  kind: "SUNDRY_CLAIM";
  payload: {
    project: string;
    amount: string;
    description: string;
    latitude?: string;
    longitude?: string;
    client_event_id: string;
    attachments: StoredFile[];
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
    category?: string;
    waste_description: string;
    location_description: string;
    estimated_volume_m3?: string;
    estimated_weight_kg?: string;
    preferred_at?: string;
    request_note?: string;
    /** 「预计车次」 (X11); absent on a job queued before it existed. */
    planned_trips?: string;
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
    category: string;
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
    record_type?: "HAZARD" | "PERMIT";
    /** Only on reports queued before X8; dropped when they are sent. */
    confirmer?: string;
    responsible_person?: string;
    due_at?: string;
    attachments?: StoredFile[];
  };
}

export interface ConsultantSubmissionOfflineJob extends OfflineJobBase {
  kind: "CONSULTANT_SUBMISSION";
  payload: {
    project: string;
    category?: string;
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
    /** A known lorry / driver by id; empty when they were typed instead. */
    vehicle: string;
    driver: string;
    /** Typed in 接单与派车; absent on jobs queued before typing existed. */
    driverName?: string;
    driverPhone?: string;
    vehiclePlate?: string;
    scheduledFor: string | null;
    notes: string;
    clientEventId: string;
  };
}

/**
 * 设备操作员工时 (2026-10 B15): one photo of one machine, taken when the
 * operator starts or stops it. `capturedAt` is the moment of the photo - the
 * hours are counted from it, however late the job reaches the server.
 */
export interface EquipmentHoursPhotoOfflineJob extends OfflineJobBase {
  kind: "EQUIPMENT_HOURS_PHOTO";
  payload: {
    equipment: string;
    /** 「名称 · 车牌」, so the queue says which machine is waiting. */
    equipmentLabel: string;
    capturedAt: string;
    clientEventId: string;
    latitude?: string;
    longitude?: string;
    locationAccuracyM?: string;
    photo: StoredFile;
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
  | MaterialOutgoingExitOfflineJob
  | SundryClaimOfflineJob
  | WasteOutgoingOfflineJob
  | DisposalRequestOfflineJob
  | SafetyIncidentOfflineJob
  | ConsultantSubmissionOfflineJob
  | CategoryEvidenceOfflineJob
  | EquipmentHoursPhotoOfflineJob
  | DispatchAcceptOfflineJob
  | DispatchCollectOfflineJob
  | TripAssignOfflineJob;

const DB_NAME = "mse-trace-offline";
const STORE_NAME = "jobs";
const DRIVER_SNAPSHOT_STORE = "driverSnapshots";
const RECYCLER_SNAPSHOT_STORE = "recyclerSnapshots";
/**
 * The full originals of photos this phone took (H5 三, WP1), kept apart from
 * the queue's compressed application photos. Added in version 4; the upgrade
 * only creates what is missing, so a phone on version 3 keeps every queued
 * job and snapshot it had.
 */
const ORIGINALS_STORE = "originals";
const DB_VERSION = 4;

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

/**
 * Bring the stores up to `DB_VERSION`, creating only what is missing.
 *
 * Exported for its test: an upgrade from version 3 (H5 三, WP1 added the
 * originals store) must leave every existing store - the queued jobs above
 * all - exactly as it was.
 */
export function upgradeOfflineStores(
  database: Pick<IDBDatabase, "objectStoreNames" | "createObjectStore">,
): void {
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
  if (!database.objectStoreNames.contains(ORIGINALS_STORE)) {
    const store = database.createObjectStore(ORIGINALS_STORE, { keyPath: "id" });
    store.createIndex("ownerId", "ownerId", { unique: false });
    store.createIndex("sha256", "sha256", { unique: false });
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => upgradeOfflineStores(request.result);
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

/**
 * Where one kept original stands on this phone (H5 三, WP1).
 *
 * - `captured`: taken; its record has not reached the server yet.
 * - `pending`: the application photo is uploaded and declared this original;
 *   it is waiting for 「同步原图」.
 * - `failed`: the last attempt to send it did not go through.
 *
 * There is no "backed up" state here on purpose: 「原图已备份」 only ever comes
 * from the server, and once the server has verified it the phone's copy is
 * deleted (五.5).
 */
export type LocalOriginalState = "captured" | "pending" | "failed";

export interface LocalOriginal {
  /** 32 hex characters, also written into the application photo's file name. */
  id: string;
  ownerId: string;
  blob: Blob;
  sha256: string;
  size: number;
  width: number;
  height: number;
  capturedAt: string;
  /** The application photo's file name, which carries `id`. */
  photoName: string;
  /** The application photo's SHA-256 as captured, then as last sent. */
  photoSha256: string;
  state: LocalOriginalState;
  declaredAt?: string;
  attempts: number;
  lastError?: string;
  lastErrorCode?: string;
  lastAttemptAt?: string;
}

/** A kept original without its bytes - what lists and counts need. */
export type LocalOriginalInfo = Omit<LocalOriginal, "blob">;

export async function putLocalOriginal(original: LocalOriginal): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ORIGINALS_STORE, "readwrite");
    transaction.objectStore(ORIGINALS_STORE).put(original);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function getLocalOriginal(id: string): Promise<LocalOriginal | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ORIGINALS_STORE, "readonly");
    const row = await requestResult(
      transaction.objectStore(ORIGINALS_STORE).get(id) as IDBRequest<LocalOriginal | undefined>,
    );
    await transactionDone(transaction);
    return row ?? null;
  } finally {
    database.close();
  }
}

/** One owner's kept originals, oldest first, without loading their bytes. */
export async function getLocalOriginals(ownerId: string): Promise<LocalOriginalInfo[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ORIGINALS_STORE, "readonly");
    const index = transaction.objectStore(ORIGINALS_STORE).index("ownerId");
    const rows: LocalOriginalInfo[] = [];
    await new Promise<void>((resolve, reject) => {
      const cursor = index.openCursor(IDBKeyRange.only(ownerId));
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current) {
          resolve();
          return;
        }
        // A Blob read from IndexedDB is a handle, not its bytes; dropping it
        // here keeps the list from holding a megabyte per row anyway.
        const { blob: _blob, ...info } = current.value as LocalOriginal;
        void _blob;
        rows.push(info);
        current.continue();
      };
      cursor.onerror = () => reject(cursor.error);
    });
    await transactionDone(transaction);
    return rows.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  } finally {
    database.close();
  }
}

/** Change a kept original's state fields, leaving its bytes as they are. */
export async function updateLocalOriginal(
  id: string,
  change: Partial<Omit<LocalOriginal, "id" | "blob" | "sha256" | "size">>,
): Promise<LocalOriginal | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ORIGINALS_STORE, "readwrite");
    const store = transaction.objectStore(ORIGINALS_STORE);
    const row = await requestResult(store.get(id) as IDBRequest<LocalOriginal | undefined>);
    const next = row ? { ...row, ...change } : null;
    if (next) store.put(next);
    await transactionDone(transaction);
    return next;
  } finally {
    database.close();
  }
}

/**
 * Drop this phone's copy of one original.
 *
 * Called when the server has verified its own copy, or for an original the
 * protection rule (`protectedLocalItems`) does not cover. Nothing else
 * deletes from this store.
 */
export async function deleteLocalOriginal(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ORIGINALS_STORE, "readwrite");
    transaction.objectStore(ORIGINALS_STORE).delete(id);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}
