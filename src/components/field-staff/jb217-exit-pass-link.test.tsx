/**
 * JB217: a 出门条's notice opens the 出门条 itself (contract §5) -
 * `exit_pass=<KIND>:<id>` - on the gate phone over its 拍照 page, on a site
 * staff or safety manager's phone over whatever tab, and in the office over
 * the notification centre every account reaches (a safety manager may hold
 * 「安全验收」 without the exit's own page, plan D3). The applicant reads the
 * sections, read-only, on their own record in 我提交过的.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { parseExitPassParam } from "@/interfaces/exit-pass";
import { fieldNotificationHref } from "@/lib/field-notification";
import { officeNotificationHref } from "@/lib/office-notification";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("@/services/api-client", () => ({ api, toastSuccess }));
const service = await import("@/services/exit-pass.service");

const ROOT = path.join(process.cwd(), "src");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

describe("the 出门条 link (JB217)", () => {
  it("reads 「<KIND>:<id>」 for the four exit kinds only", () => {
    expect(parseExitPassParam("MATERIAL_OUTGOING:mo-1")).toEqual({ kind: "MATERIAL_OUTGOING", record: "mo-1" });
    expect(parseExitPassParam("DISPOSAL_REQUEST:d-1")).toEqual({ kind: "DISPOSAL_REQUEST", record: "d-1" });
    expect(parseExitPassParam("HAZARD:h-1")).toBeNull();
    expect(parseExitPassParam("MATERIAL_OUTGOING:")).toBeNull();
    expect(parseExitPassParam("")).toBeNull();
    expect(parseExitPassParam(null)).toBeNull();
  });

  it("keeps the gate's 待放行 link as it is on the phone (one item, not a whole tab)", () => {
    const href = "/field-staff?tab=records&record=gate&exit_pass=MATERIAL_OUTGOING%3Amo-1";
    expect(fieldNotificationHref(href, { record_kind: "MATERIAL_OUTGOING", record_id: "mo-1" })).toBe(href);
  });

  it("keeps the applicant's and the safety manager's phone link too - not their 我提交过的 row", () => {
    const href = "/field-staff?exit_pass=EQUIPMENT_MOVEMENT%3Aeo-1";
    expect(fieldNotificationHref(href, { record_kind: "EQUIPMENT_MOVEMENT", record_id: "eo-1" })).toBe(href);
  });

  it("opens over the office's notification centre, from the record-page link or from the notice's data", () => {
    expect(
      officeNotificationHref({
        href: "/material-outgoing?record=mo-1&project=p-1&exit_pass=MATERIAL_OUTGOING:mo-1",
      }),
    ).toBe("/notifications?exit_pass=MATERIAL_OUTGOING%3Amo-1");
    expect(
      officeNotificationHref({ href: "/waste-outgoing?record=wo-1", exit_pass: "WASTE_OUTGOING:wo-1" }),
    ).toBe("/notifications?exit_pass=WASTE_OUTGOING%3Awo-1");
    // Any other record page is left alone.
    expect(officeNotificationHref({ href: "/material-outgoing?record=mo-1" })).toBe("/material-outgoing?record=mo-1");
  });

  it("the phone's workspace and the office's notification centre open the window from the link", () => {
    for (const file of ["components/field-staff/field-staff-workspace.tsx", "components/notifications/notifications.tsx"]) {
      const code = read(file);
      expect(code, file).toContain('parseExitPassParam(searchParams.get("exit_pass"))');
      expect(code, file).toContain('useClearSearchParam("exit_pass")');
      expect(code, file).toContain("<ExitPassWindow kind={exitPass.kind} record={exitPass.record} onClose={clearExitPass} />");
    }
  });

  it("the window opens over any tab: it is outside the workspace's tabs, beside 访客到访", () => {
    const code = read("components/field-staff/field-staff-workspace.tsx");
    const window = code.indexOf("<ExitPassWindow");
    expect(window).toBeGreaterThan(code.indexOf("<VisitorArrivalDialog"));
    expect(window).toBeLessThan(code.indexOf("<FieldStaffWorkspaceContent"));
  });
});

describe("the applicant's own record on the phone (JB217-6: 「手机端均须完整显示该栏」)", () => {
  it("我提交过的 shows the 出门条 parts, read-only, on the four exit kinds", () => {
    const code = read("components/field-staff/my-submissions.tsx");
    expect(code).toContain(
      "exitPass={isExitPassKind(row.kind) ? { kind: row.kind, recordId: row.id, readOnly: true } : null}",
    );
  });

  it("现场记录中心 shows them read-only too", () => {
    const code = read("components/contractor-ops/archive-queue.tsx");
    expect(code).toContain(
      "exitPass={loaded && isExitPassKind(row.kind) ? { kind: row.kind, recordId: row.id, readOnly: true } : null}",
    );
  });

  it("each of the four exit windows passes its own kind, on one line (材料领用 and a machine's entry pass none)", () => {
    expect(read("components/contractor-ops/operations-workspaces.tsx")).toContain(
      'exitPass={issue ? null : { kind: "MATERIAL_OUTGOING", recordId: row.id }}',
    );
    expect(read("components/contractor-ops/office-module-lists.tsx")).toContain(
      'exitPass={shownMovement.direction === "EXIT" ? { kind: "EQUIPMENT_MOVEMENT", recordId: shownMovement.id } : null}',
    );
    expect(read("components/contractor-ops/waste-outgoing-workspace.tsx")).toContain(
      'exitPass={{ kind: "WASTE_OUTGOING", recordId: shown.id }}',
    );
    expect(read("components/contractor-ops/site-disposal-workspaces.tsx")).toContain(
      'exitPass={{ kind: "DISPOSAL_REQUEST", recordId: row.id }}',
    );
  });
});

describe("the requests (contract §2-§4)", () => {
  const entries = (body: FormData) => [...body.entries()].map(([key, value]) => [key, value instanceof File ? `file:${value.name}` : value]);

  it("reads one pass by kind and record", () => {
    service.getExitPass("WASTE_OUTGOING", "wo-1");
    expect(api.get).toHaveBeenLastCalledWith("/api/exit-passes/get_pass/", { kind: "WASTE_OUTGOING", record: "wo-1" });
  });

  it("signs with the drawn signature and the switch", async () => {
    api.post.mockResolvedValueOnce({ state: "sent", reference: "MO-1" });
    await service.signExitPass("MATERIAL_OUTGOING", "mo-1", new File(["x"], "sig.png"), false);
    const [url, body] = api.post.mock.lastCall!;
    expect(url).toBe("/api/exit-passes/sign/");
    expect(entries(body)).toEqual([
      ["kind", "MATERIAL_OUTGOING"],
      ["record", "mo-1"],
      ["signature", "file:sig.png"],
      ["external_required", "false"],
    ]);
    expect(toastSuccess).toHaveBeenLastCalledWith("exitPass.toast.signedSent", { reference: "MO-1" });
  });

  it("sets 「需要外部审批」 as JSON, and the waive toasts that the 出门条 went out", async () => {
    api.post.mockResolvedValueOnce({ reference: "MO-1" });
    await service.setExitPassExternalRequired("MATERIAL_OUTGOING", "mo-1", true);
    expect(api.post).toHaveBeenLastCalledWith("/api/exit-passes/set_external_required/", {
      kind: "MATERIAL_OUTGOING",
      record: "mo-1",
      required: true,
    });
    api.post.mockResolvedValueOnce({ reference: "MO-1" });
    await service.setExitPassExternalRequired("MATERIAL_OUTGOING", "mo-1", false, true);
    expect(toastSuccess).toHaveBeenLastCalledWith("exitPass.toast.waived", { reference: "MO-1" });
  });

  it("registers the paper copy from 附件, or uploads it", async () => {
    api.post.mockResolvedValue({ reference: "MO-1" });
    const fields = { company: "业主 ABC", name: "Mr Lim", opinion: "", date: "2026-11-17" };
    await service.recordExitPassExternalPaper("MATERIAL_OUTGOING", "mo-1", { ...fields, attachment: "att-1" });
    expect(api.post.mock.lastCall![0]).toBe("/api/exit-passes/record_external_paper/");
    expect(entries(api.post.mock.lastCall![1])).toContainEqual(["attachment", "att-1"]);
    await service.recordExitPassExternalPaper("MATERIAL_OUTGOING", "mo-1", { ...fields, file: new File(["x"], "signed.pdf") });
    const uploaded = entries(api.post.mock.lastCall![1]);
    expect(uploaded).toContainEqual(["file", "file:signed.pdf"]);
    expect(uploaded.map(([key]) => key)).not.toContain("attachment");
  });

  it("signs 外部审批 online with 所属公司／部门, 审批意见 and the signature", async () => {
    api.post.mockResolvedValueOnce({ reference: "MO-1" });
    await service.signExitPassExternal("MATERIAL_OUTGOING", "mo-1", {
      company: "总部",
      opinion: "同意",
      signature: new File(["x"], "ext.png"),
    });
    expect(api.post.mock.lastCall![0]).toBe("/api/exit-passes/sign_external/");
    expect(entries(api.post.mock.lastCall![1])).toEqual([
      ["kind", "MATERIAL_OUTGOING"],
      ["record", "mo-1"],
      ["company", "总部"],
      ["opinion", "同意"],
      ["signature", "file:ext.png"],
    ]);
  });

  it("releases with the photos, their meta, the fix and one client_event_id (a resend is the same release)", async () => {
    api.post.mockResolvedValueOnce({ incident_no: "GT-1" });
    await service.releaseExit({
      kind: "MATERIAL_OUTGOING",
      record: "mo-1",
      clientEventId: "exit-1",
      photos: [
        { file: new File(["x"], "1.jpg"), captured_at: "2026-11-18T06:19:00Z", latitude: "3.1", longitude: "101.7", client_event_id: "p-1" },
      ],
      fix: { latitude: "3.1", longitude: "101.7", accuracy_m: "8" },
    });
    const [url, body] = api.post.mock.lastCall!;
    expect(url).toBe("/api/gate-incidents/release_exit/");
    const sent = entries(body);
    expect(sent).toContainEqual(["kind", "MATERIAL_OUTGOING"]);
    expect(sent).toContainEqual(["record", "mo-1"]);
    expect(sent).toContainEqual(["client_event_id", "exit-1"]);
    expect(sent).toContainEqual(["photos", "file:1.jpg"]);
    expect(sent).toContainEqual(["latitude", "3.1"]);
    const meta = JSON.parse(String(sent.find(([key]) => key === "photo_meta")![1]));
    expect(meta).toEqual([
      { captured_at: "2026-11-18T06:19:00Z", latitude: "3.1", longitude: "101.7", accuracy_m: null, client_event_id: "p-1" },
    ]);
    expect(toastSuccess).toHaveBeenLastCalledWith("exitPass.toast.released", { reference: "GT-1" });
  });

  it("reads the gate's 待放行, for one project or the phone's own", () => {
    service.getExitPassesWaiting("p-1");
    expect(api.get).toHaveBeenLastCalledWith("/api/exit-passes/get_waiting/", { project: "p-1" });
    service.getExitPassesWaiting();
    expect(api.get).toHaveBeenLastCalledWith("/api/exit-passes/get_waiting/", undefined);
  });
});

describe("the words the backend's tests read (contract §6), in all four languages", () => {
  type Catalogue = Record<string, Record<string, Record<string, string>>>;
  const catalogues = {
    zh: zh as unknown as Catalogue,
    "zh-TW": zhTW as unknown as Catalogue,
    en: en as unknown as Catalogue,
    ms: ms as unknown as Catalogue,
  };
  const CODES = [
    "exit_pass_not_applicable",
    "exit_pass_not_ready",
    "exit_pass_record_closed",
    "exit_pass_not_a_signer",
    "exit_pass_own_application",
    "exit_pass_already_signed",
    "exit_pass_signature_required",
    "exit_pass_needs_signature_first",
    "exit_pass_external_not_waiting",
    "exit_pass_external_not_allowed",
    "exit_pass_external_fields_required",
    "exit_pass_external_locked",
    "exit_pass_not_sent",
    "exit_pass_already_released",
    "exit_pass_release_phone_only",
    "exit_pass_external_pending",
  ];
  const ACTIONS = ["exit_pass_approve", "exit_pass_external", "exit_pass_waive_external"];
  const OPERATIONS = [
    "exit_pass_signed",
    "exit_pass_external_set",
    "exit_pass_external_waived",
    "exit_pass_external_signed",
    "exit_pass_external_paper_recorded",
    "exit_pass_external_paper_corrected",
    "exit_pass_sent",
    "exit_pass_released",
  ];

  it("words every new error code, PIN action and audit operation", () => {
    for (const [locale, messages] of Object.entries(catalogues)) {
      for (const code of CODES) expect(messages.errors.api[code], `${locale} errors.api.${code}`).toBeTruthy();
      for (const key of ACTIONS) expect(messages.signOff.action[key], `${locale} signOff.action.${key}`).toBeTruthy();
      for (const key of OPERATIONS) expect(messages.audit.operation[key], `${locale} audit.operation.${key}`).toBeTruthy();
      expect(messages.siteControl.gateCategory.EXIT_RELEASE, `${locale} EXIT_RELEASE`).toBeTruthy();
    }
  });

  it("uses the contract's Chinese, word for word", () => {
    const zh = catalogues.zh;
    expect(zh.errors.api.exit_pass_external_pending).toBe(
      "这笔还在等外部审批，现在不能确认归档；请先登记签回的文件或请对方在线签名，或改为不需要外部审批，再确认归档。",
    );
    expect(zh.errors.api.exit_pass_own_application).toBe(
      "这是你自己的申请，不能自己签出门条；请请这个项目的另一位安全经理签名。",
    );
    expect(zh.errors.api.exit_pass_not_sent).toBe(
      "这张出门条还没有发出，现在不能放行；请车辆先等候，并联系申请人或安全经理先签出门条。",
    );
    expect(zh.audit.operation.exit_pass_external_paper_corrected).toBe("更换签回的外部审批文件");
    expect(zh.signOff.action.exit_pass_approve).toBe("出门条批准（安全经理）签名");
    expect(zh.siteControl.gateCategory.EXIT_RELEASE).toBe("出场放行");
  });
});
