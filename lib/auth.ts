import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { HttpError } from "./errors";
import { createSupabaseAdminClient } from "./supabase";

const PASSWORD_PREFIX = "scrypt";
const PASSWORD_PARAMS = "n=16384,r=8,p=1";
const SESSION_TTL_DAYS = 30;

export type AppUser = {
  id: string;
  username: string;
  created_at?: string;
};

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return `${PASSWORD_PREFIX}$${PASSWORD_PARAMS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [prefix, params, salt, hash] = storedHash.split("$");

  if (prefix !== PASSWORD_PREFIX || params !== PASSWORD_PARAMS || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, salt, expected.length);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function generateRecoveryKey() {
  return `slops-${randomBytes(24).toString("base64url")}`;
}

export function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function createSession(userId: string) {
  const supabase = createSupabaseAdminClient();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error } = await supabase.from("app_sessions").insert({
    user_id: userId,
    token_hash: hashSecret(token),
    expires_at: expiresAt,
  });

  if (error) {
    throw error;
  }

  return {
    token,
    expiresAt,
  };
}

export async function createRecoveryKey(userId: string) {
  const supabase = createSupabaseAdminClient();
  const recoveryKey = generateRecoveryKey();

  const { error } = await supabase.from("app_recovery_keys").insert({
    user_id: userId,
    key_hash: hashSecret(recoveryKey),
    purpose: "account_recovery",
  });

  if (error) {
    throw error;
  }

  return recoveryKey;
}

export async function requireBearerUser(token: string): Promise<AppUser> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("app_sessions")
    .select("id, user_id, expires_at, app_users(id, username, created_at)")
    .eq("token_hash", hashSecret(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) {
    throw new HttpError(401, "unauthorized", "Invalid bearer token.");
  }

  const user = Array.isArray(data.app_users)
    ? data.app_users[0]
    : data.app_users;

  if (!user) {
    throw new HttpError(401, "unauthorized", "Invalid bearer token.");
  }

  void supabase
    .from("app_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", data.id);

  return user as AppUser;
}

export async function consumeRecoveryKey(username: string, recoveryKey: string) {
  const supabase = createSupabaseAdminClient();
  const { data: user, error: userError } = await supabase
    .from("app_users")
    .select("id, username")
    .eq("username", username)
    .maybeSingle();

  if (userError || !user) {
    throw new HttpError(401, "invalid_recovery_key", "Invalid recovery key.");
  }

  const { data: key, error: keyError } = await supabase
    .from("app_recovery_keys")
    .select("id")
    .eq("user_id", user.id)
    .eq("key_hash", hashSecret(recoveryKey))
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (keyError || !key) {
    throw new HttpError(401, "invalid_recovery_key", "Invalid recovery key.");
  }

  const { error: consumeError } = await supabase
    .from("app_recovery_keys")
    .update({ used_at: new Date().toISOString() })
    .eq("id", key.id);

  if (consumeError) {
    throw consumeError;
  }

  return user as AppUser;
}
