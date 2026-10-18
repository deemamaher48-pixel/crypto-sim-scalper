import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { bridgeDb, verifyBridge } from "@/lib/mt5-bridge.server";

const Body = z.object({
  id: z.string().uuid(),
  success: z.boolean(),
  ticket: z.number().optional(),
  price: z.number().optional(),
  error: z.string().max(500).optional(),
}).passthrough();

export const Route = createFileRoute("/api/public/mt5/report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await verifyBridge(request);
        if (denied) return denied;
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });
        const r = parsed.data;
        const db = await bridgeDb();
        await db.from("mt5_commands").update({ status: r.success ? "done" : "failed", result: r, updated_at: new Date().toISOString() }).eq("id", r.id);
        return Response.json({ ok: true });
      },
    },
  },
});
