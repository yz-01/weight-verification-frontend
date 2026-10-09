import { afterEach, describe, expect, it, vi } from "vitest";

import { FIELD_OPEN_EVENT, openFieldHref } from "@/lib/field-notification";

/**
 * A field link tapped on the field app switches the screen there and then
 * (the workspace listens), instead of a router round trip that did nothing
 * when the address was already the one showing.
 */
function onPage(pathname: string) {
  const target = new EventTarget();
  vi.stubGlobal("window", {
    location: { origin: "https://app.test", pathname },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  });
  return target;
}

afterEach(() => vi.unstubAllGlobals());

describe("openFieldHref", () => {
  it("hands a field link to the workspace when it takes it", () => {
    const page = onPage("/field-staff");
    const seen: string[] = [];
    page.addEventListener(FIELD_OPEN_EVENT, (event) => {
      event.preventDefault();
      seen.push((event as CustomEvent<string>).detail);
    });
    const push = vi.fn();
    openFieldHref("/field-staff?tab=tasks&task=t1", push);
    openFieldHref("/field-staff?tab=tasks&task=t1", push);
    expect(seen).toEqual([
      "/field-staff?tab=tasks&task=t1",
      "/field-staff?tab=tasks&task=t1",
    ]);
    expect(push).not.toHaveBeenCalled();
  });

  it("navigates when nothing on the page takes it", () => {
    onPage("/field-staff");
    const push = vi.fn();
    openFieldHref("/field-staff?tab=tasks", push);
    expect(push).toHaveBeenCalledWith("/field-staff?tab=tasks");
  });

  it("navigates to another page as before", () => {
    const page = onPage("/field-staff");
    const listener = vi.fn((event: Event) => event.preventDefault());
    page.addEventListener(FIELD_OPEN_EVENT, listener);
    const push = vi.fn();
    openFieldHref("/notifications/my-tasks", push);
    expect(listener).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/notifications/my-tasks");
  });
});
