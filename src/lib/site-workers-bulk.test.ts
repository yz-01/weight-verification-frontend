import { describe, expect, it } from "vitest";

import type { BatchRowData } from "@/interfaces/site-workers";
import {
  BULK_FIELDS,
  applyPaste,
  blankRow,
  blankRows,
  confirmRow,
  editRow,
  filledCount,
  hasUnsynced,
  isBlank,
  isGridPaste,
  mergeIncoming,
  nextCell,
  parsePaste,
  planSync,
  pollSince,
  rowFromServer,
  settleSync,
  withBlankTail,
} from "@/lib/site-workers-bulk";

function serverRow(id: string, position: number, extra: Partial<BatchRowData> = {}): BatchRowData {
  return {
    id,
    position,
    name: `Person ${position}`,
    phone: "",
    passport_no: "",
    nationality: "",
    date_of_birth: "",
    passport_expiry: "",
    cidb_no: "",
    company_text: "",
    trade_text: "",
    source: "PHONE",
    read_status: "READ",
    needs_check: false,
    photo_url: "https://files.test/p.jpg",
    photo_is_pdf: false,
    ...extra,
  };
}

describe("parsePaste", () => {
  it("splits Excel's tabs and lines", () => {
    expect(parsePaste("Rahim\t012-111 2222\tA1111111\r\nKarim\t\tB2222222\r\n")).toEqual([
      ["Rahim", "012-111 2222", "A1111111"],
      ["Karim", "", "B2222222"],
    ]);
  });

  it("keeps a WhatsApp list one name per line", () => {
    expect(parsePaste("MD RAHIM\nABDUL KARIM\n\n")).toEqual([["MD RAHIM"], ["ABDUL KARIM"]]);
  });

  it("keeps Excel's quoted cells whole", () => {
    expect(parsePaste('"Rahim\nbin Ali"\tA1\n"say ""hi"""\tB2')).toEqual([
      ["Rahim bin Ali", "A1"],
      ['say "hi"', "B2"],
    ]);
  });

  it("drops empty lines and trims", () => {
    expect(parsePaste("  a  \t b \n\t\n")).toEqual([["a", "b"]]);
  });

  it("tells a grid from text for one box", () => {
    expect(isGridPaste("Rahim")).toBe(false);
    expect(isGridPaste("Rahim\n")).toBe(false);
    expect(isGridPaste("Rahim\tA1")).toBe(true);
    expect(isGridPaste("Rahim\nKarim")).toBe(true);
  });
});

describe("applyPaste", () => {
  it("fills from the cell pasted into and adds rows past the end", () => {
    const rows = blankRows(2);
    const next = applyPaste(rows, 1, "phone", [
      ["0121112222", "A1"],
      ["0123334444", "B2", "BGD", "x", "y", "z", "w", "too far"],
    ]);
    expect(next[1].values.phone).toBe("0121112222");
    expect(next[1].values.passport_no).toBe("A1");
    expect(next[2].values.nationality).toBe("BGD");
    expect(next[2].values.company_text).toBe("w");
    expect(next[0].values.name).toBe("");
    // Ends with empty lines to type into.
    expect(isBlank(next[next.length - 1])).toBe(true);
    expect(next[1].version).toBeGreaterThan(0);
  });
});

describe("nextCell", () => {
  const last = BULK_FIELDS.length - 1;
  it("Tab runs along the row and on to the next", () => {
    expect(nextCell(0, 0, "Tab", false, 3)).toEqual({ row: 0, column: 1 });
    expect(nextCell(0, last, "Tab", false, 3)).toEqual({ row: 1, column: 0 });
    expect(nextCell(2, last, "Tab", false, 3)).toBeNull();
    expect(nextCell(1, 0, "Tab", true, 3)).toEqual({ row: 0, column: last });
  });
  it("Enter goes down the column", () => {
    expect(nextCell(0, 2, "Enter", false, 3)).toEqual({ row: 1, column: 2 });
    expect(nextCell(2, 2, "Enter", false, 3)).toBeNull();
    expect(nextCell(1, 2, "Enter", true, 3)).toEqual({ row: 0, column: 2 });
  });
});

