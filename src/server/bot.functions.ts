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

const PAPER_FEE = 0.001; // 0.1% like Binance spot

async function paperSell(userId: string, trade: TradeRow, price: number, reason: ExitReason) {
  const db = await admin();
  const qty = Number(trade.qty);
  const proceeds = qty * price * (1 - PAPER_FEE);
  const pnl = proceeds - Number(trade.entry_price) * qty;
  const { data: s } = await db.from("bot_settings").select("paper_usdt, paper_btc").eq("user_id", userId).single();
  await db
    .from("bot_settings")
    .update({ paper_usdt: Number(s!.paper_usdt) + proceeds, paper_btc: Math.max(0, Number(s!.paper_btc) - qty) })
    .eq("user_id", userId);
  await db
    .from("trades")
    .update({ status: "closed", exit_price: price, pnl, exit_reason: reason, closed_at: new Date().toISOString() })
    .eq("id", trade.id)
    .eq("user_id", userId);
  return { exitPrice: price, pnl };
}

export const runBotTick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => tickUser(context.userId));

/** One bot step for one user. Called by the open dashboard and by the background job. */
export async function tickUser(userId: string) {
    const { data: settings } = await (await admin()).from("bot_settings").select("*").eq("user_id", userId).maybeSingle();
    if (!settings) return { action: "idle" as const, message: "احفظ الإعدادات أولاً" };
    const paper = settings.mode !== "testnet";
    const creds = paper ? null : await loadCreds(userId);
    if (!paper && !creds) return { action: "idle" as const, message: "أضف مفاتيح Testnet من الإعدادات أو بدّل للمحاكاة" };

    const params: StrategyParams = {
      emaFast: settings.ema_fast,
      emaSlow: settings.ema_slow,
      rsiPeriod: settings.rsi_period,
      rsiOverbought: Number(settings.rsi_overbought),
      rsiOversold: Number(settings.rsi_oversold),
    };
    const klines = await fetchKlines(settings.symbol, settings.interval, 200, paper ? "live" : "testnet");
    const price = klines[klines.length - 1]!.close;
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
        const r = paper ? await paperSell(userId, open, price, reason) : await sellTrade(userId, creds!, open, reason);
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
    const freeUsdt = paper
      ? Number(settings.paper_usdt)
      : Number((await getBalances(creds!)).find((b) => b.asset === "USDT")?.free ?? 0);
    const gate = riskGate({
      hasOpenTrade: false,
      tradesToday: today?.length ?? 0,
      maxTradesPerDay: settings.max_trades_per_day,
      pnlToday: (today ?? []).reduce((s, t) => s + Number(t.pnl ?? 0), 0),
      maxDailyLossUsdt: Number(settings.max_daily_loss_usdt),
      positionUsdt: Number(settings.position_usdt),
      freeUsdt,
    });
    if (!gate.ok) return { action: "blocked" as const, price, ind, message: gate.reason };

    const size = Number(settings.position_usdt);
    let qty: number;
    let entry: number;
    if (paper) {
      qty = (size / price) * (1 - PAPER_FEE);
      entry = size / qty; // fee-inclusive cost basis
    } else {
      const order = await signedRequest<OrderResult>(creds!, "POST", "/api/v3/order", {
        symbol: settings.symbol,
        side: "BUY",
        type: "MARKET",
        quoteOrderQty: size.toFixed(2),
        newOrderRespType: "FULL",
      });
      const base = settings.symbol.replace(/USDT$/, "");
      const fee = (order.fills ?? [])
        .filter((f) => f.commissionAsset === base)
        .reduce((s, f) => s + Number(f.commission), 0);
      const execQty = Number(order.executedQty);
      entry = Number(order.cummulativeQuoteQty) / execQty;
      qty = execQty - fee;
    }
    const b = bracket(price, Number(settings.stop_loss_pct), Number(settings.take_profit_pct));
    const { error: insErr } = await db.from("trades").insert({
      user_id: userId,
      symbol: settings.symbol,
      mode: paper ? "paper" : "testnet",
      qty,
      entry_price: entry,
      stop_price: b.stop,
      target_price: b.target,
      entry_reason: sig.reason,
    });
    // Unique open-trade index rejects a duplicate when the page and background job tick together.
    if (insErr) return { action: "hold" as const, price, ind, message: "صفقة مفتوحة بالفعل" };
    if (paper)
      await db
        .from("bot_settings")
        .update({ paper_usdt: freeUsdt - size, paper_btc: Number(settings.paper_btc) + qty })
        .eq("user_id", userId);
    return { action: "buy" as const, price, ind, message: `شراء عند ${price.toFixed(2)} — ${sig.reason}` };
}

export const resetPaperAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    await db.from("trades").delete().eq("user_id", context.userId).eq("mode", "paper");
    await context.supabase
      .from("bot_settings")
      .update({ paper_usdt: 10000, paper_btc: 0, enabled: false })
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const closeTradeNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tradeId: string }) => ({ tradeId: String(i.tradeId) }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: trade } = await db
      .from("trades")
      .select("id, symbol, qty, entry_price, stop_price, target_price, mode")
      .eq("id", data.tradeId)
      .eq("user_id", context.userId)
      .eq("status", "open")
      .maybeSingle();
    if (!trade) throw new Error("الصفقة غير موجودة");
    if (trade.mode === "paper") {
      const k = await fetchKlines(trade.symbol, "1m", 1, "live");
      return paperSell(context.userId, trade, k[0]!.close, "manual");
    }
    const creds = await loadCreds(context.userId);
    if (!creds) throw new Error("أضف مفاتيح API أولاً");
    return sellTrade(context.userId, creds, trade, "manual");
  });
