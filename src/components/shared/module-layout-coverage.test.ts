import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every contractor module looks like 材料进场 (C-020, T-368/T-369/T-370).
 *
 * Lucas, 2026-09-23: 「全部模块都基本上都是这样的 layout 和设计」 for the
 * detail (图 1／图 2) and 「后台的全部模块的页面状态是和图 4 一模一样的」 for
 * the office list. Both are asserted by source, per module, because the way
 * this drifts is one module quietly keeping its own layout.
 */
function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

const SHELL = "src/components/shared/record-detail-shell.tsx";

describe("the detail shell does what the customer asked (T-368)", () => {
  const shell = read(SHELL);

  it("keeps photographs small - 「照片需要很小很小」", () => {
    expect(shell).toMatch(/size-20/);
    expect(shell).toMatch(/sizes="80px"/);
  });

  it("zooms in and out once a photograph is opened", () => {
    expect(shell).toMatch(/MAX_ZOOM = 4/);
    expect(shell).toMatch(/t\("zoomIn"\)/);
    expect(shell).toMatch(/t\("zoomOut"\)/);
    expect(shell).toMatch(/width: `\$\{zoom \* 100\}%`/);
  });

  it("shows signatures only when the record has some - 「没有签名就不需要放」", () => {
    expect(shell).toMatch(/signatures\.length > 0 &&/);
  });

  it("puts the buttons in the right column, under panel and signatures", () => {
    const aside = shell.slice(shell.indexOf("<aside"), shell.indexOf("</aside>"));
    const panel = aside.indexOf("{panel}");
    const signatures = aside.indexOf("signatures.length > 0");
    const actions = aside.indexOf("{actions ?");
    expect(panel).toBeGreaterThan(-1);
    expect(signatures).toBeGreaterThan(panel);
    expect(actions).toBeGreaterThan(signatures);
  });
});

describe("the material receipt detail is the template (T-368)", () => {
  const receipt = read("src/components/receipts/view-receipt.tsx");

  it("is drawn by the shell", () => {
    expect(receipt).toMatch(/<RecordDetailShell/);
  });

  it("no longer carries the read-only block of 图 3", () => {
    // The three sections that repeated the summary below the photographs.
    for (const section of ["receipts.section.delivery", "receipts.section.material", "receipts.section.vehicle"]) {
      expect(receipt).not.toContain(section);
    }
    expect(receipt).not.toContain('className="hidden');
  });
});

/** Where each module's record detail is drawn, and the kind of its conversation. */
const DETAILS: Array<[string, string]> = [
  ["src/components/receipts/view-receipt.tsx", "MATERIAL_RECEIPT"],
  ["src/components/contractor-ops/operations-workspaces.tsx", "MATERIAL_OUTGOING"],
  ["src/components/contractor-ops/office-module-lists.tsx", "EQUIPMENT_MOVEMENT"],
  ["src/components/contractor-ops/office-module-lists.tsx", "PROGRESS"],
  ["src/components/contractor-ops/waste-outgoing-workspace.tsx", "WASTE_OUTGOING"],
  ["src/components/contractor-ops/site-disposal-workspaces.tsx", "DISPOSAL_REQUEST"],
  // Claim too (T-374): 杂费报销 on the same shell, with its own conversation.
  ["src/components/sundry-claims/sundry-claims-office.tsx", "SUNDRY_CLAIM"],
];

describe("every module's detail is the same shell, with its own conversation (T-369)", () => {
  for (const [file, kind] of DETAILS) {
    it(`${kind} in ${path.basename(file)}`, () => {
      const code = read(file);
      expect(code).toMatch(/<RecordDetailShell/);
      expect(code).toMatch(new RegExp(String.raw`conversation=\{\{\s*kind:\s*"` + kind + '"'));
    });
  }
});

