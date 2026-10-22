<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Agent rules
- Trade history is never truncated on insert; account reads paginate until exhausted, and src/lib/trade-history.ts shares outcome presentation — keeps records complete and labels consistent without changing execution reasons.
- Pure trading logic (indicators, signals, risk) lives in src/lib/trading.ts with tests; server code imports it — keeps rules testable and shared with the UI.
- Bot execution runs in authenticated server functions (src/functions/bot.functions.ts) — workers are stateless, no in-memory bot state.
- Chart and paper-mode prices come from the live Binance public API (Testnet mode decides on Testnet prices to match its fills); paper balances live in bot_settings — user wants real prices with simulated trading.
- API credentials table has no client grants; only server functions read it via admin client — secrets never reach the browser.
- Background bot: a managed schedule calls /api/public/jobs/bot-tick every minute, ticking every enabled account; a unique open-trade index prevents duplicate buys from overlapping ticks.
- Home uses the local paper engine only for guests; authenticated home uses durable paper_services state and the shared background-paper pure engine, with leased transactional state/history commits — closed tabs cannot stop trading or double-book balances.
- A paper_services account is excluded from legacy bot ticks; permanent account trade history is never deleted by a balance reset — avoids competing engines and keeps absence records intact.
- Shared PriceChart preserves the visible time range on price updates and separates drag-to-pan from explicit zoom controls — prevents live updates and gestures from unexpectedly changing zoom.
- MT5 VPS bridge: the VPS polls /api/public/mt5/poll and posts /report with a bearer key; commands queue in server-only mt5_commands — the VPS pulls, so no inbound port is needed.
- MT5 auto-bot strategy is chosen by AUTO.strategy in src/lib/mt5-autobot.server.ts; SNIPER entries pass a fail-closed AI review, TURBO skips it by user choice for demo scalping — keeps strategy logic pure in src/lib and switchable.
- MT5 entries carry SL/TP distances ("pts:SL/TP" in comment, parsed by /pending) and the EA re-anchors them on the broker fill; CLOSE/BREAKEVEN with ticket 0 apply to all symbol positions; relay posts EA snapshot.json to /api/public/mt5/status — broker price is the only truth for execution.
- MT5 open positions are managed by the pure src/lib/mt5-manager.ts (break-even, half close, smart exit) from broker snapshot profit, one command per ticket per 2 min — broker numbers stay the truth and rules stay testable.
- MT5 TURBO entries use src/lib/smart-bracket.ts: user SL/TP points are maximums, real distances come from recent swings, ATR and the nearest level; poor reward skips the entry — keeps stops chart-based, not fixed. TURBO signals only trade with the EMA21/50 trend after a pullback to EMA9, and size up (max 0.02) only at full strength; chop filters (EMA gap, slope, ADX) and a daily circuit breaker (src/lib/circuit-breaker.ts, balances tagged on entries) gate entries — avoids counter-trend, chasing and loss streaks.
- TURBO self-learning lives in pure src/lib/turbo-learn.ts: today's real outcomes (bal: tags) pause a side after 2 straight losses and demand stronger signals on a poor win rate — adapts without changing the base strategy.
- MT5 runs two slots: one SWING (pure src/lib/swing.ts: 1H EMA50/200 trend + 15m BOS/EMA21 pullback, AI-approved, comment "auto SW") and one TURBO; swing positions (stop ≥3.5 pts) get their own management and EA trail — turbo rules would cut swings early.
- Circuit breaker only counts losses ≥ $1.5; the bot posts its stop reason to Telegram once per change (state kept in mt5_status id=2) — the user should never have to ask why it stopped.
- News window: block before/at release; max 2 AI-reviewed turbo trades after, via pure src/lib/news-window.ts (scheduled UTC times + live 1m spike) — keeps news rules testable.
- News gating uses only the fixed schedule and live 1m price spikes (src/lib/news-window.ts); channel text is not read — user wants decisions from price action only.
- MT5 TURBO entries come from the session engine (pure src/lib/session-engine.ts): UTC sessions, daily pivot bias on the last 5m close, Asia-range breakout at London open, flexible EMA9/21 pullback or micro-breakout; score sets lot (max 0.03, base while another trade is unsecured) and turbo break-even is session-aware — replaces the old turboSignal/smart-bracket gate for entries.
