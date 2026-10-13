import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  checkGatePass,
  confirmGatePass,
  createGateIncident,
} from "@/services/site-access.service";

/**
 * 门岗拍照 (batch H, HD5): the guard's phone page is photos and a 「特殊事项」
 * switch - no pass scan, no category, no gate name (Q18 / F1 overturned: the
 * scan moved to its own entry, 访客扫码). Off, each photo is its own record;
 * on, a note and the people asked in make one Gate Issue.
 *
 * There is no DOM renderer in this project's test runner, so the form is read
 * the way the repository's other guards read source: the one component, its
 * one send button.
 */

const SOURCE = readFileSync(path.join(__dirname, "gate-records.tsx"), "utf8");

function formSource() {
  const start = SOURCE.indexOf("function GatePhotoCapture(");
  const end = SOURCE.indexOf("\nfunction ", start + 1);
  expect(start).toBeGreaterThan(-1);
  return SOURCE.slice(start, end);
}

describe("the guard's gate photo form", () => {
  it("waits for the project and a photo, and for a special matter its note and people", () => {
    const form = formSource();
    const requires = form.match(/requires=\{\[([\s\S]*?)\]\}\s*disabled=\{save\.isPending\}/);
    expect(requires).not.toBeNull();
    const labels = [...requires![1].matchAll(/t[r]?\("([^"]+)"\)/g)].map((match) => match[1]);
    expect(labels).toEqual(["field.project", "field.photos", "note", "assignees"]);
  });

  it("has no pass scan and asks nothing the customer took off the phone", () => {
    const form = formSource();
    for (const gone of [
      "GateQrScanner",
      "findGatePass",
      "access_pass",
      "gateCategory",
      "GATE_INCIDENT_CATEGORIES",
      "field.category",
      "field.gate",
      "field.description",
    ]) {
      expect(form, gone).not.toContain(gone);
    }
    expect(form).toContain('t("special")');
    expect(form).toContain("first_message");
  });

  it("sends a plain photo as one record each, through the offline queue", () => {
    const form = formSource();
    expect(form).toContain("submitGatePhotoOfflineAware");
    expect(form).toContain("for (const photo of camera.photos)");
    expect(form).toContain("photos: [photo]");
  });

  it("says on the form, not only in a tooltip, that a photo is what it waits for", () => {
    expect(formSource()).toContain('tr("photoFirst")');
  });
});

function lastCall(): { url: string; body: FormData | null; json: unknown } {
  const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  const [url, init] = mock.mock.calls.at(-1) as [string, RequestInit];
  return {
    url: String(url),
    body: init.body instanceof FormData ? init.body : null,
    json: typeof init.body === "string" ? JSON.parse(init.body) : null,
  };
}

describe("what the phone sends", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: { id: "row", pass: { subject_name: "Ali" }, event: { direction: "ENTRY", occurred_at: "2026-10-13T01:00:00Z" } },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts a special matter with its note and people - and no category or pass", async () => {
    const photo = new File([new Uint8Array([255, 216, 255])], "gate.jpg", { type: "image/jpeg" });

    await createGateIncident({
      project: "p1",
      is_issue: true,
      members: ["u1", "u2"],
      first_message: "No exit slip",
      client_event_id: "gate-1",
      photos: [{ file: photo, captured_at: "2026-10-07T03:11:00.000Z", client_event_id: "gate-photo-1" }],
    });

    const { url, body } = lastCall();
    expect(url).toContain("/api/gate-incidents/create_gate_incident/");
    expect(body).not.toBeNull();
    expect(body!.get("is_issue")).toBe("true");
    expect(body!.has("category")).toBe(false);
    expect(body!.has("access_pass")).toBe(false);
    expect(body!.get("first_message")).toBe("No exit slip");
    expect(body!.getAll("members")).toEqual(["u1", "u2"]);
    expect(body!.getAll("photos")).toHaveLength(1);
  });

  it("reads a scanned pass with the guard's project before anything is recorded", async () => {
    await checkGatePass("p1", "token-abc");

    const { url, json } = lastCall();
    expect(url).toContain("/api/site-access-passes/check_gate_pass/");
    expect(json).toEqual({ project: "p1", qr_value: "token-abc" });
  });

  it("confirms the entry with the project and the direction the guard pressed", async () => {
    await confirmGatePass({
      project: "p1",
      qr_value: "token-abc",
      direction: "ENTRY",
      client_event_id: "visitor-1",
    });

    const { url, json } = lastCall();
    expect(url).toContain("/api/site-access-passes/confirm_gate_pass/");
    expect(json).toMatchObject({ project: "p1", direction: "ENTRY", client_event_id: "visitor-1" });
  });
});
