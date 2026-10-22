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
- Trade history is never truncated on insert; account reads paginate until exhausted, and src/lib/trade-history.ts shares outcome presentation.
- Pure trading logic (indicators, signals, risk) lives in src/lib/trading.ts with tests; server code imports it.
- Bot execution runs in authenticated server functions (src/functions/bot.functions.ts) — workers are stateless, no in-memory bot state.
- Chart and paper-mode prices come from the live Binance public API (Testnet mode decides on Testnet prices to match its fills); paper balances live in bot_settings — user wants real prices with simulated trading.
- API credentials table has no client grants; only server functions read it via admin client — secrets never reach the browser.
- Background bot: a managed schedule calls /api/public/jobs/bot-tick every minute, ticking every enabled account; a unique open-trade index prevents duplicate buys from overlapping ticks.
- Home uses the local paper engine only for guests; authenticated home uses durable paper_services state and the shared background-paper pure engine, with leased transactional state/history commits — closed tabs cannot stop trading or double-book balances.
- A paper_services account is excluded from legacy bot ticks; permanent account trade history is never deleted by a balance reset — avoids competing engines and keeps absence records intact.
- Shared PriceChart preserves the visible time range on price updates and separates drag-to-pan from explicit zoom controls — prevents live updates and gestures from unexpectedly changing zoom.
- MT5 VPS bridge: VPS polls /api/public/mt5/poll, posts /report (bearer key); commands queue in server-only mt5_commands — no inbound port.
- MT5 auto-bot strategy is chosen by AUTO.strategy in src/lib/mt5-autobot.server.ts; SNIPER entries pass a fail-closed AI review, TURBO skips it by user choice for demo scalping — keeps strategy logic pure in src/lib and switchable.
- MT5 entries carry SL/TP distances ("pts:SL/TP" in comment, parsed by /pending) and the EA re-anchors them on the broker fill; CLOSE/BREAKEVEN with ticket 0 apply to all symbol positions; relay posts EA snapshot.json to /api/public/mt5/status — broker price is the only truth for execution.
- MT5 open positions are managed by the pure src/lib/mt5-manager.ts (break-even, half close, smart exit) from broker snapshot profit, one command per ticket per 2 min — broker numbers stay the truth and rules stay testable.
- MT5 TURBO entries use src/lib/smart-bracket.ts: user SL/TP points are maximums, real distances come from recent swings, ATR and the nearest level; poor reward skips the entry — keeps stops chart-based, not fixed. TURBO signals only trade with the EMA21/50 trend after a pullback to EMA9, and size up (max 0.02) only at full strength; chop filters (EMA gap, slope, ADX) and a daily circuit breaker (src/lib/circuit-breaker.ts, balances tagged on entries) gate entries — avoids counter-trend, chasing and loss streaks.
- TURBO self-learning lives in pure src/lib/turbo-learn.ts: today's real bot outcomes (bal: tags) pause a side after 2 straight losses and demand stronger signals on a poor win rate; manual/Telegram trades (non-"auto" comments) and bot trades overlapping them are excluded from learning, the breaker and the heavy gate — user tests must not teach the bot.
- MT5 runs two slots: one SWING (pure src/lib/swing.ts: 1H EMA50/200 trend + 15m BOS/EMA21 pullback, AI-approved, comment "auto SW") and one TURBO; swing positions (stop ≥3.5 pts) get their own management and EA trail — turbo rules would cut swings early.
- Circuit breaker counts losses ≥ $1.5; stop reason posts to Telegram once per change (mt5_status id=2) — user always knows why.
- news-window.ts is off in mt5-autobot (NEWS_GUARD=false, user choice).
- TURBO 5m-structure (m5-structure.ts) and 1H/4H (htf-gate.ts) gates apply only after a stop loss or against firm opposite 5m momentum (pure src/lib/heavy-gate.ts) — user rule: no permanent freeze.
- MT5 TURBO entries come from the session engine (pure src/lib/session-engine.ts): UTC sessions, direction from the 1m EMA21/50 trend (daily pivot no longer gates turbo, user choice; swing still uses it), Asia-range breakout at London open, flexible EMA9/21 pullback or micro-breakout; score sets lot (max 0.03, base while another trade is unsecured) and turbo break-even is session-aware — replaces the old turboSignal/smart-bracket gate for entries.
- MT5 TURBO reversal engine (pure src/lib/reversal.ts): when the normal turbo entry is blocked, a firm 5m candle not opposed by 1H opens a quick scalp, plus a firm 15m body not opposed by 4H a stronger one — lets the bot flip after a stop instead of idling; skips extreme 5m RSI (<25 sell, >75 buy) only.
- Nightly Telegram report: pure daily-report.ts via /api/public/jobs/daily-report (21:00 UTC).
- Nightly report P&L per trade uses EA snapshot "deals" (broker net per ticket, pure buildReportTrades), else balance-diff estimate — broker is truth.
