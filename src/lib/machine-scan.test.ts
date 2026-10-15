import { describe, expect, it } from "vitest";

import {
  equipmentScanLink,
  matchScanned,
  registerScanKeys,
  scanCandidates,
  squashCode,
} from "@/lib/machine-scan";

/**
 * A machine's QR code, read the one way everywhere (2026-10 I24, ID59, ID60):
 * 设备进退场's 「扫描设备二维码」, the actual exit's check of the approved
 * machine, and 设备操作员工时 - and the server (`equipment_qr`), so a sticker the
 * phone accepts is one the server accepts.
 */

const register = [
  { id: "a1", code: "EQ-OPS-261015-001", site_no: "12", registration_no: "WXY 1234", serial_no: "SN-77", name: "Excavator" },
  { id: "b2", code: "EQ-OPS-261015-002", site_no: "挖机 3", registration_no: "", serial_no: "", name: "Crane" },
];

describe("reading a machine's QR code", () => {
  it("reads the system's own sticker by the machine's id", () => {
    const link = equipmentScanLink("https://trace.example.my/", "b2");
    expect(link).toBe("https://trace.example.my/scan/equipment?equipment=b2");
    expect(matchScanned(link, register, registerScanKeys)?.name).toBe("Crane");
  });

  it("tries the text, then the link's parameters, then its last path part", () => {
    expect(scanCandidates(" https://x.my/scan/equipment?equipment=abc&code=EQ-1 ")).toEqual([
      "https://x.my/scan/equipment?equipment=abc&code=EQ-1",
      "abc",
      "EQ-1",
      "equipment",
    ]);
    expect(scanCandidates("WXY 1234")).toEqual(["WXY 1234"]);
    expect(scanCandidates("   ")).toEqual([]);
  });

  it("matches the number, 现场编号, plate or serial, ignoring case, spaces and dashes", () => {
    expect(matchScanned("eq ops 261015 001", register, registerScanKeys)?.id).toBe("a1");
    expect(matchScanned("12", register, registerScanKeys)?.id).toBe("a1");
    expect(matchScanned("挖机3", register, registerScanKeys)?.id).toBe("b2");
    expect(matchScanned("wxy-1234", register, registerScanKeys)?.id).toBe("a1");
    expect(matchScanned("sn77", register, registerScanKeys)?.id).toBe("a1");
    expect(matchScanned("https://supplier.example/fleet/WXY1234", register, registerScanKeys)?.id).toBe("a1");
  });

  it("names nothing it does not know", () => {
    expect(matchScanned("https://trace.example.my/scan/equipment?equipment=zz", register, registerScanKeys)).toBeNull();
    expect(matchScanned("---", register, registerScanKeys)).toBeNull();
    expect(matchScanned("", register, registerScanKeys)).toBeNull();
  });

  it("checks the approved machine only, at the actual exit", () => {
    const approved = [register[0]];
    expect(matchScanned(equipmentScanLink("https://t.my", "a1"), approved, registerScanKeys)).toBe(register[0]);
    expect(matchScanned(equipmentScanLink("https://t.my", "b2"), approved, registerScanKeys)).toBeNull();
  });

  it("squashes the way the server's normalised_plate does", () => {
    expect(squashCode(" wxy-12 34 ")).toBe("WXY1234");
    expect(squashCode("挖机 1")).toBe("挖机1");
    expect(squashCode(null)).toBe("");
  });
});
