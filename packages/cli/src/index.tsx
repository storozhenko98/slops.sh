#!/usr/bin/env bun
import { createCliRenderer, TextAttributes } from "@opentui/core";
import { createRoot, useKeyboard, useTerminalDimensions } from "@opentui/react";
import { SYMBOLS, WAGER, type SlotSymbol } from "@slops/game";
import { useEffect, useRef, useState } from "react";
import { apiRequest, type Session } from "./api";
import { printHelp, parseOptions } from "./commands";
import { getUserFilePath, readSession, writeSession } from "./session";
import { TICKER_PHRASES, type TickerPhrase } from "./ticker";
import { maybeOfferUpdate } from "./updater";
import { VERSION } from "./version";

type Run = {
  id: string;
  current_balance: number;
  peak_balance: number;
  status: "active" | "busted" | "cashed_out";
};

type LeaderboardEntry = {
  rank: number;
  userId?: string;
  username: string;
  peakBalance: number;
};

type Friend = {
  userId: string;
  username: string;
};

type BoardScope = "global" | "friends";
type GameView = "game" | "help" | "leaderboard" | "addFriend";

type SpinResponse = {
  run: Run;
  result?: {
    labels: string[];
    outcome: string;
    message: string;
    payout: number;
    balanceAfter: number;
    busted: boolean;
  };
  spin?: {
    symbols: SlotSymbol[];
    outcome: string;
    payout: number;
    balance_after: number;
  } | null;
  busted?: boolean;
};

type AuthResponse = {
  user: {
    id: string;
    username: string;
  };
  session: {
    token: string;
    expiresAt: string;
  };
  recoveryKey?: string;
};

type AuthMode = "register" | "login" | "reset";
type AuthFocus = "username" | "password" | "recovery" | "actions";
type AuthedSession = Session & { token: string };

const DEFAULT_API_URL = "https://slops.sh";
const spinnerLabels = SYMBOLS.map((symbol) => symbol.label);
const AGENT_TICKER_FRAME_INTERVAL = 12;
const theme = {
  bg: "#101418",
  panel: "#161b20",
  border: "#3c4038",
  borderDim: "#2b302b",
  text: "#f6f0df",
  muted: "#a7a091",
  dim: "#5f5a50",
  green: "#73f0a1",
  gold: "#ffd166",
  cyan: "#63d7ff",
  danger: "#ff6b7a",
};
const reelPalette = [theme.green, theme.gold, theme.cyan];
const derangedPalette = [
  "#ff3355",
  "#ff7a18",
  "#ffd166",
  "#73f0a1",
  "#63d7ff",
  "#b388ff",
  "#ff5ea8",
];
const coinPalette = [theme.gold, theme.green, theme.cyan, theme.danger];
const DERANGED_TICKER_INTERVAL = 4;
const COIN_FLYBY_PERIOD = 43;
const COIN_FLYBY_DURATION = 15;
const LEADERBOARD_REFRESH_INTERVAL_MS = 7_000;
const normalTickerPhrases = TICKER_PHRASES.filter((phrase) => !phrase.deranged);
const derangedTickerPhrases = TICKER_PHRASES.filter((phrase) => phrase.deranged);
const HISTORY_ROWS = 6;
const BOARD_ROWS = 6;

const args = process.argv.slice(2);
const { options, positional } = parseOptions(args);
const apiUrl = normalizeApiUrl(
  String(options.api ?? process.env.SLOPS_API_URL ?? DEFAULT_API_URL),
);
const command = positional[0];

if (options.version || command === "version") {
  console.log(`slops ${VERSION}`);
  process.exit(0);
}

if (options.help || command === "help") {
  printHelp();
  process.exit(0);
}

if (command) {
  console.error("slops is a TUI now. Launch it with `slops` and use h for help.");
  process.exit(1);
}

if (
  await maybeOfferUpdate({
    currentVersion: VERSION,
    skip: options["no-update"] === true,
  })
) {
  process.exit(0);
}

const initialSession = await readSession();
const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  clearOnShutdown: true,
  backgroundColor: theme.bg,
  targetFps: 30,
});

createRoot(renderer).render(
  <App apiUrl={apiUrl} initialSession={initialSession} />,
);

function App({
  apiUrl,
  initialSession,
}: {
  apiUrl: string;
  initialSession: Session | null;
}) {
  const [session, setSession] = useState(initialSession);

  if (!session?.token) {
    return (
      <AuthScreen
        apiUrl={session?.apiUrl || apiUrl}
        initialSession={session}
        onAuthed={setSession}
      />
    );
  }

  return (
    <GameScreen
      apiUrl={session.apiUrl || apiUrl}
      session={session as AuthedSession}
      onLogout={async () => {
        const localSession: Session = {
          apiUrl: session.apiUrl || apiUrl,
          recoveryKey: session.recoveryKey,
          user: session.user,
        };
        await writeSession(localSession);
        setSession(localSession);
      }}
    />
  );
}

