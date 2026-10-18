import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { rateLimit, verifyBridge } from "@/lib/mt5-bridge.server";

const Body = z.object({
  command_id: z.string().uuid(),
  success: z.boolean(),
  ticket: z.number().optional(),
  price: z.number().optional(),
  error: z.string().max(500).optional(),
}).strict();

export const Route = createFileRoute("/api/public/mt5/report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = await rateLimit(request, "report", 120, 60);
        if (limited) return limited;
        const denied = await verifyBridge(request);
        if (denied) return denied;
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });
        const r = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin as any).rpc("mt5_report_command", { p_id: r.command_id, p_success: r.success, p_result: r });
        if (error) return Response.json({ error: "report_failed" }, { status: 500 });
        // Only leased, non-final commands accept a report; duplicates/unknown/expired are rejected.
        if (data !== "ok") return Response.json({ ok: false, error: "not_leased_or_duplicate" }, { status: 409 });
        return Response.json({ ok: true });
      },
    },
  },
});
