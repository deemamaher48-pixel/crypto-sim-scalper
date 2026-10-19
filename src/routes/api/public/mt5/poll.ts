import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { bridgeDb, rateLimit, verifyBridge, withRequestLog } from "@/lib/mt5-bridge.server";

const Body = z.object({
  connected: z.boolean().optional(),
  balance: z.number().optional(),
  equity: z.number().optional(),
  free_margin: z.number().optional(),
  positions: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
}).passthrough();

async function handle(request: Request) {
  const limited = await rateLimit(request, "poll", 120, 60);
  if (limited) return limited;
  const denied = await verifyBridge(request);
  if (denied) return denied;
  let status: unknown = {};
  if (request.method === "POST") {
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });
    status = parsed.data;
  }
  const db = await bridgeDb();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await db.from("mt5_status").upsert({ id: 1, payload: status, updated_at: new Date().toISOString() });
  // Leases commands (status stays "leased" until /report). Expired unreported => "unknown", never retried.
  const { data, error } = await (supabaseAdmin as any).rpc("mt5_lease_commands", { p_lease_sec: 30, p_limit: 20 });
  if (error) return Response.json({ error: "lease_failed" }, { status: 500 });
  const commands = (data ?? []).map((c: any) => ({ command_id: c.id, action: c.action, symbol: c.symbol, lot: c.lot, sl: c.sl, tp: c.tp, ticket: c.ticket, comment: c.comment, ttl: c.ttl }));
  const { data: ctl } = await db.from("mt5_control").select("emergency_stop").eq("id", 1).maybeSingle();
  return Response.json({ commands, emergency_stop: ctl?.emergency_stop ?? true });
}

export const Route = createFileRoute("/api/public/mt5/poll")({
  server: { handlers: { POST: ({ request }) => withRequestLog("poll", request, () => handle(request)) } },
});
