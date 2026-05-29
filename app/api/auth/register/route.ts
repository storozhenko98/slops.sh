import { registerSchema } from "@/lib/schemas";
import { badRequest, json, serverError } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { createRecoveryKey, createSession, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = registerSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();

    const { data: existingUser } = await supabase
      .from("app_users")
      .select("id")
      .eq("username", body.username)
      .maybeSingle();

    if (existingUser) {
      return json(
        { error: "username_taken", message: "Username is already taken." },
        { status: 409 },
      );
    }

    const { data: user, error } = await supabase
      .from("app_users")
      .insert({
        username: body.username,
        password_hash: await hashPassword(body.password),
      })
      .select("id, username, created_at")
      .single();

    if (error || !user) {
      return json(
        {
          error: "registration_failed",
          message: error?.message ?? "Could not create account.",
        },
        { status: 400 },
      );
    }

    const [session, recoveryKey] = await Promise.all([
      createSession(user.id),
      createRecoveryKey(user.id),
    ]);

    return json({
      user,
      session,
      recoveryKey,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return badRequest(error);
    }

    return serverError(error);
  }
}
