/** Unsubmitted forms are separate from the queue of explicitly submitted jobs. */
export type DraftValues = Record<string, unknown>;
export interface DraftSnapshot {
  values: DraftValues;
  ready: boolean;
  status: "loading" | "empty" | "saving" | "saved" | "error";
}
type Encoded = null | boolean | number | string | Encoded[] | { [key: string]: Encoded };
interface DraftRecord { id: string; values: Encoded }
interface DraftFile { id: string; owner: string; file: File }
const PREFIX = "mse-form-draft:v1:";
const stores = new Map<string, FormDraftStore>();

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
  private snapshot: DraftSnapshot = { values: {}, ready: false, status: "loading" };
  private listeners = new Set<() => void>();
  private fileIds = new WeakMap<File, string>();
  private savedFiles = new Set<string>();
  private loadPromise?: Promise<void>;
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
    if (this.snapshot.ready) return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.persistence.load(this.id).then((record) => {
      const files = new Map(record?.files.map((entry) => [entry.id, entry.file]) ?? []);
      const decode = (value: Encoded): unknown => {
        if (Array.isArray(value)) return value.map(decode);
        if (value && typeof value === "object") {
          const marker = value as { $draft?: string; id?: string };
          if (marker.$draft === "undefined") return undefined;
          if (marker.$draft === "file") {
            const file = files.get(String(marker.id));
            if (!file) throw new Error("draft_attachment_missing");
            this.fileIds.set(file, String(value.id));
            this.savedFiles.add(String(value.id));
            return file;
          }
          return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decode(entry)]));
        }
        return value;
      };
      const values = record ? decode(record.values) as DraftValues : {};
      this.publish({ values, ready: true, status: Object.keys(values).length ? "saved" : "empty" });
    }).catch(() => {
      this.loadPromise = undefined;
      this.publish({ ...this.snapshot, status: "error" });
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
  retry = () => this.snapshot.ready ? this.persist(this.snapshot.values) : void this.load();
  private persist(values: DraftValues, clear = false) {
    const revision = ++this.revision;
    const encoded = this.encode(values);
    let journalFailed = false;
    try { this.persistence.journal(this.id, encoded.values); } catch { journalFailed = true; }
    this.publish({ values, ready: true, status: "saving" });
    // Serialize writes, including clearing after success, so an older pending write
    // cannot resurrect an already submitted draft.
    this.writes = this.writes.catch(() => {}).then(async () => {
      await this.persistence.save(this.id, encoded.values, encoded.files, clear);
      if (clear) this.savedFiles.clear();
      encoded.files.forEach((entry) => this.savedFiles.add(entry.id));
      if (revision === this.revision) this.publish({ values, ready: true, status: journalFailed ? "error" : Object.keys(values).length ? "saved" : "empty" });
    }).catch(() => {
      if (revision === this.revision) this.publish({ values, ready: true, status: "error" });
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
