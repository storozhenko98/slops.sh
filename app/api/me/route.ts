import type { NextRequest } from "next/server";
import { handleHttpError, json, requireUser } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const supabase = createSupabaseAdminClient();

    const [{ data: profile }, { data: run }] = await Promise.all([
      supabase
        .from("app_users")
        .select("id, username, created_at")
        .eq("id", user.id)
        .single(),
      supabase
        .from("runs")
        .select("id, current_balance, peak_balance, status, created_at")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return json({ user, profile, activeRun: run ?? null });
  } catch (error) {
    return handleHttpError(error);
  }
}