/** The office page of each module, its component, and the sidebar key its title reads. */
const OFFICE_PAGES: Array<[string, string, string, string]> = [
  ["src/app/(dashboard)/material-outgoing/page.tsx", "MaterialOutgoingOffice", "src/components/contractor-ops/office-module-lists.tsx", "nav.submodule.materialOutgoing"],
  ["src/app/(dashboard)/site-equipment/page.tsx", "SiteEquipmentOffice", "src/components/contractor-ops/office-module-lists.tsx", "nav.submodule.siteEquipment"],
  ["src/app/(dashboard)/progress/page.tsx", "SiteProgressOffice", "src/components/contractor-ops/office-module-lists.tsx", "nav.submodule.progressRecords"],
  ["src/app/(dashboard)/waste-outgoing/page.tsx", "WasteOutgoingWorkspace", "src/components/contractor-ops/waste-outgoing-workspace.tsx", "nav.submodule.wasteOutgoing"],
  ["src/app/(dashboard)/site-disposals/page.tsx", "SiteDisposalOffice", "src/components/contractor-ops/site-disposal-workspaces.tsx", "nav.submodule.siteDisposals"],
  ["src/app/(dashboard)/sundry-claims/page.tsx", "SundryClaimsOffice", "src/components/sundry-claims/sundry-claims-office.tsx", "nav.submodule.sundryClaims"],
];

/** The body of one exported component, up to the next top-level function. */
function componentBody(code: string, name: string) {
  const start = code.indexOf(`export function ${name}(`);
  expect(start, `${name} is exported`).toBeGreaterThan(-1);
  const next = code.slice(start + 1).search(/\n(?:export )?function [A-Z]/);
  return next === -1 ? code.slice(start) : code.slice(start, start + 1 + next);
}

describe("every office list is the receipt list's layout (图 4, T-370)", () => {
  for (const [page, component, file, titleKey] of OFFICE_PAGES) {
    it(`${path.basename(path.dirname(page))} mounts ${component}`, () => {
      expect(read(page)).toMatch(new RegExp(`<${component} />`));
      const body = componentBody(read(file), component);
      expect(body).toMatch(/<ModuleRecordsTable/);
      // The page is called what the sidebar calls it (C-020 第 7 条).
      expect(body).toContain(`tRoot("${titleKey}")`);
      // No card list left behind on the office page.
      expect(body).not.toMatch(/<article/);
    });
  }

  it("the frame is the receipt list's frame", () => {
    const frame = read("src/components/shared/module-records-table.tsx");
    const receipts = read("src/components/receipts/receipts.tsx");
    const container = 'className="flex h-[calc(100dvh-5rem)] flex-col gap-4"';
    expect(receipts).toContain(container);
    expect(frame).toContain(container);
    expect(frame).toMatch(/<ListHeader/);
    expect(frame).toMatch(/<DataTable/);
    expect(frame).toMatch(/onRowClick=\{onOpen\}/);
  });

  it("the phone keeps its cards (「手机端不受影响」)", () => {
    const phone = read("src/components/field-staff/field-records-panel.tsx");
    for (const workspace of ["SiteEquipmentWorkspace", "SiteProgressWorkspace", "SiteDisposalWorkspace", "MaterialOutgoingWorkspace"]) {
      expect(phone).toContain(`<${workspace} `);
    }
  });
});

describe("single items can be previewed, printed and downloaded from the record (T-365, D-236)", () => {
  it("the shell's photo viewer carries the file actions, so every module detail has them", () => {
    const shell = read(SHELL);
    const viewer = shell.slice(shell.indexOf("function PhotoViewer("));
    expect(viewer).toMatch(/<EvidenceFileActions/);
  });
});

describe("forms are compact, changed once in the shared components (T-371)", () => {
  it("tight label spacing on every field", () => {
    expect(read("src/components/shared/page-primitives.tsx")).toMatch(/cn\("space-y-1", className\)/);
  });

  it("page sections spread across three columns on a wide screen", () => {
    const shell = read("src/components/shared/form-shell.tsx");
    expect(shell).toMatch(/surface !== "dialog" && "xl:grid-cols-3"/);
    expect(shell).toMatch(/gap-y-2/);
  });

  it("the photo slots sit in one row on the office screen, two across on a phone", () => {
    expect(read("src/components/field-staff/field-evidence-grid.tsx")).toMatch(/grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5/);
  });
});
