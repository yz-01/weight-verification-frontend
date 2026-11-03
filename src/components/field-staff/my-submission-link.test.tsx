/**
 * A notice about one of the worker's own submissions opens that submission
 * (JB97, Lucas 11-03: 「铃铛那里按进去确保是可以看到事项的详情，不是首页」).
 *
 * The notice links `/field-staff?tab=home&submission=<KIND>:<id>`; under
 * 我提交过的 the record's sheet opens - from the list when it is on the page
 * shown, read by itself when it is older than that page.
 */
import { afterEach, describe, expect, it, vi } from "vitest";


// Which record the address opens: a notice's `?submission=<KIND>:<id>`.
const nav = vi.hoisted(() => ({ search: "submission=EQUIPMENT_MOVEMENT:mv-7" }));

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/field-staff",
  // The office's notice about a movement opens it here (Fable B4 #15).
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1" }, can: () => true }),
}));
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: () => <div data-stub="conversation" />,
}));
vi.mock("@/components/shared/record-attachments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/shared/record-attachments")>()),
  RecordAttachmentsPanel: ({ readOnly }: { readOnly?: boolean }) => (
    <div data-stub="attachments" data-read-only={String(Boolean(readOnly))} />
  ),
}));
vi.mock("@/components/shared/record-export-button", () => ({
  RecordExportButton: ({ kind }: { kind: string }) => <div data-stub="export" data-kind={kind} />,
}));

const { RECORDER, renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { MySubmissions } = await import("@/components/field-staff/my-submissions");

const row = {
  id: "mv-7",
  kind: "EQUIPMENT_MOVEMENT" as const,
  reference: "EQ-SITE-007",
  detail: "Excavator",
  project_id: "p-1",
  project_name: "Site",
  submitted_at: "2026-10-08T01:00:00Z",
  status: "EXIT",
  status_label: "Exit",
  photo: null,
};

function seeded(client: import("@tanstack/react-query").QueryClient) {
  client.setQueryData(["my-submissions"], { results: [row], count: 1 });
  client.setQueryData(["my-submissions", "detail", "EQUIPMENT_MOVEMENT", "mv-7"], {
    ...row,
    fields: [{ key: "delivery_note_no", value: "DO-OUT-7" }],
    photos: [{ url: "https://cdn.example/mv-7.jpg", caption: "Exit gate" }],
    // The server sends it; the worker's own sheet does not show it.
    ...RECORDER,
  });
}

describe("a notice's link opens the submission it names (JB97)", () => {
  afterEach(() => {
    nav.search = "submission=EQUIPMENT_MOVEMENT:mv-7";
  });

  it("opens the record from the list", () => {
    const html = renderDetail(<MySubmissions />, seeded);
    expect(html).toContain('data-record-detail="dialog"');
    expect(html).toContain("EQ-SITE-007");
    expect(html).toContain("DO-OUT-7");
  });

  it("opens a record older than the page shown, read by itself", () => {
    const html = renderDetail(<MySubmissions />, (client) => {
      seeded(client);
      client.setQueryData(["my-submissions"], { results: [], count: 0 });
    });
    expect(html).toContain('data-record-detail="dialog"');
    expect(html).toContain("EQ-SITE-007");
    expect(html).toContain("DO-OUT-7");
  });

  it("opens nothing for a link that names no submission kind", () => {
    nav.search = "submission=NOT_A_KIND:mv-7";
    const html = renderDetail(<MySubmissions />, seeded);
    expect(html).not.toContain('data-record-detail="dialog"');
  });
});

describe("parseSubmissionParam", () => {
  it("reads <KIND>:<id> and refuses anything else", async () => {
    const { parseSubmissionParam } = await import("@/components/field-staff/my-submissions");
    expect(parseSubmissionParam("PROGRESS:pg-1")).toEqual({ kind: "PROGRESS", id: "pg-1" });
    expect(parseSubmissionParam("PROGRESS:")).toBeNull();
    expect(parseSubmissionParam(":pg-1")).toBeNull();
    expect(parseSubmissionParam("BOGUS:pg-1")).toBeNull();
    expect(parseSubmissionParam(null)).toBeNull();
  });
});
