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
- Background bot entries pass a Claude AI review (src/lib/ai-analyst.server.ts) after the indicator signal; it fails closed so AI errors never open trades — indicators find setups, AI vetoes weak ones.
