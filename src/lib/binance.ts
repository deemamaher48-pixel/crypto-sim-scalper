// Binance Spot Testnet REST helpers (server-side use; signing via Web Crypto, workerd-safe).
export const TESTNET_REST = "https://testnet.binance.vision";
export const TESTNET_WS = "wss://stream.testnet.binance.vision/ws";
// Real live market data (public, no keys).
export const LIVE_REST = "https://data-api.binance.vision";
export const LIVE_WS = "wss://data-stream.binance.vision/ws";

export type Kline = { time: number; open: number; high: number; low: number; close: number; volume: number };

export async function fetchKlines(
  symbol: string,
  interval: string,
  limit = 200,
  source: "live" | "testnet" = "live",
): Promise<Kline[]> {
  const base = source === "live" ? LIVE_REST : TESTNET_REST;
  const res = await fetch(`${base}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  if (!res.ok) throw new Error(`تعذر جلب الشموع (${res.status})`);
  const rows = (await res.json()) as unknown[][];
  return rows.map((r) => ({
    time: Math.floor(Number(r[0]) / 1000),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
  }));
}

async function hmac(secret: string, msg: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function signedRequest<T>(
  creds: { apiKey: string; apiSecret: string },
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const qs = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    recvWindow: "10000",
    timestamp: String(Date.now()),
  }).toString();
  const signature = await hmac(creds.apiSecret, qs);
  const res = await fetch(`${TESTNET_REST}${path}?${qs}&signature=${signature}`, {
    method,
    headers: { "X-MBX-APIKEY": creds.apiKey },
  });
  const body = (await res.json().catch(() => ({}))) as { msg?: string; code?: number };
  if (!res.ok) throw new Error(`Binance: ${body.msg ?? res.status}`);
  return body as T;
}

export type Balance = { asset: string; free: string; locked: string };
export async function getBalances(creds: { apiKey: string; apiSecret: string }) {
  const acc = await signedRequest<{ balances: Balance[] }>(creds, "GET", "/api/v3/account", {
    omitZeroBalances: "true",
  });
  return acc.balances;
}

export async function getLotStep(symbol: string): Promise<number> {
  const res = await fetch(`${TESTNET_REST}/api/v3/exchangeInfo?symbol=${symbol}`);
  const info = (await res.json()) as {
    symbols?: { filters: { filterType: string; stepSize?: string }[] }[];
  };
  const step = info.symbols?.[0]?.filters.find((f) => f.filterType === "LOT_SIZE")?.stepSize;
  return step ? Number(step) : 0.00001;
}

export type OrderResult = {
  orderId: number;
  executedQty: string;
  cummulativeQuoteQty: string;
  fills?: { qty: string; commission: string; commissionAsset: string }[];
};
