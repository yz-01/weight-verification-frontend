/**
 * 分类管理 → 查看记录 opens a disposal request where the reader is (Lucas
 * 10-30): `DisposalInPlace` is the office list's own popup fetched by id, so
 * the two cannot drift, and a step taken in it refreshes what the list reads.
 *
 * The runner has no DOM and the dialog renders into a portal, so the wiring
 * is checked on the source.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));

const source = readFileSync(
  path.join(process.cwd(), "src/components/contractor-ops/site-disposal-workspaces.tsx"),
  "utf8",
);

function body(name: string) {
  const start = source.indexOf(`export function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf("\nexport ", start + 1);
  const nextConst = source.indexOf("\nconst ", start + 1);
  const ends = [next, nextConst].filter((at) => at > -1);
  return source.slice(start, ends.length ? Math.min(...ends) : undefined);
}


/**
 * JB164: this test imports a large module inside it (the whole workspace or
 * config), which under a full parallel run on the 7.5 GB machine took longer
 * than the default 20 s (logs/final-fe-ci2.log). The assertions are unchanged;
 * only the wait is longer.
 */
const SLOW_IMPORT = 60_000;

describe("a disposal request opened in place (Lucas 10-30)", () => {
  it("is exported with { id, onClose }", { timeout: SLOW_IMPORT }, async () => {
    const mod = await import("@/components/contractor-ops/site-disposal-workspaces");
    expect(typeof mod.DisposalInPlace).toBe("function");
    expect(source).toContain("export function DisposalInPlace({ id, onClose }: { id: string; onClose: () => void })");
  });

  it("renders the very popup, steps and step dialogs the office list does", () => {
    const inPlace = body("DisposalInPlace");
    const office = body("SiteDisposalOffice");
    // The steps are drawn by the popup itself since JB166 (one row with
    // 加进资料包, the destructive ones last); each screen hands it `onStep`.
    for (const part of ["<DisposalDetailDialog", "onStep=", "<DisposalStepDialogs"]) {
      expect(inPlace).toContain(part);
      expect(office).toContain(part);
    }
    const dialog = source.slice(source.indexOf("function DisposalDetailDialog("), source.indexOf("type DisposalStep"));
    expect(dialog).toContain("<DisposalActions");
  });

  it("reads the record under the list's key and refreshes the same queries", () => {
    const inPlace = body("DisposalInPlace");
    expect(inPlace).toContain('queryKey: ["site-disposals", "record", id]');
    expect(inPlace).toContain('qc.invalidateQueries({ queryKey: ["site-disposals"] })');
    expect(body("SiteDisposalOffice")).toContain('qc.invalidateQueries({ queryKey: ["site-disposals"] })');
  });

  it("never navigates away from the page it opened over", () => {
    const inPlace = body("DisposalInPlace");
    expect(inPlace).not.toMatch(/useRouter|router\.push|setViewingId|useUrlSelection/);
  });
});
