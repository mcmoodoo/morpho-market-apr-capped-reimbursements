/**
 * Bundle dashboard app for the browser. Run before serving: bun run build:dashboard
 */
import { join } from "node:path";

const outdir = join(import.meta.dir, "dist");

const result = await Bun.build({
  entrypoints: [join(import.meta.dir, "main.tsx")],
  outdir,
  minify: false,
  target: "browser",
  sourcemap: "none",
});

if (!result.success) {
  console.error("Build failed:", result.logs);
  process.exit(1);
}

console.log("Dashboard built to", outdir);
console.log("Outputs:", result.outputs?.length);
result.outputs?.forEach((o, i) => console.log(" ", i, o.path, "(kind:", o.kind + ")"));
