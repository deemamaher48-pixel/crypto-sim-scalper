import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { buildReportTrades, dailyReport, type BrokerDeal } from "@/lib/daily-report";

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
          db.from("mt5_commands").select("action,comment,ticket,result").eq("status", "executed").gte("created_at", day.toISOString()).order("created_at", { ascending: true }),
          db.from("mt5_status").select("payload").eq("id", 1).maybeSingle(),
        ]);
        const p = (st?.payload ?? {}) as any;
        const end = typeof p.balance === "number" ? p.balance as number : null;
        const cmds = ((all ?? []) as any[]).map((r) => ({ action: r.action, comment: r.comment, ticket: Number(r.result?.ticket ?? r.ticket) || 0 }));
        const deals = Array.isArray(p.deals) ? p.deals as BrokerDeal[] : null;
        const { trades, start, exact } = buildReportTrades(cmds, deals, end);
        const { notifyOwners } = await import("@/lib/mt5-telegram.server");
        await notifyOwners(dailyReport(trades, start, end) + (exact ? "\n✅ أرباح الصفقات من MT5 مباشرة" : "\nℹ️ أرباح الصفقات تقديرية (حدّثوا الإكسبيرت للأرقام الدقيقة)"));
        return Response.json({ ok: true, trades: trades.length });
      },
    },
  },
});
