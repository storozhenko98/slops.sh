export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
};

export function requirePublicSupabaseEnv() {
  if (!env.supabaseUrl || !env.supabasePublishableKey) {
    throw new Error("Missing Supabase public environment variables.");
  }
}
