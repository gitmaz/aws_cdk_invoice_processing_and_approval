import * as fs from "fs";
import * as path from "path";

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDirRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

/**
 * Copy prebuilt `spa/dist` without Docker (Windows-friendly when SPA_USE_PREBUILT_DIST=1).
 */
export function spaPrebuiltLocalBundling(
  root: string,
  target: "lambda" | "s3",
): { tryBundle(outputDir: string): boolean } {
  return {
    tryBundle(outputDir: string): boolean {
      const distDir = path.join(root, "spa", "dist");
      if (!fs.existsSync(distDir)) {
        console.error("spa/dist missing. Run: npm run spa:build:dev");
        return false;
      }
      try {
        if (target === "lambda") {
          copyDirRecursive(distDir, path.join(outputDir, "dist"));
          fs.copyFileSync(
            path.join(root, "lambda", "spa-static-host", "handler.cjs"),
            path.join(outputDir, "index.js"),
          );
        } else {
          copyDirRecursive(distDir, outputDir);
        }
        return true;
      } catch (e) {
        console.error("spa prebuilt local bundle failed:", e);
        return false;
      }
    },
  };
}
