const version = process.argv[2];

if (!version) {
  console.error("usage: bun scripts/write-cli-version.ts <version>");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(?:[+-][A-Za-z0-9.-]+)?$/.test(version)) {
  console.error(`invalid version: ${version}`);
  process.exit(1);
}

await Bun.write(
  "packages/cli/src/version.ts",
  `export const VERSION = ${JSON.stringify(version)};\n`,
);
