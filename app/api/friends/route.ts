import type { NextRequest } from "next/server";
import { friendSchema } from "@/lib/schemas";
import { badRequest, handleHttpError, json, requireUser } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("friendships")
      .select("friend_user_id, app_users!friendships_friend_user_id_fkey(username)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    return json({
      friends: (data ?? []).map((friend) => ({
        userId: friend.friend_user_id,
        username: profileUsername(friend.app_users),
      })),
    });
  } catch (error) {
    return handleHttpError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const body = friendSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();

    const { data: friend, error: friendError } = await supabase
      .from("app_users")
      .select("id, username")
      .eq("username", body.username)
      .single();

    if (friendError || !friend) {
      return json({ error: "not_found" }, { status: 404 });
    }

    if (friend.id === user.id) {
      return json({ error: "self_friend" }, { status: 400 });
    }

    const { error } = await supabase.from("friendships").upsert({
      user_id: user.id,
      friend_user_id: friend.id,
    });

    if (error) {
      throw error;
    }

    return json({ friend });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return badRequest(error);
    }

    return handleHttpError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const body = friendSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();

    const { data: friend, error: friendError } = await supabase
      .from("app_users")
      .select("id")
      .eq("username", body.username)
      .single();

    if (friendError || !friend) {
      return json({ ok: true });
    }

    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("user_id", user.id)
      .eq("friend_user_id", friend.id);

    if (error) {
      throw error;
    }

    return json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return badRequest(error);
    }

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
