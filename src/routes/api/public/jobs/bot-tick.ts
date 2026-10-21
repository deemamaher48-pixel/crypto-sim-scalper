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
        const { tickBackgroundUser } = await import("@/functions/background.functions");
        const { data: services, error: serviceError } = await supabaseAdmin.from("paper_services").select("user_id,enabled,state");
        if (serviceError) throw serviceError;
        const [{ data: enabled }, { data: open }] = await Promise.all([
          supabaseAdmin.from("bot_settings").select("user_id").eq("enabled", true),
          supabaseAdmin.from("trades").select("user_id").eq("status", "open"),
        ]);
        const managed = new Set((services ?? []).map(s => s.user_id));
        const users = [...new Set([...(enabled ?? []), ...(open ?? [])].map((r) => r.user_id))].filter(u => !managed.has(u));
        const active = (services ?? []).filter(s => s.enabled || (s.state as { trades?: { closedAt?: string }[] }).trades?.some(t => !t.closedAt));
        const { mt5AutoTick } = await import("@/lib/mt5-autobot.server");
        const tasks = [...users.map(u => () => tickUser(u)), ...active.map(s => () => tickBackgroundUser(s.user_id)), () => mt5AutoTick()];
        const results: PromiseSettledResult<unknown>[] = [];
        for (const task of tasks) results.push(...await Promise.allSettled([task()]));
        const { trackLoop } = await import("@/lib/mt5-manager.server");
        await trackLoop(supabaseAdmin).catch(e => console.error("trackLoop", e));
        const failed = results.filter((r) => r.status === "rejected").length;
        return Response.json({ users: tasks.length, failed });
      },
    },
  },
});
