import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The phone's 设备进退场 shows no data (D-273, T-393).
 *
 * Lucas, 2026-09-25: 「设备进退场的数据是不需要显示的，他们的工作就只是拍照
 * 而已」. The office list (`SiteEquipmentOffice`) keeps the figures; the phone
 * keeps only what taking the photos needs - an entry, an exit that says which
 * machine by name, and the 4-5 photographs (D-257).
 *
 * Asserted by source: the way this drifts back is somebody copying the office
 * tiles or history list into the phone screen "for context".
 */
function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

function componentBody(code: string, name: string) {
  const start = code.indexOf(`export function ${name}(`);
  expect(start, `${name} is exported`).toBeGreaterThan(-1);
  const next = code.slice(start + 1).search(/\n(?:\/\*\*[\s\S]*?\*\/\n)?(?:export )?function [A-Z]/);
  return next === -1 ? code.slice(start) : code.slice(start, start + 1 + next);
}

const WORKSPACES = "src/components/contractor-ops/operations-workspaces.tsx";
const PHONE = "src/components/field-staff/field-records-panel.tsx";

describe("phone 设备进退场 is photos only (D-273)", () => {
  const code = read(WORKSPACES);
  const body = componentBody(code, "SiteEquipmentWorkspace");

  it("is mounted by the phone only, inside its pending slots", () => {
    const phone = read(PHONE);
    expect(phone).toMatch(
      /<FieldSlots scope=\{`equipment:[^`]*`\} jobKinds=\{\["EQUIPMENT_MOVEMENT"\]\}><SiteEquipmentWorkspace [^>]*fieldTaskId=\{task\?\.id\}/,
    );
    // The office has its own list; this component is not mounted there.
    expect(read("src/components/contractor-ops/office-module-lists.tsx")).not.toMatch(/<SiteEquipmentWorkspace/);
  });

  it("has no stat tiles", () => {
    expect(body).not.toMatch(/equipment\.summary\./);
    expect(body).not.toMatch(/getEquipmentSummary/);
    expect(body).not.toMatch(/quantity_on_site|project_total/);
  });

  it("has no equipment data cards", () => {
    expect(body).not.toMatch(/<article/);
    expect(body).not.toMatch(/serial_no|registration_no|category_name|noIdentifier/);
    expect(body).not.toMatch(/equipmentStatus\.|<StatusBadge/);
  });

  it("has no recent-movements section, filters or export", () => {
    expect(body).not.toMatch(/recentMovements|equipmentFilter/);
    expect(body).not.toMatch(/getEquipmentMovements|exportEquipmentMovements|<ExportButton/);
    expect(body).not.toMatch(/getSuppliers/);
  });

  it("fetches only the equipment it lists, and says when that fails", () => {
    expect(body.match(/useQuery\(/g)).toHaveLength(1);
    expect(body).toMatch(/error=\{rows\.isError\}/);
  });

  it("still records an entry and registers a machine that has just arrived", () => {
    expect(body).toMatch(/"equipment\.recordEntry"/);
    expect(body).toMatch(/<EquipmentDialog/);
    expect(body).toMatch(/t\("equipment\.add"\)/);
  });

  it("still records an exit, choosing the machine by name", () => {
    expect(body).toMatch(/"equipment\.recordExit"/);
    expect(body).toMatch(/\{machineName\(row\)\}/);
    // The code appears only to tell apart two machines with the same name.
    expect(body).toMatch(/> 1 \? `\$\{row\.name\} \(\$\{row\.code\}\)` : row\.name/);
  });

  it("the worker's own movements still carry their conversation, under 我的提交", () => {
    const mine = read("src/components/field-staff/my-submissions.tsx");
    expect(mine).toMatch(/CONVERSATION_KINDS = new Set<string>\(\[[\s\S]*?"EQUIPMENT_MOVEMENT"[\s\S]*?\]\)/);
    expect(mine).toMatch(/<RecordConversationPanel kind=\{row\.kind/);
  });

  it("still takes the photographs, 4 to 5 of them (D-257)", () => {
    expect(body).toMatch(/<MovementDialog[\s\S]*?fieldTaskId=\{fieldTaskId\}/);
    const dialog = componentBody(code, "MovementDialog");
    expect(dialog).toMatch(/<FieldEvidenceGrid/);
    expect(dialog).toMatch(/maxFiles=\{EQUIPMENT_PHOTO_MAX/);
    expect(dialog).toMatch(/FIELD_EVIDENCE_PHOTO_COUNT/);
  });
});
