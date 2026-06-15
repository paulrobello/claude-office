import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolve the "@/*" → "src/*" path alias (mirrors tsconfig.json) so unit tests
// can import source modules that use the alias internally.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
