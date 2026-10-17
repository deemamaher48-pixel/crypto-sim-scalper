import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Background bot: runs every enabled account's bot (or open trade) even when no page is open.
export const Route = createFileRoute("/api/public/jobs/bot-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { tickUser } = await import("@/functions/bot.functions");
        const [{ data: enabled }, { data: open }] = await Promise.all([
          supabaseAdmin.from("bot_settings").select("user_id").eq("enabled", true),
          supabaseAdmin.from("trades").select("user_id").eq("status", "open"),
        ]);
        const users = [...new Set([...(enabled ?? []), ...(open ?? [])].map((r) => r.user_id))];
        const results = await Promise.allSettled(users.map((u) => tickUser(u)));
        const failed = results.filter((r) => r.status === "rejected").length;
        return Response.json({ users: users.length, failed });
      },
    },
  },
});
