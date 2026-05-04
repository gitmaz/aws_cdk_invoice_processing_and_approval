import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    /** Avoid flaky cross-file `@aws-sdk/*` mock overlap when files run in parallel. */
    fileParallelism: false,
  },
});