describe("sync", () => {
  it("sends changed rows, never untouched blank ones, and settles ids", () => {
    const typed = editRow(blankRow(), "name", "Rahim");
    const rows = [typed, blankRow(), editRow(blankRow(), "name", "")];
    const plan = planSync(rows);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({ key: typed.key, name: "Rahim" });
    expect(plan.rows[0].id).toBeUndefined();

    const settled = settleSync(rows, plan, { ids: { [typed.key]: "id-1" }, removed: [] });
    expect(settled[0].id).toBe("id-1");
    expect(hasUnsynced(settled, [])).toBe(false);
    expect(hasUnsynced(settled, ["gone"])).toBe(true);
  });

  it("keeps a row dirty when it was typed in again while the sync was out", () => {
    const typed = editRow(blankRow(), "name", "Rah");
    const plan = planSync([typed]);
    const typedMore = editRow(typed, "name", "Rahim");
    const settled = settleSync([typedMore], plan, { ids: { [typed.key]: "id-1" }, removed: [] });
    expect(settled[0].id).toBe("id-1");
    const again = planSync(settled);
    expect(again.rows[0]).toMatchObject({ id: "id-1", name: "Rahim" });
  });

  it("a row the server removed (typed empty) loses its id", () => {
    const row = { ...rowFromServer(serverRow("id-9", 4)), photoUrl: null };
    const emptied = editRow(row, "name", "");
    const plan = planSync([emptied]);
    expect(plan.rows[0].id).toBe("id-9");
    const settled = settleSync([emptied], plan, { ids: {}, removed: ["id-9"] });
    expect(settled[0].id).toBeUndefined();
    expect(planSync(settled).rows).toHaveLength(0);
  });

  it("「核对好了」 is sent once", () => {
    const yellow = rowFromServer(serverRow("id-2", 2, { needs_check: true, read_status: "CHECK_FAILED" }));
    const checked = confirmRow(yellow);
    expect(checked.needsCheck).toBe(false);
    const plan = planSync([checked]);
    expect(plan.rows[0]).toMatchObject({ id: "id-2", checked: true });
    const settled = settleSync([checked], plan, { ids: {}, removed: [] });
    expect(planSync(settled).rows).toHaveLength(0);
  });

  it("typing the passport number on a yellow row clears it", () => {
    const yellow = rowFromServer(serverRow("id-3", 3, { needs_check: true }));
    expect(editRow(yellow, "passport_no", "A1").needsCheck).toBe(false);
    expect(editRow(yellow, "name", "A").needsCheck).toBe(true);
  });

  it("sends at most one chunk", () => {
    const rows = Array.from({ length: 10 }, (_, index) => editRow(blankRow(), "name", `P${index}`));
    expect(planSync(rows, 4).rows).toHaveLength(4);
  });
});

describe("mergeIncoming", () => {
  it("puts phone rows before the empty lines and keeps rows already shown", () => {
    const mine = { ...editRow(blankRow(), "name", "Typed"), id: "id-1", position: 1 };
    const rows = [mine, ...blankRows(3)];
    const merged = mergeIncoming(rows, [serverRow("id-1", 1, { name: "Server copy" }), serverRow("id-2", 2)]);
    expect(merged[0].values.name).toBe("Typed");
    expect(merged[1].id).toBe("id-2");
    expect(merged[1].photoUrl).toBe("https://files.test/p.jpg");
    expect(isBlank(merged[2])).toBe(true);
    expect(filledCount(merged)).toBe(2);
    expect(mergeIncoming(merged, [serverRow("id-2", 2)])).toBe(merged);
  });

  it("asks for rows since half a minute before the server's last answer", () => {
    expect(pollSince("2026-10-28T03:00:30.000Z")).toBe("2026-10-28T03:00:00.000Z");
    expect(pollSince("2026-10-28T11:00:30+08:00")).toBe("2026-10-28T03:00:00.000Z");
  });

  it("keeps empty lines at the end", () => {
    expect(withBlankTail([editRow(blankRow(), "name", "a")]).length).toBe(6);
  });
});
