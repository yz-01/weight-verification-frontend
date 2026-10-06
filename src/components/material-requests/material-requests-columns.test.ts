/**
 * D3 (6/10): the MR table does not repeat what the top bar and the filter row
 * already say. Read from the source, the way the other layout guards here do.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/components/material-requests/material-requests-office.tsx"),
  "utf8",
);
const columns = source.slice(
  source.indexOf("const columns = useMemo<ColumnDef<MaterialRequest"),
  source.indexOf("const runExport ="),
);

describe("MR table columns (D3)", () => {
  it("has no request-type or project column", () => {
    expect(columns).not.toMatch(/id: "request_type"/);
    expect(columns).not.toMatch(/accessorKey: "project_name"/);
  });

  it("still filters by request type", () => {
    expect(source).toMatch(/param="request_type"\s+allLabel=\{t\("allTypes"\)\}/);
  });

  it("shows the date with its time", () => {
    expect(columns).toMatch(/accessorKey: "created_at"[\s\S]*?df\.dateTime\(row\.original\.created_at\)/);
  });

  it("an Other Request says so, in grey, where the material would be", () => {
    expect(columns).toMatch(
      /request_type === "OTHER" \? \(\s*<span className="text-muted-foreground">\{t\("type\.OTHER"\)\}<\/span>/,
    );
  });

  it("remembers columns under a new key, so an old saved set cannot bring the dropped ones back", () => {
    expect(source).toContain('storageKey="material-requests.v2"');
    expect(source).not.toContain('storageKey="material-requests"');
  });
});
