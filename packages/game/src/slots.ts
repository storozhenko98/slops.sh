export const STARTING_BALANCE = 1000;
export const WAGER = 25;
export const REEL_COUNT = 3;

export const SYMBOLS = [
  { id: "7", label: "7", weight: 2 },
  { id: "AI", label: "AI", weight: 10 },
  { id: "BUG", label: "BUG", weight: 10 },
  { id: "TOK", label: "TOK", weight: 9 },
  { id: "PR", label: "PR", weight: 9 },
  { id: "NPM", label: "NPM", weight: 8 },
  { id: "LGTM", label: "LGTM", weight: 8 },
  { id: "TODO", label: "TODO", weight: 8 },
  { id: "SHIP", label: "SHIP", weight: 5 },
  { id: "MERGE", label: "MERGE", weight: 5 },
  { id: "HALLUCINATION", label: "HAL", weight: 3 },
  { id: "CONTEXT", label: "CTX", weight: 2 },
] as const;

export type SlotSymbol = (typeof SYMBOLS)[number]["id"];

export type SpinOutcome =
  | "jackpot"
  | "one-shot-green"
  | "tests-passed"
  | "lgtm"
  | "triple"
  | "pair"
  | "hallucination"
  | "context-full"
  | "miss";

export type SpinResult = {
  symbols: SlotSymbol[];
  labels: string[];
  outcome: SpinOutcome;
  wager: number;
  payout: number;
  balanceBefore: number;
  balanceAfter: number;
  busted: boolean;
  message: string;
};

type RandomSource = () => number;

const totalWeight = SYMBOLS.reduce((sum, symbol) => sum + symbol.weight, 0);
const symbolLabels = new Map(SYMBOLS.map((symbol) => [symbol.id, symbol.label]));

export function pickSymbol(random: RandomSource = Math.random): SlotSymbol {
  const roll = random() * totalWeight;
  let cursor = 0;

  for (const symbol of SYMBOLS) {
    cursor += symbol.weight;
    if (roll < cursor) {
      return symbol.id;
    }
  }

  return SYMBOLS[SYMBOLS.length - 1].id;
}

export function spinSymbols(random: RandomSource = Math.random): SlotSymbol[] {
  return Array.from({ length: REEL_COUNT }, () => pickSymbol(random));
}

export function resolveSpin(
  symbols: SlotSymbol[],
  balanceBefore: number,
  wager = WAGER,
): SpinResult {
  if (symbols.length !== REEL_COUNT) {
    throw new Error(`expected ${REEL_COUNT} symbols`);
  }

  if (balanceBefore <= 0) {
    return result(symbols, "context-full", wager, 0, balanceBefore, 0);
  }

  const [first] = symbols;
  const allSame = symbols.every((symbol) => symbol === first);
  const counts = symbols.reduce<Record<string, number>>((acc, symbol) => {
    acc[symbol] = (acc[symbol] ?? 0) + 1;
    return acc;
  }, {});
  const hasPair = Object.values(counts).some((count) => count === 2);

  if (allSame && first === "CONTEXT") {
    return result(symbols, "context-full", wager, 0, balanceBefore, 0);
  }

  if (symbols.includes("HALLUCINATION")) {
    const loss = Math.max(wager, Math.floor(balanceBefore / 2));
    return result(
      symbols,
      "hallucination",
      wager,
      0,
      balanceBefore,
      Math.max(0, balanceBefore - loss),
    );
  }

  if (allSame && first === "7") {
    return withMultiplier(symbols, "jackpot", wager, 50, balanceBefore);
  }

  if (allSame && first === "SHIP") {
    return withMultiplier(symbols, "one-shot-green", wager, 20, balanceBefore);
  }

  if (allSame && first === "AI") {
    return withMultiplier(symbols, "tests-passed", wager, 12, balanceBefore);
  }

  if (allSame && first === "LGTM") {
    return withMultiplier(symbols, "lgtm", wager, 8, balanceBefore);
  }

  if (allSame) {
    return withMultiplier(symbols, "triple", wager, 6, balanceBefore);
  }

  if (hasPair) {
    return withMultiplier(symbols, "pair", wager, 2, balanceBefore);
  }

  return result(
    symbols,
    "miss",
    wager,
    0,
    balanceBefore,
    Math.max(0, balanceBefore - wager),
  );
}

export function labelFor(symbol: SlotSymbol): string {
  return symbolLabels.get(symbol) ?? symbol;
}

function withMultiplier(
  symbols: SlotSymbol[],
  outcome: SpinOutcome,
  wager: number,
  multiplier: number,
  balanceBefore: number,
) {
  const payout = wager * multiplier;
  return result(
    symbols,
    outcome,
    wager,
    payout,
    balanceBefore,
    Math.max(0, balanceBefore - wager + payout),
  );
}

function result(
  symbols: SlotSymbol[],
  outcome: SpinOutcome,
  wager: number,
  payout: number,
  balanceBefore: number,
  balanceAfter: number,
): SpinResult {
  return {
    symbols,
    labels: symbols.map(labelFor),
    outcome,
    wager,
    payout,
    balanceBefore,
    balanceAfter,
    busted: balanceAfter <= 0,
    message: messageFor(outcome),
  };
}

function messageFor(outcome: SpinOutcome) {
  switch (outcome) {
    case "jackpot":
      return "one-shot green. impossible, allegedly.";
    case "one-shot-green":
      return "ship it before anyone reviews it.";
    case "tests-passed":
      return "tests passed. suspicious.";
    case "lgtm":
      return "LGTM. small win, large confidence.";
    case "triple":
      return "three of a kind. agent keeps its job.";
    case "pair":
      return "pair found. minor cope unlocked.";
    case "hallucination":
      return "agent hallucinated. balance got cut in half.";
    case "context-full":
      return "context window full. run is dead.";
    case "miss":
      return "nothing happened, which is on brand.";
  }
}
