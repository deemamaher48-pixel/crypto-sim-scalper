import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  fetchKlines,
  getBalances,
  getLotStep,
  signedRequest,
  type OrderResult,
} from "@/lib/binance";
import {
  bracket,
  computeIndicators,
  entrySignal,
  exitCheck,
  floorToStep,
  riskGate,
  type ExitReason,
  type StrategyParams,
} from "@/lib/trading";

type Creds = { apiKey: string; apiSecret: string };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadCreds(userId: string): Promise<Creds | null> {
  const db = await admin();
  const { data } = await db
    .from("api_credentials")
    .select("api_key, api_secret")
    .eq("user_id", userId)
    .maybeSingle();
  return data ? { apiKey: data.api_key, apiSecret: data.api_secret } : null;
}

export const getCredentialStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await loadCreds(context.userId);
    return { configured: !!c, keyHint: c ? `••••${c.apiKey.slice(-4)}` : null };
  });

export const saveCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { apiKey: string; apiSecret: string }) => {
    const apiKey = String(i.apiKey ?? "").trim();
    const apiSecret = String(i.apiSecret ?? "").trim();
    if (apiKey.length < 20 || apiSecret.length < 20 || apiKey.length > 200 || apiSecret.length > 200)
      throw new Error("المفاتيح غير صالحة");
    return { apiKey, apiSecret };
  })
  .handler(async ({ data, context }) => {
    // Verify the keys against Testnet before saving.
    await getBalances(data);
    const db = await admin();
    const { error } = await db.from("api_credentials").upsert({
      user_id: context.userId,
      api_key: data.apiKey,
      api_secret: data.apiSecret,
      testnet: true,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    await db.from("api_credentials").delete().eq("user_id", context.userId);
    await context.supabase.from("bot_settings").update({ enabled: false }).eq("user_id", context.userId);
    return { ok: true };
  });

export const getAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await loadCreds(context.userId);
    if (!c) return { configured: false as const, balances: [] };
    const balances = await getBalances(c);
    return {
      configured: true as const,
      balances: balances
        .filter((b) => ["USDT", "BTC"].includes(b.asset))
        .map((b) => ({ asset: b.asset, free: Number(b.free), locked: Number(b.locked) })),
    };
  });

type TradeRow = {
  id: string;
  symbol: string;
  qty: number;
  entry_price: number;
  stop_price: number;
  target_price: number;
};

async function sellTrade(userId: string, creds: Creds, trade: TradeRow, reason: ExitReason) {
  const db = await admin();
  const base = trade.symbol.replace(/USDT$/, "");
  const [step, balances] = await Promise.all([getLotStep(trade.symbol), getBalances(creds)]);
  const free = Number(balances.find((b) => b.asset === base)?.free ?? 0);
  const qty = floorToStep(Math.min(Number(trade.qty), free), step);
  if (qty <= 0) throw new Error("لا يوجد رصيد كافٍ لإغلاق الصفقة");
  const order = await signedRequest<OrderResult>(creds, "POST", "/api/v3/order", {
    symbol: trade.symbol,
    side: "SELL",
    type: "MARKET",
    quantity: qty,
    newOrderRespType: "FULL",
  });
  const execQty = Number(order.executedQty);
  const quote = Number(order.cummulativeQuoteQty);
  const exitPrice = execQty > 0 ? quote / execQty : 0;
  const pnl = quote - Number(trade.entry_price) * execQty;
  await db
    .from("trades")
    .update({
      status: "closed",
      exit_price: exitPrice,
      pnl,
      exit_reason: reason,
      closed_at: new Date().toISOString(),
    })
    .eq("id", trade.id)
    .eq("user_id", userId);
  return { exitPrice, pnl };
}

