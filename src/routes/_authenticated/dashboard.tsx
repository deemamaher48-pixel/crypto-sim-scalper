import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Power, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLiveKlines } from "@/hooks/use-live-klines";
import { computeIndicators, entrySignal } from "@/lib/trading";
import { fmt, settingsQuery, tradesQuery } from "@/lib/queries";
import { closeTradeNow, runBotTick } from "@/functions/bot.functions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const PriceChart = lazy(() => import("@/components/PriceChart"));

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم — سكالبر" },
      { name: "description", content: "شارت BTC/USDT مباشر وحالة بوت السكالبينغ." },
      { property: "og:title", content: "لوحة التحكم — سكالبر" },
      { property: "og:description", content: "شارت BTC/USDT مباشر وحالة بوت السكالبينغ." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(settingsQuery),
      context.queryClient.ensureQueryData(tradesQuery),
    ]),
  component: Dashboard,
});

type TickLog = { at: Date; action: string; message: string };

function Dashboard() {
  const qc = useQueryClient();
  const { data: s } = useSuspenseQuery(settingsQuery);
  const { data: trades } = useSuspenseQuery(tradesQuery);
  const { klines, connected } = useLiveKlines(s.symbol, s.interval);
  const tick = useServerFn(runBotTick);
  const close = useServerFn(closeTradeNow);
  const [log, setLog] = useState<TickLog[]>([]);
  const busy = useRef(false);

  const open = trades.find((t) => t.status === "open");
  const price = klines.at(-1)?.close ?? 0;
  const prevClose = klines.at(-2)?.close ?? price;
  const ind = useMemo(
    () =>
      computeIndicators(klines.slice(0, -1).map((k) => k.close), {
        emaFast: s.ema_fast, emaSlow: s.ema_slow, rsiPeriod: s.rsi_period,
        rsiOverbought: Number(s.rsi_overbought), rsiOversold: Number(s.rsi_oversold),
      }),
    [klines.length, klines.at(-2)?.close, s],
  );
  const signal = ind
    ? entrySignal(ind, { emaFast: s.ema_fast, emaSlow: s.ema_slow, rsiPeriod: s.rsi_period, rsiOverbought: Number(s.rsi_overbought), rsiOversold: Number(s.rsi_oversold) })
    : null;

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase.from("bot_settings").update({ enabled }).eq("user_id", s.user_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });

  // The bot runs while this page is open: a server-side tick every 10s.
  useEffect(() => {
    if (!s.enabled && !open) return;
    const run = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const r = await tick();
        setLog((l) => [{ at: new Date(), action: r.action, message: r.message }, ...l].slice(0, 30));
        if (r.action === "buy" || r.action === "sell") {
          toast.success(r.message);
          qc.invalidateQueries();
        }
      } catch (e) {
        setLog((l) => [{ at: new Date(), action: "error", message: e instanceof Error ? e.message : "خطأ" }, ...l].slice(0, 30));
      } finally {
        busy.current = false;
      }
    };
    run();
    const id = setInterval(run, 10_000);
    return () => clearInterval(id);
  }, [s.enabled, !!open]);

  const today = new Date().toISOString().slice(0, 10);
  const closedToday = trades.filter((t) => t.status === "closed" && t.closed_at?.startsWith(today));
  const pnlToday = closedToday.reduce((a, t) => a + Number(t.pnl ?? 0), 0);
  const openPnl = open ? (price - Number(open.entry_price)) * Number(open.qty) : 0;
  const paper = s.mode !== "testnet";
  const equity = Number(s.paper_usdt) + Number(s.paper_btc) * price;
  const change = price - prevClose;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end gap-6 rounded-lg border bg-card p-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              BTC/USDT · {s.interval}
              <span className={`h-2 w-2 rounded-full ${connected ? "bg-bull" : "bg-bear"}`} />
              <span className="text-xs">{connected ? "سوق حقيقي مباشر" : "جارٍ الاتصال…"}</span>
            </div>
            <div className={`num text-3xl font-semibold ${change >= 0 ? "text-bull" : "text-bear"}`}>{fmt(price)}</div>
          </div>
          <Stat label={`EMA ${s.ema_fast}`} value={fmt(ind?.emaFast)} className="text-chart-1" />
          <Stat label={`EMA ${s.ema_slow}`} value={fmt(ind?.emaSlow)} className="text-chart-2" />
          <Stat
            label={`RSI ${s.rsi_period}`}
            value={fmt(ind?.rsi, 1)}
            className={ind && ind.rsi >= Number(s.rsi_overbought) ? "text-bear" : ind && ind.rsi <= Number(s.rsi_oversold) ? "text-bull" : ""}
          />
          <Stat label="الاتجاه" value={ind ? (ind.emaFast > ind.emaSlow ? "صاعد ▲" : "هابط ▼") : "—"} className={ind && ind.emaFast > ind.emaSlow ? "text-bull" : "text-bear"} />
        </div>
        <div className="rounded-lg border bg-card p-2">
          <Suspense fallback={<div className="h-[420px]" />}>
            <PriceChart
              klines={klines}
              emaFast={s.ema_fast}
              emaSlow={s.ema_slow}
              levels={open ? { entry: Number(open.entry_price), stop: Number(open.stop_price), target: Number(open.target_price) } : null}
            />
          </Suspense>
        </div>
        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-2 text-sm font-medium">سجل البوت اللحظي</div>
          <ul className="max-h-56 divide-y overflow-auto text-sm">
            {log.length === 0 && <li className="px-4 py-3 text-muted-foreground">شغّل البوت لترى قراراته هنا.</li>}
            {log.map((l, i) => (
              <li key={i} className="flex gap-3 px-4 py-2">
                <span className="num text-xs text-muted-foreground">{l.at.toLocaleTimeString("en-GB")}</span>
                <span className={l.action === "buy" ? "text-bull" : l.action === "sell" ? "text-primary" : l.action === "error" ? "text-bear" : ""}>{l.message}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold">
              <Power className={`h-4 w-4 ${s.enabled ? "text-bull" : "text-muted-foreground"}`} />
              البوت {s.enabled ? "يعمل" : "متوقف"}
            </div>
            <Switch checked={s.enabled} onCheckedChange={(v) => toggle.mutate(v)} aria-label="تشغيل البوت" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {paper ? "وضع المحاكاة: أسعار حقيقية ورصيد افتراضي." : "وضع Testnet: أوامر على Binance Testnet."} يعمل البوت على الخادم كل دقيقة حتى لو أغلقت الصفحة.
          </p>
          <div className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
            الإشارة الحالية:{" "}
            <span className={signal?.buy ? "text-bull font-medium" : "text-muted-foreground"}>{signal?.reason ?? "—"}</span>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center justify-between text-sm font-semibold">
            الرصيد {paper && <span className="rounded bg-primary/15 px-2 py-0.5 text-xs text-primary">افتراضي</span>}
          </div>
          {paper ? (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="USDT" value={fmt(s.paper_usdt)} />
              <Stat label="BTC" value={fmt(s.paper_btc, 5)} />
              <Stat label="القيمة الكلية" value={fmt(equity)} />
              <Stat label="ربح اليوم" value={fmt(pnlToday)} className={pnlToday >= 0 ? "text-bull" : "text-bear"} />
            </div>
          ) : (
            <Stat label="ربح اليوم" value={fmt(pnlToday)} className={pnlToday >= 0 ? "text-bull" : "text-bear"} />
          )}
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 text-sm font-semibold">الصفقة المفتوحة</div>
          {open ? (
            <div className="space-y-2 text-sm">
              <Row k="سعر الدخول" v={fmt(open.entry_price)} />
              <Row k="الكمية" v={fmt(open.qty, 5)} />
              <Row k="وقف الخسارة" v={fmt(open.stop_price)} cls="text-bear" />
              <Row k="جني الأرباح" v={fmt(open.target_price)} cls="text-bull" />
              <Row k="الربح غير المحقق" v={`${fmt(openPnl)} USDT`} cls={openPnl >= 0 ? "text-bull" : "text-bear"} />
              <Button
                variant="destructive"
                size="sm"
                className="mt-2 w-full"
                onClick={async () => {
                  try {
                    const r = await close({ data: { tradeId: open.id } });
                    toast.success(`أُغلقت الصفقة: ${fmt(r.pnl)} USDT`);
                    qc.invalidateQueries();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "تعذر الإغلاق");
                  }
                }}
              >
                <X className="h-4 w-4" /> إغلاق فوري
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد صفقة مفتوحة.</p>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4 text-sm">
          <div className="mb-2 font-semibold">قواعد المخاطر</div>
          <Row k="حجم الصفقة" v={`${fmt(s.position_usdt)} USDT`} />
          <Row k="وقف الخسارة" v={`${s.stop_loss_pct}%`} />
          <Row k="جني الأرباح" v={`${s.take_profit_pct}%`} />
          <Row k="صفقات اليوم" v={`${closedToday.length + (open ? 1 : 0)} / ${s.max_trades_per_day}`} />
          <Row k="حد الخسارة اليومي" v={`${fmt(s.max_daily_loss_usdt)} USDT`} />
          <Link to="/settings" className="mt-3 block text-xs text-primary hover:underline">تعديل الإعدادات</Link>
        </div>
      </aside>
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`num text-lg font-semibold ${className}`}>{value}</div>
    </div>
  );
}

function Row({ k, v, cls = "" }: { k: string; v: string; cls?: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-muted-foreground">{k}</span>
      <span className={`num ${cls}`}>{v}</span>
    </div>
  );
}
