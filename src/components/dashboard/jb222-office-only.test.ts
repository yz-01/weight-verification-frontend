/**
 * Audit 11-20 F1 (JB222): the server refuses the dashboard and the project map
 * to a phone account (`is_field_staff`). That is safe only while no phone
 * screen reads them: the office shell sends a phone account to /field-staff,
 * and the two calls live in the office dashboard's own components.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(path.join(process.cwd(), dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(process.cwd(), rel)).isDirectory()) return walk(rel);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [rel] : [];
  });
}

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("the dashboard and the project map are office screens", () => {
  it("only the office dashboard's components ask for them", () => {
    const callers = walk("src")
      .filter((file) => /\bgetContractorDashboard\(|\bgetProjectMap\(/.test(read(file)))
      .filter((file) => !file.endsWith("services/contractor-dashboard.service.ts"));
    expect(callers.length).toBeGreaterThan(0);
    for (const file of callers) expect(file, file).toMatch(/^src\/components\/dashboard\//);
  });

  it("the phone app reaches neither, and the office shell sends a phone account away", () => {
    for (const file of [...walk("src/components/field-staff"), ...walk("src/app/(field-staff)")]) {
      expect(read(file), file).not.toMatch(/contractor-dashboard|components\/dashboard\//);
    }
    expect(read("src/components/layout/dashboard-shell.tsx")).toContain('redirectWithFallback(router, "/field-staff");');
  });
});