export const runBotTick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: settings } = await supabase
      .from("bot_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!settings) return { action: "idle" as const, message: "احفظ الإعدادات أولاً" };
    const creds = await loadCreds(userId);
    if (!creds) return { action: "idle" as const, message: "أضف مفاتيح API من الإعدادات" };

    const params: StrategyParams = {
      emaFast: settings.ema_fast,
      emaSlow: settings.ema_slow,
      rsiPeriod: settings.rsi_period,
      rsiOverbought: Number(settings.rsi_overbought),
      rsiOversold: Number(settings.rsi_oversold),
    };
    const klines = await fetchKlines(settings.symbol, settings.interval, 200);
    const price = klines[klines.length - 1].close;
    const closed = klines.slice(0, -1).map((k) => k.close); // signals use closed candles only
    const ind = computeIndicators(closed, params);

    const db = await admin();
    const { data: open } = await db
      .from("trades")
      .select("id, symbol, qty, entry_price, stop_price, target_price")
      .eq("user_id", userId)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();

    if (open) {
      const reason = exitCheck(price, open, ind);
      if (reason) {
        const r = await sellTrade(userId, creds, open, reason);
        return { action: "sell" as const, price, ind, message: `تم الإغلاق: ${r.pnl.toFixed(2)} USDT` };
      }
      return { action: "hold" as const, price, ind, message: "الصفقة مفتوحة — مراقبة الوقف والهدف" };
    }

    if (!settings.enabled) return { action: "idle" as const, price, ind, message: "البوت متوقف" };
    if (!ind) return { action: "idle" as const, price, ind, message: "بيانات غير كافية للمؤشرات" };

    const sig = entrySignal(ind, params);
    if (!sig.buy) return { action: "wait" as const, price, ind, message: sig.reason };

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { data: today } = await db
      .from("trades")
      .select("pnl")
      .eq("user_id", userId)
      .gte("opened_at", startOfDay.toISOString());
    const balances = await getBalances(creds);
    const gate = riskGate({
      hasOpenTrade: false,
      tradesToday: today?.length ?? 0,
      maxTradesPerDay: settings.max_trades_per_day,
      pnlToday: (today ?? []).reduce((s, t) => s + Number(t.pnl ?? 0), 0),
      maxDailyLossUsdt: Number(settings.max_daily_loss_usdt),
      positionUsdt: Number(settings.position_usdt),
      freeUsdt: Number(balances.find((b) => b.asset === "USDT")?.free ?? 0),
    });
    if (!gate.ok) return { action: "blocked" as const, price, ind, message: gate.reason };

    const order = await signedRequest<OrderResult>(creds, "POST", "/api/v3/order", {
      symbol: settings.symbol,
      side: "BUY",
      type: "MARKET",
      quoteOrderQty: Number(settings.position_usdt).toFixed(2),
      newOrderRespType: "FULL",
    });
    const base = settings.symbol.replace(/USDT$/, "");
    const fee = (order.fills ?? [])
      .filter((f) => f.commissionAsset === base)
      .reduce((s, f) => s + Number(f.commission), 0);
    const execQty = Number(order.executedQty);
    const entry = Number(order.cummulativeQuoteQty) / execQty;
    const b = bracket(entry, Number(settings.stop_loss_pct), Number(settings.take_profit_pct));
    await db.from("trades").insert({
      user_id: userId,
      symbol: settings.symbol,
      qty: execQty - fee,
      entry_price: entry,
      stop_price: b.stop,
      target_price: b.target,
      entry_reason: sig.reason,
    });
    return { action: "buy" as const, price, ind, message: `شراء عند ${entry.toFixed(2)} — ${sig.reason}` };
  });

export const closeTradeNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tradeId: string }) => ({ tradeId: String(i.tradeId) }))
  .handler(async ({ data, context }) => {
    const creds = await loadCreds(context.userId);
    if (!creds) throw new Error("أضف مفاتيح API أولاً");
    const db = await admin();
    const { data: trade } = await db
      .from("trades")
      .select("id, symbol, qty, entry_price, stop_price, target_price")
      .eq("id", data.tradeId)
      .eq("user_id", context.userId)
      .eq("status", "open")
      .maybeSingle();
    if (!trade) throw new Error("الصفقة غير موجودة");
    return sellTrade(context.userId, creds, trade, "manual");
  });
