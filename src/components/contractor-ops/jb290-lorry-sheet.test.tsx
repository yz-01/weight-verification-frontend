/**
 * JB290 (客户 11-27d): 「请完善手机端垃圾清运流程，在门岗拍照上传之前，必须完成以下资料：
 * 填写车辆车牌号码。清运司机签名。工地现场负责人签名。以上资料全部必填，完成后才进入
 * 门岗拍照、上传及正式放行环节。车牌号码、双方签名及门岗照片必须关联同一条垃圾清运记录，
 * 并同步至后台预览、打印及归档资料，形成完整的清运证据闭环。」
 *
 * The server refuses every skip on its own (`contractor_ops/tests/test_jb290_lorry_sheet.py`);
 * these prove what the site phone, the gate phone and the office window draw and say.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { DisposalTrip } from "@/interfaces/contractor-ops";
import type { ExitPassLorry } from "@/interfaces/exit-pass";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/field-staff",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-site", full_name: "Ah Ong", is_field_staff: true }, can: () => true }),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { LorrySignDialog, LorrySignLines, LorrySignButton, extraLorrySeq, filledLorrySeq, lorrySheetMissing, lorrySheetStep, nextLorry } = await import(
  "@/components/contractor-ops/disposal-lorry-sheet"
);
const { ReleaseCaptureView, GateLorryCard } = await import("@/components/site-access/exit-pass-window");
const { ExitPassSections } = await import("@/components/contractor-ops/exit-pass-panel");
const { RELEASE, SENT, exitPass } = await import("@/components/contractor-ops/jb217-exit-pass-fixtures");

const here = (file: string) => readFileSync(path.join(__dirname, file), "utf8");
const root = (file: string) => readFileSync(path.join(__dirname, "..", "..", file), "utf8");
const LANGUAGES = { zh, "zh-TW": zhTW, en, ms } as const;

const SHEET = {
  id: "s-1",
  vehicle_plate: "WXY 1234",
  driver_name: "Murugan",
  driver_signature: "https://cdn.example/driver.png",
  site_signer_name: "Ah Ong",
  site_signature: "https://cdn.example/site.png",
  filled_by_name: "Ah Ong",
  signed_at: "2026-11-27T02:00:00Z",
};

function trip(seq: number, status: DisposalTrip["status"], extra: Partial<DisposalTrip> = {}): DisposalTrip {
  return {
    id: `t-${seq}`, seq, status, weight_kg: null, do_no: "", vehicle_plate: "", note: "",
    submitted_at: null, submitted_by_name: "", accepted_by_name: null, accepted_at: null,
    corrections: [], evidence: [], sheet: null, release: null, ...extra,
  };
}

const RELEASED = { incident_id: "gt-1", incident_no: "GT-PRJ-0001-045", by: "示范门岗", at: "2026-11-27T02:10:00Z", photo_count: 2 };

describe("JB290: which lorry the site fills and the gate releases", () => {
  it("is the first lorry still planned that the gate has not released", () => {
    const trips = [
      trip(2, "PLANNED"),
      trip(1, "PLANNED", { release: RELEASED, sheet: SHEET }),
      trip(3, "PLANNED"),
    ];
    expect(nextLorry({ trips })?.seq).toBe(2);
    expect(nextLorry({ trips: [trip(1, "SUBMITTED"), trip(2, "CANCELLED")] })).toBeNull();
  });

  it("keeps a lorry the driver sent early, once its sheet is in, as the one at the gate (QA290)", () => {
    const trips = [
      trip(1, "SUBMITTED", { release: RELEASED, sheet: SHEET }),
      trip(2, "SUBMITTED", { sheet: SHEET }),
      trip(3, "PLANNED"),
    ];
    expect(nextLorry({ trips })?.seq).toBe(2);
    // Sent without a sheet (before JB290, or no gate step): past, as before.
    expect(nextLorry({ trips: [trip(1, "SUBMITTED"), trip(2, "PLANNED")] })?.seq).toBe(2);
  });

  it("offers 【填写车牌和签名】 on a running job, also once every planned lorry has left (QA290: the fill adds one)", () => {
    const running = { status: "IN_PROGRESS" as const, trips_closed_at: null };
    expect(lorrySheetStep({ ...running, trips: [trip(1, "PLANNED")] }, { submit: true })).toBe("open");
    const allGone = [trip(1, "PLANNED", { release: RELEASED, sheet: SHEET }), trip(2, "CANCELLED")];
    expect(lorrySheetStep({ ...running, trips: allGone }, { submit: true })).toBe("open");
    expect(extraLorrySeq({ trips: allGone })).toBe(3);
    expect(extraLorrySeq({ trips: [] })).toBe(1);
    expect(lorrySheetStep({ ...running, trips: [trip(1, "PLANNED")] }, { submit: false })).toBeNull();
    expect(lorrySheetStep({ status: "COMPLETED", trips_closed_at: null, trips: [trip(1, "PLANNED")] }, { submit: true })).toBeNull();
    expect(lorrySheetStep({ status: "CANCELLED", trips_closed_at: null, trips: [trip(1, "PLANNED")] }, { submit: true })).toBeNull();
    expect(lorrySheetStep({ status: "REQUESTED", trips_closed_at: null, trips: [] }, { submit: true })).toBeNull();
    expect(renderDetail(<LorrySignButton step="open" onOpen={() => {}} />)).toContain("填写车牌和签名");
    expect(JSON.stringify(zh.jb290)).not.toContain("请后台先按【加一车】");
  });

  it("the extra lorry's form says it adds 第 N 车", () => {
    const row = {
      id: "d-1", reference_no: "DISP-1", status: "IN_PROGRESS", trips_closed_at: null,
      trips: [trip(1, "PLANNED", { release: RELEASED, sheet: SHEET })],
    } as unknown as Parameters<typeof LorrySignDialog>[0]["row"];
    const html = renderDetail(<LorrySignDialog row={row} onClose={() => {}} onSaved={() => {}} />);
    expect(html).toContain("第 2 车：车牌和签名");
    expect(html).toContain("之前批准的车都已经放行了。保存后会加上这一车（第 2 车），门岗就可以拍照放行。");
  });

  it("says 「第 N 车：车牌和签名已填」 on the card once the sheet is in (QA290)", () => {
    expect(filledLorrySeq({ trips: [trip(1, "PLANNED", { sheet: SHEET }), trip(2, "PLANNED")] })).toBe(1);
    expect(filledLorrySeq({ trips: [trip(1, "PLANNED", { sheet: SHEET, release: RELEASED }), trip(2, "PLANNED")] })).toBeNull();
    const html = renderDetail(<LorrySignButton step="open" filled={1} onOpen={() => {}} />);
    expect(html).toContain('data-lorry-sheet-filled="1"');
    expect(html).toContain("第 1 车：车牌和签名已填");
    expect(renderDetail(<LorrySignButton step="open" filled={null} onOpen={() => {}} />)).not.toContain("已填");
  });

  it("the record's buttons carry it beside 【拍车辆出场 / Gate Pass】", () => {
    const source = here("site-disposal-workspaces.tsx");
    expect(source).toContain('<LorrySignButton step={lorrySheetStep(row, { submit: can("disposal.submit") })} filled={filledLorrySeq(row)}');
    expect(source).toContain('case "lorrySheet":');
    expect(source).toContain("<LorrySignLines trip={trip} waiting={next?.id === trip.id} />");
    expect(root("services/contractor-ops.service.ts")).toContain("/sign_lorry/");
  });
});

describe("JB290: 「以上资料全部必填」 on the site phone", () => {
  it("names every missing item, in the form's order", () => {
    const sig = new File(["x"], "s.png", { type: "image/png" });
    expect(lorrySheetMissing({ plate: " ", driverName: "", siteName: "" })).toEqual([
      "plate", "driverName", "driverSignature", "siteName", "siteSignature",
    ]);
    expect(
      lorrySheetMissing({ plate: "wxy 1234", driverName: "Murugan", driverSignature: sig, siteName: "Ah Ong", siteSignature: sig }),
    ).toEqual([]);
  });

  it("draws the plate, both names and both signature pads; the site name is the account's", () => {
    const row = { id: "d-1", reference_no: "DISP-PRJ-0001-012", trips: [trip(1, "PLANNED")] };
    const html = renderDetail(
      <LorrySignDialog row={row as never} onClose={() => {}} onSaved={() => {}} />,
    );
    for (const words of ["第 1 车：车牌和签名", "车辆车牌号码", "清运司机姓名", "清运司机签名", "工地现场负责人姓名", "工地现场负责人签名", "保存，交给门岗"]) {
      expect(html).toContain(words);
    }
    expect(html).toContain('value="Ah Ong"');
    expect(html).toContain("全部必填");
    // Nothing filled: the save button is off.
    const button = html.slice(html.lastIndexOf("<button", html.indexOf("data-lorry-sheet-submit")));
    expect(button.slice(0, button.indexOf(">"))).toContain('disabled=""');
    expect(html).not.toContain("data-lorry-sheet-refill");
  });

  it("filled before and not released: says so, and a new fill replaces it", () => {
    const row = { id: "d-1", reference_no: "DISP-1", trips: [trip(1, "PLANNED", { sheet: SHEET, vehicle_plate: "WXY 1234" })] };
    const html = renderDetail(<LorrySignDialog row={row as never} onClose={() => {}} onSaved={() => {}} />);
    expect(html).toContain("这一车已经填过（WXY 1234），门岗还没有放行。");
  });
});

describe("JB290: 「车牌号码、双方签名及门岗照片必须关联同一条垃圾清运记录」 on the office window", () => {
  it("each lorry shows its plate, both signers with their signatures, who filled it and its 门岗放行", () => {
    const html = renderDetail(
      <LorrySignLines trip={trip(1, "PLANNED", { sheet: SHEET, vehicle_plate: "WXY 1234", release: RELEASED })} waiting={false} />,
    );
    expect(html).toContain("车牌：WXY 1234");
    expect(html).toContain("清运司机：Murugan");
    expect(html).toContain("工地现场负责人：Ah Ong");
    expect(html).toContain('src="https://cdn.example/driver.png"');
    expect(html).toContain('src="https://cdn.example/site.png"');
    expect(html).toContain("Ah Ong 填写");
    expect(html).toContain("门岗放行：GT-PRJ-0001-045 · 示范门岗");
    expect(html).toContain("2 张照片");
  });

  it("the next lorry still waiting says what it waits for; a past lorry says nothing", () => {
    expect(renderDetail(<LorrySignLines trip={trip(2, "PLANNED")} waiting />)).toContain("等工地填车牌，司机和工地负责人签名");
    expect(renderDetail(<LorrySignLines trip={trip(1, "SUBMITTED")} waiting={false} />)).toBe("");
  });

  it("the 出门条's 门岗放行 names the lorry and its plate", () => {
    const pass = exitPass({
      kind: "DISPOSAL_REQUEST",
      state: "sent",
      multi_release: true,
      sent: SENT,
      releases: [{ ...RELEASE, trip_seq: 1, vehicle_plate: "WXY 1234" }],
    });
    expect(renderDetail(<ExitPassSections pass={pass} />)).toContain("第 1 车 · 车牌：WXY 1234");
  });
});

describe("JB290: the gate phone - 拍照 / 上传 / 确认放行 locked until the site has filled it", () => {
  const view = (props: Partial<Parameters<typeof ReleaseCaptureView>[0]>) =>
    renderDetail(
      <ReleaseCaptureView
        photosTaken={0}
        offline={false}
        pending={false}
        error={null}
        done={null}
        multi
        camera={<div data-stub="camera" />}
        onRelease={() => {}}
        {...props}
      />,
    );

  it("locked: says 「工地还没有填车牌、司机和工地负责人还没有签名」 and 【确认放行】 is off with that reason", () => {
    const reason = zh.errors.api.disposal_lorry_sheet_missing;
    expect(reason).toBe("工地还没有填车牌、司机和工地负责人还没有签名。");
    const html = view({ lockedReason: reason, photosTaken: 2 });
    expect(html).toContain("data-exit-pass-release-locked");
    expect(html).toContain(`title="${reason}"`);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-exit-pass-release="confirm"|data-exit-pass-release="confirm"[^>]*disabled=""/);
    // The lock is the server's state: even offline the reason shown is the lock.
    expect(view({ lockedReason: reason, offline: true })).toContain(`title="${reason}"`);
  });

  it("the camera itself is locked in the window, and the lorry is named", () => {
    const source = root("components/site-access/exit-pass-window.tsx");
    expect(source).toContain("const lockedReason = pass.release_locked ? tRoot(`errors.api.${pass.release_locked}`) : undefined;");
    expect(source).toContain("<FieldCamera label={t(\"gate.takePhoto\")} fileCount={0} disabled");
    const ready: ExitPassLorry = { state: "ready", trip: { id: "t-1", seq: 1, vehicle_plate: "WXY 1234", sheet: SHEET } };
    const html = renderDetail(<GateLorryCard lorry={ready} />);
    expect(html).toContain("第 1 车 · 车牌：WXY 1234");
    expect(html).toContain("清运司机：Murugan · 工地现场负责人：Ah Ong");
    const waiting: ExitPassLorry = { state: "waiting_sheet", trip: { id: "t-2", seq: 2, vehicle_plate: "", sheet: null } };
    expect(renderDetail(<GateLorryCard lorry={waiting} />)).toContain("第 2 车");
  });

  it("the lock reason is said once: the box, not again under the camera or the button (QA290)", () => {
    const reason = zh.errors.api.disposal_lorry_sheet_missing;
    const html = view({ lockedReason: reason, photosTaken: 0 });
    expect(html.split(reason).length - 1 - html.split(`title="${reason}"`).length + 1).toBe(1);
    const source = root("components/site-access/exit-pass-window.tsx");
    expect(source).toContain("showReason={!lockedReason}");
    expect(source).toContain('<FieldWrapper label={t("gate.photos")} required>');
  });

  it("ready: 【确认放行】 opens with a photo, as before", () => {
    const html = view({ photosTaken: 1 });
    const button = html.slice(html.lastIndexOf("<button", html.indexOf('data-exit-pass-release="confirm"')));
    expect(button.slice(0, button.indexOf(">"))).not.toContain('disabled=""');
  });
});

describe("JB290 words: four languages, 你 never 您", () => {
  const keys = Object.keys(zh.jb290);
  it("every key in all four files, the error codes and the other places too", () => {
    for (const [name, messages] of Object.entries(LANGUAGES)) {
      expect(Object.keys(messages.jb290).sort(), name).toEqual([...keys].sort());
      expect(messages.errors.api.disposal_lorry_sheet_missing, name).toBeTruthy();
      expect(messages.audit.operation.disposal_lorry_signed, name).toBeTruthy();
      expect(messages.siteDisposal.timelineEvent.LORRY_SIGNED, name).toBeTruthy();
      expect(messages.mySubmissions.field.lorry_sheet, name).toBeTruthy();
      expect(messages.mySubmissions.field.lorry_released, name).toBeTruthy();
      const all = JSON.stringify(messages.jb290) + messages.errors.api.disposal_lorry_sheet_missing;
      expect(all, name).not.toContain("您");
    }
  });
});
