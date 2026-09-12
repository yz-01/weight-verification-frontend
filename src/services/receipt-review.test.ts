/**
 * The key the accept/reject buttons put on the wire.
 *
 * Both buttons on the material-receipt screen were dead from the day the
 * screen shipped: this service sent `{ decision: "ACCEPTED" }` and
 * `receiving/views.py` reads `request.data.get("acceptance_status")`, so every
 * press came back 400 - "Say whether the delivery is accepted or rejected" -
 * and the delivery stayed PENDING (F-382).
 *
 * Why nothing caught it, and why this file exists in this shape: the Django
 * side has a dozen tests on that endpoint and every one of them builds the
 * request body itself, from the server's own contract. They prove the server
 * is right. Nothing on this side looked at the request at all. A defect that
 * lives *between* two correct halves is invisible to any check that stands
 * inside one of them - so this one stands on the body, by reading the source
 * of the function that builds it.
 *
 * Reading source rather than calling the function is deliberate: calling it
 * would need the API client, a fetch stub and a toast, and the thing worth
 * pinning is one literal. If this ever grows a proper request-level harness,
 * replace it - but do not delete it for being crude without putting something
 * in its place, because crude is still the only thing that saw this.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SERVICE = "src/services/contractor.service.ts";
const source = readFileSync(SERVICE, "utf8");

/** `reviewReceipt`, from its signature to the end of its body. */
function reviewReceiptSource(): string {
  const start = source.indexOf("export async function reviewReceipt(");
  expect(start, "reviewReceipt has moved or been renamed").toBeGreaterThan(-1);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

describe("reviewReceipt", () => {
  const body = reviewReceiptSource();

  it("posts to the endpoint that decides a delivery", () => {
    expect(body).toContain("/review_receipt/");
  });

  it("names the decision the way the server reads it", () => {
    // `receiving/views.py`: decision = request.data.get("acceptance_status")
    expect(
      body,
      "the server reads `acceptance_status`; anything else is a 400 nobody " +
        "on this side can see",
    ).toContain("acceptance_status:");
  });

  it("does not send the caller's own word for it instead", () => {
    // The exact shape of the defect: the argument is named `decision`, and it
    // used to be spread onto the wire unchanged.
    const wire = body.slice(body.indexOf("api.post"));
    expect(wire).not.toMatch(/\bdecision:/);
    expect(wire).not.toContain("`,\n    payload,\n  )");
  });

  it("still carries the reason a rejection needs", () => {
    // The server refuses a REJECTED with no reason, so dropping this key
    // while renaming the other one would trade one dead button for another.
    expect(body).toContain("rejection_reason:");
  });
});
