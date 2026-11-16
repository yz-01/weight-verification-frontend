/**
 * JB208-7 (Lucas 11-16 audit): 「用户已邀请」 / 「重设链接已发送」 were shown
 * even when the server said the email did not go out (`invitation_sent` /
 * `delivered` false - no mail server, or the send failed). The same two
 * functions serve MSE Admin and a tenant's own user pages.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  post: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("@/services/api-client", () => ({
  api: { post: calls.post },
  download: vi.fn(),
  toastSuccess: calls.success,
}));
vi.mock("@/services/contractor.service", () => ({
  exportBody: vi.fn(),
  exportQuery: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { warning: calls.warning } }));
vi.mock("@/lib/i18n-runtime", () => ({ t: (key: string) => key }));

const { createUser, sendPasswordReset } = await import("@/services/users.service");

const payload = { email: "a@b.test", full_name: "A", role: null } as never;

describe("JB208-7 invitation and reset delivery", () => {
  beforeEach(() => {
    calls.post.mockReset();
    calls.success.mockReset();
    calls.warning.mockReset();
  });

  it("warns, not congratulates, when the invitation did not go out", async () => {
    calls.post.mockResolvedValue({ id: "u1", invitation_sent: false });
    await createUser(payload);
    expect(calls.success).not.toHaveBeenCalled();
    expect(calls.warning).toHaveBeenCalledWith(
      "users.toast.createdNotSent",
      expect.anything(),
    );
  });

  it("still says 用户已邀请 when it did", async () => {
    calls.post.mockResolvedValue({ id: "u1", invitation_sent: true });
    await createUser(payload);
    expect(calls.success).toHaveBeenCalledWith("users.toast.created");
    expect(calls.warning).not.toHaveBeenCalled();
  });

  it("warns when the reset link did not go out, and confirms when it did", async () => {
    calls.post.mockResolvedValue({ delivered: false });
    await sendPasswordReset("u1");
    expect(calls.warning).toHaveBeenCalledWith(
      "users.resetPassword.notSent",
      expect.anything(),
    );
    expect(calls.success).not.toHaveBeenCalled();

    calls.post.mockResolvedValue({ delivered: true });
    await sendPasswordReset("u1");
    expect(calls.success).toHaveBeenCalledWith("users.resetPassword.sent");
  });
});
