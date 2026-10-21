import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Isolate from the parent REA monorepo Vitest config.
    passWithNoTests: false,
    include: ["packages/*/src/**/*.test.ts"],
  },
});
