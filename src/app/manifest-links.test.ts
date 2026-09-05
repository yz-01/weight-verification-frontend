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

  /**
   * The install page is not the only place people install from.
   *
   * A browser reads the manifest at the moment of installing, and the
   * `start_url` it finds is where the app opens for good. Only
   * `/trace/field-ready` ever served a manifest carrying the handoff token,
   * and that screen is shown once, straight after a PIN. Anybody who
   * installed the ordinary way - Share, Add to Home Screen, from whatever
   * screen they were on - got an app whose start_url is the PIN screen, and
   * got asked for a PIN every single launch (F-206).
   *
   * So the field shell rewrites the manifest href to the token-carrying URL
   * on every field page. These check the pieces that has to be made of,
   * because the failure is invisible until somebody installs a build.
   */
  it("keeps the handoff token so a later install can use it", () => {
    // The token reaches the client exactly once, when a PIN is accepted.
    expect(
      readFileSync("src/components/field-staff/field-access.tsx", "utf8"),
    ).toContain("setFieldBootstrapToken(bootstrapToken)");
    // And again whenever the installed app signs itself back in, so an app
    // re-installed from inside the app carries it too.
    expect(
      readFileSync("src/components/field-staff/field-pwa-bootstrap.tsx", "utf8"),
    ).toContain("setFieldBootstrapToken(token)");
  });

  it("points every field page's manifest at the bootstrap start_url", () => {
    const shell = readFileSync(
      "src/components/field-staff/field-staff-shell.tsx",
      "utf8",
    );
    expect(shell).toContain("<FieldManifestToken />");

    const patcher = readFileSync(
      "src/components/field-staff/field-manifest-token.tsx",
      "utf8",
    );
    expect(patcher).toContain("/field-manifest.webmanifest?bootstrap=");
    // The href of the link that is already there, not a second link: a
    // browser installs the first rel="manifest" it finds and ignores the
    // rest, which is the trap F-172 was.
    expect(patcher).toContain('link[rel="manifest"]');
    expect(patcher).toContain("link.href =");
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
