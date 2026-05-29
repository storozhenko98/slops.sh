import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  chmod,
  lstat,
  mkdir,
  readlink,
  rename,
  rm,
  symlink,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const GITHUB_REPO = "storozhenko98/slops.sh";
const UPDATE_MANIFEST_URL =
  `https://github.com/${GITHUB_REPO}/releases/download/latest/slops-version.json`;
const UPDATE_CHECK_TIMEOUT_MS = 1_500;

type ReleaseAsset =
  | string
  | {
      name: string;
      sha256?: string;
    };

type ReleaseManifest = {
  version: string;
  tag?: string;
  assets: Record<string, ReleaseAsset>;
};

type UpdateCheckOptions = {
  currentVersion: string;
  skip?: boolean;
};

export async function maybeOfferUpdate({
  currentVersion,
  skip = false,
}: UpdateCheckOptions) {
  if (skip || process.env.SLOPS_NO_UPDATE === "1") {
    return false;
  }

  if (currentVersion.includes("-dev") && process.env.SLOPS_UPDATE_CHECK !== "1") {
    return false;
  }

  if (!input.isTTY || !output.isTTY) {
    return false;
  }

  const platform = platformKey();
  if (!platform) {
    return false;
  }

  const manifest = await fetchManifest();
  if (!manifest || !isNewerVersion(manifest.version, currentVersion)) {
    return false;
  }

  const asset = manifest.assets[platform];
  if (!asset) {
    return false;
  }

  const answer = await ask(
    `slops ${manifest.version} is available; you have ${currentVersion}. Update now? [Y/n] `,
  );

  if (answer && !["y", "yes"].includes(answer.toLowerCase())) {
    return false;
  }

  try {
    const target = await installUpdate(manifest, asset);
    console.log(`updated ${target} to slops ${manifest.version}`);
    console.log("start slops again to use the new binary");
    return true;
  } catch (error) {
    console.error(
      `update failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    await ask("press ENTER to launch the current version ");
    return false;
  }
}

async function fetchManifest() {
  try {
    const response = await fetch(UPDATE_MANIFEST_URL, {
      headers: {
        accept: "application/json",
        "user-agent": "slops-updater",
      },
      signal: AbortSignal.timeout(UPDATE_CHECK_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as ReleaseManifest;
  } catch {
    return null;
  }
}

async function installUpdate(manifest: ReleaseManifest, asset: ReleaseAsset) {
  const assetInfo = typeof asset === "string" ? { name: asset } : asset;
  const tag = manifest.tag || "latest";
  const downloadUrl =
    `https://github.com/${GITHUB_REPO}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(assetInfo.name)}`;
  const response = await fetch(downloadUrl, {
    headers: { "user-agent": "slops-updater" },
  });

  if (!response.ok) {
    throw new Error(`download failed with HTTP ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (assetInfo.sha256) {
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== assetInfo.sha256) {
      throw new Error("download checksum did not match release manifest");
    }
  }

  const primaryTarget = await resolveUpdateTarget(
    process.env.SLOPS_UPDATE_TARGET || process.execPath,
  );
  const fallbackTarget = join(slopsHomeDir(), "bin", "slops");
  const target = await canReplace(primaryTarget) ? primaryTarget : fallbackTarget;
  const temp = `${target}.download-${process.pid}`;

  await mkdir(dirname(target), { recursive: true, mode: 0o755 });
  await Bun.write(temp, bytes);
  await chmod(temp, 0o755);

  try {
    await rename(temp, target);
    if (target === fallbackTarget) {
      await linkHomeCommand(target);
    }
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }

  return target;
}

async function resolveUpdateTarget(path: string) {
  try {
    const stats = await lstat(path);
    if (!stats.isSymbolicLink()) {
      return path;
    }

    const target = await readlink(path);
    return target.startsWith("/") ? target : join(dirname(path), target);
  } catch {
    return path;
  }
}

async function canReplace(path: string) {
  try {
    await access(path, constants.W_OK);
    await access(dirname(path), constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function platformKey() {
  if (process.platform === "darwin") {
    if (process.arch === "arm64") {
      return "macos-arm64";
    }

    if (process.arch === "x64") {
      return "macos-x64";
    }
  }

  if (process.platform === "linux" && process.arch === "x64") {
    return "linux-x64";
  }

  return null;
}

function homeBinDir() {
  const home = process.env.HOME || process.cwd();
  return join(home, ".local", "bin");
}

function slopsHomeDir() {
  const home = process.env.HOME || process.cwd();
  return process.env.SLOPS_HOME || join(home, ".local", "share", "slops");
}

async function linkHomeCommand(target: string) {
  const linkPath = join(homeBinDir(), "slops");
  await mkdir(dirname(linkPath), { recursive: true, mode: 0o755 });

  try {
    const stats = await lstat(linkPath);
    if (stats.isDirectory() && !stats.isSymbolicLink()) {
      return;
    }
  } catch {
    // Missing link is the expected first-update path.
  }

  await rm(linkPath, { force: true });
  await symlink(target, linkPath);
}

async function ask(prompt: string) {
  const rl = createInterface({ input, output });
  const answer = await rl.question(prompt);
  rl.close();
  return answer.trim();
}

function isNewerVersion(remote: string, current: string) {
  const remoteParts = parseVersion(remote);
  const currentParts = parseVersion(current);

  if (!remoteParts || !currentParts) {
    return remote !== current;
  }

  for (let index = 0; index < remoteParts.length; index += 1) {
    if (remoteParts[index] > currentParts[index]) {
      return true;
    }

    if (remoteParts[index] < currentParts[index]) {
      return false;
    }
  }

  return false;
}

function parseVersion(value: string) {
  const clean = value.replace(/^v/, "").split(/[+-]/, 1)[0];
  const parts = clean.split(".").map((part) => Number(part));

  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
    return null;
  }

  return parts;
}
