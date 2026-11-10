/**
 * JB159 (found on the 11-10 update-doc screenshots): a 垃圾清运 job filed from
 * the phone stores 「GPS captured site location」 as its 工地位置, and that
 * English stood on the Chinese record detail, the driver's page and both
 * PDFs. Old and new rows hold the same words, so they are worded where they
 * are shown; the list PDF / spreadsheet get them through the column's
 * `values`, the 完整证据 PDF from the server (`pdf_words.site_location`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));

const { GPS_SITE_LOCATION, siteLocationText } = await import(
  "@/components/contractor-ops/site-disposal-workspaces"
);

const source = readFileSync(
  path.join(process.cwd(), "src/components/contractor-ops/site-disposal-workspaces.tsx"),
  "utf8",
);

describe("the phone's GPS site location", () => {
  it("is worded for the reader; a typed place stays as typed", () => {
    expect(GPS_SITE_LOCATION).toBe("GPS captured site location");
    expect(siteLocationText(GPS_SITE_LOCATION, zh.siteDisposal.gpsSiteLocation)).toBe("GPS 定位的工地位置");
    expect(siteLocationText("Level 3 west", zh.siteDisposal.gpsSiteLocation)).toBe("Level 3 west");
    for (const messages of [zhTW, en, ms]) {
      expect(messages.siteDisposal.gpsSiteLocation).toBeTruthy();
      expect(messages.siteDisposal.gpsSiteLocation).not.toBe(GPS_SITE_LOCATION);
    }
  });

  it("is never shown raw: list card, detail, list column, driver's and worker's pages, the list file", () => {
    // Every place that shows a job's location goes through the wording.
    expect(source.match(/\{(?:row|current|row\.original)\.location_description\}/g)).toBeNull();
    expect(source.match(/siteLocationText\(/g)?.length).toBeGreaterThanOrEqual(6);
    expect(source).toContain("values: { [GPS_SITE_LOCATION]: t(\"gpsSiteLocation\") },");
    // The phone still files the same words, so old and new rows agree.
    expect(source).toContain("location_description: isFieldStaff ? GPS_SITE_LOCATION : locationDescription,");
  });
});
