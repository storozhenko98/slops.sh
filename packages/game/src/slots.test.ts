import { describe, expect, test } from "bun:test";
import { WAGER, resolveSpin, spinSymbols } from "./slots";

describe("resolveSpin", () => {
  test("pays the jackpot", () => {
    const spin = resolveSpin(["7", "7", "7"], 1000);

    expect(spin.outcome).toBe("jackpot");
    expect(spin.payout).toBe(WAGER * 800);
    expect(spin.balanceAfter).toBe(20975);
  });

  test("charges the wager on a miss", () => {
    const spin = resolveSpin(["BUG", "AI", "PR"], 1000);

    expect(spin.outcome).toBe("miss");
    expect(spin.balanceAfter).toBe(975);
  });

  test("single hallucination is just a normal miss", () => {
    const spin = resolveSpin(["AI", "HALLUCINATION", "PR"], 1000);

    expect(spin.outcome).toBe("miss");
    expect(spin.balanceAfter).toBe(975);
  });

  test("repeated hallucination stress-cuts the active balance", () => {
    const spin = resolveSpin(["AI", "HALLUCINATION", "HALLUCINATION"], 1000);

    expect(spin.outcome).toBe("hallucination");
    expect(spin.balanceAfter).toBe(650);
  });

  test("pairs pay enough to feel like a win", () => {
    const spin = resolveSpin(["BUG", "BUG", "AI"], 1000);

    expect(spin.outcome).toBe("pair");
    expect(spin.payout).toBe(WAGER * 3);
    expect(spin.balanceAfter).toBe(1050);
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
