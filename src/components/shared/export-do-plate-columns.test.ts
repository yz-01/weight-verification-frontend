import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 2026-10 C12: 「表头有 DO / 车牌」 - every export of a record that carries a
 * delivery order number or a lorry plate prints them as columns.
 *
 * Asserted by source, per export call, because the columns are worded on the
 * screen that asks for the file and the way this drifts is one screen's
 * list quietly missing them. The server's half (``export_fields``) is
 * checked by ``contractor_ops/tests/test_list_export_photos.py``, which reads
 * the headings back out of the PDF.
 */
function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

/** The source of every `exporter({ ... })` call in a file. */
function calls(source: string, exporter: string) {
  const found: string[] = [];
  let from = source.indexOf(`${exporter}({`);
  while (from !== -1) {
    const end = source.indexOf("\n    });", from);
    found.push(source.slice(from, end === -1 ? undefined : end));
    from = source.indexOf(`${exporter}({`, from + 1);
  }
  return found;
}

const EXPORTS: Array<[string, string, Array<"delivery_note_no" | "vehicle_plate" | "disposal_do_no">]> = [
  // 材料进场 and both material reports (数量 / 成本).
  ["src/components/receipts/receipts.tsx", "exportReceipts", ["delivery_note_no", "vehicle_plate"]],
  ["src/components/reports/material-report.tsx", "exportReceipts", ["delivery_note_no", "vehicle_plate"]],
  // 材料退场, office list and workspace.
  ["src/components/contractor-ops/office-module-lists.tsx", "exportMaterialOutgoing", ["delivery_note_no", "vehicle_plate"]],
  ["src/components/contractor-ops/operations-workspaces.tsx", "exportMaterialOutgoing", ["delivery_note_no", "vehicle_plate"]],
  // 设备进出场.
  ["src/components/contractor-ops/office-module-lists.tsx", "exportEquipmentMovements", ["delivery_note_no", "vehicle_plate"]],
  // 环保材料出场: the lorry, no DO on the record.
  ["src/components/contractor-ops/waste-outgoing-workspace.tsx", "exportWasteOutgoingRecords", ["vehicle_plate"]],
  // 清运: its disposal DO, no plate on the record.
  ["src/components/contractor-ops/site-disposal-workspaces.tsx", "exportDisposalRequests", ["disposal_do_no"]],
  // 调度: the plate, no DO on the record.
  ["src/components/dispatches/dispatches.tsx", "exportDispatches", ["vehicle_plate"]],
];

describe("DO and plate head every export that has them (C12)", () => {
  it.each(EXPORTS)("%s %s", (file, exporter, keys) => {
    const found = calls(read(file), exporter);
    expect(found.length, `${exporter} in ${file}`).toBeGreaterThan(0);
    for (const call of found) {
      for (const key of keys) {
        expect(call, `${exporter} in ${file} asks for ${key}`).toContain(`key: "${key}"`);
      }
    }
  });
});
