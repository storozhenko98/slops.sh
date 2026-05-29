export const STARTING_BALANCE = 1000;
export const WAGER = 25;
export const WAGER_STEPS = [25, 50, 100, 250, 500, 1000] as const;
export const MIN_WAGER = WAGER_STEPS[0];
export const BASE_MAX_WAGER = WAGER_STEPS[WAGER_STEPS.length - 1];
export const REEL_COUNT = 3;
export const HALLUCINATION_MIN_COUNT = 2;
export const HALLUCINATION_LOSS_RATE = 0.6;
export const CONTEXT_LEAK_LOSS_RATE = 0.45;
export const BUG_TAX_LOSS_RATE = 0.25;
export const TODO_LOOP_LOSS_RATE = 0.22;
export const DEPENDENCY_HOLE_LOSS_RATE = 0.4;
export const SEGFAULT_LOSS_RATE = 0.8;
export const MEMORY_LEAK_MIN_LOSS_RATE = 0.22;
export const MEMORY_LEAK_MAX_LOSS_RATE = 0.58;
export const RATE_LIMIT_MIN_LOSS_RATE = 0.18;
export const RATE_LIMIT_MAX_LOSS_RATE = 0.52;

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
  { id: "SEGFAULT", label: "SEG", weight: 2 },
] as const;

export type SlotSymbol = (typeof SYMBOLS)[number]["id"];

export type SpinOutcome =
  | "jackpot"
  | "one-shot-green"
  | "tests-passed"
  | "merge-party"
  | "token-pump"
  | "vibe-jackpot"
  | "seven-pair"
  | "seven-spark"
  | "hot-pair"
  | "npm-pair"
  | "lgtm"
  | "triple"
  | "pair"
  | "hallucination"
  | "context-leak"
  | "bug-tax"
  | "todo-loop"
  | "dependency-hole"
  | "segfault"
  | "memory-leak"
  | "rate-limit"
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
const PAYOUT_MULTIPLIERS = {
  jackpot: 3000,
  "one-shot-green": 800,
  "tests-passed": 400,
  "merge-party": 200,
  "token-pump": 55,
  "vibe-jackpot": 110,
  "seven-pair": 150,
  "seven-spark": 8,
  "hot-pair": 30,
  "npm-pair": 22,
  lgtm: 250,
  triple: 120,
  pair: 6,
} as const satisfies Record<
  Exclude<
    SpinOutcome,
    | "hallucination"
    | "context-leak"
    | "bug-tax"
    | "todo-loop"
    | "dependency-hole"
    | "segfault"
    | "memory-leak"
    | "rate-limit"
    | "context-full"
    | "miss"
  >,
  number
>;

export function playableWagerSteps(balance = Number.POSITIVE_INFINITY): number[] {
  if (!Number.isFinite(balance)) {
    return [...WAGER_STEPS];
  }

  const maxPlayable = Math.floor(balance);
  const steps: number[] = WAGER_STEPS.filter((step) => step <= maxPlayable);

  if (maxPlayable >= MIN_WAGER && !steps.includes(maxPlayable)) {
    steps.push(maxPlayable);
  }

  return steps;
}

export function normalizeWager(value = WAGER, balance = Number.POSITIVE_INFINITY): number {
  const numeric = Number.isFinite(value) ? Math.floor(value) : WAGER;
  const steps = playableWagerSteps(balance);
  const maxPlayable = steps.at(-1) ?? MIN_WAGER;
  const capped = Math.min(Math.max(numeric, MIN_WAGER), maxPlayable);
  return [...steps].reverse().find((step) => step <= capped) ?? MIN_WAGER;
}

export function nextWager(current: number, balance = Number.POSITIVE_INFINITY): number {
  const steps = playableWagerSteps(balance);
  return steps.find((step) => step > current) ?? steps[steps.length - 1] ?? MIN_WAGER;
}

export function previousWager(current: number): number {
  return [...WAGER_STEPS].reverse().find((step) => step < current) ?? MIN_WAGER;
}

