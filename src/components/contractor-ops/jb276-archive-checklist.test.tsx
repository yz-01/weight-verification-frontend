/**
 * JB276 + JB281 (客户 11-26 事项 17、22) on screen.
 *
 * - 「确认归档」 of a 材料进场 / 材料退场 shows the client's text, lists the
 *   required items still missing and keeps the button locked; the tick box
 *   「我已核对所有资料，确认无误。」 must be ticked; the PIN comes after.
 * - Archived, it says nobody can change or delete it; the receipt's and the
 *   return's change buttons are gone, with the reason.
 * - A 材料退场 shows its seven steps (done / current / locked) and
 *   「确认正式退场」 stays locked until the gate's photographs are in.
 * - Every word in four languages.
 *
 * Rendered to static markup - the runner has no DOM.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { MaterialOutgoing, ReturnFlowStep } from "@/interfaces/contractor-ops";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

let onPhone = false;
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-office", full_name: "Wang HQ", is_field_staff: onPhone },
    can: () => true,
  }),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/material-outgoing",
}));

const { RecordClosurePanel, recordClosureKey } = await import("@/components/shared/record-closure");
const { ReturnFlowSteps } = await import("@/components/contractor-ops/return-flow-steps");
const { OutgoingActions } = await import("@/components/contractor-ops/operations-workspaces");

function render(node: React.ReactNode, seed?: (client: QueryClient) => void, messages: object = zh) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  seed?.(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function buttonWith(html: string, text: string): string {
  const match = [...html.matchAll(/<button([^>]*)>((?:(?!<\/button>)[\s\S])*)<\/button>/g)].find((m) =>
    m[2].includes(text),
  );
  expect(match, `a button reading ${text}`).toBeTruthy();
  return match![1];
}

const closure = (state: object) => (client: QueryClient) =>
  client.setQueryData(recordClosureKey("MATERIAL_RECEIPT", "r-1"), {
    kind: "MATERIAL_RECEIPT",
    record: "r-1",
    ready: true,
    closed: false,
    closure: null,
    ...state,
  });

const CLIENT_TEXT =
  "请认真核对所有资料，包括供应商、材料名称、规格、单位、数量、车牌号码、DO（送货单及读取资料）、相关照片及签收记录。";

describe("确认归档 of a 材料进场 / 材料退场 (JB276)", () => {
  it("shows the client's text exactly, instead of the old one", () => {
    expect(zh.jb276.help).toBe(CLIENT_TEXT);
    const html = render(<RecordClosurePanel kind="MATERIAL_RECEIPT" recordId="r-1" />, closure({ checklist: true, missing: [] }));
    expect(html).toContain(CLIENT_TEXT);
    expect(html).not.toContain("系统不做任何前置判断");
    expect(html).not.toContain("电脑后台仍可改正");
  });

  it("lists every missing item in plain words and keeps the button and the tick locked", () => {
    const missing = ["supplier", "material_name", "specification", "unit", "quantity", "vehicle_plate", "do_photo", "do_data", "photos", "signatures"];
    const html = render(<RecordClosurePanel kind="MATERIAL_RECEIPT" recordId="r-1" />, closure({ checklist: true, missing }));
    expect(html).toContain(zh.jb276.missingTitle);
    for (const code of missing) {
      expect(html).toContain(`data-archive-missing-item="${code}"`);
      expect(html).toContain((zh.jb276.missing as Record<string, string>)[code]);
    }
    expect(buttonWith(html, zh.recordClosure.action)).toMatch(/\sdisabled=""/);
    expect(html).toMatch(/data-archive-tick[\s\S]*disabled=""/);
  });

  it("a code it has no words for still reads as plain words", () => {
    const html = render(<RecordClosurePanel kind="MATERIAL_RECEIPT" recordId="r-1" />, closure({ checklist: true, missing: ["a_later_code"] }));
    expect(html).toContain(zh.jb276.missing.other);
    expect(html).not.toContain(">a_later_code<");
  });

  it("asks for the tick before the button goes, and says the PIN comes next", () => {
    const html = render(<RecordClosurePanel kind="MATERIAL_RECEIPT" recordId="r-1" />, closure({ checklist: true, missing: [] }));
    expect(html).toContain(zh.jb276.tick);
    expect(html).toContain("（必须勾选）");
    expect(html).toContain(zh.jb276.pinNext);
    expect(buttonWith(html, zh.recordClosure.action)).toMatch(/\sdisabled=""/);
  });

  it("another kind keeps its own box, with no checklist", () => {
    const html = render(<RecordClosurePanel kind="MATERIAL_RECEIPT" recordId="r-1" />, closure({}));
    expect(html).toContain(zh.recordClosure.help);
    expect(html).not.toContain("data-archive-tick");
    expect(buttonWith(html, zh.recordClosure.action)).not.toMatch(/\sdisabled=""/);
  });

  it("archived: says who and when, and that nobody can change or delete it", () => {
    const html = render(
      <RecordClosurePanel kind="MATERIAL_RECEIPT" recordId="r-1" />,
      closure({
        checklist: true,
        missing: [],
        closed: true,
        closure: { confirmed_by: "u", confirmed_by_name: "Wang HQ", confirmed_at: "2026-11-26T03:00:00Z", note: "" },
      }),
    );
    expect(html).toContain("Wang HQ");
    expect(html).toContain("任何人都不能修改或删除这笔记录，包括总部管理员");
    expect(html).not.toContain("仍可改正");
  });
});

const STEPS = (states: ReturnFlowStep["state"][]): ReturnFlowStep[] =>
  (["applied", "approved", "site_exit", "exit_pass", "gate", "exit_confirmed", "archived"] as const).map(
    (key, index) => ({
      key,
      state: states[index],
      by: states[index] === "done" ? `Person ${index + 1}` : "",
      at: states[index] === "done" ? "2026-11-26T03:00:00Z" : null,
    }),
  );

describe("材料退场's seven steps (JB281)", () => {
  it("lists them in the client's order with who and when, the current one and the locked ones", () => {
    const html = render(
      <ReturnFlowSteps steps={STEPS(["done", "done", "done", "done", "current", "locked", "locked"])} />,
    );
    const order = Object.values(zh.jb281.step).map((words) => html.indexOf(words));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("Person 1");
    expect(html).toContain('data-return-step="gate" data-return-step-state="current"');
    expect(html).toContain('data-return-step="archived" data-return-step-state="locked"');
    expect(html).toContain(zh.jb281.state.locked);
  });

  const row = (steps: ReturnFlowStep[]): MaterialOutgoing =>
    ({
      id: "o-1",
      reference_no: "MO-XP-001",
      project: "p-1",
      kind: "RETURN",
      status: "PROCESSED",
      supplier: "s-1",
      supplier_name: "AAA",
      needs_supplier: false,
      has_return_note: true,
      material_name: "水泥",
      quantity: "10",
      unit: "BAG",
      photos: [],
      return_steps: steps,
    }) as unknown as MaterialOutgoing;

  it("「确认正式退场」 stays locked, saying why, until the gate's photographs are in", () => {
    const html = render(
      <OutgoingActions row={row(STEPS(["done", "done", "done", "done", "current", "locked", "locked"]))} pending={false} onReview={() => {}} />,
    );
    expect(html).toContain(zh.jb281.waitGate);
    expect(buttonWith(html, "确认正式退场")).toMatch(/\sdisabled=""/);
  });

  it("opens once the gate has released it", () => {
    const html = render(
      <OutgoingActions row={row(STEPS(["done", "done", "done", "done", "done", "current", "locked"]))} pending={false} onReview={() => {}} />,
    );
    expect(html).not.toContain(zh.jb281.waitGate);
    expect(buttonWith(html, "确认正式退场")).not.toMatch(/\sdisabled=""/);
  });
});

describe("the phone shows no approval (Lucas 11-26 「手机不应该出现审批才对」)", () => {
  const outgoing = (status: string, kind = "RETURN"): MaterialOutgoing =>
    ({
      id: "o-1", reference_no: "MO-XP-001", project: "p-1", kind, status, supplier: "s-1",
      supplier_name: "AAA", needs_supplier: false, has_return_note: status !== "PENDING",
      material_name: "水泥", quantity: "10", unit: "BAG", photos: [],
    }) as unknown as MaterialOutgoing;
  const office = zh.contractorOps;

  it("a phone account with every permission sees no Return Note, 批准, 驳回 or 确认正式退场", () => {
    onPhone = true;
    try {
      for (const kind of ["RETURN", "ISSUE"]) {
        const pending = render(<OutgoingActions row={outgoing("PENDING", kind)} pending={false} onReview={() => {}} />);
        expect(pending).not.toContain("<button");
        expect(pending).not.toContain(`>${office.action.approve}<`);
        expect(pending).not.toContain(office.outgoing.returnAction);
        expect(pending).not.toContain(office.returnNote.fill);
        expect(pending).not.toContain(office.returnNote.edit);
        expect(pending).toContain(zh.jb281.phoneWaitApproval);
        const processed = render(<OutgoingActions row={outgoing("PROCESSED", kind)} pending={false} onReview={() => {}} />);
        expect(processed).not.toContain(office.outgoing.finalConfirm);
        expect(processed).not.toContain(office.issue.finalConfirm);
        expect(processed).not.toContain("<button");
      }
    } finally {
      onPhone = false;
    }
  });

  it("the office keeps them", () => {
    const pending = render(<OutgoingActions row={outgoing("PENDING")} pending={false} onReview={() => {}} />);
    expect(pending).toContain(office.action.approve);
    expect(pending).toContain(office.outgoing.returnAction);
    expect(pending).toContain(office.returnNote.fill);
  });
});

describe("the gate photographs 车辆、车牌、退场货物 (JB281 step 5)", () => {
  const gateStep = (photos: { shot: "VEHICLE" | "PLATE" | "GOODS" }[]): ReturnFlowStep => ({
    key: "gate",
    state: "done",
    by: "Guard One",
    at: "2026-11-26T03:00:00Z",
    incident_no: "GT-XP-001",
    photos: photos.length,
    shots: { VEHICLE: 1, PLATE: 1, GOODS: 1 },
    gate_photos: photos.map((photo, index) => ({
      id: `g-${index}`,
      shot: photo.shot,
      image: `https://x.test/${photo.shot}.jpg`,
      captured_at: "2026-11-26T03:00:00Z",
    })),
  });

  it("the gate phone has one labelled camera per shot, and 确认放行 waits for all three", async () => {
    const { ReleaseShotCameras, ReleaseCaptureView } = await import("@/components/site-access/exit-pass-window");
    const empty = { photos: [], add: () => {}, remove: () => {}, clear: () => {} };
    const html = render(<ReleaseShotCameras cameras={{ VEHICLE: empty, PLATE: empty, GOODS: empty }} />);
    for (const shot of ["VEHICLE", "PLATE", "GOODS"]) {
      expect(html).toContain(`data-release-shot="${shot}"`);
      expect(html).toContain((zh.jb281.shot as Record<string, string>)[shot]);
    }
    expect(html).toContain(zh.jb281.gateShotsHint);
    const locked = render(
      <ReleaseCaptureView
        photosTaken={2}
        missingReason={zh.jb281.gateNeedShots}
        offline={false}
        pending={false}
        error={null}
        done={null}
        multi={false}
        camera={null}
        onRelease={() => {}}
      />,
    );
    expect(locked).toContain(zh.jb281.gateNeedShots);
    expect(locked).toMatch(/data-exit-pass-release="confirm"[^>]*disabled=""|disabled=""[^>]*data-exit-pass-release="confirm"/);
  });

  it("the release sends each photo's shot", () => {
    const text = readFileSync(join(process.cwd(), "src/services/exit-pass.service.ts"), "utf8");
    expect(text).toContain("...(shot ? { shot } : {})");
    const window = readFileSync(join(process.cwd(), "src/components/site-access/exit-pass-window.tsx"), "utf8");
    expect(window).toContain('const labelled = pass.kind === "MATERIAL_OUTGOING";');
  });

  it("the step list shows the three, and 确认正式退场 shows them to the office", () => {
    const shots = [{ shot: "VEHICLE" as const }, { shot: "PLATE" as const }, { shot: "GOODS" as const }];
    const list = render(<ReturnFlowSteps steps={[gateStep(shots)]} />);
    for (const shot of ["VEHICLE", "PLATE", "GOODS"]) {
      expect(list).toContain(`data-gate-shot="${shot}"`);
      expect(list).toContain(`https://x.test/${shot}.jpg`);
    }
    const steps = STEPS(["done", "done", "done", "done", "done", "current", "locked"]).map((step) =>
      step.key === "gate" ? gateStep(shots) : step,
    );
    const actions = render(
      <OutgoingActions
        row={{ id: "o-1", reference_no: "MO-1", project: "p-1", kind: "RETURN", status: "PROCESSED", supplier: "s-1",
          needs_supplier: false, has_return_note: true, material_name: "水泥", quantity: "10", unit: "BAG", photos: [],
          return_steps: steps } as unknown as MaterialOutgoing}
        pending={false}
        onReview={() => {}}
      />,
    );
    expect(actions).toContain(zh.jb281.checkGatePhotos);
    expect(actions).toContain("data-exit-confirm-gate-photos");
    expect(actions).toContain("https://x.test/PLATE.jpg");
  });
});

describe("archived records offer no change (JB276 第 5 点)", () => {
  const source = (path: string) => readFileSync(join(process.cwd(), "src", path), "utf8");

  it("the receipt hides 归入分类, 更正, 修改材料明细 and 补拍照片 once archived, with the reason", () => {
    const text = source("components/receipts/view-receipt.tsx");
    expect(text).not.toContain("archived && archiveLocks");
    expect(text).toMatch(/can\("receipt\.update"\) && !data\.superseded_by && !archived && \(\s*<Button size="sm" variant="outline" onClick=\{\(\) => setFiling\(true\)\}/);
    expect(text).toContain('t("jb276.lockedNote")');
    expect(source("components/receipts/create-receipt.tsx")).toContain('t("jb276.lockedTitle")');
  });

  it("the return hides 上传文件 and says why", () => {
    const text = source("components/contractor-ops/operations-workspaces.tsx");
    expect(text).toContain("!finished && !finalReturn");
    expect(text).toContain('tRootDetail("jb276.lockedNote")');
  });
});

describe("four languages (中英文统一)", () => {
  const catalogues = { zh, "zh-TW": zhTW, en, ms } as const;
  const keys = (node: unknown, prefix = ""): string[] =>
    typeof node === "object" && node !== null
      ? Object.entries(node).flatMap(([key, value]) => keys(value, prefix ? `${prefix}.${key}` : key))
      : [prefix];

  it("every jb276 / jb281 word is in all four, with the same keys", () => {
    for (const group of ["jb276", "jb281"] as const) {
      const expected = keys(zh[group]).sort();
      for (const [locale, messages] of Object.entries(catalogues)) {
        expect(keys((messages as Record<string, unknown>)[group]).sort(), `${locale} ${group}`).toEqual(expected);
      }
    }
  });

  it("the new refusals and 操作记录 words are in all four", () => {
    for (const messages of Object.values(catalogues)) {
      for (const code of ["archived_record_final", "archive_items_missing", "archive_check_not_ticked", "return_gate_not_released"]) {
        expect((messages.errors.api as Record<string, string>)[code]).toBeTruthy();
      }
      for (const code of ["record_archive_checked", "return_exit_confirmed"]) {
        expect((messages.audit.operation as Record<string, string>)[code]).toBeTruthy();
      }
    }
    expect(zh.contractorOps.outgoing.finalConfirm).toBe("确认正式退场");
  });

  it("the Chinese says 你, never 您", () => {
    for (const messages of [zh, zhTW]) {
      expect(JSON.stringify([messages.jb276, messages.jb281])).not.toContain("您");
    }
  });
});
