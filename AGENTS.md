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
- Bot execution runs in authenticated server functions (src/server/bot.functions.ts), ticked from the open dashboard — workers are stateless, no in-memory bot state.
- Market data always comes from the live Binance public API; only orders/balances differ by mode (paper in DB, or Testnet) — user wants real prices with simulated trading.
- API credentials table has no client grants; only server functions read it via admin client — secrets never reach the browser.
