import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The phone's 设备进退场 shows no data (D-273, T-393).
 *
 * Lucas, 2026-09-25: 「设备进退场的数据是不需要显示的，他们的工作就只是拍照
 * 而已」. The office list (`SiteEquipmentOffice`) keeps the figures; the phone
 * keeps only what taking the photos needs - an entry, an exit that says which
 * machine by name, and the photographs (at least 4, L6).
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

  it("chooses the machine from one dropdown, not a long list (A9)", () => {
    expect(body).toMatch(/<Select\b/);
    expect(body).toMatch(/data-testid="field-equipment-select"/);
    expect(body).not.toMatch(/group\.rows\.map|field-equipment-\$\{group/);
  });

  it("records an entry in one step, and a 「新设备」 by name (C8, X2)", () => {
    // No application for an entry any more: the one-step form.
    expect(body).toMatch(/<EquipmentEntryDialog/);
    expect(body).toMatch(/NEW_MACHINE/);
    expect(body).toMatch(/t\("equipment\.newMachineEntry"\)/);
    expect(body).not.toMatch(/ApplyMovementDialog|applyNew|applyEntry/);
    // The office can still register a machine from here.
    expect(body).toMatch(/<EquipmentDialog/);
    expect(body).toMatch(/t\("equipment\.add"\)/);
  });

  it("records an exit in one step like the entry, never applied for (Q27, F3)", () => {
    // 进场 / 退场 chosen first; the exit is the entry's form, the other way.
    expect(body).toMatch(/data-testid="field-equipment-direction"/);
    expect(body).toMatch(/<EquipmentEntryDialog[\s\S]*?direction=\{direction\}/);
    expect(body).not.toMatch(/ApplyExitDialog|MachineStep|<MovementDialog|applyExit/);
  });

  it("names a machine 「名称 · 车牌」, the code only for twins (F3)", () => {
    const labeller = componentBody(code, "machineLabeller");
    expect(labeller).toMatch(/`\$\{row\.name\} · \$\{row\.registration_no\}`/);
    expect(labeller).toMatch(/> 1 \? `\$\{plain\(row\)\} \(\$\{row\.code\}\)` : plain\(row\)/);
    expect(body).toMatch(/\{label\(row\)\}/);
  });

  it("shows no category anywhere on the phone (F3)", () => {
    const entry = componentBody(code, "EquipmentEntryDialog");
    for (const part of [body, entry]) {
      expect(part).not.toMatch(/ProjectColumnPicker|EquipmentClassSelect|category/);
      expect(part).not.toMatch(/field\.category|equipmentColumn|equipmentSubClass/);
    }
    // One entry is one machine: no quantity or unit on the entry form.
    expect(entry).not.toMatch(/field\.quantity|field\.unit|EQUIPMENT_UNITS/);
  });

  it("the worker's own movements still carry their conversation, under 我的提交", () => {
    const mine = read("src/components/field-staff/my-submissions.tsx");
    expect(mine).toMatch(/CONVERSATION_KINDS = new Set<string>\(\[[\s\S]*?"EQUIPMENT_MOVEMENT"[\s\S]*?\]\)/);
    expect(mine).toMatch(/<RecordConversationPanel kind=\{row\.kind/);
  });

  it("still takes the photographs, at least 4 and no ceiling (L6, replacing D-257's 4-5)", () => {
    expect(body).toMatch(/<EquipmentEntryDialog[\s\S]*?fieldTaskId=\{fieldTaskId\}/);
    const entry = componentBody(code, "EquipmentEntryDialog");
    expect(entry).toMatch(/<FieldEvidenceGrid/);
    expect(entry).toMatch(/hasRequiredFieldEvidence\(fieldEvidence\)/);
    expect(entry).toMatch(/<FieldSignaturePad[\s\S]*?<FieldSignaturePad/);
    expect(entry).toMatch(/submitEquipmentMovementOfflineAware/);
    expect(entry).toMatch(/entry: !going/);
    expect(entry).toMatch(/exit: going/);
    const dialog = componentBody(code, "MovementDialog");
    expect(dialog).toMatch(/<FieldEvidenceGrid/);
    expect(dialog).not.toMatch(/maxFiles=/);
    expect(dialog).toMatch(/hasRequiredFieldEvidence\(fieldEvidence\)/);
    // 「手机和后台都要」: the office counts four too, the DO photo included.
    expect(dialog).toMatch(/submissionPhotos\.length \+ \(deliveryNotePhoto \? 1 : 0\) >= EQUIPMENT_PHOTO_MIN/);
    expect(code).toMatch(/const EQUIPMENT_PHOTO_MIN = 4;/);
  });
});
