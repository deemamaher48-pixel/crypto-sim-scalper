import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { dailyReport, type ReportTrade } from "@/lib/daily-report";

// Nightly Telegram summary (scheduled 21:00 UTC = midnight Damascus).
export const Route = createFileRoute("/api/public/jobs/daily-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const day = new Date(); day.setUTCHours(0, 0, 0, 0);
        const [{ data: all }, { data: st }] = await Promise.all([
          db.from("mt5_commands").select("action,comment").eq("status", "executed").gte("created_at", day.toISOString()).order("created_at", { ascending: true }),
          db.from("mt5_status").select("payload").eq("id", 1).maybeSingle(),
        ]);
        const end = typeof (st?.payload as any)?.balance === "number" ? (st!.payload as any).balance as number : null;
        const rows: { side: "long" | "short"; comment: string; bal: number; exits: string[] }[] = [];
        for (const r of (all ?? []) as any[]) {
          const c = String(r.comment ?? "");
          if (r.action === "BUY" || r.action === "SELL") rows.push({ side: r.action === "BUY" ? "long" : "short", comment: c, bal: Number(/bal:(-?[\d.]+)/.exec(c)?.[1]), exits: [] });
          else if (rows.length && c.startsWith("mgr")) {
            const why = c.split(" ")[3] ?? r.action;
            rows[rows.length - 1].exits.push(r.action === "BREAKEVEN" ? "BREAKEVEN" : why);
          }
        }
        const { entryReason } = await import("@/lib/daily-report");
        const trades: ReportTrade[] = rows.map((r, i) => {
          const next = rows.slice(i + 1).find((x) => Number.isFinite(x.bal))?.bal ?? end;
          const pnl = Number.isFinite(r.bal) && next != null ? +(next - r.bal).toFixed(2) : 0;
          return { side: r.side, pnl, swing: r.comment.startsWith("auto SW"), manual: !r.comment.startsWith("auto"), entry: entryReason(r.comment), exits: [...new Set(r.exits)] };
        });
        const start = rows.find((r) => Number.isFinite(r.bal))?.bal ?? end;
        const { notifyOwners } = await import("@/lib/mt5-telegram.server");
        await notifyOwners(dailyReport(trades, start, end));
        return Response.json({ ok: true, trades: trades.length });
      },
    },
  },
});
