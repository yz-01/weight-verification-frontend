import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentUser } from "@/interfaces/auth";
import { forgetFieldUser, lastFieldUser, rememberFieldUser } from "@/lib/field-offline-user";

/**
 * H12: a field phone opened with no network still opens the cached app, as
 * the account it last saw - never with a token kept beside it.
 */
describe("the field phone's last account (H12)", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the last account and forgets it on sign-out", () => {
    const user = { id: "u1", full_name: "Ah Seng", is_field_staff: true } as unknown as CurrentUser;
    expect(lastFieldUser()).toBeNull();
    rememberFieldUser(user);
    expect(lastFieldUser()).toMatchObject({ id: "u1", full_name: "Ah Seng" });
    forgetFieldUser();
    expect(lastFieldUser()).toBeNull();
  });

  it("is used only when a field phone has no network, and only a field session keeps it", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/providers/auth-provider.tsx"),
      "utf8",
    );
    expect(source).toMatch(/fieldSession && error instanceof ApiError && error\.isNetwork/);
    // A field worker signed in to the office on a shared PC is not kept.
    expect(source).toContain(
      "if (fieldSession && hasFieldSession() && next.is_field_staff) rememberFieldUser(next);",
    );
    expect(source).toContain("if (fieldSession && me?.is_field_staff) rememberFieldUser(me);");
    // Every sign-out forgets it, office or field.
    const signOut = source.slice(source.indexOf("const signOut = useCallback"));
    expect(signOut.slice(0, signOut.indexOf("router.replace("))).toMatch(
      /\n\s*forgetFieldUser\(\);/,
    );
  });

  it("goes with every session that ends - signed out or refused, any app", async () => {
    vi.stubGlobal("document", { cookie: "" });
    const window = globalThis.window as unknown as Record<string, unknown>;
    window.location = { protocol: "https:", pathname: "/dashboard" };
    window.matchMedia = () => ({ matches: false });
    const tokens = await import("@/lib/auth-token");
    const user = { id: "u1", is_field_staff: true } as unknown as CurrentUser;
    for (const clear of [tokens.clearTokens, tokens.clearFieldTokens, tokens.clearDriverTokens]) {
      rememberFieldUser(user);
      clear();
      expect(lastFieldUser(), clear.name).toBeNull();
    }
  });
});