function AuthScreen({
  apiUrl,
  initialSession,
  onAuthed,
}: {
  apiUrl: string;
  initialSession: Session | null;
  onAuthed: (session: Session) => void;
}) {
  const initialMode: AuthMode = initialSession?.user ? "login" : "register";
  const [mode, setModeState] = useState<AuthMode>(initialMode);
  const [focus, setFocus] = useState<AuthFocus>("username");
  const modeRef = useRef<AuthMode>(initialMode);
  const focusRef = useRef<AuthFocus>("username");
  const [username, setUsername] = useState(initialSession?.user?.username ?? "");
  const [password, setPassword] = useState("");
  const [recoveryInput, setRecoveryInput] = useState(initialSession?.recoveryKey ?? "");
  const [message, setMessage] = useState("username + password. no email.");
  const [busy, setBusy] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [pendingSession, setPendingSession] = useState<Session | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [frame, setFrame] = useState(0);
  const { width, height } = useTerminalDimensions();
  const compact = width < 100 || height < 30;
  const tiny = width < 72 || height < 24;

  function setAuthMode(next: AuthMode | ((current: AuthMode) => AuthMode)) {
    const value = typeof next === "function" ? next(modeRef.current) : next;
    modeRef.current = value;
    setModeState(value);
  }

  function setAuthFocus(next: AuthFocus | ((current: AuthFocus) => AuthFocus)) {
    const value = typeof next === "function" ? next(focusRef.current) : next;
    focusRef.current = value;
    setFocus(value);
  }

  useEffect(() => {
    const timer = setInterval(() => setFrame((value) => value + 1), 120);
    return () => clearInterval(timer);
  }, []);

  useKeyboard((key) => {
    if (showHelp) {
      if (key.name === "h" || key.name === "escape" || isEnter(key)) {
        setShowHelp(false);
      }
      return;
    }

    if (recoveryKey) {
      if (isEnter(key) && pendingSession) {
        onAuthed(pendingSession);
      }
      return;
    }

    if (key.name === "tab" || key.name === "up" || key.name === "down") {
      setAuthFocus((current) => nextAuthFocus(current, modeRef.current));
      return;
    }

    if (key.name === "escape") {
      setAuthMode((current) => (current === "register" ? "login" : "register"));
      setAuthFocus("username");
      setMessage(modeRef.current === "register" ? "create a new slops account" : "sign in to existing slops account");
      return;
    }

    if (isEnter(key)) {
      void submit();
      return;
    }

    if (key.name === "backspace") {
      const currentFocus = focusRef.current;
      if (currentFocus === "username") {
        setUsername((value) => value.slice(0, -1));
      } else if (currentFocus === "password") {
        setPassword((value) => value.slice(0, -1));
      } else if (currentFocus === "recovery") {
        setRecoveryInput((value) => value.slice(0, -1));
      }
      return;
    }

    if (key.sequence.length === 1 && !key.ctrl && !key.meta) {
      const currentFocus = focusRef.current;
      if (currentFocus === "username") {
        if (/^[a-zA-Z0-9_]$/.test(key.sequence)) {
          setUsername((value) => `${value}${key.sequence}`.slice(0, 24));
        }
        return;
      } else if (currentFocus === "password") {
        setPassword((value) => `${value}${key.sequence}`.slice(0, 256));
        return;
      } else if (currentFocus === "recovery") {
        if (/^[a-zA-Z0-9_-]$/.test(key.sequence)) {
          setRecoveryInput((value) => `${value}${key.sequence}`.slice(0, 128));
        }
        return;
      }
    }

    if (focusRef.current !== "actions") {
      return;
    }

    if (key.name === "h") {
      setShowHelp(true);
      return;
    }

    if (key.name === "r") {
      setAuthMode("reset");
      setAuthFocus("username");
      setMessage(
        recoveryInput
          ? "reset password with saved recovery key"
          : "paste recovery key, then set a new password",
      );
      return;
    }

    if (key.name === "q") {
      renderer.destroy();
      process.exit(0);
    }
  });

  async function submit() {
    if (busy) {
      return;
    }

    if (username.length < 2 || password.length < 8) {
      setMessage("username needs 2 chars; password needs 8");
      return;
    }

    if (mode === "reset" && recoveryInput.length < 16) {
      setMessage("recovery key is required to reset password");
      return;
    }

    setBusy(true);
    setMessage(
      mode === "register"
        ? "minting account..."
        : mode === "reset"
          ? "resetting password..."
          : "checking password...",
    );

    const result = await apiRequest<AuthResponse>(
      apiUrl,
      mode === "register"
        ? "/api/auth/register"
        : mode === "reset"
          ? "/api/auth/recovery/reset-password"
          : "/api/auth/login",
      {
        method: "POST",
        body:
          mode === "reset"
            ? { username, password, recoveryKey: recoveryInput }
            : { username, password },
      },
    );

    setBusy(false);

    if (!result.ok) {
      setMessage(result.message ?? result.error);
      return;
    }

    const session: Session = {
      apiUrl,
      token: result.data.session.token,
      expiresAt: result.data.session.expiresAt,
      recoveryKey:
        result.data.recoveryKey ??
        (initialSession?.user?.username === result.data.user.username
          ? initialSession.recoveryKey
          : undefined),
      user: result.data.user,
    };

    await writeSession(session);

    if ((mode === "register" || mode === "reset") && result.data.recoveryKey) {
      setRecoveryKey(result.data.recoveryKey);
      setPendingSession(session);
      return;
    }

    onAuthed(session);
  }

  if (recoveryKey) {
    return (
      <box flexDirection="column" padding={1} gap={1} flexGrow={1}>
        <Header
          frame={frame}
          title="SLOPSINO"
          subtitle={mode === "reset" ? "password reset" : "account created"}
        />
        <box
          border
          borderColor="#73f0a1"
          padding={1}
          gap={1}
          flexGrow={1}
          justifyContent="center"
          alignItems="center"
        >
          <text fg="#73f0a1" attributes={TextAttributes.BOLD}>
            RECOVERY KEY
          </text>
          <text fg="#f6f0df">{recoveryKey}</text>
          <text fg="#a7a091" wrapMode="word">
            saved to user.json; keep another copy before leaving
          </text>
          <text fg="#ffd166">press ENTER to enter slopsino</text>
        </box>
      </box>
    );
  }

  return (
    <box flexDirection="column" padding={1} gap={1} flexGrow={1}>
      <Header frame={frame} title="SLOPSINO" subtitle="fake coins · real terminal nonsense" />

      {showHelp ? (
        <AuthHelp />
      ) : tiny ? (
        <TinyAuthForm
          mode={mode}
          focus={focus}
          username={username}
          password={password}
          recoveryKey={recoveryInput}
          message={message}
          busy={busy}
        />
      ) : compact ? (
        <AuthForm
          mode={mode}
          focus={focus}
          username={username}
          password={password}
          recoveryKey={recoveryInput}
          message={apiUrl === DEFAULT_API_URL ? message : `${message} · dev api`}
          busy={busy}
          height={17}
        />
      ) : (
        <box flexDirection="row" gap={1} flexGrow={1}>
          <AuthForm
            mode={mode}
            focus={focus}
            username={username}
            password={password}
            recoveryKey={recoveryInput}
            message={message}
            busy={busy}
          />

          <box border borderColor="#37362d" padding={1} flexGrow={1} gap={1} flexDirection="column">
            <text fg="#ffd166" attributes={TextAttributes.BOLD}>
              SLOPSINO POLICY
            </text>
            <text fg="#f6f0df">username/password only</text>
            <text fg="#f6f0df">session + recovery key stored in user.json</text>
            <text fg="#f6f0df">no sudo or global install</text>
            <text fg="#f6f0df">fake coins, no cash value</text>
            <text fg="#a7a091">TAB to actions, then h help · r reset · q quit</text>
            {apiUrl !== DEFAULT_API_URL ? <text fg="#ffd166">dev api</text> : null}
            <text fg="#a7a091">
              user.json: {compactPath(getUserFilePath(), 58)}
            </text>
          </box>
        </box>
      )}
    </box>
  );
}

