/**
 * JB191: a message on head office's thread carries the people ticked under
 * 「发给谁」 - one field, the ids with commas, sent even when nobody is ticked
 * so the server knows the page asked - and every other thread's message
 * carries none (客户 11-13: 「双方都可以选择接收人」).
 */
import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), list: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock("@/services/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api-client")>()),
  api,
}));

const service = await import("@/services/contractor-ops.service");

describe("the package chat service (JB191)", () => {
  it("sends the ticked people with the message", async () => {
    api.post.mockResolvedValueOnce({ id: "m1" });
    await service.sendPackageMessage("pk1", "r-hq", { body: "请看一下", to: ["u-fin", "u-admin"] });
    const [url, body] = api.post.mock.calls.at(-1)!;
    expect(url).toBe("/api/evidence-packages/pk1/send_message/");
    const form = body as FormData;
    expect(form.get("recipient")).toBe("r-hq");
    expect(form.get("body")).toBe("请看一下");
    expect(form.get("to")).toBe("u-fin,u-admin");
  });

  it("says the page asked even when nobody is ticked, and says nothing on a thread that does not ask", async () => {
    api.post.mockResolvedValue({ id: "m2" });
    await service.sendPackageMessage("pk1", "r-hq", { body: "x", to: [] });
    expect((api.post.mock.calls.at(-1)![1] as FormData).get("to")).toBe("");
    await service.sendPackageMessage("pk1", "r-con", { body: "x" });
    expect((api.post.mock.calls.at(-1)![1] as FormData).has("to")).toBe(false);
  });

  it("reads who may be chosen on one thread of one package", () => {
    service.getPackageThreadPeople("pk1", "r-hq");
    expect(api.get).toHaveBeenCalledWith("/api/evidence-packages/pk1/thread_people/", { recipient: "r-hq" });
  });
});
