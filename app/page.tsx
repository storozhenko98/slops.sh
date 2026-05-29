const leaderboard = [
  ["alice", "12,400"],
  ["you", "7,900"],
  ["max", "6,660"],
];

export default function Home() {
  return (
    <div className="shell">
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
            <div className="eyebrow">spin while your agent thinks</div>
            <h1>slops</h1>
            <p className="lead">
              A cursed terminal slot machine for the dead air between
              &quot;planning edits&quot; and &quot;applying patch&quot;.
            </p>
            <div className="commands" aria-label="Install commands">
              <code className="command">
                curl -fsSL https://slops.sh/install.sh | bash{" "}
                <span>macOS · linux</span>
              </code>
              <code className="command">
                ~/.local/bin/slops <span>launch</span>
              </code>
            </div>
          </div>

          <aside className="terminal" aria-label="Slopsino preview">
            <div className="terminal-bar">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
            <div className="tui">
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
                <div className="reel">7</div>
                <div className="reel">AI</div>
              </div>
              <div className="ticker">
                [DGEN] npm audit found forbidden soup
                <br />
                ~-_-~^ -_- ^~-_- ^~-_- ^~-_
              </div>
              <div>
                {leaderboard.map(([name, score]) => (
                  <div className="command" key={name}>
                    {name}
                    <span>{score}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>

        <section className="section grid" aria-label="Product details">
          <div className="feature">
            <h2>Server-side spins</h2>
            <p>
              The client only asks to spin. Vercel API routes decide symbols,
              payouts, balances, and leaderboard state.
            </p>
          </div>
          <div className="feature">
            <h2>Fake coins only</h2>
            <p>
              No cash value, deposits, withdrawals, crypto, prizes, or pretend
              financial upside.
            </p>
          </div>
          <div className="feature">
            <h2>OpenTUI native</h2>
            <p>
              Built with OpenTUI React so the terminal can feel animated without
              turning into a browser tab.
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