function GameScreen({
  apiUrl,
  session,
  onLogout,
}: {
  apiUrl: string;
  session: AuthedSession;
  onLogout: () => Promise<void>;
}) {
  const [run, setRun] = useState<Run | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [reels, setReels] = useState(["BUG", "7", "AI"]);
  const [message, setMessage] = useState("press SPACE to spin");
  const [spinLog, setSpinLog] = useState<string[]>([]);
  const [view, setView] = useState<GameView>("game");
  const [boardScope, setBoardScope] = useState<BoardScope>("global");
  const [boardPage, setBoardPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [friendInput, setFriendInput] = useState("");
  const [frame, setFrame] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const { width, height } = useTerminalDimensions();
  const dense = width < 120 || height < 36;
  const narrow = width < 82;
  const stackDetails = width < 96;
  const showDetails = height >= 32;
  const tiny = width < 72 || height < 24;

  const token = session.token;
  const balance = run?.current_balance ?? 1000;
  const peak = run?.peak_balance ?? 1000;
  const outOfCoins = (run?.status ?? "active") === "busted" || balance < WAGER;
  const canSpin = !spinning && !outOfCoins;
  const status = tickerPhraseAt(Math.floor(frame / AGENT_TICKER_FRAME_INTERVAL));
  const detailRows = dense ? 3 : HISTORY_ROWS;
  const detailLineWidth = Math.max(
    18,
    stackDetails ? width - 8 : Math.floor((width - 10) / 2) - 4,
  );
  const messageWidth = Math.max(24, Math.min(width - 8, dense ? 58 : 74));
  const statHeight = 5;
  const reelHeight = dense ? 4 : 5;
  const slotHeight = dense ? 12 : 13;
  const reelDense = dense || width < 132;
  const fullBoardRows = Math.max(5, height - 14);
  const friendIds = new Set(friends.map((friend) => friend.userId));
  const filteredLeaderboard = leaderboard.filter((entry) =>
    search ? entry.username.toLowerCase().includes(search.toLowerCase()) : true,
  );
  const maxBoardPage = Math.max(0, Math.ceil(filteredLeaderboard.length / fullBoardRows) - 1);
  const visibleLeaderboard = filteredLeaderboard.slice(
    boardPage * fullBoardRows,
    boardPage * fullBoardRows + fullBoardRows,
  );
  const panelRows = fixedRows(
    leaderboard.length
      ? leaderboard
          .slice(0, BOARD_ROWS)
          .map((entry) => formatLeaderboardEntry(entry, friendIds))
      : [boardScope === "friends" ? "-- no friends on board yet" : "-- no spins yet 0"],
    detailRows,
  );
  const historyRows = fixedRows(
    spinLog.length ? spinLog : ["spin history appears here"],
    detailRows,
  );
  const displayMessage = outOfCoins && !spinning
    ? "out of fake coins. press n for a new run."
    : message;
  const controls = outOfCoins
    ? "n new run · l leaderboard · h help · q quit"
    : "SPACE spin · n new run · h help · l leaderboard";

  useEffect(() => {
    const timer = setInterval(() => setFrame((value) => value + 1), 140);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    void refresh(apiUrl, token, setRun, setLeaderboard, setMessage, onLogout, boardScope);
    void refreshFriends(apiUrl, token, setFriends);
  }, [apiUrl, token, boardScope]);

  useEffect(() => {
    const timer = setInterval(() => {
      void refreshLeaderboard(apiUrl, token, setLeaderboard, boardScope);
    }, LEADERBOARD_REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [apiUrl, token, boardScope]);

  useEffect(() => {
    setBoardPage(0);
  }, [boardScope, search]);

  useEffect(() => {
    if (!spinning) {
      return;
    }

    const timer = setInterval(() => {
      setReels([randomLabel(), randomLabel(), randomLabel()]);
    }, 70);

    return () => clearInterval(timer);
  }, [spinning]);

  useKeyboard((key) => {
    if (view === "help") {
      if (key.name === "h" || key.name === "escape" || isEnter(key)) {
        setView("game");
      }
      return;
    }

    if (view === "addFriend") {
      handleFriendKey(key);
      return;
    }

    if (view === "leaderboard") {
      handleLeaderboardKey(key);
      return;
    }

    if (key.name === "q") {
      renderer.destroy();
      process.exit(0);
    }

    if (key.name === "o") {
      void onLogout();
      return;
    }

    if (key.name === "h") {
      setView("help");
      return;
    }

    if (key.name === "l") {
      setBoardScope("global");
      setBoardPage(0);
      setView("leaderboard");
      void refreshLeaderboard(apiUrl, token, setLeaderboard, "global");
      return;
    }

    if (key.name === "f") {
      setFriendInput("");
      setView("addFriend");
      return;
    }

    if (key.name === "v") {
      toggleBoardScope();
      return;
    }

    if (key.name === "n") {
      void startNewRun();
      return;
    }

    if (key.name === "space") {
      void spin();
    }

    if (key.name === "r") {
      void refresh(apiUrl, token, setRun, setLeaderboard, setMessage, onLogout, boardScope);
      void refreshFriends(apiUrl, token, setFriends);
      setMessage("refreshed. n starts a fresh run.");
    }
  });

  function handleLeaderboardKey(key: { name: string; sequence: string; ctrl?: boolean; meta?: boolean }) {
    if (searching) {
      if (key.name === "escape" || isEnter(key)) {
        setSearching(false);
        return;
      }

      if (key.name === "backspace") {
        setSearch((value) => value.slice(0, -1));
        return;
      }

      if (key.sequence.length === 1 && !key.ctrl && !key.meta) {
        setSearch((value) => `${value}${key.sequence}`.slice(0, 24));
      }
      return;
    }

    if (key.name === "escape") {
      setView("game");
      return;
    }

    if (key.name === "q") {
      renderer.destroy();
      process.exit(0);
    }

    if (key.name === "h") {
      setView("help");
      return;
    }

    if (key.name === "l") {
      setBoardScope("global");
      setBoardPage(0);
      void refreshLeaderboard(apiUrl, token, setLeaderboard, "global");
      return;
    }

    if (key.name === "v") {
      toggleBoardScope();
      return;
    }

    if (key.name === "f") {
      setFriendInput("");
      setView("addFriend");
      return;
    }

    if (key.name === "s") {
      setSearching(true);
      return;
    }

    if (key.name === "c") {
      setSearch("");
      setBoardPage(0);
      return;
    }

    if (key.name === "n" || key.name === "right" || key.name === "down" || key.name === "j") {
      setBoardPage((page) => Math.min(maxBoardPage, page + 1));
      return;
    }

    if (key.name === "p" || key.name === "left" || key.name === "up" || key.name === "k") {
      setBoardPage((page) => Math.max(0, page - 1));
    }
  }

  function handleFriendKey(key: { name: string; sequence: string; ctrl?: boolean; meta?: boolean }) {
    if (key.name === "escape") {
      setView("game");
      return;
    }

    if (isEnter(key)) {
      void addFriend();
      return;
    }

    if (key.name === "backspace") {
      setFriendInput((value) => value.slice(0, -1));
      return;
    }

    if (key.sequence.length === 1 && !key.ctrl && !key.meta && /^[a-zA-Z0-9_]$/.test(key.sequence)) {
      setFriendInput((value) => `${value}${key.sequence}`.slice(0, 24));
    }
  }

  function toggleBoardScope() {
    const nextScope = boardScope === "global" ? "friends" : "global";
    setBoardScope(nextScope);
    setBoardPage(0);
    setMessage(nextScope === "global" ? "showing global board." : "showing friends board.");
    void refreshLeaderboard(apiUrl, token, setLeaderboard, nextScope);
  }

  async function spin() {
    if (!canSpin) {
      setMessage("out of fake coins. press n for a new run.");
      return;
    }

    setSpinning(true);
    setMessage("server is deciding how bad this gets...");

    const response = await apiRequest<SpinResponse>(apiUrl, "/api/spin", {
      method: "POST",
      token,
      body: {
        runId: run?.id,
        nonce: crypto.randomUUID(),
      },
    });

    setSpinning(false);

    if (!response.ok) {
      setMessage(response.message ?? response.error);
      return;
    }

    setRun(response.data.run);

    if (response.data.result) {
      setReels(response.data.result.labels);
      setMessage(
        response.data.run.status === "busted"
          ? `${response.data.result.message} out of coins. press n for a new run.`
          : response.data.result.message,
      );
      setSpinLog((log) =>
        [
          `${response.data.result?.outcome ?? "spin"} · ${response.data.result?.balanceAfter.toLocaleString()}`,
          ...log,
        ].slice(0, HISTORY_ROWS),
      );
    } else if (response.data.busted) {
      setMessage("out of fake coins. press n for a new run.");
    }

    await refreshLeaderboard(apiUrl, token, setLeaderboard, boardScope);
  }

  async function startNewRun() {
    setSpinning(false);
    setMessage("starting a fresh run...");

    const response = await apiRequest<{ run: Run }>(apiUrl, "/api/runs", {
      method: "POST",
      token,
      body: { restart: true },
    });

    if (!response.ok) {
      setMessage(response.message ?? response.error);
      return;
    }

    setRun(response.data.run);
    setReels(["BUG", "7", "AI"]);
    setSpinLog([]);
    setMessage("new run. press SPACE to spin.");
    await refreshLeaderboard(apiUrl, token, setLeaderboard, boardScope);
  }

  async function addFriend() {
    const username = friendInput.trim().toLowerCase();
    if (username.length < 2) {
      setMessage("friend username needs at least 2 chars.");
      return;
    }

    const response = await apiRequest<{ friend: Friend }>(apiUrl, "/api/friends", {
      method: "POST",
      token,
      body: { username },
    });

    if (!response.ok) {
      setMessage(response.message ?? response.error);
      return;
    }

    setMessage(`added ${response.data.friend.username} as a friend.`);
    setFriendInput("");
    setView("leaderboard");
    await refreshFriends(apiUrl, token, setFriends);
    await refreshLeaderboard(apiUrl, token, setLeaderboard, boardScope);
  }

  if (view === "help") {
    return (
      <box flexDirection="column" padding={1} gap={1} flexGrow={1} backgroundColor={theme.bg}>
        <Header subtitle={`${session.user?.username ?? "you"} · help`} />
        <GameHelp />
      </box>
    );
  }

  if (view === "addFriend") {
    return (
      <box flexDirection="column" padding={1} gap={1} flexGrow={1} backgroundColor={theme.bg}>
        <Header subtitle={`${session.user?.username ?? "you"} · add friend`} />
        <AddFriendView username={friendInput} />
      </box>
    );
  }

  if (view === "leaderboard") {
    return (
      <box flexDirection="column" padding={1} gap={1} flexGrow={1} backgroundColor={theme.bg} overflow="hidden">
        <Header subtitle={`${boardScope} leaderboard · l global · v switch · ESC back`} />
        <LeaderboardView
          scope={boardScope}
          rows={visibleLeaderboard.map((entry) => formatLeaderboardEntry(entry, friendIds))}
          page={boardPage}
          maxPage={maxBoardPage}
          search={search}
          searching={searching}
          lineWidth={Math.max(24, width - 8)}
        />
      </box>
    );
  }

  if (tiny) {
    return (
      <box
        flexDirection="column"
        padding={1}
        gap={1}
        flexGrow={1}
        backgroundColor={theme.bg}
        overflow="hidden"
      >
        <Header subtitle={`${session.user?.username ?? "you"} · fake coins`} />
        <text
          fg={theme.green}
          attributes={TextAttributes.BOLD}
          height={1}
          flexShrink={0}
          content={fixedLine(
            `bal ${balance.toLocaleString()} · best ${peak.toLocaleString()} · wager ${WAGER}`,
            Math.max(20, width - 4),
          )}
          truncate
        />
        <box
          border
          borderColor={spinning ? reelPalette[frame % reelPalette.length] : theme.gold}
          backgroundColor={theme.panel}
          height={7}
          padding={1}
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          overflow="hidden"
        >
          <text
            fg={spinning ? reelPalette[frame % reelPalette.length] : theme.gold}
            attributes={TextAttributes.BOLD}
            height={1}
            flexShrink={0}
            content={centerLine(reels.join("  |  "), Math.max(20, width - 8))}
            truncate
          />
          <text
            fg={theme.text}
            height={1}
            flexShrink={0}
            content={centerLine(displayMessage, Math.max(20, width - 8))}
            truncate
          />
          <text
            fg={theme.muted}
            height={1}
            flexShrink={0}
            content={centerLine(controls, Math.max(20, width - 8))}
            truncate
          />
        </box>
        <HistoryPanel
          status={status}
          frame={frame}
          rows={historyRows}
          lineWidth={Math.max(20, width - 8)}
        />
      </box>
    );
  }

  return (
    <box
      flexDirection="column"
      padding={1}
      gap={1}
      flexGrow={1}
      backgroundColor={theme.bg}
      overflow="hidden"
    >
      <Header
        subtitle={`${session.user?.username ?? "you"} · fake coins · h help`}
      />

      {narrow ? (
        <StatsStrip
          balance={balance.toLocaleString()}
          peak={peak.toLocaleString()}
          wager={WAGER.toLocaleString()}
          lineWidth={Math.max(20, width - 8)}
        />
      ) : (
        <box flexDirection="row" gap={1} flexShrink={0}>
          <Stat label="balance" value={balance.toLocaleString()} tone={theme.green} height={statHeight} />
          <Stat label="best" value={peak.toLocaleString()} tone={theme.gold} height={statHeight} />
          <Stat label="wager" value={WAGER.toLocaleString()} tone={theme.cyan} height={statHeight} />
        </box>
      )}

      <box
        border
        borderColor={spinning ? reelPalette[frame % reelPalette.length] : theme.border}
        backgroundColor={theme.panel}
        height={slotHeight}
        padding={1}
        gap={0}
        flexDirection="column"
        justifyContent="flex-start"
        alignItems="center"
        flexShrink={0}
        overflow="hidden"
      >
        <text
          fg={spinning ? reelPalette[frame % reelPalette.length] : theme.muted}
          height={1}
          flexShrink={0}
          content={centerLine(spinning ? scanline(frame) : "SLOPS // SERVER-SIDE RNG", messageWidth)}
          truncate
        />
        <CoinFlyby
          frame={frame}
          lineWidth={messageWidth}
          intense={spinning || status.deranged === true}
        />

        <box
          flexDirection="row"
          gap={reelDense ? 1 : 2}
          justifyContent="center"
          height={reelHeight}
          flexShrink={0}
        >
          {reels.map((reel, index) => (
            <Reel
              key={`reel-${index}`}
              label={reel}
              index={index}
              frame={frame}
              spinning={spinning}
              compact={reelDense}
              height={reelHeight}
            />
          ))}
        </box>

        <text
          fg={theme.text}
          attributes={TextAttributes.BOLD}
          height={1}
          flexShrink={0}
          content={centerLine(displayMessage, messageWidth)}
          truncate
        />
        <text
          fg={theme.muted}
          height={1}
          flexShrink={0}
          content={centerLine(controls, messageWidth)}
          truncate
        />
      </box>

      {showDetails ? (
        <box flexDirection={stackDetails ? "column" : "row"} gap={1} flexGrow={1} overflow="hidden">
          <HistoryPanel status={status} frame={frame} rows={historyRows} lineWidth={detailLineWidth} />
          <LeaderboardPanel
            rows={panelRows}
            lineWidth={detailLineWidth}
            title={boardScope === "global" ? "GLOBAL BEST" : "FRIENDS"}
          />
        </box>
      ) : null}
    </box>
  );
}

function Header({
  title = "SLOPS",
  subtitle,
}: {
  frame?: number;
  title?: string;
  subtitle: string;
}) {
  return (
    <box height={3} flexDirection="column" alignItems="center" justifyContent="center" flexShrink={0}>
      <text
        fg={theme.gold}
        attributes={TextAttributes.BOLD}
        height={1}
        flexShrink={0}
        content={`▣ ${title} ▣`}
      />
      <text
        fg={theme.muted}
        height={1}
        flexShrink={0}
        wrapMode="word"
        content={subtitle}
        truncate
      />
    </box>
  );
}

function AuthForm({
  mode,
  focus,
  username,
  password,
  recoveryKey,
  message,
  busy,
  height,
}: {
  mode: AuthMode;
  focus: AuthFocus;
  username: string;
  password: string;
  recoveryKey: string;
  message: string;
  busy: boolean;
  height?: number;
}) {
  return (
    <box
      border
      borderColor="#37362d"
      padding={1}
      flexGrow={height ? undefined : 1}
      height={height}
      gap={1}
      flexDirection="column"
    >
      <text
        fg="#73f0a1"
        attributes={TextAttributes.BOLD}
        content={
          mode === "register"
            ? "create account"
            : mode === "reset"
              ? "reset password"
              : "sign in"
        }
      />
      <Field
        label="username"
        value={username}
        placeholder="username"
        focused={focus === "username"}
      />
      <Field
        label="password"
        value={password ? "*".repeat(password.length) : ""}
        placeholder="password"
        focused={focus === "password"}
      />
      {mode === "reset" ? (
        <Field
          label="key"
          value={recoveryKey}
          placeholder="recovery key"
          focused={focus === "recovery"}
        />
      ) : null}
      <text fg={busy ? "#ffd166" : "#ff6b9d"} wrapMode="word" content={message} />
      <ActionLine focused={focus === "actions"} />
      <text
        fg="#a7a091"
        wrapMode="word"
        content={`TAB moves focus · ENTER submit · ESC ${mode === "register" ? "sign in" : "create account"}`}
      />
    </box>
  );
}

function TinyAuthForm({
  mode,
  focus,
  username,
  password,
  recoveryKey,
  message,
  busy,
}: {
  mode: AuthMode;
  focus: AuthFocus;
  username: string;
  password: string;
  recoveryKey: string;
  message: string;
  busy: boolean;
}) {
  return (
    <box border borderColor="#37362d" padding={1} gap={1} flexGrow={1} flexDirection="column">
      <text
        fg="#73f0a1"
        attributes={TextAttributes.BOLD}
        content={mode === "register" ? "create account" : mode === "reset" ? "reset password" : "sign in"}
      />
      <CompactField
        label="user"
        value={username}
        placeholder="username"
        focused={focus === "username"}
      />
      <CompactField
        label="pass"
        value={password ? "*".repeat(password.length) : ""}
        placeholder="password"
        focused={focus === "password"}
      />
      {mode === "reset" ? (
        <CompactField
          label="key"
          value={recoveryKey}
          placeholder="recovery key"
          focused={focus === "recovery"}
        />
      ) : null}
      <text
        fg={busy ? "#ffd166" : "#ff6b9d"}
        wrapMode="word"
        content={message}
      />
      <ActionLine focused={focus === "actions"} />
      <text fg="#a7a091" wrapMode="word" content="TAB moves · ENTER submit · ESC switch" />
    </box>
  );
}

function ActionLine({ focused }: { focused: boolean }) {
  return (
    <text
      fg={focused ? theme.green : theme.muted}
      attributes={focused ? TextAttributes.BOLD : undefined}
      content={`${focused ? "> " : "  "}actions: h help · r reset · q quit`}
      truncate
    />
  );
}

function AuthHelp() {
  return (
    <box
      border
      borderColor={theme.gold}
      backgroundColor={theme.panel}
      padding={1}
      gap={1}
      flexGrow={1}
      flexDirection="column"
      overflow="hidden"
    >
      <text fg={theme.gold} attributes={TextAttributes.BOLD} content="HELP" />
      <text fg={theme.text} content="TAB / arrows  move between fields and actions" />
      <text fg={theme.text} content="ENTER         submit current form" />
      <text fg={theme.text} content="ESC           switch sign in / create account" />
      <text fg={theme.text} content="h             help, only when actions is focused" />
      <text fg={theme.text} content="r             reset, only when actions is focused" />
      <text fg={theme.text} content="q             quit, only when actions is focused" />
      <text fg={theme.text} content="h / r / q     typed normally inside username/password fields" />
      <text fg={theme.muted} content="Recovery keys are saved in user.json after register/reset." />
    </box>
  );
}

function Field({
  label,
  value,
  placeholder,
  focused,
}: {
  label: string;
  value: string;
  placeholder: string;
  focused: boolean;
}) {
  const { width } = useTerminalDimensions();
  const lineWidth = Math.max(12, Math.min(56, width - 20));
  const display = value ? value : placeholder;

  return (
    <box border borderColor={focused ? "#73f0a1" : "#37362d"} padding={1} height={3}>
      <text
        fg={value ? "#f6f0df" : "#5f5a50"}
        attributes={TextAttributes.BOLD}
        truncate
        content={filledLine(`${focused ? "> " : "  "}${label}: ${display}`, lineWidth)}
      />
    </box>
  );
}

function CompactField({
  label,
  value,
  placeholder,
  focused,
}: {
  label: string;
  value: string;
  placeholder: string;
  focused: boolean;
}) {
  const { width } = useTerminalDimensions();
  const lineWidth = Math.max(10, width - 12);
  const display = value ? value : placeholder;

  return (
    <box border borderColor={focused ? "#73f0a1" : "#37362d"} padding={1} height={3}>
      <text
        fg={value ? "#f6f0df" : "#5f5a50"}
        attributes={TextAttributes.BOLD}
        truncate
        content={filledLine(`${focused ? ">" : " "} ${label}: ${display}`, lineWidth)}
      />
    </box>
  );
}

function Stat({
  label,
  value,
  tone,
  height,
}: {
  label: string;
  value: string;
  tone: string;
  height: number;
}) {
  return (
    <box
      border
      borderColor={theme.borderDim}
      backgroundColor={theme.panel}
      padding={1}
      flexGrow={1}
      height={height}
      flexDirection="column"
      justifyContent="flex-start"
      overflow="hidden"
    >
      <text
        fg={theme.muted}
        height={1}
        flexShrink={0}
        content={fixedLine(label.toUpperCase(), 18)}
        truncate
      />
      <text
        fg={tone}
        attributes={TextAttributes.BOLD}
        height={1}
        flexShrink={0}
        content={fixedLine(value, 18)}
        truncate
      />
    </box>
  );
}

function StatsStrip({
  balance,
  peak,
  wager,
  lineWidth,
}: {
  balance: string;
  peak: string;
  wager: string;
  lineWidth: number;
}) {
  return (
    <box
      border
      borderColor={theme.borderDim}
      backgroundColor={theme.panel}
      padding={1}
      height={3}
      flexDirection="column"
      justifyContent="center"
      overflow="hidden"
      flexShrink={0}
    >
      <text
        fg={theme.text}
        attributes={TextAttributes.BOLD}
        height={1}
        flexShrink={0}
        content={fixedLine(`BAL ${balance} · BEST ${peak} · WAGER ${wager}`, lineWidth)}
        truncate
      />
    </box>
  );
}

function Reel({
  label,
  index,
  frame,
  spinning,
  compact,
  height,
}: {
  label: string;
  index: number;
  frame: number;
  spinning: boolean;
  compact: boolean;
  height: number;
}) {
  const width = compact ? 10 : 15;
  const color = spinning ? reelPalette[(frame + index) % reelPalette.length] : theme.gold;

  return (
    <box
      width={width}
      height={height}
      border
      borderColor={color}
      backgroundColor={theme.bg}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
      overflow="hidden"
    >
      <text
        fg={color}
        attributes={TextAttributes.BOLD}
        height={1}
        flexShrink={0}
        content={centerLine(label, width - 2)}
        truncate
      />
    </box>
  );
}

function CoinFlyby({
  frame,
  lineWidth,
  intense,
}: {
  frame: number;
  lineWidth: number;
  intense: boolean;
}) {
  const width = Math.max(1, lineWidth);
  const phase = frame % COIN_FLYBY_PERIOD;
  const active = intense || phase < COIN_FLYBY_DURATION;

  if (!active) {
    return (
      <text
        fg={theme.dim}
        height={1}
        flexShrink={0}
        content={fixedLine("", width)}
        truncate
      />
    );
  }

  const chars = coinFlybyLine(frame, width, intense ? 10 : 6);

  return (
    <box height={1} flexShrink={0} flexDirection="row" overflow="hidden">
      {chars.map((char, index) => (
        <text
          key={`coin-flyby-${index}`}
          fg={coinFlybyColor(char, index, frame)}
          attributes={char === "$" ? TextAttributes.BOLD : undefined}
          height={1}
          width={1}
          flexShrink={0}
          content={char}
        />
      ))}
    </box>
  );
}

function HistoryPanel({
  status,
  frame,
  rows,
  lineWidth,
}: {
  status: TickerPhrase;
  frame: number;
  rows: string[];
  lineWidth: number;
}) {
  return (
    <box
      border
      borderColor={theme.borderDim}
      title="agent ticker"
      backgroundColor={theme.panel}
      padding={1}
      flexGrow={1}
      flexDirection="column"
      gap={0}
      overflow="hidden"
    >
      <TickerStatus phrase={status} frame={frame} lineWidth={lineWidth} />
      {rows.map((line, index) => (
        <text
          key={`history-${index}`}
          fg={line.trim() ? theme.muted : theme.dim}
          height={1}
          flexShrink={0}
          content={fixedLine(line, lineWidth)}
          truncate
        />
      ))}
    </box>
  );
}

function TickerStatus({
  phrase,
  frame,
  lineWidth,
}: {
  phrase: TickerPhrase;
  frame: number;
  lineWidth: number;
}) {
  const text = phrase.deranged ? `[DGEN] ${phrase.text}` : phrase.text;

  if (!phrase.deranged) {
    return (
      <box
        height={2}
        flexShrink={0}
        flexDirection="column"
        overflow="hidden"
      >
        <text
          fg={theme.cyan}
          attributes={TextAttributes.BOLD}
          height={1}
          flexShrink={0}
          content={fixedLine(text, lineWidth)}
          truncate
        />
        <text
          fg={theme.dim}
          height={1}
          flexShrink={0}
          content={fixedLine("", lineWidth)}
          truncate
        />
      </box>
    );
  }

  const line = fixedLine(text, lineWidth);
  const waveFrame = Math.floor(frame / 2);

  return (
    <box height={2} flexShrink={0} flexDirection="row" overflow="hidden">
      {Array.from(line).map((char, index) => {
        const glyph = derangedGlyph(char, index, frame);

        return (
          <box
            key={`ticker-char-${index}`}
            width={1}
            height={2}
            flexDirection="column"
            flexShrink={0}
            overflow="hidden"
          >
            <text
              fg={derangedPalette[(index + frame) % derangedPalette.length]}
              attributes={TextAttributes.BOLD}
              height={1}
              width={1}
              flexShrink={0}
              content={glyph}
            />
            <text
              fg={derangedPalette[(index + frame + 2) % derangedPalette.length]}
              attributes={TextAttributes.BOLD}
              height={1}
              width={1}
              flexShrink={0}
              content={derangedWaveMarker(char, index, waveFrame)}
            />
          </box>
        );
      })}
    </box>
  );
}

function LeaderboardPanel({
  rows,
  lineWidth,
  title,
}: {
  rows: string[];
  lineWidth: number;
  title: string;
}) {
  return (
    <box
      border
      borderColor={theme.borderDim}
      title="leaderboard"
      backgroundColor={theme.panel}
      padding={1}
      flexGrow={1}
      flexDirection="column"
      gap={0}
      overflow="hidden"
    >
      <text
        fg={theme.gold}
        attributes={TextAttributes.BOLD}
        height={1}
        flexShrink={0}
        content={fixedLine(title, lineWidth)}
        truncate
      />
      {rows.map((line, index) => (
        <text
          key={`leaderboard-${index}`}
          fg={line.trim() ? theme.text : theme.dim}
          height={1}
          flexShrink={0}
          content={fixedLine(line, lineWidth)}
          truncate
        />
      ))}
    </box>
  );
}

function GameHelp() {
  return (
    <box
      border
      borderColor={theme.gold}
      backgroundColor={theme.panel}
      padding={1}
      gap={1}
      flexGrow={1}
      flexDirection="column"
      overflow="hidden"
    >
      <text fg={theme.gold} attributes={TextAttributes.BOLD} content="GAME HELP" />
      <text fg={theme.text} content="SPACE  spin if the run can afford the wager" />
      <text fg={theme.text} content="n      start a fresh 1,000 coin run" />
      <text fg={theme.text} content="r      refresh account/run state" />
      <text fg={theme.text} content="l      open the global leaderboard" />
      <text fg={theme.text} content="v      switch board between global and friends" />
      <text fg={theme.text} content="f      add a friend by username" />
      <text fg={theme.text} content="o      sign out, keeping recovery key in user.json" />
      <text fg={theme.text} content="h      close help" />
      <text fg={theme.text} content="q      quit" />
      <text fg={theme.muted} content="Fake coins only. No cash value, no deposits, no withdrawals." />
    </box>
  );
}

function AddFriendView({ username }: { username: string }) {
  const { width } = useTerminalDimensions();
  const lineWidth = Math.max(18, width - 10);

  return (
    <box
      border
      borderColor={theme.cyan}
      backgroundColor={theme.panel}
      padding={1}
      gap={1}
      flexGrow={1}
      flexDirection="column"
      overflow="hidden"
    >
      <text fg={theme.cyan} attributes={TextAttributes.BOLD} content="ADD FRIEND" />
      <text
        fg={theme.text}
        attributes={TextAttributes.BOLD}
        content={filledLine(`> username: ${username || "friend_username"}`, lineWidth)}
        truncate
      />
      <text fg={theme.muted} content="ENTER add · ESC back" />
    </box>
  );
}

function LeaderboardView({
  scope,
  rows,
  page,
  maxPage,
  search,
  searching,
  lineWidth,
}: {
  scope: BoardScope;
  rows: string[];
  page: number;
  maxPage: number;
  search: string;
  searching: boolean;
  lineWidth: number;
}) {
  return (
    <box
      border
      borderColor={theme.borderDim}
      backgroundColor={theme.panel}
      padding={1}
      gap={0}
      flexGrow={1}
      flexDirection="column"
      overflow="hidden"
    >
      <text
        fg={theme.gold}
        attributes={TextAttributes.BOLD}
        height={1}
        flexShrink={0}
        content={fixedLine(scope === "global" ? "GLOBAL LEADERBOARD" : "FRIENDS LEADERBOARD", lineWidth)}
        truncate
      />
      <text
        fg={searching ? theme.green : theme.muted}
        height={1}
        flexShrink={0}
        content={fixedLine(`search: ${search || "(s to search)"}`, lineWidth)}
        truncate
      />
      <text
        fg={theme.muted}
        height={1}
        flexShrink={0}
        content={fixedLine(`page ${page + 1}/${maxPage + 1} · n/p page · v view · f friend · c clear · ESC back`, lineWidth)}
        truncate
      />
      {(rows.length ? rows : ["-- no matching scores"]).map((line, index) => (
        <text
          key={`full-board-${index}`}
          fg={line.trim() ? theme.text : theme.dim}
          height={1}
          flexShrink={0}
          content={fixedLine(line, lineWidth)}
          truncate
        />
      ))}
    </box>
  );
}

async function refresh(
  apiUrl: string,
  token: string,
  setRun: (run: Run | null) => void,
  setLeaderboard: (entries: LeaderboardEntry[]) => void,
  setMessage: (message: string) => void,
  onLogout?: () => Promise<void>,
  scope: BoardScope = "global",
) {
  const me = await apiRequest<{ activeRun: Run | null }>(apiUrl, "/api/me", {
    token,
  });

  if (me.ok) {
    setRun(me.data.activeRun);
    if (!me.data.activeRun) {
      setMessage("press SPACE to start a run and spin");
    }
  } else {
    setMessage(me.message ?? me.error);
    if (me.error === "unauthorized") {
      await onLogout?.();
    }
  }

  await refreshLeaderboard(apiUrl, token, setLeaderboard, scope);
}

async function refreshLeaderboard(
  apiUrl: string,
  token: string | undefined,
  setLeaderboard: (entries: LeaderboardEntry[]) => void,
  scope: BoardScope = "global",
) {
  const board = await apiRequest<{ entries: LeaderboardEntry[] }>(
    apiUrl,
    `/api/leaderboard?limit=100&scope=${scope}`,
    token ? { token } : {},
  );

  if (board.ok) {
    setLeaderboard(board.data.entries);
  }
}

async function refreshFriends(
  apiUrl: string,
  token: string,
  setFriends: (friends: Friend[]) => void,
) {
  const result = await apiRequest<{ friends: Friend[] }>(apiUrl, "/api/friends", {
    token,
  });

  if (result.ok) {
    setFriends(result.data.friends);
  }
}

function formatLeaderboardEntry(entry: LeaderboardEntry, friendIds: Set<string>) {
  const star = entry.userId && friendIds.has(entry.userId) ? "* " : "";
  return `${star}#${entry.rank} ${entry.username} ${entry.peakBalance.toLocaleString()}`;
}

function randomLabel() {
  return spinnerLabels[Math.floor(Math.random() * spinnerLabels.length)];
}

function normalizeApiUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function isEnter(key: { name: string }) {
  return key.name === "return" || key.name === "enter";
}

function nextAuthFocus(current: AuthFocus, mode: AuthMode): AuthFocus {
  if (mode !== "reset") {
    if (current === "username") {
      return "password";
    }

    if (current === "password") {
      return "actions";
    }

    return "username";
  }

  if (current === "username") {
    return "password";
  }

  if (current === "password") {
    return "recovery";
  }

  if (current === "recovery") {
    return "actions";
  }

  return "username";
}

function scanline(frame: number) {
  const fills = ["░", "▒", "▓", "█"];
  return `╔${fills[frame % fills.length].repeat(8)} SERVER-SIDE SPIN ${fills[(frame + 2) % fills.length].repeat(8)}╗`;
}

function derangedGlyph(char: string, index: number, frame: number) {
  if (char === " ") {
    return " ";
  }

  return (index + frame) % 23 === 0 ? char.toUpperCase() : char;
}

function derangedWaveMarker(char: string, index: number, frame: number) {
  if (char === " ") {
    return " ";
  }

  const marks = ["_", "-", "~", "^", "~", "-"];
  return marks[(index + frame) % marks.length] ?? "~";
}

function coinFlybyLine(frame: number, width: number, count: number) {
  const line = Array.from({ length: width }, () => " ");
  const burst = Math.floor(frame / COIN_FLYBY_PERIOD);
  const phase = frame % COIN_FLYBY_PERIOD;
  const travelWidth = width + 18;

  for (let index = 0; index < count; index += 1) {
    const seed = pseudoRandomInt(burst * 97 + index * 41 + width * 13);
    const speed = 2 + (seed % 3);
    const progress = (phase * speed + seed) % travelWidth;
    const position = progress - 9;
    const glyph = seed % 5 === 0 ? "o" : "$";

    putCoinChar(line, position - 2, ".");
    putCoinChar(line, position - 1, ".");
    putCoinChar(line, position, glyph);
  }

  return line;
}

function putCoinChar(line: string[], position: number, char: string) {
  if (position >= 0 && position < line.length) {
    line[position] = char;
  }
}

function coinFlybyColor(char: string, index: number, frame: number) {
  if (char === ".") {
    return theme.dim;
  }

  if (char === " ") {
    return theme.dim;
  }

  return coinPalette[(index + frame) % coinPalette.length];
}

function pseudoRandomInt(value: number) {
  let next = value | 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return Math.abs(next);
}

function tickerPhraseAt(index: number) {
  if (
    derangedTickerPhrases.length &&
    index % DERANGED_TICKER_INTERVAL === DERANGED_TICKER_INTERVAL - 1
  ) {
    return derangedTickerPhrases[
      Math.floor(index / DERANGED_TICKER_INTERVAL) % derangedTickerPhrases.length
    ];
  }

  if (!normalTickerPhrases.length) {
    return TICKER_PHRASES[index % TICKER_PHRASES.length];
  }

  const derangedBefore = Math.floor(index / DERANGED_TICKER_INTERVAL);
  return normalTickerPhrases[(index - derangedBefore) % normalTickerPhrases.length];
}

function fixedRows(lines: string[], count: number) {
  return Array.from({ length: count }, (_, index) => lines[index] ?? "");
}

function fixedLine(value: string, width: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (width <= 0) {
    return "";
  }

  if (clean.length > width) {
    return clean.slice(0, Math.max(0, width - 3)) + "...";
  }

  return clean.padEnd(width, " ");
}

function centerLine(value: string, width: number) {
  const clean = fixedLine(value, width).trimEnd();
  if (clean.length >= width) {
    return clean.slice(0, width);
  }

  const left = Math.floor((width - clean.length) / 2);
  return `${" ".repeat(left)}${clean}`.padEnd(width, " ");
}

function compactPath(path: string, maxLength: number) {
  if (path.length <= maxLength) {
    return path;
  }

  return `...${path.slice(-Math.max(0, maxLength - 3))}`;
}

function filledLine(value: string, width: number) {
  const clean = value.replace(/\s+/g, " ");
  if (clean.length >= width) {
    return clean.slice(0, width);
  }

  return clean.padEnd(width, ".");
}
