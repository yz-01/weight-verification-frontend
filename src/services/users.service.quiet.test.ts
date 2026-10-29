import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 编辑用户's single 「保存」 saves the fields and then the 权限开关: one toast
 * at the end, not 「用户已更新」 while the switches' PIN is still being asked.
 */

const patch = vi.fn();
const post = vi.fn();
const toastSuccess = vi.fn();
vi.mock("@/services/api-client", () => ({
  api: {
    patch: (...args: unknown[]) => patch(...args),
    post: (...args: unknown[]) => post(...args),
  },
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
}));

const { setPermissionSwitches, updateUser } = await import("./users.service");

describe("quiet saves for the edit-user dialog", () => {
  beforeEach(() => {
    patch.mockReset().mockResolvedValue({ id: "u1" });
    post.mockReset().mockResolvedValue({ off: [] });
    toastSuccess.mockReset();
  });

  it("updateUser toasts by default and not when quiet", async () => {
    await updateUser("u1", { full_name: "A" });
    expect(toastSuccess).toHaveBeenCalledWith("users.toast.updated");
    toastSuccess.mockReset();
    await updateUser("u1", { full_name: "A" }, { quiet: true });
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("setPermissionSwitches toasts by default and not when quiet", async () => {
    const payload = { off: [], projects: { all: true as const } };
    await setPermissionSwitches("u1", payload);
    expect(toastSuccess).toHaveBeenCalledWith("users.toast.switchesSaved");
    toastSuccess.mockReset();
    await setPermissionSwitches("u1", payload, { quiet: true });
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
