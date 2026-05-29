import { describe, expect, test } from "bun:test";
import { WAGER, resolveSpin, spinSymbols } from "./slots";

describe("resolveSpin", () => {
  test("pays the jackpot", () => {
    const spin = resolveSpin(["7", "7", "7"], 1000);

    expect(spin.outcome).toBe("jackpot");
    expect(spin.payout).toBe(WAGER * 50);
    expect(spin.balanceAfter).toBe(2225);
  });

  test("charges the wager on a miss", () => {
    const spin = resolveSpin(["BUG", "AI", "PR"], 1000);

    expect(spin.outcome).toBe("miss");
    expect(spin.balanceAfter).toBe(975);
  });

  test("hallucination halves the active balance", () => {
    const spin = resolveSpin(["AI", "HALLUCINATION", "PR"], 1000);

    expect(spin.outcome).toBe("hallucination");
    expect(spin.balanceAfter).toBe(500);
  });

  test("context triple busts the run", () => {
    const spin = resolveSpin(["CONTEXT", "CONTEXT", "CONTEXT"], 1000);

    expect(spin.busted).toBe(true);
    expect(spin.balanceAfter).toBe(0);
  });

  test("uses injected randomness for deterministic reels", () => {
    const rolls = [0, 0.5, 0.99];
    const symbols = spinSymbols(() => rolls.shift() ?? 0);

    expect(symbols).toEqual(["7", "PR", "CONTEXT"]);
  });
});
