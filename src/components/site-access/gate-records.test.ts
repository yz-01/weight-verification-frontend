import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGateIncident, findGatePass } from "@/services/site-access.service";

/**
 * F1 (7/10): the guard took a photo, pressed send, and nothing happened.
 *
 * 「门岗拍了照发送不了」 - the phone form's send button listed a 事项类别 in
 * `requires`, so with a photo taken and no category chosen (the customer had
 * decided a guard should not have to choose one) it stayed grey. Its reason
 * was in a hover tooltip, which a phone never shows, and the server would have
 * refused the request anyway. Q18 cut the form to: photos, scan a pass, who to
 * talk to and the first words, send.
 *
 * There is no DOM renderer in this project's test runner, so the form is read
 * the way the repository's other guards read source: the one component, its
 * one send button.
 */

const SOURCE = readFileSync(path.join(__dirname, "gate-records.tsx"), "utf8");

function formSource() {
  const start = SOURCE.indexOf("function GateIncidentForm(");
  const end = SOURCE.indexOf("\nfunction ", start + 1);
  expect(start).toBeGreaterThan(-1);
  return SOURCE.slice(start, end);
}

describe("the guard's gate photo form", () => {
  it("sends once a photo is taken: the button waits for the project and photos only", () => {
    const form = formSource();
    const requires = form.match(/requires=\{\[([\s\S]*?)\]\}\s*disabled=\{save\.isPending\}/);
    expect(requires).not.toBeNull();
    const labels = [...requires![1].matchAll(/t\("([^"]+)"\)/g)].map((match) => match[1]);
    expect(labels).toEqual(["field.project", "field.photos"]);
  });

  it("asks nothing the customer took off the phone (Q18)", () => {
    const form = formSource();
    for (const gone of [
      "gateCategory",
      "GATE_INCIDENT_CATEGORIES",
      "field.category",
      "field.gate",
      "field.description",
      "getSiteAccessPasses",
    ]) {
      expect(form, gone).not.toContain(gone);
    }
    expect(form).toContain("GateQrScanner");
    expect(form).toContain("first_message");
  });

  it("says on the form, not only in a tooltip, that a photo is what it waits for", () => {
    expect(formSource()).toContain('t("photoFirst")');
  });

  it("no longer filters or tags the office list by category", () => {
    const panel = SOURCE.slice(
      SOURCE.indexOf("export function GateRecordsPanel("),
      SOURCE.indexOf("function Empty("),
    );
    expect(panel).not.toContain("category");
    const card = SOURCE.slice(
      SOURCE.indexOf("function GateIncidentCard("),
      SOURCE.indexOf("function PhotoTray("),
    );
    expect(card).not.toContain("category");
  });
});

function lastCall(): { url: string; body: FormData | null } {
  const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  const [url, init] = mock.mock.calls.at(-1) as [string, RequestInit];
  return { url: String(url), body: init.body instanceof FormData ? init.body : null };
}

describe("what the phone sends", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, data: { id: "row" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts photos, the scanned pass and the first words - and no category", async () => {
    const photo = new File([new Uint8Array([255, 216, 255])], "gate.jpg", { type: "image/jpeg" });

    await createGateIncident({
      project: "p1",
      access_pass: "pass-1",
      members: ["u1", "u2"],
      first_message: "No exit slip",
      client_event_id: "gate-1",
      photos: [{ file: photo, captured_at: "2026-10-07T03:11:00.000Z", client_event_id: "gate-photo-1" }],
    });

    const { url, body } = lastCall();
    expect(url).toContain("/api/gate-incidents/create_gate_incident/");
    expect(body).not.toBeNull();
    expect(body!.has("category")).toBe(false);
    expect(body!.has("gate_name")).toBe(false);
    expect(body!.has("description")).toBe(false);
    expect(body!.get("access_pass")).toBe("pass-1");
    expect(body!.get("first_message")).toBe("No exit slip");
    expect(body!.getAll("members")).toEqual(["u1", "u2"]);
    expect(body!.getAll("photos")).toHaveLength(1);
  });

  it("looks a scanned pass up on the project without recording a gate event", async () => {
    await findGatePass("p1", "token-abc");

    const { url } = lastCall();
    expect(url).toContain("/api/gate-incidents/find_pass/");
    expect(url).toContain("project=p1");
    expect(url).toContain("qr=token-abc");
    expect(url).not.toContain("scan_gate");
  });
});
