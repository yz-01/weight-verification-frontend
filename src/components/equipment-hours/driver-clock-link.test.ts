/**
 * 司机专属打卡链接 (J26, item 125, Q26): a public page per driver, the same
 * scan → photo → sign → send as the site phone, its own offline queue, and
 * the office's links.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { driverLinkEnding } from "@/components/equipment-hours/driver-clock-link";
import { driverQueueOwner } from "@/components/equipment-hours/equipment-hours-capture";
import zh from "@/messages/zh.json";
import { proxy } from "@/proxy";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

describe("the driver's page", () => {
  it("opens without an account", () => {
    const response = proxy(new NextRequest("https://trace.example/equipment-clock/abcdefghijklmnopqrstuvwxyz"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("says plainly why a link no longer works", () => {
    expect(driverLinkEnding("driver_link_invalid")).toBe("invalid");
    expect(driverLinkEnding("driver_link_closed")).toBe("closed");
    expect(driverLinkEnding("driver_link_other_device")).toBe("otherDevice");
    expect(driverLinkEnding("equipment_hours_outside_fence")).toBeNull();
    expect(zh.errors.api.equipment_hours_outside_fence).toBe("你不在工地范围内，请在工地打卡。");
    expect(zh.errors.api.equipment_hours_no_fence).toBe("项目还没设电子围栏，请联络工地办公室。");
  });

  it("uses the site phone's capture, with the link's machines, queue and a required location", () => {
    const capture = read("src/components/equipment-hours/equipment-hours-capture.tsx");
    expect(capture).toContain("driver ? loadDriverMachines(driver.token, driver.device)");
    expect(capture).toContain("...(driver ? { driverLink: driver } : {})");
    expect(capture).toContain('...(driver ? ([[fix, t("phone.location")]] as [unknown, string][]) : [])');
    expect(driverQueueOwner("abc")).toBe("driver-link:abc");
    expect(read("src/components/equipment-hours/driver-clock-link.tsx")).toContain(
      'window.addEventListener("online", flush)',
    );
  });

  it("a queued clock-in is replayed to the link's own endpoint", () => {
    const sync = read("src/services/offline-sync.service.ts");
    expect(sync).toContain("return clockDriverLink(payload.driverLink.token, {");
  });
});

describe("the office's links", () => {
  it("are made, sent again and stopped from the hours page", () => {
    const page = read("src/components/equipment-hours/equipment-operator-hours.tsx");
    expect(page).toContain("<DriverClockLinksDialog project={project}");
    const dialog = read("src/components/equipment-hours/driver-clock-links.tsx");
    expect(dialog).toContain("reissue.mutate(row.id)");
    expect(dialog).toContain("stop.mutate(row.id)");
    expect(zh.driverClock.office.title).toBe("司机打卡链接");
  });
});
