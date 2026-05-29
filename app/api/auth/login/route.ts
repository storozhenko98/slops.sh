import { loginSchema } from "@/lib/schemas";
import { badRequest, json, serverError } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { createSession, verifyPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = loginSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();
    const { data: user, error } = await supabase
      .from("app_users")
      .select("id, username, password_hash")
      .eq("username", body.username)
      .maybeSingle();

    if (error || !user || !verifyPassword(body.password, user.password_hash)) {
      return json(
        {
          error: "login_failed",
          message: "Invalid username or password.",
        },
        { status: 401 },
      );
    }

    const session = await createSession(user.id);

    return json({
      session,
      user: {
        id: user.id,
        username: user.username,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return badRequest(error);
    }

    return serverError(error);
  }
}
