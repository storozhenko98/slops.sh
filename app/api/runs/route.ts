import { MIN_WAGER, STARTING_BALANCE } from "@slops/game";
import type { NextRequest } from "next/server";
import { runSchema } from "@/lib/schemas";
import { badRequest, handleHttpError, json, requireUser } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = runSchema.parse(await readOptionalJson(request));
    const user = await requireUser(request);
    const supabase = createSupabaseAdminClient();

    const { data: activeRun } = await supabase
      .from("runs")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (activeRun && !body.restart) {
      return json({ run: activeRun });
    }

    if (activeRun && body.restart) {
      const { error: endError } = await supabase
        .from("runs")
        .update({
          status: activeRun.current_balance >= MIN_WAGER ? "cashed_out" : "busted",
          ended_at: new Date().toISOString(),
        })
        .eq("id", activeRun.id);

      if (endError) {
        throw endError;
      }
    }

    const { data: run, error } = await supabase
      .from("runs")
      .insert({
        user_id: user.id,
        starting_balance: STARTING_BALANCE,
        current_balance: STARTING_BALANCE,
        peak_balance: STARTING_BALANCE,
        status: "active",
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return json({ run });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return badRequest(error);
    }

    return handleHttpError(error);
  }
}

async function readOptionalJson(request: NextRequest) {
  if (!request.headers.get("content-length")) {
    return {};
  }

  try {
    return await request.json();
  } catch {
    return {};
  }
}
