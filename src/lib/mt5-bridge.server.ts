// Shared helpers for the MT5 VPS bridge endpoints (server-only).

/** Safe per-request log: timestamp, duration, status, X-Request-ID. Never logs keys or bodies. */
export async function withRequestLog(endpoint: string, request: Request, fn: () => Promise<Response>): Promise<Response> {
  const arrived = new Date();
  const t0 = Date.now();
  const raw = request.headers.get("x-request-id") ?? "";
  const request_id = /^[A-Za-z0-9._-]{1,64}$/.test(raw) ? raw : raw ? "invalid" : null;
  let status = 500;
  try {
    const res = await fn();
    status = res.status;
    return res;
  } finally {
    console.log(JSON.stringify({ mt5_req: endpoint, arrived_at: arrived.toISOString(), duration_ms: Date.now() - t0, status, request_id }));
  }
}
async function sha(s: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

/** Returns a 401 Response when the caller lacks the bridge key, otherwise null. */
export async function verifyBridge(request: Request): Promise<Response | null> {
  const key = process.env["MT5_BRIDGE_API_KEY"];
  if (!key) return new Response("Bridge not configured", { status: 503 });
  const got = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const [a, b] = await Promise.all([sha(got), sha(key)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0 && got.length > 0 ? null : new Response("Unauthorized", { status: 401 });
}

export async function bridgeDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // mt5_* tables are server-only and not in generated types.
  return supabaseAdmin as unknown as { from: (t: string) => any };
}

/** Shared-storage rate limit (DB fixed window). Returns 429 Response when exceeded. */
export async function rateLimit(request: Request, name: string, max: number, windowSec: number): Promise<Response | null> {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc("mt5_rate_hit", { p_bucket: `${name}:${ip}`, p_max: max, p_window_sec: windowSec });
  if (error || data !== true) return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(windowSec) } });
  return null;
}