export function isAllowedWager(value: number, balance = Number.POSITIVE_INFINITY) {
  return Number.isInteger(value) && playableWagerSteps(balance).some((step) => step === value);
}

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
  random: RandomSource = Math.random,
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
  const hallucinationCount = counts.HALLUCINATION ?? 0;
  const contextCount = counts.CONTEXT ?? 0;
  const segfaultCount = counts.SEGFAULT ?? 0;

  if (allSame && first === "CONTEXT") {
    return result(symbols, "context-full", wager, 0, balanceBefore, 0);
  }

  if (segfaultCount >= 2 || containsExactSymbols(symbols, ["SEGFAULT", "BUG", "CONTEXT"])) {
    return withLoss(
      symbols,
      "segfault",
      wager,
      Math.max(wager * 12, Math.floor(balanceBefore * SEGFAULT_LOSS_RATE)),
      balanceBefore,
    );
  }

  if (hallucinationCount >= HALLUCINATION_MIN_COUNT) {
    return withLoss(
      symbols,
      "hallucination",
      wager,
      varianceLoss(balanceBefore, wager, HALLUCINATION_LOSS_RATE, 0.82, random),
      balanceBefore,
    );
  }

  if (allSame && first === "7") {
    return withMultiplier(
      symbols,
      "jackpot",
      wager,
      PAYOUT_MULTIPLIERS.jackpot,
      balanceBefore,
    );
  }

  if (allSame && first === "SHIP") {
    return withMultiplier(
      symbols,
      "one-shot-green",
      wager,
      PAYOUT_MULTIPLIERS["one-shot-green"],
      balanceBefore,
    );
  }

  if (allSame && first === "AI") {
    return withMultiplier(
      symbols,
      "tests-passed",
      wager,
      PAYOUT_MULTIPLIERS["tests-passed"],
      balanceBefore,
    );
  }

  if (allSame && first === "LGTM") {
    return withMultiplier(
      symbols,
      "lgtm",
      wager,
      PAYOUT_MULTIPLIERS.lgtm,
      balanceBefore,
    );
  }

  if (allSame) {
    return withMultiplier(
      symbols,
      "triple",
      wager,
      PAYOUT_MULTIPLIERS.triple,
      balanceBefore,
    );
  }

  if (contextCount >= 2) {
    return withLoss(
      symbols,
      "context-leak",
      wager,
      varianceLoss(balanceBefore, wager, CONTEXT_LEAK_LOSS_RATE, 0.72, random),
      balanceBefore,
    );
  }

  if (containsExactSymbols(symbols, ["NPM", "TOK", "CONTEXT"])) {
    return withLoss(
      symbols,
      "rate-limit",
      wager,
      varianceLoss(balanceBefore, wager, RATE_LIMIT_MIN_LOSS_RATE, RATE_LIMIT_MAX_LOSS_RATE, random),
      balanceBefore,
    );
  }

  if (containsExactSymbols(symbols, ["BUG", "TODO", "NPM"])) {
    return withLoss(
      symbols,
      "dependency-hole",
      wager,
      varianceLoss(balanceBefore, wager, DEPENDENCY_HOLE_LOSS_RATE, 0.68, random),
      balanceBefore,
    );
  }

  if (segfaultCount === 1) {
    return withLoss(
      symbols,
      "memory-leak",
      wager,
      varianceLoss(balanceBefore, wager, MEMORY_LEAK_MIN_LOSS_RATE, MEMORY_LEAK_MAX_LOSS_RATE, random),
      balanceBefore,
    );
  }

  if (counts.BUG === 2) {
    return withLoss(
      symbols,
      "bug-tax",
      wager,
      varianceLoss(balanceBefore, wager, BUG_TAX_LOSS_RATE, 0.5, random),
      balanceBefore,
    );
  }

  if (counts.TODO === 2) {
    return withLoss(
      symbols,
      "todo-loop",
      wager,
      varianceLoss(balanceBefore, wager, TODO_LOOP_LOSS_RATE, 0.46, random),
      balanceBefore,
    );
  }

  if (containsExactSymbols(symbols, ["SHIP", "MERGE", "LGTM"])) {
    return withMultiplier(
      symbols,
      "merge-party",
      wager,
      PAYOUT_MULTIPLIERS["merge-party"],
      balanceBefore,
    );
  }

  if (containsExactSymbols(symbols, ["AI", "TOK", "PR"])) {
    return withMultiplier(
      symbols,
      "token-pump",
      wager,
      PAYOUT_MULTIPLIERS["token-pump"],
      balanceBefore,
    );
  }

  if (containsExactSymbols(symbols, ["7", "AI", "SHIP"])) {
    return withMultiplier(
      symbols,
      "vibe-jackpot",
      wager,
      PAYOUT_MULTIPLIERS["vibe-jackpot"],
      balanceBefore,
    );
  }

  if (counts["7"] === 2) {
    return withMultiplier(
      symbols,
      "seven-pair",
      wager,
      PAYOUT_MULTIPLIERS["seven-pair"],
      balanceBefore,
    );
  }

  if (counts.SHIP === 2 || counts.MERGE === 2 || counts.LGTM === 2) {
    return withMultiplier(
      symbols,
      "hot-pair",
      wager,
      PAYOUT_MULTIPLIERS["hot-pair"],
      balanceBefore,
    );
  }

  if (counts.NPM === 2) {
    return withMultiplier(
      symbols,
      "npm-pair",
      wager,
      PAYOUT_MULTIPLIERS["npm-pair"],
      balanceBefore,
    );
  }

  if (counts["7"] === 1) {
    return withMultiplier(
      symbols,
      "seven-spark",
      wager,
      PAYOUT_MULTIPLIERS["seven-spark"],
      balanceBefore,
    );
  }

  if (hasPair) {
    return withMultiplier(
      symbols,
      "pair",
      wager,
      PAYOUT_MULTIPLIERS.pair,
      balanceBefore,
    );
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

function withLoss(
  symbols: SlotSymbol[],
  outcome: SpinOutcome,
  wager: number,
  loss: number,
  balanceBefore: number,
) {
  return result(
    symbols,
    outcome,
    wager,
    0,
    balanceBefore,
    Math.max(0, balanceBefore - loss),
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
      return "777 jackpot. terminal has left the building.";
    case "one-shot-green":
      return "triple SHIP. ship it before anyone reviews it.";
    case "tests-passed":
      return "triple AI. tests passed and the line went vertical.";
    case "merge-party":
      return "SHIP MERGE LGTM. fake coin party started.";
    case "token-pump":
      return "AI TOK PR. token pump detected.";
    case "vibe-jackpot":
      return "7 AI SHIP. vibe jackpot engaged.";
    case "seven-pair":
      return "two sevens. not jackpot, still stupid money.";
    case "seven-spark":
      return "single seven spark. small number got loud.";
    case "hot-pair":
      return "hot pair. leaderboard bait.";
    case "npm-pair":
      return "npm installed money somehow.";
    case "lgtm":
      return "triple LGTM. confidence pump detected.";
    case "triple":
      return "three of a kind. balance got irresponsible.";
    case "pair":
      return "pair found. line goes up enough to notice.";
    case "hallucination":
      return "agent hallucinated twice. balance got chainsawed.";
    case "context-leak":
      return "context leaked everywhere. balance got rinsed.";
    case "bug-tax":
      return "double BUG. production incident tax.";
    case "todo-loop":
      return "double TODO. scope creep ate the floor.";
    case "dependency-hole":
      return "BUG TODO NPM. dependency hole liquidation event.";
    case "segfault":
      return "SEG FAULT. 80 percent wiped. beautiful disaster.";
    case "memory-leak":
      return "SEG slipped in. random memory leak tax.";
    case "rate-limit":
      return "NPM TOK CTX. rate limit ate a random chunk.";
    case "context-full":
      return "context window full. run is dead.";
    case "miss":
      return "nothing happened, which is on brand.";
  }
}

function varianceLoss(
  balanceBefore: number,
  wager: number,
  minRate: number,
  maxRate: number,
  random: RandomSource,
) {
  const rate = minRate + random() * (maxRate - minRate);
  return Math.max(wager * 4, Math.floor(balanceBefore * rate));
}

function containsExactSymbols(symbols: SlotSymbol[], combo: SlotSymbol[]) {
  if (symbols.length !== combo.length) {
    return false;
  }

  const counts = symbols.reduce<Record<string, number>>((acc, symbol) => {
    acc[symbol] = (acc[symbol] ?? 0) + 1;
    return acc;
  }, {});

  return combo.every((symbol) => {
    const nextCount = counts[symbol] ?? 0;
    counts[symbol] = nextCount - 1;
    return nextCount > 0;
  });
}
