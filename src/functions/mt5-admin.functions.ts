import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Admin-only emergency stop. When on, /poll issues only CLOSE / CLOSE_PARTIAL / BREAKEVEN.
export const setEmergencyStop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ stop: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("mt5_control")
      .update({ emergency_stop: data.stop, updated_by: context.userId, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error("Update failed");
    return { emergency_stop: data.stop };
  });
