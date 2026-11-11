/**
 * JB166 (Lucas 11-11: 「这些按钮不consistent，歪来歪去的也是好乱，整理一下弄好看，
 * 查看整个系统有没有类似的问题然后执行修复」): one look for every record's
 * action group.
 *
 * - One size: the record panels' `sm`, and the shared buttons that sit in
 *   those groups (加进资料包, 删除, 撤回, 上传附件) take it rather than their own.
 * - One destructive look: `outline-destructive`, last in its group; the filled
 *   `destructive` is left to a confirmation dialog's confirm button.
 *
 * Rendered to static markup (the runner has no DOM); the bigger screens are
 * read as source for the order they put their buttons in.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { MaterialOutgoing } from "@/interfaces/contractor-ops";
import messages from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u1", is_field_staff: false }, can: () => true }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/material-outgoing",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/contractor-ops/pack-collect", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/contractor-ops/pack-collect")>()),
  RecordPackBadge: () => <span data-stub="pack-badge" />,
  usePackCollect: () => ({ collecting: null }),
}));

const { TooltipProvider } = await import("@/components/ui/tooltip");
const { Button } = await import("@/components/ui/button");
const { AddToPackageButton } = await import("@/components/contractor-ops/add-to-package");
const { DeleteRecordButton } = await import("@/components/shared/delete-record-button");
const { SundryWithdraw } = await import("@/components/sundry-claims/sundry-withdraw");
const { OutgoingActions } = await import("@/components/contractor-ops/operations-workspaces");

function draw(node: ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** Every `<button>` opening tag, in order. */
function buttons(html: string) {
  return html.match(/<button[^>]*>/g) ?? [];
}

function read(file: string) {
  return readFileSync(path.join(process.cwd(), "src", file), "utf8");
}

/** The source of one function, up to the next top-level declaration. */
function slice(source: string, from: string, to: string) {
  const start = source.indexOf(from);
  expect(start, from).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf(to, start + from.length));
}

