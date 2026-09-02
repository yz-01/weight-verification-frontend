import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Minimal on purpose.
 *
 * This project had no test runner at all, so the first one in should cover the
 * logic that is hardest to check by reading — the realtime hook's backoff and
 * event filtering — without pulling in a DOM, a component renderer, or a
 * browser. Those can be added when something needs them; adding them now would
 * be configuration nobody has a use for yet.
 *
 * The `@/` alias is repeated here because Vitest resolves through Vite, not
 * through `tsconfig.json`. If it drifts from the tsconfig `paths` entry, imports
 * resolve in the editor and fail in the runner.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
