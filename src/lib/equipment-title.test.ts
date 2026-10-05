import { describe, expect, it } from "vitest";

import { equipmentDirectionTitleKey } from "@/lib/equipment-title";

describe("the equipment page title follows ?direction= (B14)", () => {
  it("names a list of exits 设备退场 and a list of entries 设备进场", () => {
    expect(equipmentDirectionTitleKey("EXIT", false)).toBe(
      "nav.submodule.equipmentExit",
    );
    expect(equipmentDirectionTitleKey("ENTRY", false)).toBe(
      "nav.submodule.equipmentEntry",
    );
  });

  it("keeps the module name when no direction is chosen", () => {
    expect(equipmentDirectionTitleKey(undefined, false)).toBeNull();
    expect(equipmentDirectionTitleKey("", false)).toBeNull();
    expect(equipmentDirectionTitleKey("SIDEWAYS", false)).toBeNull();
  });

  it("does not rename the machine register", () => {
    expect(equipmentDirectionTitleKey("EXIT", true)).toBeNull();
  });
});
