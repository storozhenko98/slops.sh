import { describe, expect, test } from "bun:test";
import {
  WAGER,
  nextWager,
  normalizeWager,
  previousWager,
  resolveSpin,
  spinSymbols,
} from "./slots";

describe("resolveSpin", () => {
  test("pays the jackpot", () => {
    const spin = resolveSpin(["7", "7", "7"], 1000);

    expect(spin.outcome).toBe("jackpot");
    expect(spin.payout).toBe(WAGER * 2500);
    expect(spin.balanceAfter).toBe(63475);
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
    expect(spin.balanceAfter).toBe(400);
  });

  test("pairs pay enough to feel like a win", () => {
    const spin = resolveSpin(["TOK", "TOK", "AI"], 1000);

    expect(spin.outcome).toBe("pair");
    expect(spin.payout).toBe(WAGER * 5);
    expect(spin.balanceAfter).toBe(1100);
  });

  test("special combos can jump the run over 2k", () => {
    const spin = resolveSpin(["SHIP", "MERGE", "LGTM"], 1000);

    expect(spin.outcome).toBe("merge-party");
    expect(spin.payout).toBe(WAGER * 150);
    expect(spin.balanceAfter).toBe(4725);
  });

  test("two sevens are a loud near jackpot", () => {
    const spin = resolveSpin(["7", "AI", "7"], 1000);

    expect(spin.outcome).toBe("seven-pair");
    expect(spin.payout).toBe(WAGER * 110);
    expect(spin.balanceAfter).toBe(3725);
  });

  test("double bug taxes the run", () => {
    const spin = resolveSpin(["BUG", "BUG", "AI"], 1000);

    expect(spin.outcome).toBe("bug-tax");
    expect(spin.payout).toBe(0);
    expect(spin.balanceAfter).toBe(750);
  });

  test("dependency hole is a heavy loss combo", () => {
    const spin = resolveSpin(["BUG", "TODO", "NPM"], 1000);

    expect(spin.outcome).toBe("dependency-hole");
    expect(spin.balanceAfter).toBe(600);
  });

  test("supports higher wagers", () => {
    const spin = resolveSpin(["AI", "TOK", "PR"], 1000, 100);

    expect(spin.outcome).toBe("token-pump");
    expect(spin.payout).toBe(4000);
    expect(spin.balanceAfter).toBe(4900);
  });

  test("walks wager steps", () => {
    expect(nextWager(25, 1000)).toBe(50);
    expect(nextWager(500, 750)).toBe(500);
    expect(previousWager(250)).toBe(100);
    expect(normalizeWager(1000, 600)).toBe(500);
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
