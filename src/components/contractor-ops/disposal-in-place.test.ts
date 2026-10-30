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

describe("a disposal request opened in place (Lucas 10-30)", () => {
  it("is exported with { id, onClose }", async () => {
    const mod = await import("@/components/contractor-ops/site-disposal-workspaces");
    expect(typeof mod.DisposalInPlace).toBe("function");
    expect(source).toContain("export function DisposalInPlace({ id, onClose }: { id: string; onClose: () => void })");
  });

  it("renders the very popup, steps and step dialogs the office list does", () => {
    const inPlace = body("DisposalInPlace");
    const office = body("SiteDisposalOffice");
    for (const part of ["<DisposalDetailDialog", "<DisposalActions", "<DisposalStepDialogs"]) {
      expect(inPlace).toContain(part);
      expect(office).toContain(part);
    }
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
