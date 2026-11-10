/**
 * JB149 (客户 11-10 事项 6, and the follow-up the same day): 垃圾清运「异常」.
 *
 * 「如果是车辆异常，必须注明第几车发生异常。手机端增加异常拍照功能，每笔异常最少上传2张
 * 照片。」 and 「垃圾清运增加「异常记录」分类…点击后显示所有异常记录。异常记录保留公司
 * 名称及相关清运资料。」 Rendered to static markup (the runner has no DOM), so what
 * is checked is what each state draws, and - for the wiring of a screen too big
 * to render here - its source.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DisposalAnomaly, DisposalEvidence, DisposalRequest, DisposalTrip } from "@/interfaces/contractor-ops";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));

const { ANOMALY_PHOTO_MIN, DisposalAnomaliesPanel, anomalyEntries, anomalyPhotoStrip, anomalyReady, anomalyTrips, disposalPhotoGroups } =
  await import("@/components/contractor-ops/site-disposal-workspaces");
const { clearanceTabHref } = await import("@/lib/waste-clearance-figures");

function photo(id: string, extra: Partial<DisposalEvidence> = {}): DisposalEvidence {
  return {
    id,
    kind: "ANOMALY",
    stage: "ANOMALY",
    image: `https://files.test/${id}.jpg`,
    watermarked: `https://files.test/${id}-wm.jpg`,
    note: "",
    captured_at: "2026-11-10T02:00:00Z",
    uploaded_at: "2026-11-10T02:00:00Z",
    latitude: null,
    longitude: null,
    accuracy_m: null,
    device_id: "",
    client_event_id: "",
    submitted_by_name: "张三",
    trip: null,
    anomaly: "a1",
    ...extra,
  };
}

function trip(seq: number, status: DisposalTrip["status"], plate = ""): DisposalTrip {
  return {
    id: `t${seq}`,
    seq,
    status,
    weight_kg: null,
    do_no: "",
    vehicle_plate: plate,
    note: "",
    submitted_at: null,
    submitted_by_name: "",
    accepted_by_name: null,
    accepted_at: null,
    corrections: [],
    evidence: [],
  };
}

const vehicle: DisposalAnomaly = {
  id: "a1",
  kind: "VEHICLE",
  trip: "t1",
  trip_seq: 1,
  supplier_name: "Alpha Haulage",
  internal_clearance: false,
  vehicle_plate: "WXY 1234",
  reason: "爆胎",
  reported_by_name: "张三",
  reported_at: "2026-11-10T02:05:00Z",
  latitude: null,
  longitude: null,
  evidence: [photo("p1"), photo("p2")],
};

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function row(extra: Partial<DisposalRequest>): DisposalRequest {
  return {
    trips: [trip(1, "SUBMITTED", "WXY 1234"), trip(2, "PLANNED")],
    anomalies: [],
    is_abnormal: false,
    anomaly_text: "",
    disposal_evidence_is_overdue: false,
    evidence: [],
    ...extra,
  } as DisposalRequest;
}

const words = zh.siteDisposal.anomaly;

describe("reporting from the phone (事项 6 第 2、3 点)", () => {
  it("needs a reason, two photos, and - for a vehicle - which load", () => {
    expect(ANOMALY_PHOTO_MIN).toBe(2);
    expect(anomalyReady({ kind: "VEHICLE", trip: "", reason: "爆胎", photos: 2 })).toBe(false);
    expect(anomalyReady({ kind: "VEHICLE", trip: "t1", reason: "爆胎", photos: 1 })).toBe(false);
    expect(anomalyReady({ kind: "VEHICLE", trip: "t1", reason: "  ", photos: 3 })).toBe(false);
    expect(anomalyReady({ kind: "VEHICLE", trip: "t1", reason: "爆胎", photos: 2 })).toBe(true);
    expect(anomalyReady({ kind: "OTHER", trip: "", reason: "下雨", photos: 2 })).toBe(true);
  });

  it("offers every load that was not cancelled", () => {
    const loads = anomalyTrips(row({ trips: [trip(1, "ACCEPTED"), trip(2, "CANCELLED"), trip(3, "PLANNED")] }));
    expect(loads.map((load) => load.seq)).toEqual([1, 3]);
  });

  it("asks for the same things on its button, worded", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/contractor-ops/site-disposal-workspaces.tsx"), "utf8");
    const dialog = source.slice(source.indexOf("function AnomalyDialog("), source.indexOf("function anomalyKindLabel("));
    expect(dialog).toMatch(/\[kind !== "VEHICLE" \|\| trip, t\("anomaly\.trip"\)\]/);
    expect(dialog).toMatch(/\[photos\.length >= ANOMALY_PHOTO_MIN/);
    expect(dialog).toMatch(/\[reason\.trim\(\), t\("anomaly\.reason"\)\]/);
    expect(dialog).toContain("reportDisposalAnomaly(row.id");
    // Shown stamped, never the raw upload alone (check-photo-watermarks).
    expect(source).toMatch(/item\.watermarked \|\| item\.image/);
    // The button sits with the job's other steps, for whoever runs the job.
    const actions = source.slice(source.indexOf("function DisposalActions("), source.indexOf("function DisposalStepDialogs("));
    expect(actions).toMatch(/can\("disposal\.submit"\) && RUNNING\.includes\(row\.status\) && <Button.*onStep\("anomaly"\)/);
  });
});

describe("the report on the detail (第 2 点, 补充 第 2 点)", () => {
  it("names the load, its plate, the company kept on it, the reason and the photos", () => {
    const html = render(<DisposalAnomaliesPanel row={row({ anomalies: [vehicle], is_abnormal: true })} />);

    expect(html).toContain(words.panelTitle);
    expect(html).toContain(words.kindVEHICLE);
    expect(html).toContain("第 1 车");
    expect(html).toContain("WXY 1234");
    expect(html).toContain("Alpha Haulage");
    expect(html).toContain("爆胎");
    expect(html).toContain("张三");
    expect(html.split("-wm.jpg\"").length - 1).toBeGreaterThanOrEqual(2);
  });

  it("says a late job is late, and draws nothing for a job that is neither", () => {
    expect(render(<DisposalAnomaliesPanel row={row({ disposal_evidence_is_overdue: true, is_abnormal: true })} />)).toContain(words.kindOVERDUE);
    expect(render(<DisposalAnomaliesPanel row={row({})} />)).toBe("");
  });

  it("puts the report's photos in their own row, first", () => {
    const groups = disposalPhotoGroups(row({ evidence: [photo("p1"), photo("r1", { kind: "REQUEST", stage: "REQUEST", anomaly: null })] }));
    expect(groups[0]).toBe("ANOMALY");
    expect(disposalPhotoGroups(row({ evidence: [] }))).not.toContain("ANOMALY");
  });
});

describe("「异常记录」 (补充 第 1 点)", () => {
  it("is a tab beside 工地清运 that keeps the project, company and dates", () => {
    const params = new URLSearchParams("kind=disposal&project=p1&supplier=s1&date_from=2026-11-01&status=APPROVED");
    const href = clearanceTabHref("abnormal", params);
    expect(href).toContain("kind=disposal");
    expect(href).toContain("abnormal=1");
    expect(href).toContain("project=p1");
    expect(href).toContain("supplier=s1");
    expect(href).toContain("date_from=2026-11-01");
    expect(clearanceTabHref("disposal", new URLSearchParams("abnormal=1&project=p1"))).toBe("/waste-clearance?kind=disposal&project=p1");
    expect(clearanceTabHref("dispatch", params)).toBe("/waste-clearance?kind=dispatch");
  });

  it("lists each report, then the lateness", () => {
    const entries = anomalyEntries(row({ anomalies: [vehicle, { ...vehicle, id: "a2", kind: "OTHER" }], disposal_evidence_is_overdue: true }));
    expect(entries.map((entry) => entry.kind)).toEqual(["VEHICLE", "OTHER", "OVERDUE"]);
  });

  it("shows each report's own photographs in the photo cell, not the job's (JB159, shot a02)", () => {
    // The job holds five photographs - the report's two among them - and its
    // strip is the job's; the cell drew that strip (3 squares and 「+2」).
    const job = {
      photo_count: 5,
      photo_thumbs: ["job-1", "job-2", "job-3", "job-4"],
      cover_photo_url: "job-1",
    };
    const reported = anomalyPhotoStrip(
      row({ ...job, anomalies: [{ ...vehicle, photo_thumbs: ["thumb-p1", "thumb-p2"] }] }),
    );
    expect(reported).toEqual({ photo_thumbs: ["thumb-p1", "thumb-p2"], cover_photo_url: "thumb-p1", photo_count: 2 });
    // From a server without the reports' thumbnails: their stamped copies.
    expect(anomalyPhotoStrip(row({ ...job, anomalies: [vehicle] })).photo_thumbs).toEqual([
      "https://files.test/p1-wm.jpg",
      "https://files.test/p2-wm.jpg",
    ]);
    // A job that is only late keeps its own strip.
    expect(anomalyPhotoStrip(row({ ...job, disposal_evidence_is_overdue: true }))).toMatchObject(job);
    const source = readFileSync(path.join(process.cwd(), "src/components/contractor-ops/site-disposal-workspaces.tsx"), "utf8");
    expect(source).toContain("cover: anomalyPhotoStrip,");
  });

  it("filters the list and the file on the server, and words both", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/contractor-ops/site-disposal-workspaces.tsx"), "utf8");
    expect(source).toContain('useListQuery(["project", "status", "counted", "abnormal"');
    expect(source).toContain("columns={abnormal ? anomalyColumns : columns}");
    expect(source).toContain("abnormalExportColumns(t, tRoot)");
    for (const key of ["anomaly_supplier", "anomaly_plate", "anomaly_kind", "anomaly_trip", "anomaly_reason", "anomaly_reporter", "anomaly_at"]) {
      expect(source).toContain(`key: "${key}"`);
    }
    // 第 1 点: every list file says 「异常」 and what it was; the row is red.
    expect(source).toMatch(/key: "is_abnormal", label: t\("field\.isAbnormal"\), values: \{ true: t\("overdue\.badge"\)/);
    expect(source).toContain('key: "anomaly_text"');
    expect(source).toContain("rowClassName={(row) => (row.is_abnormal");
  });
});

describe("the photo tile (JB159)", () => {
  it("says a tap adds a photo, since it does - for the report and the site photos", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/contractor-ops/site-disposal-workspaces.tsx"), "utf8");
    expect(source).toMatch(/file=\{photos\[photos\.length - 1\]\}\s*adds\s*onCapture=\{\(file\) => setPhotos\(\(current\) => \[\.\.\.current, file\]\)\}/);
    expect(source).toMatch(/file=\{taken\[taken\.length - 1\]\?\.file\}\s*adds\s/);
  });
});

describe("worded in all four languages", () => {
  it("has every new sentence", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const sd = messages.siteDisposal;
      for (const text of [
        ...Object.values(sd.anomaly),
        sd.action.reportAnomaly,
        sd.evidenceKind.ANOMALY,
        sd.stage.ANOMALY,
        sd.timelineEvent.ANOMALY_REPORTED,
        sd.field.isAbnormal,
        sd.field.anomalyText,
        sd.toast.anomalyReported,
        messages.wasteClearance.tab.abnormal,
        messages.mySubmissions.field.anomaly,
        messages.errors.api.disposal_anomaly_trip_required,
        messages.errors.api.disposal_anomaly_photos_required,
        messages.errors.api.disposal_anomaly_reason_required,
        messages.errors.api.disposal_anomaly_not_running,
      ]) {
        expect(typeof text === "string" && text.trim().length > 0).toBe(true);
      }
    }
    expect(zh.siteDisposal.anomaly.kindVEHICLE).toBe("车辆异常");
    expect(zh.wasteClearance.tab.abnormal).toBe("异常记录");
  });
});
