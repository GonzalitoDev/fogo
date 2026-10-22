import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  oxc: { jsx: { runtime: "automatic" } },
  esbuild: { jsx: "automatic" },
  test: { include: ["lib/**/*.test.ts"] },
});
