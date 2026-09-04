import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One `rel="manifest"` per page, and the field portal must claim its own.
 *
 * A browser installs the **first** `rel="manifest"` link it finds and ignores
 * every later one. The root layout used to carry a literal `<link>` tag, so it
 * always won: the field portal's own manifest, rendered second by route
 * metadata, was never the one installed. The home-screen icon therefore
 * started at `/` and the worker landed on the three-portal chooser instead of
 * their own screen — after a successful PIN, which is what made it look like
 * the sign-in had not stuck (F-172).
 *
 * The rule that keeps this from coming back: nobody writes a manifest link by
 * hand. Route metadata declares it, so a nested route replaces the value
 * instead of adding a second tag.
 */

/**
 * Every source file under `src`, found by walking rather than by `fs.globSync`:
 * that helper exists at runtime but is not in the installed Node type
 * definitions, so using it type-checked red while the tests passed.
 */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full.split(path.sep).join("/")] : [];
  });
}

const sources = sourceFiles("src");

describe("manifest links", () => {
  it("are never written as literal markup", () => {
    const literals = sources.filter((file) =>
      /<link[^>]*rel=["']manifest["']/.test(readFileSync(file, "utf8")),
    );
    expect(literals).toEqual([]);
  });

  /**
   * Each of these renders inside the field portal, and each is somewhere a
   * worker can press "add to home screen".
   */
  it.each([
    "src/app/(field-staff)/layout.tsx",
    "src/app/(auth)/trace/field-login/page.tsx",
    "src/app/(auth)/field-pwa-bootstrap/page.tsx",
  ])("%s declares the field manifest", (file) => {
    expect(readFileSync(file, "utf8")).toContain(
      'manifest: "/field-manifest.webmanifest"',
    );
  });

  it("lets the install page carry the handoff token into start_url", () => {
    // The one page that has a token: the installed app must start at the
    // bootstrap URL so the standalone storage gets its own session, which is
    // the whole reason the app opens already signed in.
    const page = readFileSync(
      "src/app/(auth)/trace/field-ready/page.tsx",
      "utf8",
    );
    expect(page).toContain(
      "`/field-manifest.webmanifest?bootstrap=${encodeURIComponent(token)}`",
    );

    const route = readFileSync("src/app/field-manifest.webmanifest/route.ts", "utf8");
    expect(route).toContain(
      "`/field-pwa-bootstrap?token=${encodeURIComponent(token)}`",
    );
    // and without a token it must still be a field screen, never the chooser
    expect(route).toContain('"/trace/field-login"');
  });
});
