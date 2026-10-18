import { createFileRoute } from "@tanstack/react-router";
import { rateLimit, verifyBridge } from "@/lib/mt5-bridge.server";

// No command access, no logging. Only side effect: a rate-limit counter row.
export const Route = createFileRoute("/api/public/mt5/auth-check")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const limited = await rateLimit(request, "auth-check", 10, 60);
        if (limited) return limited;
        const denied = await verifyBridge(request);
        if (denied) {
          return denied.status === 401
            ? Response.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } })
            : denied;
        }
        return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
