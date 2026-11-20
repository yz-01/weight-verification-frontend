/**
 * Audit 11-20 F4 (JB222): the project map writes a person's 最新定位 time under
 * the icon, so it is read without a press - also on a phone, which has no
 * hover. The shared map draws it only when a marker carries one; no other map
 * sets `caption`, so every other map draws exactly what it drew before.
 */
import { describe, expect, it } from "vitest";

import { markerCaption } from "@/components/shared/location-map";

describe("the words under a marker", () => {
  it("nothing without a caption", () => {
    expect(markerCaption({})).toBe("");
    expect(markerCaption({ caption: "" })).toBe("");
  });

  it("the caption, escaped, outside the icon's own span", () => {
    expect(markerCaption({ caption: "14:05" })).toBe('<em class="mse-map-caption">14:05</em>');
    expect(markerCaption({ caption: "<b>&" })).toBe('<em class="mse-map-caption">&lt;b&gt;&amp;</em>');
  });
});
