import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { bridgeDb, rateLimit, verifyBridge, withRequestLog } from "@/lib/mt5-bridge.server";

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
        await db.from("mt5_status").upsert({ id: 1, payload: parsed.data, updated_at: new Date().toISOString() });
        return Response.json({ ok: true });
      }),
    },
  },
});
