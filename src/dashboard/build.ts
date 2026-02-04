/**
 * Bundle dashboard app for the browser. Run before serving: bun run build:dashboard
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const dir = import.meta.dir;
const outdir = join(dir, "dist");

// Build Tailwind CSS
const tw = spawnSync("bunx", ["tailwindcss", "-i", join(dir, "input.css"), "-o", join(dir, "styles.css")], {
  stdio: "inherit",
  cwd: join(dir, "../.."),
});
if (tw.status !== 0) {
  process.exit(tw.status ?? 1);
}

const result = await Bun.build({
  entrypoints: [join(dir, "main.tsx")],
  outdir: outdir,
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
