import { describe, expect, it } from "vitest";

import { missingFields } from "@/lib/missing-fields";

/**
 * The rule every greyed-out submit button in this app now depends on.
 *
 * The complaint it answers is "有时候我不知道为什么这个按钮点不到" — I cannot tell
 * why this button will not respond. So what matters is not that the button is
 * disabled at the right time, but that the *same* list decides the disabling
 * and names the fields, in the order the person reads them on screen.
 */
describe("missingFields", () => {
  it("names nothing when every requirement is met", () => {
    expect(
      missingFields([
        ["Concrete", "Material"],
        [1, "Quantity"],
      ]),
    ).toEqual([]);
  });

  it("names the fields in the order they appear on the form", () => {
    expect(
      missingFields([
        ["", "Material"],
        [1, "Quantity"],
        ["", "Site"],
      ]),
    ).toEqual(["Material", "Site"]);
  });

  it("treats a field holding only spaces as empty", () => {
    // A typed space is the difference between the button staying grey with no
    // explanation and the form telling the person the field is still blank.
    expect(missingFields([["   ", "Reason"]])).toEqual(["Reason"]);
  });

  it("accepts zero as an answer for anything that is not a string", () => {
    // A count of zero photos is missing; a temperature of 0 is not. Callers
    // pass the comparison they mean, so the list is given `false`, not `0`.
    expect(missingFields([[0, "Photos"]])).toEqual(["Photos"]);
    expect(missingFields([[0 >= 0, "Temperature"]])).toEqual([]);
  });

  it("lets a caller drop a requirement that does not apply", () => {
    // Rejecting needs a note, approving does not, and the same button serves
    // both: the requirement is written as satisfied when it is not in force.
    const requires = (decision: string, note: string) =>
      missingFields([[decision !== "REJECT" || note, "Note"]]);
    expect(requires("APPROVE", "")).toEqual([]);
    expect(requires("REJECT", "")).toEqual(["Note"]);
    expect(requires("REJECT", "Wrong weight")).toEqual([]);
  });

  it("counts a file or an object as supplied", () => {
    expect(missingFields([[new Blob(["x"]), "Photo"]])).toEqual([]);
    expect(missingFields([[null, "Photo"]])).toEqual(["Photo"]);
    expect(missingFields([[undefined, "Photo"]])).toEqual(["Photo"]);
  });
});
