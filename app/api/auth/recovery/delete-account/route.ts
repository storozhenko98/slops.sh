import { deleteAccountSchema } from "@/lib/schemas";
import { badRequest, handleHttpError, json } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { consumeRecoveryKey } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = deleteAccountSchema.parse(await request.json());
    const user = await consumeRecoveryKey(body.username, body.recoveryKey);
    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
      .from("app_users")
      .delete()
      .eq("id", user.id);

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
