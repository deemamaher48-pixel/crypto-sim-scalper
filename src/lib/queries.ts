import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Settings = Tables<"bot_settings">;
export type Trade = Tables<"trades">;

export const DEFAULT_SETTINGS: Omit<Settings, "user_id" | "updated_at"> = {
  symbol: "BTCUSDT",
  interval: "1m",
  ema_fast: 9,
  ema_slow: 21,
  rsi_period: 14,
  rsi_overbought: 70,
  rsi_oversold: 30,
  stop_loss_pct: 0.5,
  take_profit_pct: 1,
  position_usdt: 50,
  max_trades_per_day: 20,
  max_daily_loss_usdt: 25,
  enabled: false,
  mode: "paper",
  paper_usdt: 10000,
  paper_btc: 0,
};

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data } = await supabase.from("bot_settings").select("*").maybeSingle();
    if (data) return data;
    const { data: created, error } = await supabase
      .from("bot_settings")
      .insert({ user_id: u.user!.id, ...DEFAULT_SETTINGS })
      .select("*")
      .single();
    if (error) throw error;
    return created;
  },
});

export const tradesQuery = queryOptions({
  queryKey: ["trades"],
  queryFn: async () => {
    const trades: Trade[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("trades")
        .select("*")
        .order("opened_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      trades.push(...data);
      if (data.length < pageSize) return trades;
    }
  },
});

export function fmt(n: number | null | undefined, d = 2) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Signed money: +1.23 for profit, -1.23 for loss. */
export function fmtSigned(n: number | null | undefined, d = 2) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  return (v > 0 ? "+" : "") + fmt(v, d);
}
