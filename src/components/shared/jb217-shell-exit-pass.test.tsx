/**
 * JB217 (客户 11-18 事项 2, 图 4): 「在右侧现有签名区域下方设置独立的「出门条批准
 * （安全经理）」栏，上传附件区域往下移」 - in the record window's right column,
 * 签名 → 出门条批准（安全经理） → 附件 → 沟通记录, on a computer (the order in
 * the column) and on a phone (the `order-*` the one column follows); drawn for
 * a kind with no 签名 too; and 【确认归档】 says why it is off while 外部审批 is
 * owed (D11).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/material-outgoing",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1", is_field_staff: false }, can: () => true }),
}));
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: () => <div data-stub="conversation" />,
}));
vi.mock("@/components/shared/record-attachments", () => ({
  RecordAttachmentsPanel: () => <div data-stub="attachments" />,
  recordAttachmentsKey: (kind: string, id: string) => ["record-attachments", kind, id],
}));
vi.mock("@/components/shared/record-closure", () => ({
  RecordClosurePanel: ({ blocked }: { blocked?: { reason: string } | null }) => (
    <div data-stub="closure" data-blocked={blocked?.reason ?? ""} />
  ),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { RecordDetailShell } = await import("@/components/shared/record-detail-shell");
const { exitPassKey } = await import("@/components/contractor-ops/exit-pass-panel");
const { APPROVAL, exitPass, external } = await import("@/components/contractor-ops/jb217-exit-pass-fixtures");

const signature = { label: "现场人员签名", url: "https://cdn.example/sig.png" };

function render(withSignatures: boolean, seedState?: Parameters<typeof exitPass>[0]) {
  return renderDetail(
    <RecordDetailShell
      reference="MO-PRJ-0001-012"
      facts={[{ label: "项目", value: "示范商业大厦一期" }]}
      signatures={withSignatures ? [signature] : []}
      actions={<button type="button">确认退场完成</button>}
      conversation={{ kind: "MATERIAL_OUTGOING", recordId: "mo-1" }}
      closure={{ kind: "MATERIAL_OUTGOING", recordId: "mo-1" }}
      exitPass={{ kind: "MATERIAL_OUTGOING", recordId: "mo-1" }}
    />,
    (client) => client.setQueryData(exitPassKey("MATERIAL_OUTGOING", "mo-1"), exitPass(seedState)),
  );
}

/** The `order-*` class on the element that carries `marker`, or on its wrapper. */
function orderNear(html: string, marker: string) {
  const at = html.indexOf(marker);
  expect(at, marker).toBeGreaterThan(-1);
  const open = html.lastIndexOf("<", at);
  const before = html.slice(Math.max(0, open - 400), html.indexOf(">", at) + 1);
  const found = [...before.matchAll(/order-(\d+)/g)].map((match) => Number(match[1]));
  return found[found.length - 1];
}

describe("the shell's 出门条 slot (JB217)", () => {
  it("sits under 签名 and above 附件 and 沟通记录, in the column's order", () => {
    const html = render(true);
    const signatures = html.indexOf("现场人员签名");
    const pass = html.indexOf("data-shell-exit-pass");
    const attachments = html.indexOf('data-stub="attachments"');
    const conversation = html.indexOf('data-stub="conversation"');
    expect(signatures).toBeGreaterThan(-1);
    expect(pass).toBeGreaterThan(signatures);
    expect(attachments).toBeGreaterThan(pass);
    expect(conversation).toBeGreaterThan(attachments);
  });

  it("takes the same place on a phone's one column: 签名 7 → 出门条 8 → 附件 9 → 沟通 10", () => {
    const html = render(true);
    const seven = html.indexOf("order-7");
    expect(seven).toBeGreaterThan(-1);
    const signed = html.indexOf("现场人员签名", seven);
    expect(signed).toBeGreaterThan(seven);
    expect(signed).toBeLessThan(html.indexOf("data-shell-exit-pass"));
    expect(orderNear(html, "data-shell-exit-pass")).toBe(8);
    expect(orderNear(html, 'data-stub="attachments"')).toBe(9);
    expect(orderNear(html, 'data-stub="conversation"')).toBe(10);
  });

  it("leaves the record's own buttons first and untouched (「保留原有「确认退场完成」按钮」)", () => {
    const html = render(true);
    expect(html.indexOf("确认退场完成")).toBeLessThan(html.indexOf("data-shell-exit-pass"));
    expect(orderNear(html, "data-shell-actions")).toBe(2);
  });

  it("is drawn for a kind with no 签名 panel (环保材料出场, 工地清运)", () => {
    const html = render(false);
    expect(html).not.toContain("现场人员签名");
    expect(html).toContain("data-shell-exit-pass");
    expect(html).toContain("出门条批准（安全经理）");
  });

  it("is not there when the module passes none", () => {
    const html = renderDetail(
      <RecordDetailShell reference="MIN-1" facts={[]} conversation={{ kind: "MATERIAL_OUTGOING", recordId: "min-1" }} />,
    );
    expect(html).not.toContain("data-shell-exit-pass");
    expect(orderNear(html, 'data-stub="attachments"')).toBe(9);
  });

  it("keeps 【确认归档】 off with the reason while 外部审批 is owed (D11), and on otherwise", () => {
    const owed = render(true, {
      state: "awaiting_external",
      approval: APPROVAL,
      external: external({ status: "waiting", required: true }),
    });
    expect(owed).toContain(
      'data-blocked="这笔还在等外部审批，现在不能确认归档；请先登记签回的文件或请对方在线签名，或改为不需要外部审批，再确认归档。"',
    );
    expect(render(true)).toContain('data-blocked=""');
  });
});
