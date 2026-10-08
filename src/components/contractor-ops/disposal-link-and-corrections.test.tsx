/**
 * After the 4th-batch audit (FABLE_AUDIT_B4 #8, #9, #27, #28; DEV_SPEC Q29).
 *
 * * #8 - the driver's link page (and the field form) read only their query,
 *   every answer goes into its cache, and the page asks again every 30 s
 *   while every lorry has gone - so the office's 「加一车」 shows up without a
 *   reload. Before, the last submission was kept in local state and shadowed
 *   the query for good.
 * * #9 - a refusal on the link carries its code, and the page words it from
 *   `errors.api.<code>` in the driver's language instead of the server's
 *   English.
 * * Q29.7 - the office corrects one lorry's weight / DO with a reason; the
 *   history shows on the lorry, newest first.
 * * Q29.8 - a red job says which lateness it is.
 * * Q29.11 - 「加一车」 stays a one-press button; only ending early is armed
 *   by a switch.
 *
 * The runner has no DOM, so screens are rendered to static markup.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/interfaces/api";
import type { DisposalRequest, DisposalTrip, ExternalDisposalTask } from "@/interfaces/contractor-ops";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));

const {
  DisposalTripsPanel,
  ExternalDisposalWorkspace,
  LINK_POLL_MS,
  canCorrectTrip,
  linkErrorText,
  linkPollInterval,
  overdueHelpKey,
} = await import("@/components/contractor-ops/site-disposal-workspaces");
const { getExternalDisposalTask, submitExternalDisposalTask } = await import("@/services/contractor-ops.service");

const DISPOSAL_CODES = [
  "disposal_link_closed",
  "disposal_all_trips_sent",
  "disposal_trips_closed",
  "disposal_trip_not_waiting",
  "disposal_nothing_sent",
  "disposal_trip_not_correctable",
] as const;

function trip(seq: number, status: DisposalTrip["status"], extra: Partial<DisposalTrip> = {}): DisposalTrip {
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
    evidence: [],
    ...extra,
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
    evidence: [],
    timeline: [],
    created_at: "2026-10-07T00:00:00Z",
    updated_at: "2026-10-07T00:00:00Z",
    ...extra,
  };
}

function linkTask(trips: Array<Pick<DisposalTrip, "id" | "seq" | "status">>, status: ExternalDisposalTask["status"] = "IN_PROGRESS") {
  const live = trips.filter((item) => item.status !== "CANCELLED");
  return {
    id: "d1",
    reference_no: "DISP-OPS-0001",
    company_name: "MSE Builders",
    project_name: "Ops Site",
    waste_description: "Hacked concrete",
    location_description: "Block A",
    status,
    evidence: [],
    trips: trips.map((item) => ({ ...item, submitted_at: null })),
    trips_total: live.length,
    trips_accepted: live.filter((item) => item.status === "ACCEPTED").length,
    current_trip: null,
  } as unknown as ExternalDisposalTask;
}

function render(node: React.ReactNode, client = new QueryClient(), messages = zh) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const source = readFileSync(
  path.join(process.cwd(), "src/components/contractor-ops/site-disposal-workspaces.tsx"),
  "utf8",
);
const noop = () => undefined;
const words = zh.siteDisposal.trips;

afterEach(() => {
  vi.unstubAllGlobals();
});

// -- #8: the link page does not freeze on its last answer ---------------------

describe("the driver's page follows the office (FABLE_AUDIT_B4 #8)", () => {
  it("asks again every 30 s while every lorry has gone, and only then", () => {
    expect(LINK_POLL_MS).toBe(30_000);
    expect(linkPollInterval(linkTask([{ id: "t1", seq: 1, status: "SUBMITTED" }]))).toBe(30_000);
    // A lorry is being filled: nothing to wait for.
    expect(linkPollInterval(linkTask([{ id: "t1", seq: 1, status: "SUBMITTED" }, { id: "t2", seq: 2, status: "PLANNED" }]))).toBe(false);
    // The job is over, or the link is gone, or nothing loaded yet.
    expect(linkPollInterval(linkTask([{ id: "t1", seq: 1, status: "ACCEPTED" }], "COMPLETED"))).toBe(false);
    expect(
      linkPollInterval(linkTask([{ id: "t1", seq: 1, status: "SUBMITTED" }]), new ApiError("gone", 404, {}, "disposal_link_closed")),
    ).toBe(false);
    expect(linkPollInterval(undefined)).toBe(false);
    // A dropped connection keeps asking.
    expect(linkPollInterval(linkTask([{ id: "t1", seq: 1, status: "SUBMITTED" }]), new ApiError("offline", 0))).toBe(30_000);
  });

  it("draws what the query holds - so the office's added lorry appears", () => {
    const client = new QueryClient();
    client.setQueryData(["external-disposal", "tok"], linkTask([{ id: "t1", seq: 1, status: "SUBMITTED" }]));
    expect(render(<ExternalDisposalWorkspace token="tok" />, client)).toContain(words.allSentTitle);

    // The poll brings back the lorry the office added.
    client.setQueryData(
      ["external-disposal", "tok"],
      linkTask([{ id: "t1", seq: 1, status: "SUBMITTED" }, { id: "t2", seq: 2, status: "PLANNED" }]),
    );
    const html = render(<ExternalDisposalWorkspace token="tok" />, client);
    expect(html).not.toContain(words.allSentTitle);
    expect(html).toContain("第 2 / 2 车");
  });

  it("keeps no copy of the last answer beside the query, on the link or the field form", () => {
    expect(source).not.toMatch(/useState<ExternalDisposalTask/);
    expect(source).not.toMatch(/useState<DisposalRequest \| null>\(null\);\s*const \[error/);
    expect(source).not.toMatch(/task \?\? taskQuery\.data/);
    expect(source.match(/qc\.setQueryData\(taskKey, saved\)/g)?.length).toBe(2);
    expect(source.match(/refetchInterval: \(query\) => linkPollInterval\(query\.state\.data, query\.state\.error\)/g)?.length).toBe(2);
  });
});

// -- #9: a refusal in the driver's language ------------------------------------

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })),
  );
}

describe("the driver's page words each refusal (FABLE_AUDIT_B4 #9)", () => {
  it("carries the server's code, as every other failure in the app does", async () => {
    respond(409, { success: false, code: "disposal_all_trips_sent", message: "Every planned load has been sent.", errors: {} });
    const refused = await submitExternalDisposalTask("tok", {}).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ApiError);
    expect((refused as ApiError).code).toBe("disposal_all_trips_sent");
    expect((refused as ApiError).status).toBe(409);

    respond(404, { success: false, code: "disposal_link_closed", message: "This disposal task link is invalid.", errors: {} });
    const gone = await getExternalDisposalTask("tok").catch((error: unknown) => error);
    expect((gone as ApiError).code).toBe("disposal_link_closed");
    expect((gone as ApiError).isNotFound).toBe(true);
  });

  it("says each disposal code in the catalogue's words, in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const tApi = createTranslator({ locale: "en", messages, namespace: "errors.api" });
      const catalogue = { has: (code: string) => tApi.has(code as never), word: (code: string) => tApi(code as never) };
      for (const code of DISPOSAL_CODES) {
        const text = linkErrorText(new ApiError("English from the server", 409, {}, code), catalogue, "fallback");
        expect(text, code).toBe((messages.errors.api as Record<string, string>)[code]);
        expect(text.trim()).not.toBe("");
      }
    }
  });

  it("falls back to the page's own sentence for anything else", () => {
    const tApi = createTranslator({ locale: "zh", messages: zh, namespace: "errors.api" });
    const catalogue = { has: (code: string) => tApi.has(code as never), word: (code: string) => tApi(code as never) };
    const fallback = zh.siteDisposal.external.error.action;
    expect(linkErrorText(new ApiError("x", 409, {}, "no_such_code"), catalogue, fallback)).toBe(fallback);
    expect(linkErrorText(new ApiError("x", 500), catalogue, fallback)).toBe(fallback);
    expect(linkErrorText(new TypeError("Failed to fetch"), catalogue, fallback)).toBe(fallback);
  });

  it("never prints the server's English on the link page", () => {
    const external = source.slice(source.indexOf("export function ExternalDisposalWorkspace"), source.indexOf("export function InternalDisposalWorkspace"));
    expect(external).not.toMatch(/reason\.message/);
    expect(external.match(/reasonText\(/g)?.length).toBeGreaterThanOrEqual(4);
  });
});

// -- Q29.7: correcting one lorry ------------------------------------------------

describe("the office corrects one lorry (Q29.7)", () => {
  const corrected = trip(1, "SUBMITTED", {
    weight_kg: "1300.00",
    corrections: [
      { id: "c3", field: "weight_kg", from: "1250.50", to: "1300.00", reason: "Second slip", by_name: "Ong Office", at: "2026-10-07T05:00:00Z" },
      { id: "c2", field: "do_no", from: "DO-1", to: "DO-1A", reason: "Weighbridge slip", by_name: "Ong Office", at: "2026-10-07T04:00:00Z" },
      { id: "c1", field: "weight_kg", from: "", to: "1250.50", reason: "Weighbridge slip", by_name: "Ong Office", at: "2026-10-07T04:00:00Z" },
    ],
  });

  it("offers 更正 on each sent lorry while the job runs and after it finished", () => {
    const running = render(<DisposalTripsPanel row={job([corrected, trip(2, "ACCEPTED"), trip(3, "PLANNED")])} canCheck onChanged={noop} />);
    expect(running.split(`${words.correct}<`).length - 1).toBe(2);

    const done = render(<DisposalTripsPanel row={job([trip(1, "ACCEPTED")], { status: "COMPLETED" })} canCheck onChanged={noop} />);
    expect(done).toContain(`${words.correct}<`);
    expect(done).not.toContain(words.accept);

    const cancelled = render(<DisposalTripsPanel row={job([trip(1, "SUBMITTED")], { status: "CANCELLED" })} canCheck onChanged={noop} />);
    expect(cancelled).not.toContain(`${words.correct}<`);

    const reader = render(<DisposalTripsPanel row={job([trip(1, "SUBMITTED")])} canCheck={false} onChanged={noop} />);
    expect(reader).not.toContain(`${words.correct}<`);
  });

  it("only a sent lorry of a live or finished job", () => {
    expect(canCorrectTrip({ status: "IN_PROGRESS" }, { status: "SUBMITTED" })).toBe(true);
    expect(canCorrectTrip({ status: "COMPLETED" }, { status: "ACCEPTED" })).toBe(true);
    expect(canCorrectTrip({ status: "IN_PROGRESS" }, { status: "PLANNED" })).toBe(false);
    expect(canCorrectTrip({ status: "IN_PROGRESS" }, { status: "CANCELLED" })).toBe(false);
    expect(canCorrectTrip({ status: "CANCELLED" }, { status: "SUBMITTED" })).toBe(false);
    expect(canCorrectTrip({ status: "REJECTED" }, { status: "ACCEPTED" })).toBe(false);
  });

  it("shows the current value, and every correction with its reason, newest first", () => {
    const html = render(<DisposalTripsPanel row={job([corrected])} canCheck onChanged={noop} />);

    expect(html).toContain("1300.00 kg");
    expect(html).toContain(words.history);
    const newest = html.indexOf("重量 1250.50 → 1300.00 kg");
    const middle = html.indexOf("DO DO-1 → DO-1A");
    const oldest = html.indexOf(`重量 ${words.blank} → 1250.50 kg`);
    expect(newest).toBeGreaterThan(-1);
    expect(middle).toBeGreaterThan(newest);
    expect(oldest).toBeGreaterThan(middle);
    expect(html).toContain("原因：Second slip");
  });

  it("asks for a reason and sends only what changed", () => {
    expect(source).toMatch(/requires=\{\[\[reason, t\("trips\.correctReason"\)\]\]\}/);
    expect(source).toMatch(/weight_kg: weightChanged \? weight\.trim\(\) : undefined/);
    expect(source).toMatch(/do_no: doChanged \? doNo\.trim\(\) : undefined/);
  });

  it("stops asking the office to type a trip count on a job with lorries", () => {
    expect(source).toMatch(/trip_count: counted \? undefined : trips/);
    expect(source).toMatch(/\{!counted && <FieldWrapper label=\{t\("field\.trips"\)\}/);
  });

  it("is worded in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const trips = messages.siteDisposal.trips;
      for (const key of ["correct", "correctTitle", "correctHint", "correctReason", "correctSave", "correctUnchanged", "history", "historyWeight", "historyDo", "historyMeta", "blank"] as const) {
        expect(trips[key].trim(), key).not.toBe("");
      }
      expect(messages.siteDisposal.timelineEvent.TRIP_CORRECTED.trim()).not.toBe("");
      expect(messages.siteDisposal.toast.tripCorrected.trim()).not.toBe("");
      expect(messages.siteDisposal.recordNumbers.tripsCounted.trim()).not.toBe("");
      expect(messages.siteDisposal.overdue.helpNextLoad.trim()).not.toBe("");
    }
  });
});

// -- Q29.8: which lateness --------------------------------------------------------

describe("a red job says which lateness it is (Q29.8)", () => {
  it("no load yet after approval, or the next lorry late after one came", () => {
    expect(overdueHelpKey(job([trip(1, "PLANNED"), trip(2, "PLANNED")]))).toBe("overdue.help");
    expect(overdueHelpKey(job([trip(1, "ACCEPTED"), trip(2, "PLANNED")]))).toBe("overdue.helpNextLoad");
    expect(overdueHelpKey(job([]))).toBe("overdue.help");
  });
});

// -- Q29.11: 「加一车」 is one press -------------------------------------------------

describe("「加一车」 stays one press; only ending early is behind the switch (Q29.11)", () => {
  it("draws 加一车 as a live button with the switch off", () => {
    const html = render(<DisposalTripsPanel row={job([trip(1, "SUBMITTED"), trip(2, "PLANNED")])} canCheck onChanged={noop} />);
    const button = html.match(/<button[^>]*>(?:(?!<\/button>).)*加一车<\/button>/)?.[0];
    expect(button).toBeTruthy();
    expect(button).not.toMatch(/\sdisabled(=|\s|>)/);
    expect(html).toContain('role="switch"');
    expect(html).not.toContain(`>${words.end}<`);
  });
});
