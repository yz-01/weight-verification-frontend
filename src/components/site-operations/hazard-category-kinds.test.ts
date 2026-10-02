import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.join(process.cwd(), "src/components/site-operations/safety.tsx"),
  "utf8",
);

const between = (startNeedle: string, endNeedle: string) => {
  const start = source.indexOf(startNeedle);
  expect(start, `${startNeedle} is present`).toBeGreaterThan(-1);
  const end = source.indexOf(endNeedle, start);
  return source.slice(start, end === -1 ? undefined : end);
};

/**
 * Two lists of hazard columns, and they are not the same list (A04).
 *
 * Reporting a hazard offered 「杂费报销」 and 「test」, because the picker merged
 * the retired `FIELD` kind in from before `EHS` existed - and a sundry claim
 * has had its own `SUNDRY` kind for a while. Those belong to nobody standing
 * in front of a hazard.
 *
 * The back-office filter keeps reading both on purpose. Migration 0040 moved
 * the columns that were purely hazards; the older mixed ones stayed where they
 * were with hazards still filed in them, so narrowing the filter would hide
 * real records rather than tidy a menu.
 */
describe("hazard category lists", () => {
  it("offers only EHS columns when a hazard is raised", () => {
    const createQuery = between('"safety-create-categories"', "enabled:");
    expect(createQuery).toContain('kind: "EHS"');
    expect(createQuery).not.toContain('kind: "FIELD"');
  });

  it("still filters the office list across both kinds", () => {
    const filterQuery = between('"safety-categories"', "enabled:");
    expect(filterQuery).toContain('kind: "EHS"');
    expect(filterQuery).toContain('kind: "FIELD"');
  });
});
