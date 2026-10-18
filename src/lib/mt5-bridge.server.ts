// Shared helpers for the MT5 VPS bridge endpoints (server-only).
async function sha(s: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

/** Returns a 401 Response when the caller lacks the bridge key, otherwise null. */
export async function verifyBridge(request: Request): Promise<Response | null> {
  const key = process.env.MT5_BRIDGE_API_KEY;
  if (!key) return new Response("Bridge not configured", { status: 503 });
  const got = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const [a, b] = await Promise.all([sha(got), sha(key)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0 && got.length > 0 ? null : new Response("Unauthorized", { status: 401 });
}

export async function bridgeDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // mt5_* tables are server-only and not in generated types.
  return supabaseAdmin as unknown as { from: (t: string) => any };
}
