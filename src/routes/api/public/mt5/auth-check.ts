import { createFileRoute } from "@tanstack/react-router";
import { verifyBridge } from "@/lib/mt5-bridge.server";

// Side-effect free: only validates the bridge Bearer key (constant-time). No DB access, no logging.
export const Route = createFileRoute("/api/public/mt5/auth-check")({
  server: {
    handlers: {
      GET: async ({ request }) => {
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
