import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

/**
 * The office raises a disposal request from a desk, not from the skip.
 *
 * The submit button demanded a current GPS fix from everybody, so an
 * administrator filing a request from the office recorded the office as the
 * place the waste was - or, more often, gave up because the button would not
 * light. The server never asked for it: `create_request` requires a fix only
 * `if request.user.is_field_staff`. This is the screen catching up with the
 * rule the API already had.
 *
 * Checked as source rather than by rendering: the condition lives inside a
 * `requires` tuple on one long line, and what matters is that the GPS entry is
 * guarded by the same flag the server uses.
 */
describe("the disposal dialog asks the office for what the office has", () => {
  const file = "src/components/contractor-ops/site-disposal-workspaces.tsx";

  it("only requires a GPS fix from field staff", () => {
    expect(read(file)).toContain('[isFieldStaff ? location : true, t("field.gps")]');
  });

  it("does not require it of everybody", () => {
    expect(read(file)).not.toMatch(/\[location, t\("field\.gps"\)\]/);
  });

  it("still asks the office for a written site location", () => {
    // The office answers the same question in words. Dropping the GPS rule
    // must not drop the only remaining record of where the waste was.
    expect(read(file)).toContain('[isFieldStaff || locationDescription, t("field.siteLocation")]');
  });
});
