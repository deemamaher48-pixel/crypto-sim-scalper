import { createFileRoute } from "@tanstack/react-router";
import { bridgeDb, rateLimit, verifyBridge, withRequestLog } from "@/lib/mt5-bridge.server";
import { parsePts } from "@/lib/mt5-points";

// Simple v3 protocol: read-only list of pending commands. No lease, no state change —
// a hung GET can be retried safely. Relay dedupes by command_id and rejects expired ones.
export const Route = createFileRoute("/api/public/mt5/pending")({
  server: {
    handlers: {
      GET: ({ request }) => withRequestLog("pending", request, async () => {
        const limited = await rateLimit(request, "pending", 120, 60);
        if (limited) return limited;
        const denied = await verifyBridge(request);
        if (denied) return denied;
        const db = await bridgeDb();
        const now = new Date().toISOString();
        const { data: ctl } = await db.from("mt5_control").select("emergency_stop").eq("id", 1).maybeSingle();
        const emergency_stop = ctl?.emergency_stop ?? true;
        const { data, error } = await db.from("mt5_commands")
          .select("id,action,symbol,lot,sl,tp,ticket,comment,expires_at")
          .eq("status", "pending").gt("expires_at", now)
          .order("created_at", { ascending: true }).limit(20);
        if (error) return Response.json({ error: "read_failed" }, { status: 500 });
        const commands = (data ?? []).map((c: any) => {
          const p = parsePts(c.comment);
          return {
            command_id: c.id, action: c.action, symbol: c.symbol, lot: Number(c.lot),
            sl: c.sl == null ? null : Number(c.sl), tp: c.tp == null ? null : Number(c.tp),
            sl_pts: p.sl_pts, tp_pts: p.tp_pts,
            ticket: c.ticket ?? 0, comment: p.comment, expires_at: c.expires_at,
          };
        });
        return Response.json({ server_time: now, emergency_stop, commands });
      }),
    },
  },
});
