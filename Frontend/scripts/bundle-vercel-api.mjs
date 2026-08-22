import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(process.cwd());
const entries = [
  ["vercel-api/index.ts", "api/index.js"],
  ["vercel-api/trpc.ts", "api/trpc/[...path].js"],
  ["vercel-api/oauth-callback.ts", "api/oauth/callback.js"],
];

for (const [source, output] of entries) {
  const sourcePath = resolve(root, source);
  const outputPath = resolve(root, output);
  mkdirSync(dirname(outputPath), { recursive: true });
  execFileSync(
    "pnpm",
    [
      "exec",
      "esbuild",
      sourcePath,
      "--bundle",
      "--platform=node",
      "--format=esm",
      "--packages=external",
      "--target=node22",
      `--outfile=${outputPath}`,
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (process.env.VERCEL === "1") {
    rmSync(sourcePath, { force: true });
  }
}
