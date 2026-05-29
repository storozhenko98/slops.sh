import type { NextRequest } from "next/server";
import { handleHttpError, json, requireUser } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") ?? "global";
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);
    const supabase = createSupabaseAdminClient();

    let userIds: string[] | null = null;

    if (scope === "friends") {
      const user = await requireUser(request);
      const { data: friends, error } = await supabase
        .from("friendships")
        .select("friend_user_id")
        .eq("user_id", user.id);

      if (error) {
        throw error;
      }

      userIds = [user.id, ...(friends ?? []).map((friend) => friend.friend_user_id)];
    }

    let query = supabase
      .from("runs")
      .select("id, user_id, peak_balance, created_at, app_users(username)")
      .order("peak_balance", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(Math.min(limit * 8, 500));

    if (userIds) {
      query = query.in("user_id", userIds);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const entriesByUser = new Map<string, {
      runId: string;
      userId: string;
      username: string;
      peakBalance: number;
      createdAt: string;
    }>();

    for (const entry of data ?? []) {
      const username = profileUsername(entry.app_users);
      const key = username === "unknown" ? entry.user_id : username.toLowerCase();

      if (entriesByUser.has(key)) {
        continue;
      }

      entriesByUser.set(key, {
        runId: entry.id,
        userId: entry.user_id,
        username,
        peakBalance: entry.peak_balance,
        createdAt: entry.created_at,
      });
    }

    return json({
      entries: Array.from(entriesByUser.values()).slice(0, limit).map((entry, index) => ({
        rank: index + 1,
        ...entry,
      })),
    });
  } catch (error) {
    return handleHttpError(error);
  }
}

function profileUsername(profile: unknown) {
  if (Array.isArray(profile)) {
    return profile[0]?.username ?? "unknown";
  }

  if (profile && typeof profile === "object" && "username" in profile) {
    return String(profile.username);
  }

  return "unknown";
}
