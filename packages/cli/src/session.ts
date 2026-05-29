import { chmod, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Session } from "./api";

const userPath = join(appConfigDir(), "user.json");

export async function readSession(): Promise<Session | null> {
  try {
    const file = Bun.file(userPath);
    if (!(await file.exists())) {
      return null;
    }

    return (await file.json()) as Session;
  } catch {
    return null;
  }
}

export async function writeSession(session: Session) {
  await mkdir(dirname(userPath), { recursive: true, mode: 0o700 });
  await Bun.write(userPath, JSON.stringify(session, null, 2));
  await chmod(userPath, 0o600).catch(() => undefined);
}

export async function clearSession() {
  await Bun.file(userPath).delete().catch(() => undefined);
}

export function getUserFilePath() {
  return userPath;
}

function appConfigDir() {
  const home = process.env.HOME ?? process.cwd();

  if (process.platform === "darwin") {
    return join(home, "Library", "Application Support", "slops");
  }

  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "slops");
  }

  return join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "slops");
}
