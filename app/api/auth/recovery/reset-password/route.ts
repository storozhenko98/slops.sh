import { resetPasswordSchema } from "@/lib/schemas";
import { badRequest, handleHttpError, json } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { consumeRecoveryKey, createRecoveryKey, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = resetPasswordSchema.parse(await request.json());
    const user = await consumeRecoveryKey(body.username, body.recoveryKey);
    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
      .from("app_users")
      .update({ password_hash: await hashPassword(body.password) })
      .eq("id", user.id);

    if (error) {
      throw error;
    }

    await supabase.from("app_sessions").delete().eq("user_id", user.id);

    return json({
      ok: true,
      recoveryKey: await createRecoveryKey(user.id),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return badRequest(error);
    }

    return handleHttpError(error);
  }
}
