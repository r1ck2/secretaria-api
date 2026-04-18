import { defineConfig } from "tsup";
import { resolve } from "path";

export default defineConfig({
  entry: ["src/main.ts"],
  outDir: "dist",
  format: ["cjs"],
  target: "node22",
  sourcemap: false,
  clean: true,
  minify: false,
  splitting: false,
  bundle: true,
  esbuildOptions(options) {
    options.alias = {
      "@": resolve(__dirname, "src"),
    };
  },
});
