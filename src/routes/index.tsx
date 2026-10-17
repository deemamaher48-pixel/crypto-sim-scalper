import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { Power, RotateCcw, X } from "lucide-react";
import { useLiveKlines } from "@/hooks/use-live-klines";
import { START_BALANCE, useLocalPaper, type LocalSettings } from "@/hooks/use-local-paper";
import { exitReasonLabel } from "@/lib/trading";
import { fmt } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const PriceChart = lazy(() => import("@/components/PriceChart"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "سكالبر — شارت BTC/USDT مباشر وبوت سكالبينغ" },
      { name: "description", content: "شارت BTC/USDT حقيقي لحظي مع بوت سكالبينغ آلي ورصيد محاكاة 10,000 USDT، بدون تسجيل." },
      { property: "og:title", content: "سكالبر — شارت BTC/USDT مباشر وبوت سكالبينغ" },
      { property: "og:description", content: "أسعار حقيقية لحظية، تداول افتراضي آلي بمؤشرات EMA و RSI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const riskFields: { key: keyof LocalSettings; label: string; min: number; max: number; step: number }[] = [
  { key: "positionUsdt", label: "حجم الصفقة USDT", min: 10, max: 100000, step: 10 },
  { key: "stopLossPct", label: "وقف الخسارة %", min: 0.05, max: 10, step: 0.05 },
  { key: "takeProfitPct", label: "جني الأرباح %", min: 0.05, max: 20, step: 0.05 },
  { key: "maxTradesPerDay", label: "أقصى صفقات/يوم", min: 1, max: 500, step: 1 },
  { key: "maxDailyLossUsdt", label: "حد الخسارة اليومي", min: 1, max: 100000, step: 1 },
  { key: "emaFast", label: "EMA سريع", min: 2, max: 100, step: 1 },
  { key: "emaSlow", label: "EMA بطيء", min: 3, max: 200, step: 1 },
  { key: "rsiPeriod", label: "فترة RSI", min: 2, max: 50, step: 1 },
];

function Home() {
  const { klines, connected } = useLiveKlines("BTCUSDT", "1m");
  const bot = useLocalPaper(klines);
  const { settings: s, ind, open, price } = bot;
  const change = price - (klines.at(-2)?.close ?? price);
  const equity = bot.usdt + bot.btc * price;
  const totalPnl = equity - START_BALANCE;
  const closed = bot.trades.filter((t) => t.closedAt);
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const openPnl = open ? (price - open.entry) * open.qty : 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <span className="text-lg font-bold">سكالبر<span className="text-primary">.</span></span>
          <span className="rounded bg-primary/15 px-2 py-0.5 text-xs text-primary">محاكاة · أسعار حقيقية</span>
          <Link to="/dashboard" className="ms-auto text-sm text-muted-foreground hover:text-foreground">
            وضع Testnet (تسجيل دخول)
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[1fr_340px]">
        <section className="space-y-4">
          <div className="flex flex-wrap items-end gap-6 rounded-lg border bg-card p-4">
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                BTC/USDT · 1m
                <span className={`h-2 w-2 rounded-full ${connected ? "bg-bull" : "bg-bear"}`} />
                <span className="text-xs">{connected ? "سوق Binance مباشر" : "جارٍ الاتصال…"}</span>
              </div>
              <h1 className={`num text-3xl font-semibold ${change >= 0 ? "text-bull" : "text-bear"}`}>{fmt(price)}</h1>
            </div>
            <Stat label={`EMA ${s.emaFast}`} value={fmt(ind?.emaFast)} cls="text-chart-1" />
            <Stat label={`EMA ${s.emaSlow}`} value={fmt(ind?.emaSlow)} cls="text-chart-2" />
            <Stat label={`RSI ${s.rsiPeriod}`} value={fmt(ind?.rsi, 1)} />
            <Stat label="الاتجاه" value={ind ? (ind.emaFast > ind.emaSlow ? "صاعد ▲" : "هابط ▼") : "—"} cls={ind && ind.emaFast > ind.emaSlow ? "text-bull" : "text-bear"} />
          </div>

          <div className="rounded-lg border bg-card p-2">
            <Suspense fallback={<div className="h-[420px]" />}>
              <PriceChart
                klines={klines}
                emaFast={s.emaFast}
                emaSlow={s.emaSlow}
                levels={open ? { entry: open.entry, stop: open.stop, target: open.target } : null}
              />
            </Suspense>
          </div>

          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-2 text-sm">
              <span className="font-medium">سجل الصفقات</span>
              <span className="text-xs text-muted-foreground">
                {closed.length} صفقة · نجاح {closed.length ? fmt((wins / closed.length) * 100, 0) : 0}%
              </span>
            </div>
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    {["الوقت", "الدخول", "الخروج", "الربح", "السبب"].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {bot.trades.map((t) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="num px-3 py-2 text-xs">{new Date(t.openedAt).toLocaleTimeString("en-GB")}</td>
                      <td className="num px-3 py-2">{fmt(t.entry)}</td>
                      <td className="num px-3 py-2">{fmt(t.exit)}</td>
                      <td className={`num px-3 py-2 ${t.pnl == null ? "" : t.pnl >= 0 ? "text-bull" : "text-bear"}`}>{t.closedAt ? fmt(t.pnl) : "مفتوحة"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{t.exitReason ? exitReasonLabel[t.exitReason] : t.entryReason}</td>
                    </tr>
                  ))}
                  {bot.trades.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">شغّل البوت لتبدأ الصفقات.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                <Power className={`h-4 w-4 ${bot.enabled ? "text-bull" : "text-muted-foreground"}`} />
                البوت {bot.enabled ? "يعمل" : "متوقف"}
              </div>
              <Switch checked={bot.enabled} onCheckedChange={bot.setEnabled} aria-label="تشغيل البوت" />
            </div>
            <div className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
              الحالة: <span className="text-muted-foreground">{bot.status}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">يتداول البوت طالما الصفحة مفتوحة، ويقرر عند إغلاق كل شمعة.</p>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center justify-between text-sm font-semibold">
              رصيد المحاكاة
              <button onClick={() => confirm("إعادة الرصيد إلى 10,000 USDT وحذف السجل؟") && bot.reset()} className="text-muted-foreground hover:text-foreground" aria-label="إعادة ضبط">
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="USDT" value={fmt(bot.usdt)} />
              <Stat label="BTC" value={fmt(bot.btc, 5)} />
              <Stat label="القيمة الكلية" value={fmt(equity)} />
              <Stat label="إجمالي الربح" value={fmt(totalPnl)} cls={totalPnl >= 0 ? "text-bull" : "text-bear"} />
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">الصفقة المفتوحة</div>
            {open ? (
              <div className="space-y-1 text-sm">
                <Row k="الدخول" v={fmt(open.entry)} />
                <Row k="وقف الخسارة" v={fmt(open.stop)} cls="text-bear" />
                <Row k="جني الأرباح" v={fmt(open.target)} cls="text-bull" />
                <Row k="غير محقق" v={`${fmt(openPnl)} USDT`} cls={openPnl >= 0 ? "text-bull" : "text-bear"} />
                <Button variant="destructive" size="sm" className="mt-2 w-full" onClick={bot.closeNow}>
                  <X className="h-4 w-4" /> إغلاق فوري
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">لا توجد صفقة مفتوحة.</p>
            )}
          </div>

          <RiskPanel settings={s} onSave={bot.updateSettings} />
        </aside>
      </main>
    </div>
  );
}

function RiskPanel({ settings, onSave }: { settings: LocalSettings; onSave: (p: Partial<LocalSettings>) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 text-sm font-semibold">إدارة المخاطر والمؤشرات</div>
      <div className="grid grid-cols-2 gap-2">
        {riskFields.map((f) => (
          <label key={f.key} className="text-xs text-muted-foreground">
            {f.label}
            <Input
              type="number" dir="ltr" className="num mt-1 h-8"
              min={f.min} max={f.max} step={f.step}
              value={draft[f.key] ?? String(settings[f.key])}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
              onBlur={() => {
                const v = Number(draft[f.key]);
                if (draft[f.key] != null && Number.isFinite(v) && v >= f.min && v <= f.max) onSave({ [f.key]: v });
                setDraft(({ [f.key]: _, ...rest }) => rest);
              }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`num text-lg font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function Row({ k, v, cls = "" }: { k: string; v: string; cls?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className={`num ${cls}`}>{v}</span>
    </div>
  );
}
