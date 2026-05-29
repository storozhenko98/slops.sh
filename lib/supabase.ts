import { createClient } from "@supabase/supabase-js";
import { env, requirePublicSupabaseEnv } from "./env";

export function createSupabasePublicClient() {
  requirePublicSupabaseEnv();

  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createSupabaseAdminClient() {
  requirePublicSupabaseEnv();

  if (!env.supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
