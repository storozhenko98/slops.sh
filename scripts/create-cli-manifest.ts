import { createHash } from "node:crypto";
import { basename, join } from "node:path";

const [version, tag, commit, assetDir, outputPath] = process.argv.slice(2);

if (!version || !tag || !commit || !assetDir || !outputPath) {
  console.error(
    "usage: bun scripts/create-cli-manifest.ts <version> <tag> <commit> <asset-dir> <output-path>",
  );
  process.exit(1);
}

const assetNames = [
  "slops-linux-x64",
  "slops-macos-x64",
  "slops-macos-arm64",
] as const;

const assets: Record<string, { name: string; sha256: string }> = {};

for (const name of assetNames) {
  const path = join(assetDir, name);
  const file = Bun.file(path);

  if (!(await file.exists())) {
    console.error(`missing release asset: ${path}`);
    process.exit(1);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const key = name.replace(/^slops-/, "");
  assets[key] = { name, sha256 };

  await Bun.write(join(assetDir, `${name}.sha256`), `${sha256}  ${basename(path)}\n`);
}

await Bun.write(
  outputPath,
  `${JSON.stringify(
    {
      version,
      tag,
      commit,
      repository: "storozhenko98/slops.sh",
      publishedAt: new Date().toISOString(),
      assets,
    },
    null,
    2,
  )}\n`,
);
