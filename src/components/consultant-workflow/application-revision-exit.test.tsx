/**
 * 「新修订」 inside the record-detail popup closes in one go (audit S3, 2026-10-08).
 *
 * The revision's `onSuccess` used to `router.push` the new revision's address.
 * In the popup that left the superseded revision in history: closing the new
 * revision went back to the old one's popup, and only a second close reached
 * the list - the two-close shape `fix/dialog-close` exists to remove. It now
 * leaves through the shared rule, which in the popup *replaces* the old
 * revision's entry, and on a page of its own still moves forward as before.
 *
 * No DOM in this runner, so the button is not clicked: the mutation's options
 * are captured as the component registers them, and its `onSuccess` is called
 * with the row the server would send back.
 */
import type { UseMutationOptions } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }));
const mutations = vi.hoisted(() => [] as UseMutationOptions<unknown, unknown, unknown, unknown>[]);

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/consultant-applications/a1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useMutation: ((options, client) => {
      mutations.push(options as UseMutationOptions<unknown, unknown, unknown, unknown>);
      return actual.useMutation(options, client);
    }) as typeof actual.useMutation,
  };
});
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u1", role: "r1" }, can: () => true }),
}));
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: () => <div data-stub="conversation" />,
}));
vi.mock("@/components/shared/record-attachments", () => ({
  RecordAttachmentsPanel: () => <div data-stub="attachments" />,
}));
vi.mock("@/components/shared/record-export-button", () => ({
  RecordExportButton: () => <div data-stub="export" />,
}));
vi.mock("@/components/shared/record-closure", () => ({
  RecordClosurePanel: () => <div data-stub="closure" />,
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { resetTrail } = await import("@/components/shared/dialog-navigation");
const { ConsultantApplicationDetail } = await import(
  "@/components/consultant-workflow/application-detail"
);

/** The 「新修订」 mutation, told apart from the others by what it calls. */
function revisionMutation() {
  const found = mutations.filter((options) =>
    String(options.mutationFn).includes("createApplicationRevision"),
  );
  expect(found, "exactly one mutation creates the revision").toHaveLength(1);
  return found[0];
}

function revise(presentation: "page" | "dialog") {
  // Nothing seeded: the mutations are registered before the loading state
  // returns, and the revision is all this test reads.
  renderDetail(<ConsultantApplicationDetail id="a1" presentation={presentation} />);
  const onSuccess = revisionMutation().onSuccess as (...args: unknown[]) => unknown;
  onSuccess({ id: "a2" }, undefined, undefined, undefined);
}

beforeEach(() => {
  mutations.length = 0;
  router.push.mockClear();
  router.back.mockClear();
  router.replace.mockClear();
});
afterEach(() => resetTrail());

describe("「新修订」 from the consultant application detail", () => {
  it("in the popup, replaces the superseded revision, so one close reaches the list", () => {
    resetTrail(["/consultant-applications", "/consultant-applications/a1"]);

    revise("dialog");

    expect(router.replace).toHaveBeenCalledWith("/consultant-applications/a2");
    expect(router.push).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it("opened straight from a notification (no in-app history), still replaces rather than stacking", () => {
    resetTrail(["/consultant-applications/a1"]);

    revise("dialog");

    expect(router.replace).toHaveBeenCalledWith("/consultant-applications/a2");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("on its own page, moves forward to the new revision as before", () => {
    resetTrail(["/consultant-applications", "/consultant-applications/a1"]);

    revise("page");

    expect(router.push).toHaveBeenCalledWith("/consultant-applications/a2");
    expect(router.replace).not.toHaveBeenCalled();
  });
});
