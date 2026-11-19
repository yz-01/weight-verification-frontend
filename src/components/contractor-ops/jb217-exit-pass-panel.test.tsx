/**
 * JB217 (客户 11-18 事项 2): the record window's 「出门条批准（安全经理）」,
 * 「外部审批」 and 「门岗放行」, in every state an older reader can meet -
 * each says what happened and what comes next, and no button is drawn that
 * the reader may not press.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { ExitPass } from "@/interfaces/exit-pass";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/material-outgoing",
  useSearchParams: () => new URLSearchParams(),
}));
const auth = vi.hoisted(() => ({
  user: { id: "u-office", is_field_staff: false } as { id: string; is_field_staff: boolean } | null,
  permissions: new Set<string>(["project.assign", "site_access.view"]),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: auth.user, can: (code: string) => auth.permissions.has(code) }),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { ExitPassPanel, ExitPassSections, SignDialog, PaperExternalDialog, WaiveExternalDialog, exitPassKey } =
  await import("@/components/contractor-ops/exit-pass-panel");
const { APPROVAL, RELEASE, SENT, exitPass, external } = await import(
  "@/components/contractor-ops/jb217-exit-pass-fixtures"
);

function sections(pass: ExitPass, readOnly = false) {
  return renderDetail(<ExitPassSections pass={pass} readOnly={readOnly} />);
}

/** The text of one part, by its marker. */
function part(html: string, name: "approval" | "external" | "release") {
  const start = html.indexOf(`data-exit-pass-part="${name}"`);
  expect(start, name).toBeGreaterThan(-1);
  const next = html.indexOf("data-exit-pass-part=", start + 10);
  return html.slice(start, next < 0 ? undefined : next);
}

