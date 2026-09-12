import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The field home must carry the three blocks the customer asked for, in order.
 *
 * Their words: 「首页只需要放任务，上传头像和图2就好」 - tasks, the avatar
 * upload, and 图2, which is 「我提交过的」 / `MySubmissions`. T-209 put that
 * third block back.
 *
 * Why a guard and not just the change: this block was on the home once before
 * and was deleted along with the tile grid in `e754025`. Nothing broke when it
 * went - no error, no empty state, no failing test. The home simply stopped
 * answering "did my work arrive", and the consequence lands on site rather
 * than here: a worker with no proof their upload landed photographs the
 * delivery again, so the load exists twice, or assumes it failed and stops
 * sending, so the evidence is missing (F-228). A deletion whose only symptom
 * is silence needs something that speaks.
 *
 * Order is asserted, not just presence. Tasks lead because they are the only
 * block that says what to do next, and the customer listed them first.
 *
 * The runtime half is `e2e/field-home-mobile.spec.ts`, which reads the three
 * headings off a 390px screen and checks they come down the page in this
 * order. Source order and rendered order are not the same claim: a `hidden`
 * class or a query that never resolves would satisfy this file and fail that
 * one.
 */

const FILE = "src/components/field-staff/field-staff-workspace.tsx";

function source(): string {
  return readFileSync(path.join(process.cwd(), FILE), "utf8");
}

/**
 * Slice one component out of the module.
 *
 * Throws when the anchor is gone rather than returning "", so a rename fails
 * loudly instead of turning every assertion below into a claim about an empty
 * string.
 */
function componentBody(name: string): string {
  const code = source();
  const start = code.search(new RegExp(`^(?:export )?function ${name}\\b`, "m"));
  if (start === -1) {
    throw new Error(`${name} not found in ${FILE} - was it renamed?`);
  }
  const rest = code.slice(start + 1);
  const end = rest.search(/^(?:export )?function \w/m);
  return end === -1 ? rest : rest.slice(0, end);
}

/** The three blocks the customer named, in the order they said them. */
const BLOCKS = ["<FieldTaskPanel", "<AvatarUpload", "<MySubmissions"] as const;

describe("the field staff home carries what the customer asked for (T-209)", () => {
  it("renders all three blocks", () => {
    const body = componentBody("FieldHomePanel");
    for (const block of BLOCKS) expect(body).toContain(block);
  });

  it("renders them in the customer's order: tasks, avatar, what I sent", () => {
    const body = componentBody("FieldHomePanel");
    const positions = BLOCKS.map((block) => body.indexOf(block));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("imports the submissions list rather than redefining one", () => {
    // The component survived the deletion and the driver dashboard has been
    // rendering it throughout. A second implementation here would drift from
    // the one the driver sees.
    expect(source()).toContain(
      'from "@/components/field-staff/my-submissions"',
    );
  });

  it("keeps the device handoff reachable, below the three", () => {
    // Not named by the customer, but it is the only way to move a field
    // session to another phone and field staff have no profile screen to
    // reach it from. Removing it would strand a worker with a broken phone.
    const body = componentBody("FieldHomePanel");
    expect(body).toContain("<FieldDeviceHandoff");
    expect(body.indexOf("<FieldDeviceHandoff")).toBeGreaterThan(
      body.indexOf("<MySubmissions"),
    );
  });
});
