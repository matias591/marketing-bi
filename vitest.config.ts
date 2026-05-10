import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    testTimeout: 60000,
    pool: "forks", // matview refreshes don't play well with worker threads
    setupFiles: ["./vitest.setup.ts"],
  },
});