describe("the destructive look", () => {
  it("is the outline button's shape in the destructive colour", () => {
    const [tag] = buttons(draw(<Button size="sm" variant="outline-destructive">取消清运</Button>));
    expect(tag).toContain('data-variant="outline-destructive"');
    expect(tag).toContain("h-8");
    expect(tag).toContain("border-destructive/50");
    expect(tag).toContain("text-destructive");
    expect(tag).toContain("dark:bg-field");
    // Not the filled red of a dialog's confirm (only on hover).
    expect(tag).not.toMatch(/[\s"]bg-destructive\/10\s/);
    expect(tag).toContain(" bg-card ");
  });
});

describe("shared buttons take the group's size", () => {
  it("加进资料包 is the record panel's size unless told otherwise", () => {
    const small = buttons(draw(<AddToPackageButton kind="DISPOSAL_REQUEST" recordId="d1" projectId="p1" reference="DR-1" />));
    expect(small).toHaveLength(1);
    expect(small[0]).toContain('data-size="sm"');
    expect(small[0]).toContain('data-variant="outline"');
    const full = buttons(draw(<AddToPackageButton kind="DISPOSAL_REQUEST" recordId="d1" projectId="p1" reference="DR-1" size="default" />));
    expect(full[0]).toContain('data-size="default"');
  });

  it("加进资料包's icon follows the button, not a size of its own", () => {
    const html = draw(<AddToPackageButton kind="DISPOSAL_REQUEST" recordId="d1" projectId="p1" reference="DR-1" />);
    expect(html).toMatch(/<svg[^>]*lucide-folder-plus/);
    expect(html).not.toMatch(/<svg[^>]*size-4[^>]*lucide-folder-plus|<svg[^>]*lucide-folder-plus[^>]*size-4/);
  });

  it("删除 with its word is a destructive action of the record; the bin alone stays a row icon", () => {
    const [worded] = buttons(draw(<DeleteRecordButton what="MR-1" onDelete={async () => undefined} />));
    expect(worded).toContain('data-variant="outline-destructive"');
    expect(worded).toContain('data-size="sm"');
    const [bin] = buttons(draw(<DeleteRecordButton iconOnly what="a.pdf" onDelete={async () => undefined} />));
    expect(bin).toContain('data-variant="outline"');
    expect(bin).toContain('data-size="icon"');
  });

  it("撤回 is the panel's size in the office and the phone's full width on the phone", () => {
    const office = buttons(draw(<SundryWithdraw id="s1" />)).at(-1)!;
    expect(office).toContain('data-variant="outline-destructive"');
    expect(office).toContain('data-size="sm"');
    expect(office).not.toContain("w-full");
    const phone = buttons(draw(<SundryWithdraw id="s1" phone />)).at(-1)!;
    expect(phone).toContain("h-11 w-full");
  });

  it("上传附件 and its form are plain `sm`, not shrunk to a third size", () => {
    const panel = read("components/shared/record-attachments.tsx");
    for (const tag of panel.match(/<Button[\s\S]*?>/g) ?? []) {
      expect(tag).not.toMatch(/h-7 px-2 text-xs/);
    }
  });
});

describe("material outgoing's decision row", () => {
  const row = {
    id: "o1",
    reference_no: "MO-1",
    status: "PENDING",
    has_return_note: false,
    project: "p1",
  } as unknown as MaterialOutgoing;

  it("is one size, the main step first and 退回 last in the destructive look", () => {
    const tags = buttons(draw(<OutgoingActions row={row} pending={false} onReview={() => {}} />));
    expect(tags).toHaveLength(3);
    for (const tag of tags) expect(tag).toContain('data-size="sm"');
    expect(tags[0]).toContain('data-variant="default"');
    expect(tags[2]).toContain('data-variant="outline-destructive"');
  });
});

describe("the screens put their buttons in one order", () => {
  it("垃圾清运: 加进资料包 among the steps, 报告异常 and 取消清运 last and alike", () => {
    const source = read("components/contractor-ops/site-disposal-workspaces.tsx");
    const actions = slice(source, "function DisposalActions(", "function DisposalStepDialogs(");
    const extra = actions.indexOf("{extra}");
    const anomaly = actions.indexOf('onStep("anomaly")');
    const cancel = actions.indexOf('onStep("cancelling")');
    expect(extra).toBeGreaterThan(actions.indexOf('onStep("numbers")'));
    expect(anomaly).toBeGreaterThan(extra);
    expect(cancel).toBeGreaterThan(anomaly);
    expect(actions).not.toContain('variant="destructive"');
    expect(actions).not.toContain("border-destructive");
    expect(actions.match(/variant="outline-destructive"/g)).toHaveLength(2);
    // Every step at the panel's size.
    expect(actions.match(/<Button /g)?.length).toBe(actions.match(/<Button size="sm"/g)?.length);
    const dialog = slice(source, "function DisposalDetailDialog(", "type DisposalStep");
    expect(dialog).toMatch(/extra=\{<AddToPackageButton kind="DISPOSAL_REQUEST"/);
  });

  it("材料进场: 验收 and 拒收 at the panel's size, 拒收 in the destructive look", () => {
    const review = slice(read("components/receipts/view-receipt.tsx"), "function ReviewDelivery(", "\nexport ");
    expect(review).not.toContain('size="lg"');
    expect(review).not.toContain('variant="destructive"');
    expect(review).toContain('variant="outline-destructive"');
  });

  it("a waste application's 取消 is the last button, no longer a ghost", () => {
    const source = read("components/contractor-ops/waste-outgoing-workspace.tsx");
    const actions = slice(source, "const renderActions = (row: WasteOutgoingRecord) => (", "\n  return (");
    expect(actions.indexOf("setCancelling(row)")).toBeGreaterThan(actions.indexOf("<AddToPackageButton"));
    expect(actions).toMatch(/variant="outline-destructive" onClick=\{\(\) => setCancelling\(row\)\}/);
  });

  it("整改: the hazard's buttons are one row at the panel's size", () => {
    const detail = slice(read("components/site-operations/safety.tsx"), "export function HazardRecordDetail(", "export function HazardInPlace(");
    const actions = detail.slice(detail.indexOf("actions={"), detail.indexOf("corrections={"));
    expect(actions).not.toContain("min-h-11");
    expect(actions).toContain("flex flex-wrap items-center gap-2");
  });
});

describe("the lint wall (check-ui-consistency 6)", () => {
  const script = path.join(process.cwd(), "scripts", "check-ui-consistency.mjs");

  function lint(body: string) {
    const root = mkdtempSync(path.join(tmpdir(), "jb166-"));
    try {
      mkdirSync(path.join(root, "src", "components", "probe"), { recursive: true });
      writeFileSync(path.join(root, "src", "components", "probe", "probe.tsx"), body);
      const run = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
      return `${run.stdout}${run.stderr}`;
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it("refuses a small filled-red button and an outline coloured red by hand", () => {
    const out = lint(
      [
        'const a = <Button size="sm" variant="destructive">取消</Button>;',
        'const b = <Button size="sm" variant="outline" className="border-destructive/50 text-destructive">报告异常</Button>;',
      ].join("\n"),
    );
    expect(out).toContain('probe.tsx:1: a small button in the filled "destructive" variant');
    expect(out).toContain("probe.tsx:2: an outline button coloured red by hand");
  });

  it("lets the dialog's confirm, a red icon and the destructive look through", () => {
    const out = lint(
      [
        'const a = <Button variant="destructive">确认取消</Button>;',
        'const b = <Button size="icon" variant="outline" className="text-destructive">x</Button>;',
        'const c = <Button size="sm" variant="outline-destructive">取消</Button>;',
      ].join("\n"),
    );
    expect(out).not.toContain("probe.tsx");
  });
});
