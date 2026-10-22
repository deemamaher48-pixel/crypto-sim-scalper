import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { bridgeDb, rateLimit, verifyBridge, withRequestLog } from "@/lib/mt5-bridge.server";
import { closedTrades } from "@/lib/closed-trades";
import { notifyOwners } from "@/lib/mt5-telegram.server";

// Simple v3: relay posts the EA's account snapshot here (balance + open positions). Status only, never leases commands.
const Body = z.object({
  connected: z.boolean().optional(),
  balance: z.number().optional(),
  equity: z.number().optional(),
  free_margin: z.number().optional(),
  positions: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
}).passthrough();

export const Route = createFileRoute("/api/public/mt5/status")({
  server: {
    handlers: {
      POST: ({ request }) => withRequestLog("status", request, async () => {
        const limited = await rateLimit(request, "status", 60, 60);
        if (limited) return limited;
        const denied = await verifyBridge(request);
        if (denied) return denied;
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });
        const db = await bridgeDb();
        const { data: prev } = await db.from("mt5_status").select("payload").eq("id", 1).maybeSingle();
        await db.from("mt5_status").upsert({ id: 1, payload: parsed.data, updated_at: new Date().toISOString() });
        if (parsed.data.connected !== false && Array.isArray(parsed.data.positions)) {
          const msgs = closedTrades(prev?.payload as any, parsed.data as any);
          for (const m of msgs) { try { await notifyOwners(m); } catch (e) { console.error("close notify", e); } }
        }
        return Response.json({ ok: true });
      }),
    },
  },
});
