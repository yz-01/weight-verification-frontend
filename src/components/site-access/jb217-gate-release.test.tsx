/**
 * JB217 (客户 11-18 事项 2): 「门岗收到后，打开该事项检查车辆及货物，在事项内现场拍照，
 * 再确认放行。确认后，该条事项归入「门岗事项」保存，保留核查照片、放行人员及时间，
 * 并关联原申请。」
 *
 * The gate phone's 「待放行 (N)」, the 出门条 window with 【核查拍照】 and
 * 【确认放行】 (off, saying why, until there is a photo and while there is no
 * network; a failure keeps the photos and offers 【重试】), the second guard
 * who opens one already released, and the 门岗事项 it becomes.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { GateIncidentDetail } from "@/interfaces/site-access";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
const search = vi.hoisted(() => ({ value: "tab=records&record=gate" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/field-staff",
  useSearchParams: () => new URLSearchParams(search.value),
}));
const auth = vi.hoisted(() => ({
  user: { id: "u-guard", is_field_staff: true } as Record<string, unknown> | null,
  permissions: new Set<string>(["site_access.scan"]),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: auth.user, can: (code: string) => auth.permissions.has(code) }),
}));
vi.mock("@/components/providers/current-project-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/providers/current-project-provider")>()),
  usePageProject: () => ["all", () => {}],
  useProjectBoxShown: () => true,
}));
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: ({ kind }: { kind: string }) => <div data-stub="conversation" data-kind={kind} />,
}));
vi.mock("@/components/shared/record-export-button", () => ({
  RecordExportButton: ({ kind }: { kind: string }) => <div data-stub="export" data-kind={kind} />,
}));
vi.mock("@/components/site-access/gate-qr-scanner", () => ({ GateQrScanner: () => null }));

const { RECORDER, renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { ExitPassWaitingList, ExitPassWindow, ReleaseCaptureView } = await import(
  "@/components/site-access/exit-pass-window"
);
const { GateRecordsPanel } = await import("@/components/site-access/gate-records");
const { exitPassKey } = await import("@/components/contractor-ops/exit-pass-panel");
const { APPROVAL, RELEASE, SENT, exitPass } = await import("@/components/contractor-ops/jb217-exit-pass-fixtures");

const WAITING = {
  results: [
    {
      kind: "MATERIAL_OUTGOING",
      record: "mo-1",
      reference: "MO-PRJ-0001-012",
      project: "p-1",
      project_name: "示范商业大厦一期",
      summary: "111 · 10.000 Bag",
      vehicle_plate: "MMP 7007",
      sent_at: "2026-11-18T06:02:11Z",
      multi_release: false,
      release_count: 0,
    },
    {
      kind: "DISPOSAL_REQUEST",
      record: "disp-1",
      reference: "DISP-PRJ-0001-003",
      project: "p-1",
      project_name: "示范商业大厦一期",
      summary: "建筑垃圾",
      vehicle_plate: "",
      sent_at: "2026-11-18T05:00:00Z",
      multi_release: true,
      release_count: 1,
    },
  ],
  count: 2,
};

function view(props: Partial<Parameters<typeof ReleaseCaptureView>[0]>) {
  return renderDetail(
    <ReleaseCaptureView
      photosTaken={0}
      offline={false}
      pending={false}
      error={null}
      done={null}
      multi={false}
      camera={<div data-stub="camera" />}
      onRelease={() => {}}
      {...props}
    />,
  );
}

describe("the gate's 「待放行」 (JB217-7)", () => {
  it("lists the sent 出门条 with number, what goes, plate and when, each to open", () => {
    const html = renderDetail(<ExitPassWaitingList project="p-1" />, (client) =>
      client.setQueryData(["exit-passes", "waiting", "p-1"], WAITING),
    );
    expect(html).toContain("待放行 (2)");
    expect(html).toContain("MO-PRJ-0001-012");
    expect(html).toContain("材料出场");
    expect(html).toContain("111 · 10.000 Bag");
    expect(html).toContain("车牌 MMP 7007");
    expect(html).toContain("工地清运");
    expect(html).toContain("已放行 1 车");
    expect(html).toContain("打开");
  });

  it("says plainly when nothing is waiting", () => {
    const html = renderDetail(<ExitPassWaitingList project="p-1" />, (client) =>
      client.setQueryData(["exit-passes", "waiting", "p-1"], { results: [], count: 0 }),
    );
    expect(html).toContain("待放行 (0)");
    expect(html).toContain("现在没有待放行的出门条。车辆没有出门条的，请先等候，并联系申请人或安全经理。");
  });

  it("sits on the guard's 拍照 page, above the 拍照 / 扫码 buttons (no new page, JB104)", () => {
    const html = renderDetail(<GateRecordsPanel initialProject="p-1" />, (client) =>
      client.setQueryData(["exit-passes", "waiting", "p-1"], WAITING),
    );
    const waiting = html.indexOf("data-exit-pass-waiting");
    const buttons = html.indexOf("data-gate-actions");
    expect(waiting).toBeGreaterThan(-1);
    expect(buttons).toBeGreaterThan(waiting);
  });

  it("is not on an office screen (only a phone releases)", () => {
    const source = readFileSync(path.join(__dirname, "gate-records.tsx"), "utf8");
    expect(source).toContain("{mayScan && user?.is_field_staff ? <ExitPassWaitingList project={project} /> : null}");
  });
});

describe("【核查拍照】 and 【确认放行】 (JB217-7)", () => {
  it("keeps 【确认放行】 off until there is a check photo, and says so on the screen", () => {
    const html = view({ photosTaken: 0 });
    expect(html).toContain("核查拍照，确认放行");
    expect(html).toContain("检查车辆及货物");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-exit-pass-release="confirm"|data-exit-pass-release="confirm"[^>]*disabled=""/);
    expect(html).toContain('title="先拍至少一张核查照片"');
    expect(html).toContain("确认放行");
  });

  it("with a photo, 【确认放行】 can be pressed", () => {
    const html = view({ photosTaken: 2 });
    const button = html.slice(html.lastIndexOf("<button", html.indexOf('data-exit-pass-release="confirm"')));
    expect(button.slice(0, button.indexOf(">"))).not.toContain('disabled=""');
  });

  it("with no signal it stays off and says to go where there is signal - the photos stay", () => {
    const html = view({ photosTaken: 2, offline: true });
    expect(html).toContain('title="确认放行要有网络：请到有信号的地方再按。照片会留着。"');
  });

  it("no signal at the press: says so, keeps the photos and offers 【重试】 (contract v2 §11)", () => {
    const html = view({ photosTaken: 3, error: { reason: "手机没有网络", network: true } });
    expect(html).toContain("data-exit-pass-release-failed");
    expect(html).toContain("放行没有提交成功：手机没有网络。照片还在，请检查网络后按「重试」。");
    expect(html).toContain('data-exit-pass-release="retry"');
    expect(html).toContain("重试");
    // The photos are not the view's to drop: the button still sends them.
    const button = html.slice(html.lastIndexOf("<button", html.indexOf('data-exit-pass-release="retry"')));
    expect(button.slice(0, button.indexOf(">"))).not.toContain('disabled=""');
  });

  it("a refusal from the server: its own sentence (what happened, what to do), and the photos kept", () => {
    const html = view({
      photosTaken: 2,
      error: { reason: "这张出门条还没有发出，现在不能放行；请车辆先等候，并联系申请人或安全经理先签出门条。", network: false },
    });
    expect(html).toContain("放行没有提交成功：这张出门条还没有发出，现在不能放行；请车辆先等候");
    expect(html).toContain("2 张核查照片还在。");
  });

  it("after the release: which 门岗事项 it was filed as; a lorry of a clearance is counted", () => {
    expect(view({ done: { number: "GT-PRJ-0001-045", count: 1 } })).toContain("已放行，记入门岗事项 GT-PRJ-0001-045。");
    expect(view({ done: { number: "GT-PRJ-0001-046", count: 2 }, multi: true })).toContain(
      "第 2 车已放行，记入门岗事项 GT-PRJ-0001-046。下一车来时再拍照放行。",
    );
  });
});

describe("the 出门条 window (JB217-6, -7)", () => {
  it("shows the guard what goes, the plate, who applied with a number to call, both approvals - and the gate step", () => {
    const html = renderDetail(<ExitPassWindow kind="MATERIAL_OUTGOING" record="mo-1" onClose={() => {}} />, (client) =>
      client.setQueryData(
        exitPassKey("MATERIAL_OUTGOING", "mo-1"),
        exitPass({ state: "sent", approval: APPROVAL, sent: SENT, can_release: true }),
      ),
    );
    expect(html).toContain("出门条 · MO-PRJ-0001-012");
    expect(html).toContain("111 · 10.000 Bag");
    expect(html).toContain("MMP 7007");
    expect(html).toContain("ah ong");
    expect(html).toContain('href="tel:+60123456789"');
    expect(html).toContain("出门条显示的是这笔记录现在的资料。");
    expect(html).toContain("出门条批准（安全经理）");
    expect(html).toContain("LILY TAN");
    expect(html).toContain("外部审批");
    expect(html).toContain("data-exit-pass-release-capture");
    // The approval parts come before the gate step.
    expect(html.indexOf("data-exit-pass-release-capture")).toBeGreaterThan(html.indexOf("出门条批准（安全经理）"));
  });

  it("a second guard opening one already released: who released it and when, nothing to press", () => {
    const html = renderDetail(<ExitPassWindow kind="MATERIAL_OUTGOING" record="mo-1" onClose={() => {}} />, (client) =>
      client.setQueryData(
        exitPassKey("MATERIAL_OUTGOING", "mo-1"),
        exitPass({ state: "released", approval: APPROVAL, sent: SENT, releases: [RELEASE], can_release: false }),
      ),
    );
    expect(html).not.toContain("data-exit-pass-release-capture");
    expect(html).toContain("data-exit-pass-gate-note");
    expect(html).toContain("这张出门条已经由 示范门岗 在 ");
    expect(html).toContain("（GT-PRJ-0001-045），不用再放行。");
  });

  it("audit round 2 (F8): a 工地清运 that ended with no lorry: 「本清运已结束」, not 「等待放行」, nothing to press", () => {
    const html = renderDetail(<ExitPassWindow kind="DISPOSAL_REQUEST" record="disp-1" onClose={() => {}} />, (client) =>
      client.setQueryData(
        exitPassKey("DISPOSAL_REQUEST", "disp-1"),
        exitPass({
          kind: "DISPOSAL_REQUEST",
          record: "disp-1",
          multi_release: true,
          state: "sent",
          approval: APPROVAL,
          sent: SENT,
          can_release: false,
          release_ended: true,
        }),
      ),
    );
    expect(html).toContain("本清运已结束");
    expect(html).not.toContain("等待放行");
    expect(html).not.toContain("等待门岗放行");
    expect(html).not.toContain("data-exit-pass-release-capture");
  });

  it("a guard opening one not sent yet: why it cannot be released now", () => {
    const html = renderDetail(<ExitPassWindow kind="MATERIAL_OUTGOING" record="mo-1" onClose={() => {}} />, (client) =>
      client.setQueryData(exitPassKey("MATERIAL_OUTGOING", "mo-1"), exitPass()),
    );
    expect(html).toContain("这张出门条还没有发出，现在不能放行；请车辆先等候，并联系申请人或安全经理先签出门条。");
  });

  it("audit F1: the applicant's own 出门条 - one plain sentence, never 【核查拍照】 / 【确认放行】", () => {
    const html = renderDetail(<ExitPassWindow kind="MATERIAL_OUTGOING" record="mo-1" onClose={() => {}} />, (client) =>
      client.setQueryData(
        exitPassKey("MATERIAL_OUTGOING", "mo-1"),
        // Even were the server to say `can_release`, `release_blocked` wins.
        exitPass({ state: "sent", approval: APPROVAL, sent: SENT, can_release: true, release_blocked: "exit_pass_own_release" }),
      ),
    );
    expect(html).not.toContain("data-exit-pass-release-capture");
    expect(html).not.toContain("data-exit-pass-release=");
    expect(html).toContain("data-exit-pass-release-blocked");
    expect(html).toContain("这是你自己申请出场的东西，要由门岗检查车辆和货物后放行。");
  });

  it("audit F1: a project with gate phones - another phone is told to let the gate release it", () => {
    const html = renderDetail(<ExitPassWindow kind="MATERIAL_OUTGOING" record="mo-1" onClose={() => {}} />, (client) =>
      client.setQueryData(
        exitPassKey("MATERIAL_OUTGOING", "mo-1"),
        exitPass({ state: "sent", approval: APPROVAL, sent: SENT, can_release: false, release_blocked: "exit_pass_gate_release_only" }),
      ),
    );
    expect(html).not.toContain("data-exit-pass-release-capture");
    expect(html).toContain(
      "这个项目有门岗手机，出门条要由门岗检查放行。请让门岗在手机上打开出门条，拍照核查后按【确认放行】。",
    );
    // One sentence in that place, not the gate note as well.
    expect(html).not.toContain("data-exit-pass-gate-note");
  });

  it("audit F1: a window the gate did not open (the applicant's 「出门条已批准」) never draws the release step", () => {
    const html = renderDetail(
      <ExitPassWindow kind="MATERIAL_OUTGOING" record="mo-1" mayRelease={false} onClose={() => {}} />,
      (client) =>
        client.setQueryData(
          exitPassKey("MATERIAL_OUTGOING", "mo-1"),
          exitPass({ state: "sent", approval: APPROVAL, sent: SENT, can_release: true }),
        ),
    );
    expect(html).not.toContain("data-exit-pass-release-capture");
    expect(html).not.toContain("确认放行</button>");
  });

  it("a record with no 出门条 says so", () => {
    const html = renderDetail(<ExitPassWindow kind="MATERIAL_OUTGOING" record="min-1" onClose={() => {}} />, (client) =>
      client.setQueryData(exitPassKey("MATERIAL_OUTGOING", "min-1"), exitPass({ state: "not_applicable" })),
    );
    expect(html).toContain("这笔记录没有出门条。");
  });
});

describe("the 门岗事项 a release becomes (JB217-8)", () => {
  const release = {
    id: "gt-1",
    incident_no: "GT-PRJ-0001-045",
    project: "p-1",
    project_name: "示范商业大厦一期",
    category: "EXIT_RELEASE",
    gate_name: "",
    description: "",
    guard: "u-guard",
    guard_name: "示范门岗",
    occurred_at: "2026-11-18T06:20:00Z",
    latitude: null,
    longitude: null,
    accuracy_m: null,
    access_pass: null,
    pass_no: null,
    pass_subject_name: null,
    access_event: null,
    access_event_direction: null,
    access_event_at: null,
    photo_count: 2,
    cover_photo: null,
    is_issue: true,
    issue_status: "CLOSED",
    issue_note: "",
    closed_by_name: "示范门岗",
    closed_at: "2026-11-18T06:20:00Z",
    member_names: "",
    may_close: false,
    created_at: "2026-11-18T06:20:00Z",
    exit_record: { kind: "MATERIAL_OUTGOING", id: "mo-1", reference: "MO-PRJ-0001-012", project: "p-1" },
    photos: [
      {
        id: "ph-1",
        image: "https://cdn.example/1.jpg",
        watermarked_image: "https://cdn.example/1-stamped.jpg",
        gate_name: "",
        guard: "u-guard",
        guard_name: "示范门岗",
        captured_at: "2026-11-18T06:19:00Z",
        uploaded_at: "2026-11-18T06:20:00Z",
        latitude: "3.1",
        longitude: "101.7",
        accuracy_m: "8",
        client_event_id: "e-1",
        created_at: "2026-11-18T06:20:00Z",
      },
      {
        id: "ph-2",
        image: "https://cdn.example/2.jpg",
        watermarked_image: "https://cdn.example/2-stamped.jpg",
        gate_name: "",
        guard: "u-guard",
        guard_name: "示范门岗",
        captured_at: "2026-11-18T06:19:30Z",
        uploaded_at: "2026-11-18T06:20:00Z",
        latitude: "3.1",
        longitude: "101.7",
        accuracy_m: "8",
        client_event_id: "e-2",
        created_at: "2026-11-18T06:20:00Z",
      },
    ],
    members: [],
    ...RECORDER,
  } as unknown as GateIncidentDetail;

  it("keeps the check photos, 放行人员 and time, and links the original request with 【打开原记录】", () => {
    search.value = "tab=records&record=gate&gate_incident=gt-1";
    const html = renderDetail(<GateRecordsPanel />, (client) => client.setQueryData(["gate-incident", "gt-1"], release));
    search.value = "tab=records&record=gate";
    expect(html).toContain("出场放行");
    expect(html).toContain("关联原申请");
    expect(html).toContain("MO-PRJ-0001-012（材料出场）");
    expect(html).toContain("打开原记录");
    expect(html).toContain("放行人员");
    expect(html).toContain("放行时间");
    expect(html).toContain("2 张");
    expect(html).toContain("https://cdn.example/1-stamped.jpg");
    expect(html).toContain("data-gate-release");
    // Closed at once in the guard's name: nobody to ask in, nothing to finish.
    expect(html).not.toContain('data-gate-issue="open"');
    expect(html).not.toContain('panel-title">指定人员');
    expect(html).not.toContain("确认结束人");
  });

  it("the office's 门岗事项 list names the original request on its row", () => {
    const source = readFileSync(path.join(__dirname, "gate-records-office.tsx"), "utf8");
    expect(source).toContain('tRoot("exitPass.gateRecord.listNote"');
    expect(source).toContain("row.original.exit_record");
  });

  it("audit F3: the 门岗事项 export carries 「关联原申请」 (contract §7 `exit_record_no`), on the issues tab only", () => {
    const source = readFileSync(path.join(__dirname, "gate-records-office.tsx"), "utf8");
    const exporting = source.slice(source.indexOf("const runExport"), source.indexOf("const above"));
    const photos = exporting.slice(0, exporting.indexOf(": ["));
    const issues = exporting.slice(exporting.indexOf(": ["));
    expect(issues).toContain('{ key: "exit_record_no", label: tRoot("exitPass.gateRecord.linked") }');
    expect(photos).not.toContain("exit_record_no");
  });
});
