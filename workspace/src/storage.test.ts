import { IDBFactory, IDBObjectStore as FakeObjectStore } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrief, type Source } from "./domain";
import { createBriefStore } from "./storage";

const fixture = (): Source => ({
  id: "source",
  name: "note.txt",
  kind: "text",
  mime: "text/plain",
  size: 13,
  text: "Bench test A.",
  note: "Retest needed",
  status: "ready",
  blob: new Blob(["Bench test A."], { type: "text/plain" }),
});

afterEach(() => vi.restoreAllMocks());

describe("browser workspace storage", () => {
  it("retains brief text, source blobs and source links after reopening", async () => {
    const factory = new IDBFactory();
    const store = createBriefStore(factory);
    const brief = createBrief("Review bench evidence", [fixture()]);
    await store.saveBrief(brief);
    const reopened = createBriefStore(factory);
    const [restored] = await reopened.listBriefs();
    expect(restored.id).toBe(brief.id);
    expect(restored.observations).toEqual(brief.observations);
    expect(await restored.sources[0].blob!.text()).toBe("Bench test A.");
    expect(restored.sources[0].blob!.type).toBe("text/plain");
    await reopened.deleteBrief(brief.id);
    expect(await store.listBriefs()).toEqual([]);
  });

  it("replaces a saved brief and orders by the last update", async () => {
    const store = createBriefStore(new IDBFactory());
    const first = createBrief("First", []);
    const second = createBrief("Second", []);
    await store.saveBrief(first);
    await store.saveBrief(second);
    await store.saveBrief({
      ...first,
      title: "Updated first",
      updatedAt: "2099-01-01T00:00:00.000Z",
    });
    const restored = await store.listBriefs();
    expect(restored).toHaveLength(2);
    expect(restored[0].title).toBe("Updated first");
  });

  it("persists and clears an unfinished draft independently from saved briefs", async () => {
    const factory = new IDBFactory();
    const store = createBriefStore(factory);
    const brief = createBrief("Saved work", []);
    await store.saveBrief(brief);
    expect(await store.loadDraft()).toBeNull();
    await store.saveDraft({ request: "", sources: [fixture()] });
    const reopened = createBriefStore(factory);
    const draft = await reopened.loadDraft();
    expect(draft?.request).toBe("");
    expect(await draft!.sources[0].blob!.text()).toBe("Bench test A.");
    await reopened.clearDraft();
    expect(await store.loadDraft()).toBeNull();
    expect(await store.listBriefs()).toHaveLength(1);
  });

  it("reports unavailable storage and rejects malformed work before saving", async () => {
    await expect(createBriefStore(undefined).listBriefs()).rejects.toThrow(
      /cannot save/,
    );
    const store = createBriefStore(new IDBFactory());
    const brief = createBrief("Valid", []);
    await expect(
      store.saveBrief({ ...brief, title: 5 as unknown as string }),
    ).rejects.toThrow(/title/);
    expect(await store.listBriefs()).toEqual([]);
  });

  it("does not report success when the write transaction aborts", async () => {
    const store = createBriefStore(new IDBFactory());
    const original = FakeObjectStore.prototype.put;
    vi.spyOn(FakeObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const request = original.call(this, value, key);
      this.transaction.abort();
      return request;
    });
    await expect(
      store.saveBrief(createBrief("Interrupted save", [])),
    ).rejects.toThrow();
    expect(await store.listBriefs()).toEqual([]);
  });

  it("atomically replaces the draft with its prepared brief", async () => {
    const store = createBriefStore(new IDBFactory());
    const draft = { request: "Review this evidence", sources: [fixture()] };
    await store.saveDraft(draft);
    const brief = createBrief(draft.request, draft.sources);
    await store.commitBrief(brief);
    expect(await store.loadDraft()).toBeNull();
    const [restored] = await store.listBriefs();
    expect(restored.id).toBe(brief.id);
    expect(await restored.sources[0].blob!.text()).toBe("Bench test A.");
  });

  it("keeps the original draft and creates no brief if preparation storage aborts", async () => {
    const store = createBriefStore(new IDBFactory());
    const draft = { request: "Do not lose this draft", sources: [fixture()] };
    await store.saveDraft(draft);
    const original = FakeObjectStore.prototype.delete;
    vi.spyOn(FakeObjectStore.prototype, "delete").mockImplementation(function (
      this: IDBObjectStore,
      key: IDBValidKey | IDBKeyRange,
    ) {
      const request = original.call(this, key);
      this.transaction.abort();
      return request;
    });
    await expect(
      store.commitBrief(createBrief(draft.request, draft.sources)),
    ).rejects.toThrow();
    expect(await store.listBriefs()).toEqual([]);
    const restored = await store.loadDraft();
    expect(restored?.request).toBe(draft.request);
    expect(await restored!.sources[0].blob!.text()).toBe("Bench test A.");
  });

  it("reports corrupt saved data instead of silently displaying an empty workspace", async () => {
    const factory = new IDBFactory();
    const store = createBriefStore(factory);
    await store.listBriefs();
    await new Promise<void>((resolve, reject) => {
      const request = factory.open("caid-workspace", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const tx = database.transaction("briefs", "readwrite");
        tx.objectStore("briefs").put({
          id: "corrupt",
          schemaVersion: 7,
          value: {},
        });
        tx.oncomplete = () => {
          database.close();
          resolve();
        };
        tx.onabort = () => {
          database.close();
          reject(tx.error);
        };
      };
    });
    await expect(store.listBriefs()).rejects.toThrow(/unsupported format/);
  });
});
