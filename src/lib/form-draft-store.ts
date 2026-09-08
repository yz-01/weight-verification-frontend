/** Unsubmitted forms are separate from the queue of explicitly submitted jobs. */
export type DraftValues = Record<string, unknown>;
export interface DraftSnapshot {
  values: DraftValues;
  ready: boolean;
  status: "loading" | "empty" | "saving" | "saved" | "error";
  /**
   * Top-level draft keys whose saved photo could not be read back.
   *
   * A browser is free to drop the stored blobs and keep the row - a private
   * window, cleared site data, or quota reclamation all do it. This used to
   * throw out of `decode`, and the catch below left `ready` false forever,
   * so `{snapshot.ready && children}` never rendered the form at all: the
   * mechanism added so nobody loses their typing was itself able to make the
   * screen unusable (F-264). The typed values are restored instead, the
   * affected fields are named here, and the worker is asked to re-take those
   * photos.
   */
  missingAttachments: string[];
}
type Encoded = null | boolean | number | string | Encoded[] | { [key: string]: Encoded };
interface DraftRecord { id: string; values: Encoded }
interface DraftFile { id: string; owner: string; file: File }
const PREFIX = "mse-form-draft:v1:";
const stores = new Map<string, FormDraftStore>();
/** Marks a value whose stored photo is gone, so it is dropped rather than thrown over. */
const MISSING = Symbol("draft-attachment-missing");

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("mse-trace-form-drafts", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("drafts", { keyPath: "id" });
      request.result.createObjectStore("files", { keyPath: "id" }).createIndex("owner", "owner");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("draft_database_blocked"));
  });
}
function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export interface DraftPersistence {
  load(id: string): Promise<{ values: Encoded; files: DraftFile[] } | null>;
  journal(id: string, values: Encoded): void;
  save(id: string, values: Encoded, files: DraftFile[], clear: boolean): Promise<void>;
}

const browserPersistence: DraftPersistence = {
  async load(id) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(["drafts", "files"], "readonly");
      const done = completed(transaction);
      const [row, files] = await Promise.all([
        result(transaction.objectStore("drafts").get(id) as IDBRequest<DraftRecord | undefined>),
        result(transaction.objectStore("files").index("owner").getAll(id) as IDBRequest<DraftFile[]>),
      ]);
      await done;
      // Text is journalled synchronously at input time, including the last keystroke.
      // A newer journal must win over a transaction interrupted by a page close.
      const journal = localStorage.getItem(PREFIX + id);
      return journal ? { values: JSON.parse(journal), files } : row ? { values: row.values, files } : null;
    } finally { database.close(); }
  },
  journal(id, values) { localStorage.setItem(PREFIX + id, JSON.stringify(values)); },
  async save(id, values, files, clear) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(["drafts", "files"], "readwrite");
      const done = completed(transaction);
      if (clear) {
        const keys = await result(transaction.objectStore("files").index("owner").getAllKeys(id));
        for (const key of keys) transaction.objectStore("files").delete(key);
      }
      for (const file of files) transaction.objectStore("files").put(file);
      transaction.objectStore("drafts").put({ id, values });
      await done;
    } finally { database.close(); }
  },
};

