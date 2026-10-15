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
  it("has the request-type column back and no project column (I16, ID37)", () => {
    expect(columns).toMatch(/id: "request_kind"[\s\S]*?requestTypeName\(row\.original, t\)/);
    expect(columns).not.toMatch(/accessorKey: "project_name"/);
  });

  it("filters by the project's own request types", () => {
    expect(source).toMatch(/param=\{typeFilter\.param\}\s+allLabel=\{t\("allTypes"\)\}/);
    expect(source).toMatch(/param: "request_kind", options: rows\.map/);
    expect(source).toMatch(/param: "request_kind_name", options: requestTypeNameOptions\(rows\)/);
  });

  it("shows the date with its time", () => {
    expect(columns).toMatch(/accessorKey: "created_at"[\s\S]*?df\.dateTime\(row\.original\.created_at\)/);
  });

  it("an Other Request shows its subject where the material would be, or says so in grey", () => {
    expect(columns).toMatch(
      /request_type === "OTHER" \? \(\s*row\.original\.subject \|\| <span className="text-muted-foreground">\{t\("type\.OTHER"\)\}<\/span>/,
    );
  });

  it("shows whose make and who sells it (D3 with D1)", () => {
    expect(columns).toMatch(/accessorKey: "manufacturer_name"/);
    expect(columns).toMatch(/accessorKey: "supplier_name"/);
  });

  it("remembers columns under a new key, so an old saved set cannot bring the dropped ones back", () => {
    // `.v4` since the request type came back (I16); `.v3` brought the
    // manufacturer and supplier columns (2026-10 D1).
    expect(source).toContain('storageKey="material-requests.v4"');
    expect(source).not.toContain('storageKey="material-requests.v3"');
    expect(source).not.toContain('storageKey="material-requests.v2"');
    expect(source).not.toContain('storageKey="material-requests"');
  });
});
