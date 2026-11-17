import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { YARD_LIST_PERMISSIONS } from "@/services/weighing.service";

/**
 * JB207W (walk 11-17, O3 + the operator's dashboard): the dashboard asked for
 * the yard list on every visit, and a role that may not read it (Finance,
 * custom roles) got 「无法载入回收场列表…」 and 「你没有权限做这件事。」 each
 * time. It asks only when the reader holds one of the codes the list answers.
 */
function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

describe("the recycler dashboard's yard filter", () => {
  it("asks for the yard list only when the reader may read it", () => {
    const dashboard = read("src/components/recycler-business/recycler-dashboard.tsx");
    expect(dashboard).toContain("const canReadYards = canAny(YARD_LIST_PERMISSIONS);");
    const query = dashboard.slice(
      dashboard.indexOf("const yards = useQuery({"),
      dashboard.indexOf("});", dashboard.indexOf("const yards = useQuery({")),
    );
    expect(query).toContain("enabled: canReadYards");
  });

  it("knows the same four codes get_sites answers, all real", () => {
    expect([...YARD_LIST_PERMISSIONS].sort()).toEqual(
      ["deduction.create", "task.assign", "weighing.operate", "yard.view"],
    );
    const catalogue = JSON.parse(read("src/lib/permission-catalogue.json")) as {
      codes: { code: string }[];
    };
    const codes = new Set(catalogue.codes.map((row) => row.code));
    for (const code of YARD_LIST_PERMISSIONS) expect(codes.has(code), code).toBe(true);
  });
});