export class FormDraftStore {
  private snapshot: DraftSnapshot = { values: {}, ready: false, status: "loading", missingAttachments: [] };
  private listeners = new Set<() => void>();
  private fileIds = new WeakMap<File, string>();
  private savedFiles = new Set<string>();
  private loadPromise?: Promise<void>;
  /** False after a failed load, so `retry` re-reads instead of writing `{}` over the draft. */
  private loaded = false;
  private writes = Promise.resolve();
  private revision = 0;
  constructor(readonly id: string, private persistence: DraftPersistence = browserPersistence) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(snapshot: DraftSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
  load = (): Promise<void> => {
    if (this.loaded) return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.persistence.load(this.id).then((record) => {
      const files = new Map(record?.files.map((entry) => [entry.id, entry.file]) ?? []);
      const missing: string[] = [];
      // `field` is the top-level draft key being decoded, so a dropped blob can
      // be reported as "re-take this photo" rather than as a broken form.
      const decode = (value: Encoded, field: string): unknown => {
        if (Array.isArray(value)) {
          return value
            .map((entry) => decode(entry, field))
            .filter((entry) => entry !== MISSING);
        }
        if (value && typeof value === "object") {
          const marker = value as { $draft?: string; id?: string };
          if (marker.$draft === "undefined") return undefined;
          if (marker.$draft === "file") {
            const file = files.get(String(marker.id));
            if (!file) {
              // Report, do not throw. See DraftSnapshot.missingAttachments.
              if (!missing.includes(field)) missing.push(field);
              return MISSING;
            }
            this.fileIds.set(file, String(value.id));
            this.savedFiles.add(String(value.id));
            return file;
          }
          return Object.fromEntries(
            Object.entries(value)
              .map(([key, entry]) => [key, decode(entry, field)] as const)
              .filter(([, entry]) => entry !== MISSING),
          );
        }
        return value;
      };
      const stored = (record?.values ?? {}) as Record<string, Encoded>;
      const values = Object.fromEntries(
        Object.entries(stored)
          .map(([key, entry]) => [key, decode(entry, key)] as const)
          .filter(([, entry]) => entry !== MISSING),
      ) as DraftValues;
      this.loaded = true;
      this.publish({
        values,
        ready: true,
        status: Object.keys(values).length ? "saved" : "empty",
        missingAttachments: missing,
      });
    }).catch(() => {
      this.loadPromise = undefined;
      // `ready: true` on purpose. The form must still render when this browser
      // refuses to store anything at all - a private window throws on
      // `indexedDB.open` - and leaving it false blanked the whole screen.
      // `loaded` stays false so `retry` re-reads rather than overwriting.
      this.publish({ values: {}, ready: true, status: "error", missingAttachments: [] });
    });
    return this.loadPromise;
  };
  private encode(values: DraftValues) {
    const files = new Map<string, DraftFile>();
    const encode = (value: unknown): Encoded => {
      if (value === undefined) return { $draft: "undefined" };
      if (value instanceof File) {
        let id = this.fileIds.get(value);
        if (!id) { id = crypto.randomUUID(); this.fileIds.set(value, id); }
        if (!this.savedFiles.has(id)) files.set(id, { id, owner: this.id, file: value });
        return { $draft: "file", id };
      }
      if (Array.isArray(value)) return value.map(encode);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encode(entry)]));
      return value as Encoded;
    };
    return { values: encode(values), files: [...files.values()] };
  }
  set(key: string, value: unknown) { this.persist({ ...this.snapshot.values, [key]: value }); }
  clear = () => { this.persist({}, true); };
  // Keyed on `loaded`, not on `ready`. A load that failed must be retried as a
  // *read*; writing the empty snapshot back would erase the draft still on disk.
  retry = () => this.loaded ? this.persist(this.snapshot.values) : void this.load();
  private persist(values: DraftValues, clear = false) {
    const revision = ++this.revision;
    const encoded = this.encode(values);
    let journalFailed = false;
    try { this.persistence.journal(this.id, encoded.values); } catch { journalFailed = true; }
    // Clearing starts a fresh form, so nothing is outstanding; otherwise the
    // notice stands until the worker re-takes the photo, which is itself a write.
    const missingAttachments = clear
      ? []
      : this.snapshot.missingAttachments.filter((field) => !Object.hasOwn(values, field) || values[field] === undefined);
    this.publish({ values, ready: true, status: "saving", missingAttachments });
    // Serialize writes, including clearing after success, so an older pending write
    // cannot resurrect an already submitted draft.
    this.writes = this.writes.catch(() => {}).then(async () => {
      await this.persistence.save(this.id, encoded.values, encoded.files, clear);
      if (clear) this.savedFiles.clear();
      encoded.files.forEach((entry) => this.savedFiles.add(entry.id));
      if (revision === this.revision) this.publish({ values, ready: true, status: journalFailed ? "error" : Object.keys(values).length ? "saved" : "empty", missingAttachments });
    }).catch(() => {
      if (revision === this.revision) this.publish({ values, ready: true, status: "error", missingAttachments });
    });
  }
  flush = () => this.writes;
}

export function formDraftKey(company: string | null, user: string, scope: string) {
  return JSON.stringify([company, user, scope]);
}
export function getFormDraftStore(id: string) {
  let store = stores.get(id);
  if (!store) { store = new FormDraftStore(id); stores.set(id, store); }
  return store;
}
