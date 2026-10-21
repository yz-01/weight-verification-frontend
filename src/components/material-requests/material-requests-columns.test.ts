/**
 * D3 (6/10): the MR table does not repeat what the top bar and the filter row
 * already say. Read from the source, the way the other layout guards here do.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LIST_FITS } from "@/lib/list-fits";

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

  it("has a 材料编号 column from the category's code, a dash for an old request (I19-15)", () => {
    expect(columns).toMatch(
      /id: "category_code"[\s\S]*?row\.original\.category_code \|\| <span className="text-muted-foreground">—<\/span>/,
    );
    expect(source).toMatch(/\{ key: "category_code", label: t\("field\.materialCode"\) \}/);
    expect(source).toMatch(/label: t\("field\.materialCode"\), value: row\.category_code \|\| "—"/);
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
    // manufacturer and supplier columns (2026-10 D1); `.v6` since the list
    // hides some columns by default to fit 1366 px (I39); `.v7` for the four
    // 64 px photos a row (J34-2).
    expect(source).toContain("storageKey={LIST_FITS.materialRequests.storageKey}");
    expect(source).toContain("defaultHidden={LIST_FITS.materialRequests.hidden}");
    expect(LIST_FITS.materialRequests.storageKey).toBe("material-requests.v7");
    expect(source).not.toMatch(/storageKey="material-requests/);
  });

  it("reads 材料编号 and the spec under the material, the unit by the quantity (I39)", () => {
    expect(columns).toMatch(/<MaterialSubLine code=\{row\.original\.category_code\} spec=\{row\.original\.specification\} \/>/);
    expect(columns).toMatch(/row\.original\.quantity != null && row\.original\.unit \? ` \$\{unitLabel\(row\.original\.unit\)\}`/);
    expect(LIST_FITS.materialRequests.hidden).toEqual(
      expect.arrayContaining(["category_code", "specification", "unit"]),
    );
  });
});