describe("出门条批准（安全经理）, 外部审批, 门岗放行 (JB217)", () => {
  it("draws the three parts in the client's order: 出门条批准 → 外部审批 → 门岗放行 (D15)", () => {
    const html = sections(exitPass());
    const approval = html.indexOf('data-exit-pass-part="approval"');
    const ext = html.indexOf('data-exit-pass-part="external"');
    const release = html.indexOf('data-exit-pass-part="release"');
    expect(approval).toBeGreaterThan(-1);
    expect(ext).toBeGreaterThan(approval);
    expect(release).toBeGreaterThan(ext);
    expect(html).toContain("出门条批准（安全经理）");
    expect(html).toContain("外部审批");
    expect(html).toContain("门岗放行");
  });

  it("unsigned: 「未批准」, that nothing has been sent, and who may sign - first names and 「等 N 人」", () => {
    const html = part(
      sections(exitPass({ signers: { names: ["LILY TAN", "陈安全", "王五", "赵六", "钱七"], total: 9 } })),
      "approval",
    );
    expect(html).toContain("未批准");
    expect(html).toContain("还没有发出门条：等安全经理签名。");
    expect(html).toContain("等待安全经理签名批准（可以签的人：LILY TAN、陈安全、王五、赵六、钱七 等 9 人）");
    // Not a safety manager (an office approver): the sentence, no button.
    expect(html).not.toContain('data-exit-pass-sign="');
  });

  it("offers 【签名批准】 only to whom the server says may sign, and never on a read-only sheet", () => {
    const signer = exitPass({ can_sign: true });
    expect(part(sections(signer), "approval")).toContain('data-exit-pass-sign="');
    expect(part(sections(signer), "approval")).toContain("签名批准");
    expect(part(sections(signer, true), "approval")).not.toContain('data-exit-pass-sign="');
  });

  it("a project with no safety manager: the section's own three steps, no preset role named, no dead button (contract §9)", () => {
    const html = part(sections(exitPass({ no_signers: true, signers: { names: [], total: 0 } })), "approval");
    expect(html).toContain("data-exit-pass-no-signers");
    expect(html).toContain("这个项目还没有能签出门条的安全经理。请管理员照以下三步设置：");
    expect(html).toContain("「安全验收」");
    expect(html).toContain("「项目人员名单」");
    expect(html).toContain("账号已启用");
    // JB219 removes the preset role names: the steps never name one.
    expect(html).not.toContain("系统已预设");
    expect(html).not.toContain('data-exit-pass-sign="');
    // Whoever staffs projects gets the way there.
    expect(html).toContain("/projects/p-1#project-team");
  });

  it("signed: the safety manager's name and position, the signature on white, and 批准时间", () => {
    const html = part(
      sections(exitPass({ state: "sent", approval: APPROVAL, sent: SENT })),
      "approval",
    );
    expect(html).toContain("已批准");
    expect(html).toContain("LILY TAN");
    expect(html).toContain("Safety Manager · 安全部");
    expect(html).toContain("批准时间");
    expect(html).toContain("2026年11月18日");
    // Ink on paper in both modes (JB172).
    expect(html).toMatch(/bg-paper[^>]*data-paper/);
    expect(html).toContain("approval.png");
    expect(html).not.toContain("未批准");
  });

  it("sent: to whom and when, then 「等待门岗放行」 - or that the project has no gate phone, and where to add one", () => {
    const html = part(sections(exitPass({ state: "sent", approval: APPROVAL, sent: SENT })), "release");
    expect(html).toContain("出门条已发送给：申请人 ah ong；门岗 示范门岗 · ");
    expect(html).toContain("等待门岗放行");
    const alone = part(
      sections(
        exitPass({
          state: "sent",
          approval: APPROVAL,
          sent: { ...SENT, to: [SENT.to[0]], no_gate_phones: true },
        }),
      ),
      "release",
    );
    expect(alone).toContain("出门条已发送给：申请人 ah ong · ");
    expect(alone).toContain("这个项目还没有门岗手机账号，出门条只发给了申请人。请在「现场人员管理」为门岗开手机账号。");
  });

  it("released: 放行人员, time, check photos and the 门岗事项's number, with 【打开】", () => {
    const html = part(
      sections(exitPass({ state: "released", approval: APPROVAL, sent: SENT, releases: [RELEASE] })),
      "release",
    );
    expect(html).toContain("已放行");
    expect(html).toContain("已放行 · 示范门岗 · ");
    expect(html).toContain("核查照片 2 张");
    expect(html).toContain("GT-PRJ-0001-045");
    expect(html).toContain("打开");
    expect(html).not.toContain("等待门岗放行");
  });

  it("audit round 2 (F8): a 工地清运 that ended with no lorry released reads 「本清运已结束」 - no waiting line, no badge", () => {
    const html = part(
      sections(
        exitPass({
          kind: "DISPOSAL_REQUEST",
          multi_release: true,
          state: "sent",
          approval: APPROVAL,
          sent: SENT,
          can_release: false,
          release_ended: true,
        }),
      ),
      "release",
    );
    expect(html).toContain("data-exit-pass-release-ended");
    expect(html).toContain("本清运已结束");
    expect(html).not.toContain("等待门岗放行");
    expect(html).not.toContain("等待放行");
    expect(html).not.toContain("<button");
  });

  it("工地清运: one release per lorry, counted", () => {
    const html = part(
      sections(
        exitPass({
          kind: "DISPOSAL_REQUEST",
          multi_release: true,
          state: "sent",
          approval: APPROVAL,
          sent: SENT,
          releases: [RELEASE, { ...RELEASE, incident_id: "gt-2", incident_no: "GT-PRJ-0001-046" }],
          can_release: true,
        }),
      ),
      "release",
    );
    expect(html).toContain("已放行 2 车");
    expect(html).toContain("GT-PRJ-0001-045");
    expect(html).toContain("GT-PRJ-0001-046");
  });

  it("外部审批 off: 「本事项不需要外部审批」; switched off after signing: who and when", () => {
    expect(part(sections(exitPass()), "external")).toContain("本事项不需要外部审批，沿用内部批准流程。");
    const waived = part(
      sections(
        exitPass({
          state: "sent",
          approval: APPROVAL,
          sent: SENT,
          external: external({ waived_by_name: "王总", waived_at: "2026-11-18T06:30:00Z" }),
        }),
      ),
      "external",
    );
    expect(waived).toContain("已改为不需要外部审批（王总 · ");
  });

  it("the 「需要外部审批」 switch, for whom may set it before signing (switched on by mistake, switched off again)", () => {
    const html = part(sections(exitPass({ external: external({ can_set: true }) })), "external");
    expect(html).toContain("data-exit-pass-external-switch");
    expect(html).toContain("需要外部审批");
    expect(html).toContain("要业主或上级部门也签名的，打开这个开关");
    expect(part(sections(exitPass()), "external")).not.toContain("data-exit-pass-external-switch");
    // Required before signing: what happens after the signature.
    const required = part(
      sections(exitPass({ external: external({ status: "waiting", required: true, can_set: true }) })),
      "external",
    );
    expect(required).toContain("需要外部审批：安全经理签名后，打印或用【发送】发给业主／上级部门签署。");
  });

  it("waiting for 外部审批: the five labels still blank, how to do it, and only the buttons this reader may use", () => {
    const pass = exitPass({
      state: "awaiting_external",
      approval: APPROVAL,
      external: external({
        status: "waiting",
        required: true,
        can_sign_online: true,
        can_record_paper: true,
        can_waive: true,
      }),
    });
    const html = part(sections(pass), "external");
    for (const label of ["所属公司／部门", "审批人姓名", "审批意见", "签名", "日期"]) {
      expect(html, label).toContain(label);
    }
    expect(html).toContain("等待外部审批");
    expect(html).toContain("【打印】或【发送】");
    expect(html).toContain('data-exit-pass-online="');
    expect(html).toContain('data-exit-pass-paper="');
    expect(html).toContain("data-exit-pass-waive");
    expect(html).toContain("不需要外部审批，直接发出门条");
    // The gate waits too, and says so.
    expect(part(sections(pass), "release")).toContain("还没有发出门条：等外部审批完成。");
    // A reader with none of them (a consultant, an office reader): whose move it is.
    const reader = part(
      sections(exitPass({ ...pass, external: external({ status: "waiting", required: true }) })),
      "external",
    );
    expect(reader).not.toContain('data-exit-pass-online="');
    expect(reader).toContain("签回的文件由有这类记录审批权限的后台人员或安全经理在电脑上登记");
  });

  it("audit round 2 (F6): 【在线签名】 / 【不需要…】 only on their flags; the words name head office for online signing", () => {
    const base = { state: "awaiting_external" as const, approval: APPROVAL };
    // The project's approver: registers the paper, signs nothing online, waives nothing.
    const project = part(
      sections(exitPass({ ...base, external: external({ status: "waiting", required: true, can_record_paper: true }) })),
      "external",
    );
    expect(project).toContain('data-exit-pass-paper="');
    expect(project).not.toContain('data-exit-pass-online="');
    expect(project).not.toContain("data-exit-pass-waive");
    // Head office, not involved: online, and may waive.
    const head = part(
      sections(
        exitPass({
          ...base,
          external: external({ status: "waiting", required: true, can_sign_online: true, can_waive: true }),
        }),
      ),
      "external",
    );
    expect(head).toContain('data-exit-pass-online="');
    expect(head).toContain("data-exit-pass-waive");
    expect(head).not.toContain('data-exit-pass-paper="');
    expect(head).toContain(
      "总部的人（总部角色或公司管理员）有这类记录的审批权限、又没有参与这笔记录的，可以自己打开这笔记录按【在线签名】。",
    );
    // Neither: whose move it is, online signing named as head office's.
    const reader = part(
      sections(exitPass({ ...base, external: external({ status: "waiting", required: true }) })),
      "external",
    );
    expect(reader).toContain(
      "签回的文件由有这类记录审批权限的后台人员或安全经理在电脑上登记；在线签名要由没有参与这笔记录的总部的人（总部角色或公司管理员，并有这类记录的审批权限）在电脑上打开这笔记录签。",
    );
    expect(reader).not.toContain("对方在本系统有审批权限的");
  });

  it("audit round 2 (F7): 「见附件：…」 opens through the 出门条's own file address, not the record's 附件", () => {
    const source = readFileSync(path.join(__dirname, "exit-pass-panel.tsx"), "utf8");
    const start = source.indexOf("function PaperCopyLink");
    const link = source.slice(start, source.indexOf("\nfunction ", start + 10));
    expect(link).toContain("load={() => exitPassPaperCopyObjectUrl(pass.kind, pass.record)}");
    expect(link).toContain("onDownload={() => downloadExitPassPaperCopy(pass.kind, pass.record, file.name)}");
    expect(link).not.toContain("recordAttachmentObjectUrl");
    expect(link).not.toContain("downloadRecordAttachment");
  });

  it("外部审批 done online: the five values and the drawn signature on white", () => {
    const html = part(
      sections(
        exitPass({
          state: "sent",
          approval: APPROVAL,
          sent: SENT,
          external: external({
            status: "done",
            required: true,
            mode: "ONLINE",
            company: "示范建筑有限公司 · 总部",
            name: "王总",
            opinion: "同意",
            date: "2026-11-18",
            signature: "https://cdn.example/exit-pass/external.png",
            recorded_by_name: "王总",
            recorded_at: "2026-11-18T07:00:00Z",
          }),
        }),
      ),
      "external",
    );
    expect(html).toContain("外部审批已完成");
    expect(html).toContain("示范建筑有限公司 · 总部");
    expect(html).toContain("王总");
    expect(html).toContain("同意");
    expect(html).toContain("external.png");
    expect(html).toContain("在线签名：王总 · ");
  });

  it("外部审批 done on paper: 「见附件：…」, opened in place, and who registered it", () => {
    const html = part(
      sections(
        exitPass({
          state: "sent",
          approval: APPROVAL,
          sent: SENT,
          external: external({
            status: "done",
            required: true,
            mode: "PAPER",
            company: "业主 ABC",
            name: "Mr Lim",
            date: "2026-11-17",
            attachment: { id: "att-1", name: "signed.pdf", url: "https://cdn.example/signed.pdf" },
            recorded_by_name: "shifan.pm",
            recorded_at: "2026-11-18T07:00:00Z",
          }),
        }),
      ),
      "external",
    );
    expect(html).toContain("见附件：signed.pdf");
    expect(html).toContain("data-exit-pass-paper-file");
    expect(html).toContain("登记人：shifan.pm · ");
    expect(html).toContain("2026年11月17日");
  });

  it("a record from before this release: one grey sentence, no 外部审批 and no 门岗放行 parts (D12)", () => {
    const html = sections(exitPass({ state: "legacy", pass_id: null }));
    expect(html).toContain("本记录在出门条功能启用前已完成，没有出门条。");
    expect(html).not.toContain('data-exit-pass-part="external"');
    expect(html).not.toContain('data-exit-pass-part="release"');
    expect(html).not.toContain("未批准");
  });

  it("before the record's own approval: who signs, and when; a returned request has none", () => {
    expect(part(sections(exitPass({ state: "not_ready" })), "approval")).toContain(
      "申请批准后，由安全经理在这里签出门条。",
    );
    const rejected = sections(exitPass({ state: "not_ready", record_closed: "rejected" }));
    expect(part(rejected, "approval")).toContain("这笔申请没有批准，没有出门条。");
    expect(rejected).not.toContain('data-exit-pass-sign="');
  });

  it("an archived record that was never signed: says it ended, nothing to press anywhere", () => {
    const html = sections(
      exitPass({ record_closed: "archived", can_sign: false, external: external({ can_set: false }) }),
    );
    expect(html).toContain("这笔记录已归档，出门条不能再签名或放行。");
    expect(part(html, "approval")).toContain("未批准：这笔记录结束时，出门条还没有安全经理签名。");
    expect(html).not.toContain("<button");
  });

  it("a cancelled record whose pass was sent but never released: void, and the gate part says so too (v2 §11)", () => {
    const html = sections(
      exitPass({ state: "sent", record_closed: "cancelled", approval: APPROVAL, sent: SENT }),
    );
    expect(html).toContain("这笔记录已退回或已取消，出门条已失效，不能放行。");
    expect(part(html, "release")).toContain("这笔记录已经结束，门岗没有放行记录。");
    expect(part(html, "release")).not.toContain("等待门岗放行");
  });

  it("a cancelled record still waiting for 外部审批: no buttons, and it is not needed any more", () => {
    const html = part(
      sections(
        exitPass({
          state: "awaiting_external",
          record_closed: "cancelled",
          approval: APPROVAL,
          external: external({ status: "waiting", required: true, can_record_paper: true }),
        }),
      ),
      "external",
    );
    expect(html).toContain("这笔记录已经结束，外部审批不用再做。");
    expect(html).not.toContain('data-exit-pass-paper="');
  });

  it("the applicant is the project's only safety manager: says so, then the same three steps (v2 §11)", () => {
    const html = part(
      sections(exitPass({ no_signers: true, applicant_is_only_signer: true, signers: { names: [], total: 0 } })),
      "approval",
    );
    expect(html).toContain("这个项目只有申请人自己是安全经理，出门条要由另一位安全经理签名。请管理员照以下三步再加一位：");
    expect(html).toContain("「安全验收」");
    expect(html).not.toContain('data-exit-pass-sign="');
  });

  it("改正 after the signature: when and by whom, and that the pass shows the corrected record (v2 §11)", () => {
    const html = sections(
      exitPass({
        state: "sent",
        approval: APPROVAL,
        sent: SENT,
        corrected_after_approval: { at: "2026-11-18T07:30:00Z", by: "王总" },
      }),
    );
    expect(html).toContain("data-exit-pass-corrected");
    expect(html).toContain("出门条签名后，这笔记录在 ");
    expect(html).toContain(" 由 王总 改正过；这里显示的是改正后的资料。");
  });

  it("a paper copy registered, nothing released yet: 【换一个签回的文件】 with what it does (v2)", () => {
    const pass = exitPass({
      state: "sent",
      approval: APPROVAL,
      sent: SENT,
      external: external({
        status: "done",
        required: true,
        mode: "PAPER",
        company: "业主 ABC",
        name: "Mr Lim",
        date: "2026-11-17",
        attachment: { id: "att-1", name: "wrong.pdf", url: "" },
        recorded_by_name: "shifan.pm",
        recorded_at: "2026-11-18T07:00:00Z",
        can_correct_paper: true,
      }),
    });
    const html = part(sections(pass), "external");
    expect(html).toContain("换一个签回的文件");
    expect(html).toContain("选错了文件？选或上传正确的签回文件，原来的文件仍保留在附件里。");
    // The same dialog, filled with what was registered, and it says nothing is sent twice.
    const dialog = renderDetail(<PaperExternalDialog pass={pass} onClose={() => {}} />);
    expect(dialog).toContain("换一个签回的文件");
    expect(dialog).toContain('value="业主 ABC"');
    expect(dialog).toContain('value="Mr Lim"');
    expect(dialog).toContain('value="2026-11-17"');
    expect(dialog).toContain("出门条已经发过，不会再发一次。");
    // Released, or no right to: no button.
    const later = part(sections({ ...pass, external: { ...pass.external, can_correct_paper: false } }), "external");
    expect(later).not.toContain("换一个签回的文件");
  });

  it("the panel draws nothing for a record with no 出门条 (a 材料领用, a machine's entry)", () => {
    const html = renderDetail(<ExitPassPanel kind="MATERIAL_OUTGOING" recordId="min-1" />, (client) =>
      client.setQueryData(exitPassKey("MATERIAL_OUTGOING", "min-1"), exitPass({ state: "not_applicable" })),
    );
    expect(html).toBe("");
  });

  it("the panel says it is loading in a record window, and nothing on a read-only sheet", () => {
    expect(renderDetail(<ExitPassPanel kind="WASTE_OUTGOING" recordId="wo-1" />)).toContain("正在载入");
    expect(renderDetail(<ExitPassPanel kind="WASTE_OUTGOING" recordId="wo-1" readOnly />)).toBe("");
  });
});

