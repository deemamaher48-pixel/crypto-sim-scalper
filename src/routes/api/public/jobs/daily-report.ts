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
        const [{ data: done }, { data: st }] = await Promise.all([
          db.from("mt5_commands").select("action,comment").in("action", ["BUY", "SELL"]).eq("status", "executed").gte("created_at", day.toISOString()).order("created_at", { ascending: true }),
          db.from("mt5_status").select("payload").eq("id", 1).maybeSingle(),
        ]);
        const end = typeof (st?.payload as any)?.balance === "number" ? (st!.payload as any).balance as number : null;
        const rows = (done ?? []).map((r: any) => ({ side: (r.action === "BUY" ? "long" : "short") as "long" | "short", comment: String(r.comment ?? ""), bal: Number(/bal:(-?[\d.]+)/.exec(r.comment ?? "")?.[1]) }));
        const trades: ReportTrade[] = rows.map((r, i) => {
          const next = rows.slice(i + 1).find((x) => Number.isFinite(x.bal))?.bal ?? end;
          const pnl = Number.isFinite(r.bal) && next != null ? +(next - r.bal).toFixed(2) : 0;
          return { side: r.side, pnl, swing: r.comment.startsWith("auto SW"), manual: !r.comment.startsWith("auto") };
        });
        const start = rows.find((r) => Number.isFinite(r.bal))?.bal ?? end;
        const { notifyOwners } = await import("@/lib/mt5-telegram.server");
        await notifyOwners(dailyReport(trades, start, end));
        return Response.json({ ok: true, trades: trades.length });
      },
    },
  },
});
