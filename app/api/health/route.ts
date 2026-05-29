import { json } from "@/lib/http";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export function GET() {
  return json({
    ok: true,
    service: "slops.sh",
    supabase: {
      urlConfigured: Boolean(env.supabaseUrl),
      publishableKeyConfigured: Boolean(env.supabasePublishableKey),
      serviceRoleConfigured: Boolean(env.supabaseServiceRoleKey),
    },
  });
}
