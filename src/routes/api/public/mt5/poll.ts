import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { bridgeDb, verifyBridge } from "@/lib/mt5-bridge.server";

const Body = z.object({
  connected: z.boolean().optional(),
  balance: z.number().optional(),
  equity: z.number().optional(),
  free_margin: z.number().optional(),
  positions: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
}).passthrough();

async function handle(request: Request) {
  const denied = await verifyBridge(request);
  if (denied) return denied;
  let status: unknown = {};
  if (request.method === "POST") {
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });
    status = parsed.data;
  }
  const db = await bridgeDb();
  const now = new Date().toISOString();
  await db.from("mt5_status").upsert({ id: 1, payload: status, updated_at: now });
  const { data } = await db.from("mt5_commands").select("id,action,symbol,lot,sl,tp,ticket,comment")
    .eq("status", "pending").order("created_at").limit(20);
  const cmds = data ?? [];
  if (cmds.length) await db.from("mt5_commands").update({ status: "sent", updated_at: now }).in("id", cmds.map((c: { id: string }) => c.id));
  return Response.json({ commands: cmds, server_time: now });
}

export const Route = createFileRoute("/api/public/mt5/poll")({
  server: { handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) } },
});
