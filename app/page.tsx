import { CopyCommand } from "./copy-command";

const leaderboard = [
  ["claude-ate-prod", "88,888"],
  ["you", "42,069"],
  ["cursor-divorce", "31,337"],
];

const chaosPills = [
  "agent is still thinking",
  "SPACEBAR liquidity event",
  "context window sweating",
  "fake coin trench run",
  "ship button haunted",
  "no cash, all voltage",
];

const flyingLoot = ["$", "777", "AI", "BUG", "PR", "TOK", "SHIP", "HAL", "{}", "LGTM"];

const terminalNoise = [
  "[DGEN] claude opened a slot-shaped pull request",
  "npm audit found 69 imaginary jackpots",
  "context window is doing cardio in fake gold",
];

export default function Home() {
  return (
    <div className="shell">
      <div className="page-noise" aria-hidden="true">
        {flyingLoot.map((item, index) => (
          <span className={`loot loot-${index}`} key={`${item}-${index}`}>
            {item}
          </span>
        ))}
      </div>

      <header className="nav">
        <a className="brand" href="/">
          slops.sh
        </a>
        <nav className="nav-links" aria-label="Primary">
          <a href="/api/health">api</a>
          <a href="https://github.com/storozhenko98/slops.sh">github</a>
        </nav>
      </header>

      <main className="main">
        <section className="hero">
          <div>
            <div className="eyebrow">spin while your agent lies about being almost done</div>
            <h1>slops</h1>
            <p className="lead">
              A fake-coin terminal slot machine for the command-tab generation:
              yell at an agent, smash SPACE, watch imaginary numbers do crimes.
            </p>
            <div className="chaos-strip" aria-label="Slops energy">
              {chaosPills.map((pill) => (
                <span key={pill}>{pill}</span>
              ))}
            </div>
            <div className="commands" aria-label="Install commands">
              <CopyCommand
                command="curl -fsSL https://slops.sh/install.sh | bash"
                meta="copy install"
                ariaLabel="Copy slops install command"
              />
              <CopyCommand
                command="slops"
                meta="copy launch"
                ariaLabel="Copy slops launch command"
              />
            </div>
          </div>

          <aside className="terminal" aria-label="Slops preview">
            <div className="terminal-bar">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
              <span className="terminal-title">slops --panic-casino</span>
            </div>
            <div className="tui">
              <div className="terminal-rain" aria-hidden="true">
                {flyingLoot.slice(0, 8).map((item, index) => (
                  <span className={`terminal-loot terminal-loot-${index}`} key={`terminal-${item}`}>
                    {item}
                  </span>
                ))}
              </div>
              <div className="terminal-siren">AGENTIC SLOT ROOM // SPACEBAR PANIC</div>
              <div className="stats">
                <div className="stat">
                  <span className="stat-label">balance</span>
                  1,240
                </div>
                <div className="stat">
                  <span className="stat-label">best</span>
                  9,700
                </div>
                <div className="stat">
                  <span className="stat-label">rank</span>
                  #42
                </div>
              </div>
              <div className="reels">
                <div className="reel">BUG</div>
                <div className="reel">777</div>
                <div className="reel">SHIP</div>
              </div>
              <div className="ticker">
                {terminalNoise.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </div>
              <div>
                {leaderboard.map(([name, score]) => (
                  <div className="command" key={name}>
                    <span className="command-text">{name}</span>
                    <span className="command-meta">{score}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>

        <section className="section grid" aria-label="Slops details">
          <div className="feature">
            <h2>Smash space</h2>
            <p>
              Start with fake coins, chase a stupid peak, screenshot the run
              before it faceplants.
            </p>
          </div>
          <div className="feature">
            <h2>Fake coins only</h2>
            <p>
              No cash value, deposits, withdrawals, crypto, prizes, or pretend
              financial upside. Just terminal confetti and leaderboard shame.
            </p>
          </div>
          <div className="feature">
            <h2>Agent waiting room</h2>
            <p>
              For the dead air between planning edits, applying patches, tests
              passing, and one more small change.
            </p>
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>fake coins · no cash value · no deposits · no withdrawals</span>
        <span>terminal brain rot only</span>
      </footer>
    </div>
  );
}
