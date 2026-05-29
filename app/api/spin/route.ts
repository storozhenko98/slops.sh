import {
  MIN_WAGER,
  STARTING_BALANCE,
  WAGER,
  WAGER_STEPS,
  isAllowedWager,
  resolveSpin,
  spinSymbols,
  type SlotSymbol,
} from "@slops/game";
import type { NextRequest } from "next/server";
import { spinSchema } from "@/lib/schemas";
import { HttpError, badRequest, handleHttpError, json, requireUser } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = spinSchema.parse(await request.json());
    const user = await requireUser(request);
    const supabase = createSupabaseAdminClient();

    const run = await findOrCreateRun(supabase, user.id, body.runId);

    const { data: previousSpin } = await supabase
      .from("spins")
      .select("*")
      .eq("run_id", run.id)
      .eq("nonce", body.nonce)
      .maybeSingle();

    if (previousSpin) {
      return json({ run, spin: previousSpin, idempotent: true });
    }

    const balanceBefore = Number(run.current_balance);
    const wager = body.wager ?? WAGER;

    if (balanceBefore < MIN_WAGER) {
      const { data: bustedRun, error } = await supabase
        .from("runs")
        .update({
          current_balance: 0,
          status: "busted",
          ended_at: new Date().toISOString(),
        })
        .eq("id", run.id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return json({ run: bustedRun, spin: null, busted: true });
    }

    if (!isAllowedWager(wager, balanceBefore)) {
      throw new HttpError(
        400,
        "bad_request",
        `Wager must be one of ${WAGER_STEPS.join(", ")} or your full current balance.`,
      );
    }

    const symbols = spinSymbols(cryptoRandom);
    const result = resolveSpin(
      symbols,
      balanceBefore,
      wager,
    );
    const status = result.busted || result.balanceAfter < MIN_WAGER ? "busted" : "active";
    const peakBalance = Math.max(Number(run.peak_balance), result.balanceAfter);

    const { data: spin, error: spinError } = await supabase
      .from("spins")
      .insert({
        run_id: run.id,
        user_id: user.id,
        nonce: body.nonce,
        symbols,
        outcome: result.outcome,
        wager: result.wager,
        payout: result.payout,
        balance_before: result.balanceBefore,
        balance_after: result.balanceAfter,
      })
      .select("*")
      .single();

    if (spinError) {
      throw spinError;
    }

    const { data: updatedRun, error: runError } = await supabase
      .from("runs")
      .update({
        current_balance: result.balanceAfter,
        peak_balance: peakBalance,
        status,
        ended_at: status === "busted" ? new Date().toISOString() : null,
      })
      .eq("id", run.id)
      .select("*")
      .single();

    if (runError) {
      throw runError;
    }

    return json({
      run: updatedRun,
      spin,
      result,
      idempotent: false,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return badRequest(error);
    }

    return handleHttpError(error);
  }
}

async function findOrCreateRun(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  runId?: string,
) {
  if (runId) {
    const { data, error } = await supabase
      .from("runs")
      .select("*")
      .eq("id", runId)
      .eq("user_id", userId)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const { data: activeRun } = await supabase
    .from("runs")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (activeRun) {
    return activeRun;
  }

  const { data, error } = await supabase
    .from("runs")
    .insert({
      user_id: userId,
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

  return data;
}

function cryptoRandom() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] / 0xffffffff;
}
