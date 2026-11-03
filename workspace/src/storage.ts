import { validateBrief, validateDraft, type Brief, type Draft } from "./domain";

const DATABASE = "caid-workspace";
const VERSION = 1;
const DRAFT_KEY = "current";

type SavedRecord<T> = { id: string; schemaVersion: number; value: T };

export interface BriefStore {
  listBriefs(): Promise<Brief[]>;
  saveBrief(brief: Brief): Promise<void>;
  commitBrief(brief: Brief): Promise<void>;
  deleteBrief(id: string): Promise<void>;
  loadDraft(): Promise<Draft | null>;
  saveDraft(draft: Draft): Promise<void>;
  clearDraft(): Promise<void>;
}

function saved<T>(value: unknown, validate: (input: unknown) => T): T {
  if (
    !value ||
    typeof value !== "object" ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== VERSION ||
    !("value" in value)
  ) {
    throw new Error(
      "Saved work uses an unsupported format. It has not been changed.",
    );
  }
  return validate(value.value);
}

/** A separate factory makes browser persistence testable without replacing global browser state. */
export function createBriefStore(
  factory: IDBFactory | undefined,
  name = DATABASE,
): BriefStore {
  function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!factory) {
        reject(new Error("This browser cannot save work locally."));
        return;
      }
      const request = factory.open(name, VERSION);
      let failed = false;
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("briefs"))
          database.createObjectStore("briefs", { keyPath: "id" });
        if (!database.objectStoreNames.contains("drafts"))
          database.createObjectStore("drafts", { keyPath: "id" });
      };
      request.onblocked = () => {
        failed = true;
        reject(
          new Error(
            "Close other tabs using this workspace, then try saving again.",
          ),
        );
      };
      request.onerror = () =>
        reject(
          request.error ?? new Error("Local storage could not be opened."),
        );
      request.onsuccess = () => {
        if (failed) {
          request.result.close();
          return;
        }
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });
  }

  async function runTransaction<T>(
    stores: "briefs" | "drafts" | ["briefs", "drafts"],
    mode: IDBTransactionMode,
    operation: (tx: IDBTransaction) => IDBRequest<T>,
  ): Promise<T> {
    const database = await open();
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = database.transaction(stores, mode);
      } catch (error) {
        database.close();
        reject(error);
        return;
      }
      let result: T;
      let operationError: unknown;
      tx.oncomplete = () => {
        database.close();
        resolve(result);
      };
      tx.onabort = () => {
        database.close();
        reject(
          operationError ??
            tx.error ??
            new Error("Local storage did not finish saving."),
        );
      };
      tx.onerror = () => {
        /* onabort reports the final transaction result. */
      };
      try {
        const request = operation(tx);
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => {
          operationError = request.error;
        };
      } catch (error) {
        operationError = error;
        tx.abort();
      }
    });
  }

  function transaction<T>(
    store: "briefs" | "drafts",
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ) {
    return runTransaction(store, mode, (tx) =>
      operation(tx.objectStore(store)),
    );
  }

  return {
    async listBriefs() {
      const records = await transaction("briefs", "readonly", (store) =>
        store.getAll(),
      );
      return records
        .map((entry: unknown) => saved(entry, validateBrief))
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    },
    async saveBrief(brief) {
      const value = validateBrief(brief);
      const entry: SavedRecord<Brief> = {
        id: value.id,
        schemaVersion: VERSION,
        value,
      };
      await transaction("briefs", "readwrite", (store) => store.put(entry));
    },
    async commitBrief(brief) {
      const value = validateBrief(brief);
      const entry: SavedRecord<Brief> = {
        id: value.id,
        schemaVersion: VERSION,
        value,
      };
      // Either both changes commit, or the original draft remains untouched.
      await runTransaction(["briefs", "drafts"], "readwrite", (tx) => {
        tx.objectStore("briefs").put(entry);
        return tx.objectStore("drafts").delete(DRAFT_KEY);
      });
    },
    async deleteBrief(id) {
      if (typeof id !== "string" || !id.trim())
        throw new Error("Choose a saved brief to delete.");
      await transaction("briefs", "readwrite", (store) => store.delete(id));
    },
    async loadDraft() {
      const entry: unknown = await transaction("drafts", "readonly", (store) =>
        store.get(DRAFT_KEY),
      );
      return entry === undefined ? null : saved(entry, validateDraft);
    },
    async saveDraft(draft) {
      const entry: SavedRecord<Draft> = {
        id: DRAFT_KEY,
        schemaVersion: VERSION,
        value: validateDraft(draft),
      };
      await transaction("drafts", "readwrite", (store) => store.put(entry));
    },
    async clearDraft() {
      await transaction("drafts", "readwrite", (store) =>
        store.delete(DRAFT_KEY),
      );
    },
  };
}

const current = () => createBriefStore(globalThis.indexedDB);
export const listBriefs = () => current().listBriefs();
export const saveBrief = (brief: Brief) => current().saveBrief(brief);
export const commitBrief = (brief: Brief) => current().commitBrief(brief);
export const deleteBrief = (id: string) => current().deleteBrief(id);
export const loadDraft = () => current().loadDraft();
export const saveDraft = (draft: Draft) => current().saveDraft(draft);
export const clearDraft = () => current().clearDraft();
