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
- Pure trading logic (indicators, signals, risk) lives in src/lib/trading.ts with tests; server code imports it — keeps rules testable and shared with the UI.
- Bot execution runs in authenticated server functions (src/server/bot.functions.ts) — workers are stateless, no in-memory bot state.
- Chart and paper-mode prices come from the live Binance public API (Testnet mode decides on Testnet prices to match its fills); paper balances live in bot_settings — user wants real prices with simulated trading.
- API credentials table has no client grants; only server functions read it via admin client — secrets never reach the browser.
- Background bot: a managed schedule calls /api/public/jobs/bot-tick every minute, ticking every enabled account; a unique open-trade index prevents duplicate buys from overlapping ticks.
