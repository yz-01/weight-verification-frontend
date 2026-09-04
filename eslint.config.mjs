import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".tmp/**",
    "next-env.d.ts",
  ]),

  // Which tile server the maps draw from is configuration, not code. It used to
  // be typed out at each `L.tileLayer(...)` call, the two copies had already
  // drifted apart, and both pointed at OpenStreetMap's public servers — outside
  // their usage policy for a commercial product, and blockable without notice.
  //
  // The centralisation lives in `src/lib/map-tiles.ts`. Nothing in the language
  // stops the next map from hardcoding a URL again, so this rule does: any
  // string carrying the `{z}/{x}/{y}` raster-tile signature is an error
  // everywhere except in that module. Deliberately provider-neutral — pasting a
  // Mapbox or MapTiler URL into a component is the same mistake.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/map-tiles.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: String.raw`Literal[value=/\{z\}\/\{x\}\/\{y\}/]`,
          message:
            "Do not hardcode a map tile URL. Import MAP_TILE_URL and MAP_TILE_OPTIONS from '@/lib/map-tiles' so the provider stays configurable via NEXT_PUBLIC_MAP_TILE_URL.",
        },
        {
          selector: String.raw`TemplateElement[value.raw=/\{z\}\/\{x\}\/\{y\}/]`,
          message:
            "Do not hardcode a map tile URL. Import MAP_TILE_URL and MAP_TILE_OPTIONS from '@/lib/map-tiles' so the provider stays configurable via NEXT_PUBLIC_MAP_TILE_URL.",
        },
      ],
    },
  },
]);

export default eslintConfig;