describe("the 出门条 dialogs (JB217)", () => {
  it("【签名批准】: the pad, the switch, and the one sentence saying the 出门条 goes out at once", () => {
    const html = renderDetail(
      <SignDialog pass={exitPass({ can_sign: true, external: external({ can_set: true }) })} onClose={() => {}} />,
    );
    expect(html).toContain("签名批准出门条");
    expect(html).toContain("安全经理签名");
    expect(html).toContain("需要外部审批");
    expect(html).toContain('data-exit-pass-next="send"');
    expect(html).toContain("按【签名批准】后，出门条马上发给申请人和本项目门岗的手机。");
    // No signature yet: the button says what is missing.
    expect(html).toMatch(/title="[^"]*安全经理签名[^"]*"/);
  });

  it("【签名批准】 with 「需要外部审批」 on: the 出门条 waits for it", () => {
    const html = renderDetail(
      <SignDialog
        pass={exitPass({ can_sign: true, external: external({ can_set: true, required: true, status: "waiting" }) })}
        onClose={() => {}}
      />,
    );
    expect(html).toContain('data-exit-pass-next="external"');
    expect(html).toContain("先等外部审批；外部审批完成后，才把出门条发给申请人和门岗。");
  });

  it("【登记签回的文件】: a file already in 附件 or one uploaded now, the four fields, and what saving does", () => {
    const pass = exitPass({
      state: "awaiting_external",
      approval: APPROVAL,
      external: external({ status: "waiting", required: true, can_record_paper: true }),
    });
    const html = renderDetail(<PaperExternalDialog pass={pass} onClose={() => {}} />, (client) =>
      client.setQueryData(["record-attachments", "MATERIAL_OUTGOING", "mo-1"], {
        kind: "MATERIAL_OUTGOING",
        record: "mo-1",
        attachments: [
          {
            id: "att-1",
            record_kind: "MATERIAL_OUTGOING",
            record_id: "mo-1",
            original_name: "signed-by-owner.pdf",
            content_type: "application/pdf",
            preview_type: "application/pdf",
            byte_size: 1000,
            note: "",
            uploaded_by_name: "shifan.pm",
            uploaded_at: "2026-11-18T06:40:00Z",
            url: "",
          },
        ],
        closed: "",
        max_files: 10,
        max_bytes: 10_000_000,
      }),
    );
    expect(html).toContain("登记签回的文件");
    expect(html).toContain("signed-by-owner.pdf");
    expect(html).toContain("现在上传");
    for (const label of ["签回的文件", "所属公司／部门", "审批人姓名", "审批意见", "日期"]) {
      expect(html, label).toContain(label);
    }
    expect(html).toContain("按【保存】后，外部审批算完成，出门条马上发给申请人和本项目门岗。");
    // Nothing chosen yet: 保存 names what is missing.
    expect(html).toMatch(/title="[^"]*签回的文件[^"]*"/);
  });

  it("【不需要外部审批，直接发出门条】: one plain sentence, the contract's own", () => {
    const html = renderDetail(<WaiveExternalDialog pass={exitPass()} onClose={() => {}} />);
    expect(html).toContain("确定这一笔不需要外部审批？出门条会马上发给申请人和门岗，之后不能再改回需要外部审批。");
    expect(html).toContain("确定，直接发出门条");
  });
});
