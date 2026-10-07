/**
 * X11 (C5): a disposal job runs a lorry at a time, and the office checks each.
 *
 * The client: approve 3 lorries; each time a driver sends a load the office
 * gets a to-do, checks that load, and after the last one the job closes by
 * itself. Rendered to static markup (the runner has no DOM), so what is
 * checked is what each state draws:
 *
 * * the office detail lists every lorry with its photographs, says
 *   「已验收 x / N 车」, and offers 【验收这一车】 only on a lorry that was sent
 *   and not yet checked - and only to someone who may check;
 * * 【加一车】 and ending early only while the job runs; ending early is armed
 *   by a switch (spec rule 8), and is not offered before any lorry was sent;
 * * the driver's link and the field form fill the next lorry, with only that
 *   lorry's photographs counted, and say so when every lorry has gone.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DisposalEvidence, DisposalRequest, DisposalTrip } from "@/interfaces/contractor-ops";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));

const { DisposalTripsPanel, currentLoad, disposalPhotoGroups } = await import(
  "@/components/contractor-ops/site-disposal-workspaces"
);

function photo(id: string, trip: string | null, kind: DisposalEvidence["kind"] = "DISPOSAL_PROOF"): DisposalEvidence {
  return {
    id,
    kind,
    image: `https://files.test/${id}.jpg`,
    watermarked: `https://files.test/${id}-wm.jpg`,
    note: "",
    captured_at: "2026-10-07T02:00:00Z",
    uploaded_at: "2026-10-07T02:00:00Z",
    latitude: null,
    longitude: null,
    accuracy_m: null,
    device_id: "",
    client_event_id: "",
    submitted_by_name: null,
    trip,
  };
}

function trip(seq: number, status: DisposalTrip["status"], evidence: DisposalEvidence[] = []): DisposalTrip {
  return {
    id: `t${seq}`,
    seq,
    status,
    weight_kg: status === "PLANNED" ? null : "1200.00",
    do_no: status === "PLANNED" ? "" : `DO-${seq}`,
    note: "",
    submitted_at: status === "PLANNED" || status === "CANCELLED" ? null : "2026-10-07T02:30:00Z",
    submitted_by_name: status === "PLANNED" ? "" : "Ali Driver",
    accepted_by_name: status === "ACCEPTED" ? "Ong Office" : null,
    accepted_at: status === "ACCEPTED" ? "2026-10-07T03:00:00Z" : null,
    corrections: [],
    evidence,
  };
}

function job(trips: DisposalTrip[], extra: Partial<DisposalRequest> = {}): DisposalRequest {
  const live = trips.filter((item) => item.status !== "CANCELLED");
  return {
    id: "d1",
    reference_no: "DISP-OPS-0001",
    project: "p1",
    project_name: "Ops Site",
    category: null,
    category_name: null,
    category_code: null,
    waste_description: "Hacked concrete",
    location_description: "Block A",
    estimated_volume_m3: null,
    estimated_weight_kg: null,
    preferred_at: null,
    request_note: "",
    client_event_id: "",
    status: "IN_PROGRESS",
    requested_by_name: "Site",
    reviewed_by_name: "Ong Office",
    reviewed_at: "2026-10-07T01:00:00Z",
    review_note: "",
    assignment_type: "EXTERNAL",
    assigned_staff: null,
    assigned_staff_name: null,
    execution_task: null,
    collector_company_name: "",
    collector_contact_name: "",
    collector_phone: "",
    collector_email: "",
    external_token_hint: "",
    external_expires_at: null,
    external_revoked_at: null,
    external_last_used_at: null,
    external_link_is_valid: true,
    disposal_evidence_is_overdue: false,
    planned_trips: trips.length,
    trips,
    trips_accepted: live.filter((item) => item.status === "ACCEPTED").length,
    trips_total: live.length,
    trips_closed_at: null,
    execution_started_at: null,
    submitted_at: null,
    actual_weight_kg: null,
    trip_count: 0,
    disposal_do_no: "",
    execution_note: "",
    ocr_status: "MANUAL",
    ocr_result: {},
    confirmed_by_name: null,
    confirmed_at: null,
    confirmation_note: "",
    evidence: trips.flatMap((item) => item.evidence),
    timeline: [],
    created_at: "2026-10-07T00:00:00Z",
    updated_at: "2026-10-07T00:00:00Z",
    ...extra,
  };
}

function render(node: React.ReactNode, messages = zh) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const noop = () => undefined;
const words = zh.siteDisposal.trips;
const count = (html: string, text: string) => html.split(text).length - 1;

describe("the office checks each lorry (X11)", () => {
  const oneOfThree = job([
    trip(1, "ACCEPTED", [photo("e1", "t1")]),
    trip(2, "SUBMITTED", [photo("e2", "t2"), photo("e3", "t2")]),
    trip(3, "PLANNED"),
  ]);

  it("says 已验收 x / N 车 and lists every lorry with its photographs", () => {
    const html = render(<DisposalTripsPanel row={oneOfThree} canCheck onChanged={noop} />);

    expect(html).toContain("已验收 1 / 3 车");
    for (const seq of [1, 2, 3]) expect(html).toContain(`第 ${seq} 车`);
    expect(html).toContain(zh.siteDisposal.tripStatus.ACCEPTED);
    expect(html).toContain(zh.siteDisposal.tripStatus.SUBMITTED);
    expect(html).toContain(zh.siteDisposal.tripStatus.PLANNED);
    // The watermarked copies, one per photograph, under their own lorry.
    expect(count(html, "-wm.jpg\"")).toBeGreaterThanOrEqual(3);
    expect(html).toContain("Ong Office");
    expect(html).toContain("DO-2");
  });

  it("offers one check, on the lorry that was sent and not yet checked", () => {
    const html = render(<DisposalTripsPanel row={oneOfThree} canCheck onChanged={noop} />);

    expect(count(html, words.accept)).toBe(1);
  });

  it("offers nothing to someone who may not check", () => {
    const html = render(<DisposalTripsPanel row={oneOfThree} canCheck={false} onChanged={noop} />);

    expect(html).not.toContain(words.accept);
    expect(html).not.toContain(words.add);
    expect(html).not.toContain(words.endSwitch);
  });

  it("adds a lorry and ends early only while the job runs, ending behind a switch", () => {
    const html = render(<DisposalTripsPanel row={oneOfThree} canCheck onChanged={noop} />);

    expect(html).toContain(words.add);
    expect(html).toContain(words.endSwitch);
    expect(html).toContain('role="switch"');
    // The end button itself is not drawn until the switch is on (rule 8).
    expect(html).not.toContain(`>${words.end}<`);

    const done = render(
      <DisposalTripsPanel row={job([trip(1, "ACCEPTED")], { status: "COMPLETED" })} canCheck onChanged={noop} />,
    );
    expect(done).toContain("已验收 1 / 1 车");
    expect(done).not.toContain(words.add);
    expect(done).not.toContain(words.endSwitch);

    const ended = render(
      <DisposalTripsPanel
        row={job([trip(1, "SUBMITTED"), trip(2, "CANCELLED")], { trips_closed_at: "2026-10-07T04:00:00Z" })}
        canCheck
        onChanged={noop}
      />,
    );
    expect(ended).toContain(words.ended);
    expect(ended).toContain(words.accept);
    expect(ended).not.toContain(words.add);
    expect(ended).toContain("已验收 0 / 1 车");
  });

  it("does not offer ending early before any lorry was sent - that is a cancellation", () => {
    const html = render(<DisposalTripsPanel row={job([trip(1, "PLANNED"), trip(2, "PLANNED")])} canCheck onChanged={noop} />);

    expect(html).toContain(words.add);
    expect(html).not.toContain(words.endSwitch);
  });

  it("draws nothing for a job from before C5, which has no lorries", () => {
    expect(render(<DisposalTripsPanel row={job([], { status: "COMPLETED" })} canCheck onChanged={noop} />)).toBe("");
  });

  it("files the detail's photographs one row per lorry", () => {
    expect(disposalPhotoGroups(oneOfThree)).toEqual(["REQUEST", "SITE_EXIT", "TRIP-1", "TRIP-2", "TRIP-3"]);
    // A job from before C5 keeps its single final-proof row.
    expect(disposalPhotoGroups(job([], { evidence: [photo("old", null)] }))).toEqual([
      "REQUEST",
      "SITE_EXIT",
      "FINAL_PROOF",
    ]);
  });
});

describe("the driver and the field form fill the next lorry (X11)", () => {
  it("counts only the photographs of the lorry being sent", () => {
    const task = job([
      trip(1, "SUBMITTED", [photo("a", "t1"), photo("b", "t1")]),
      trip(2, "PLANNED", [photo("c", "t2")]),
      trip(3, "PLANNED"),
    ]);
    const load = currentLoad(task);

    expect(load.current).toEqual({ id: "t2", seq: 2 });
    expect(load.photos.map((item) => item.id)).toEqual(["c"]);
    expect([load.sent, load.total, load.allSent]).toEqual([1, 3, false]);
  });

  it("says every lorry has gone, rather than offering a camera", () => {
    const load = currentLoad(job([trip(1, "SUBMITTED"), trip(2, "ACCEPTED"), trip(3, "CANCELLED")]));

    expect(load.current).toBeNull();
    expect(load.allSent).toBe(true);
    expect(load.total).toBe(2);
  });

  it("lets a job from before C5 take its first photograph (the server plans it then)", () => {
    const load = currentLoad(job([], { evidence: [photo("old", null)] }));

    expect(load.allSent).toBe(false);
    expect(load.photos.map((item) => item.id)).toEqual(["old"]);
  });

  const code = readFileSync(
    path.join(process.cwd(), "src/components/contractor-ops/site-disposal-workspaces.tsx"),
    "utf8",
  );

  it("sends no trip count from the field form any more - each submission is one lorry", () => {
    expect(code).toMatch(/submitInternalDisposalTask\(disposalId, \{ actual_weight_kg: weight, disposal_do_no: doNo, note \}\)/);
    expect(code).not.toMatch(/trip_count: Number\(trips\)/);
  });

  it("asks for the lorries on the request and lets the approver change the number", () => {
    expect(code).toMatch(/planned_trips: plannedTrips/);
    expect(code).toMatch(/reviewDisposalRequest\(row\.id, decision, note, Number\(trips\)\)/);
  });

  it("shows 已验收 x / N 车 in the office list", () => {
    expect(code).toMatch(/id: "trips",[\s\S]{0,200}t\("field\.tripsProgress"\)/);
  });

  it("is worded in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const trips = messages.siteDisposal.trips;
      for (const key of ["progress", "seq", "accept", "add", "endSwitch", "endHint", "end", "allSentTitle", "allSentBody", "loadTitle", "justSent"] as const) {
        expect(trips[key].trim()).not.toBe("");
      }
      for (const status of ["PLANNED", "SUBMITTED", "ACCEPTED", "CANCELLED"] as const) {
        expect(messages.siteDisposal.tripStatus[status].trim()).not.toBe("");
      }
    }
  });
});
