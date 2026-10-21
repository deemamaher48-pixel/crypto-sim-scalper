import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { bridgeDb, rateLimit, verifyBridge, withRequestLog } from "@/lib/mt5-bridge.server";

const Body = z.object({
  command_id: z.string().uuid(),
  success: z.boolean(),
  ticket: z.number().int().nonnegative().optional(),
  price: z.number().optional(),
  error: z.string().max(500).optional(),
}).strict();

// Simple v3 protocol: record the final result once. Repeats return ok (idempotent).
export const Route = createFileRoute("/api/public/mt5/result")({
  server: {
    handlers: {
      POST: ({ request }) => withRequestLog("result", request, async () => {
        const limited = await rateLimit(request, "result", 120, 60);
        if (limited) return limited;
        const denied = await verifyBridge(request);
        if (denied) return denied;
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });
        const r = parsed.data;
        const db = await bridgeDb();
        const now = new Date().toISOString();
        const { data, error } = await db.from("mt5_commands")
          .update({ status: r.success ? "executed" : "failed", result: r, reported_at: now, updated_at: now })
          .eq("id", r.command_id).in("status", ["pending", "leased"]).select("id,action,ticket,comment");
        if (error) { console.error("result save", error); return Response.json({ error: "save_failed" }, { status: 500 }); }
        if (data?.length) {
          const c: any = data[0];
          // Confirm protective actions only once MT5 actually reports back.
          if (String(c.comment ?? "").startsWith("mgr ") || String(c.comment ?? "").startsWith("telegram ")) {
            const name: Record<string, string> = { CLOSE: "الإغلاق", CLOSE_PARTIAL: "الإغلاق الجزئي", BREAKEVEN: "التأمين" };
            if (name[c.action]) {
              const msg = r.success ? `✅ تم ${name[c.action]} فعليًا على MT5\n🎫 ${c.ticket || "كل الصفقات"}${r.price ? ` @ ${r.price}` : ""}`
                : `⚠️ فشل ${name[c.action]} على MT5\n🎫 ${c.ticket || "كل الصفقات"}\nالسبب: ${r.error ?? "غير معروف"}`;
              try { const { notifyOwners } = await import("@/lib/mt5-telegram.server"); await notifyOwners(msg); } catch (e) { console.error("notify", e); }
            }
          }
          return Response.json({ ok: true });
        }
        const { data: row } = await db.from("mt5_commands").select("status").eq("id", r.command_id).maybeSingle();
        if (!row) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
        return Response.json({ ok: true, already_final: true, status: row.status });
      }),
    },
  },
});
