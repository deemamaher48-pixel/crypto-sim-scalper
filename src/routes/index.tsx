import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBackgroundPaper } from "@/hooks/use-background-paper";
import { Power, RotateCcw, X, TrendingUp, TrendingDown } from "lucide-react";
import { useLiveKlines } from "@/hooks/use-live-klines";
import { START_BALANCE, useLocalPaper, type LocalSettings } from "@/hooks/use-local-paper";
import { tradeOutcome } from "@/lib/trade-history";
import { fmt, fmtSigned } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import TradingViewChart from "@/components/TradingViewChart";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "سكالبر — بوت بيتكوين وذهب وسجل تداول دائم" },
      { name: "description", content: "محاكاة تداول بيتكوين والذهب مع بوت خلفي للحساب المسجل وسجل دائم لأوقات الصفقات." },
      { property: "og:title", content: "سكالبر — بوت بيتكوين وذهب وسجل تداول دائم" },
      { property: "og:description", content: "بوت خلفي للحساب المسجل وسجل دائم لأوقات الصفقات بأسعار السوق الحية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const riskFields: { key: keyof LocalSettings; label: string; min: number; max: number; step: number }[] = [
  { key: "positionUsdt", label: "حجم الصفقة USDT", min: 10, max: 100000, step: 10 },
  { key: "maxTradesPerDay", label: "أقصى صفقات/يوم", min: 1, max: 500, step: 1 },
  { key: "maxDailyLossUsdt", label: "حد الخسارة اليومي", min: 1, max: 100000, step: 1 },
];

function Home() {
  const identity = useQuery({queryKey:["home-identity"],queryFn:async()=>{const {data,error}=await supabase.auth.getUser();if(error)return null;return data.user;}});
  const [sym, setSym] = useState<"BTCUSDT" | "PAXGUSDT">("BTCUSDT");
  const gold = sym === "PAXGUSDT";
  const { klines, connected } = useLiveKlines(sym, "5m");
  const { klines: k15 } = useLiveKlines(sym, "15m");
  const { klines: k1 } = useLiveKlines(sym, "1m");
  const local = useLocalPaper(klines, k15, gold, k1, !identity.isPending && !identity.data);
  const background = useBackgroundPaper(identity.data?.id, local, klines, k15, k1);
  const bot = background.bot;
  useEffect(()=>{if(background.symbol)setSym(background.symbol);},[background.symbol]);
  const chartK = bot.sniper ? k1 : klines;
  const { settings: s, ind, extras, open, price } = bot;
  const change = price - (chartK.at(-2)?.close ?? price);
  const equity = bot.equity;
  const totalPnl = equity - START_BALANCE;
  const closed = bot.trades.filter((t) => t.closedAt);
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const openPnl = bot.unrealized;
  const movePnl = open && price ? (open.side === "short" ? -1 : 1) * (price - open.entry) * (open.remainingQty ?? open.qty) : 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <span className="text-lg font-bold">سكالبر<span className="text-primary">.</span></span>
          <span className="rounded bg-primary/15 px-2 py-0.5 text-xs text-primary">محاكاة · أسعار حقيقية</span>
          <Link to="/dashboard" className="ms-auto text-sm text-muted-foreground hover:text-foreground">
            حسابي وسجل الصفقات
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[1fr_340px]">
        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end gap-6 rounded-lg border bg-card p-4">
            <div>
              <div className="mb-2 flex gap-1">
                {([["BTCUSDT", "بيتكوين BTC/USDT"], ["PAXGUSDT", "ذهب XAU/USD"]] as const).map(([v, l]) => (
                  <Button key={v} size="sm" variant={sym === v ? "default" : "outline"} disabled={!!open && sym !== v}
                    title={open && sym !== v ? "سكّر الصفقة المفتوحة قبل التبديل" : undefined}
                    onClick={() => background.cloud ? background.setSymbol(v) : setSym(v)}>{l}</Button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {gold ? "الذهب XAU/USD" : "BTC/USDT"} · {bot.sniper ? "1m (فلتر 5m)" : "5m (فلتر 15m)"}
                <span className={`h-2 w-2 rounded-full ${connected ? "bg-bull" : "bg-bear"}`} />
                <span className="text-xs">{connected ? "سوق Binance مباشر" : "جارٍ الاتصال…"}</span>
              </div>
              <h1 className={`num text-3xl font-semibold ${change >= 0 ? "text-bull" : "text-bear"}`}>{fmt(price)}</h1>
            </div>
            <Stat label={`EMA ${s.emaFast}`} value={fmt(ind?.emaFast)} cls="text-chart-1" />
            <Stat label={`EMA ${s.emaSlow}`} value={fmt(ind?.emaSlow)} cls="text-chart-2" />
            <Stat label="RSI 9" value={fmt(ind?.rsi, 1)} />
            <Stat label="MACD هيستوغرام" value={fmt(extras?.hist)} cls={extras && extras.hist >= 0 ? "text-bull" : "text-bear"} />
            <Stat label="ATR 14" value={fmt(extras?.atr)} />
            <Stat label="الاتجاه" value={ind ? (ind.emaFast > ind.emaSlow ? "صاعد ▲" : "هابط ▼") : "—"} cls={ind && ind.emaFast > ind.emaSlow ? "text-bull" : "text-bear"} />
          </div>

          <div className="rounded-lg border bg-card p-2">
            <TradingViewChart
              symbol={gold ? "OANDA:XAUUSD" : "BINANCE:BTCUSDT"}
              interval={bot.sniper ? "1" : "5"}
            />
          </div>

          <ScorePanel sig={bot.signal} />
          <IndicatorsPanel x={extras} />

          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-2 text-sm">
              <span className="font-medium">سجل الصفقات</span>
              <span className="text-xs text-muted-foreground">
                {bot.trades.length} صفقة · نجاح {closed.length ? fmt((wins / closed.length) * 100, 0) : 0}%
              </span>
            </div>
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    {["وقت الدخول", "وقت الإغلاق", "الاتجاه", "الدخول", "الخروج", "صافي الربح", "النتيجة"].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {bot.trades.map((t) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="num whitespace-nowrap px-3 py-2 text-xs">{new Date(t.openedAt).toLocaleString("en-GB")}</td>
                      <td className="num whitespace-nowrap px-3 py-2 text-xs">{t.closedAt ? new Date(t.closedAt).toLocaleString("en-GB") : "—"}</td>
                      <td className="px-3 py-2"><SideTag side={t.side} /></td>
                      <td className="num px-3 py-2">{fmt(t.entry)}</td>
                      <td className="num px-3 py-2">{fmt(t.exit)}</td>
                      <td className={`num px-3 py-2 font-semibold ${t.pnl == null || t.pnl === 0 ? "text-muted-foreground" : t.pnl > 0 ? "text-bull" : "text-bear"}`}>{t.closedAt ? `${(t.pnl ?? 0) > 0 ? "+" : ""}${fmt(t.pnl)}` : "مفتوحة"}</td>
                      <td className={`whitespace-nowrap px-3 py-2 text-xs ${t.pnl == null || t.pnl === 0 ? "text-muted-foreground" : t.pnl > 0 ? "text-bull" : "text-bear"}`}>{t.closedAt ? tradeOutcome(t.pnl ?? 0) : "مفتوحة"}</td>
                    </tr>
                  ))}
                  {bot.trades.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">شغّل البوت لتبدأ الصفقات.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <aside className="min-w-0 space-y-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                <Power className={`h-4 w-4 ${bot.enabled ? "text-bull" : "text-muted-foreground"}`} />
                البوت {bot.enabled ? "يعمل" : "متوقف"}
              </div>
              <Switch checked={bot.enabled} disabled={background.busy || identity.isPending} onCheckedChange={bot.setEnabled} aria-label="تشغيل البوت" />
            </div>
            <StatusBadge tone={bot.status.tone} text={bot.status.text} />
            <Button
              size="sm" variant={bot.sniper ? "default" : "outline"} className="mt-3 w-full" disabled={!!open}
              title={open ? "سكّر الصفقة المفتوحة قبل التبديل" : undefined}
              onClick={() => bot.setSniper(!bot.sniper)}
            >
              {bot.sniper ? "إيقاف سكالب الدقيقة (1m)" : "صفقات سكالب على فريم الدقيقة (1m)"}
            </Button>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button className="bg-bull text-background hover:bg-bull/90" disabled={!!open || !price} onClick={bot.longNow}>
                <TrendingUp className="h-4 w-4" /> شراء فوري (Long)
              </Button>
              <Button className="bg-bear text-background hover:bg-bear/90" disabled={!!open || !price} onClick={bot.shortNow}>
                <TrendingDown className="h-4 w-4" /> بيع فوري (Short)
              </Button>
            </div>
            {background.cloud ? <div className="mt-3 space-y-1 text-xs text-muted-foreground"><p>حساب دائم · {bot.enabled ? "تشغيل بالخلفية" : "متوقف"}</p><p>آخر فحص: {background.lastTickAt ? new Date(background.lastTickAt).toLocaleString("en-GB") : "بانتظار أول فحص"}</p></div> : <div className="mt-3 space-y-2 text-xs text-muted-foreground"><p>تجربة محلية · تتوقف عند إغلاق الصفحة</p><Button asChild variant="outline" size="sm" className="w-full"><Link to="/auth">سجّل دخولك للتشغيل بغيابك والسجل الدائم</Link></Button></div>}
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center justify-between text-sm font-semibold">
              رصيد المحاكاة
              <Button variant="ghost" size="icon" disabled={background.cloud} onClick={() => confirm("إعادة الرصيد إلى 10,000 USDT وحذف السجل؟") && bot.reset()} className="text-muted-foreground hover:text-foreground" aria-label="إعادة ضبط">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="USDT متاح" value={fmt(bot.usdt)} />
              <Stat label="هامش مستخدم" value={fmt(open?.size ?? 0)} />
              <Stat label="القيمة الكلية" value={fmt(equity)} />
              <Stat label="إجمالي الربح" value={fmtSigned(totalPnl)} cls={totalPnl >= 0 ? "text-bull" : "text-bear"} />
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center justify-between text-sm font-semibold">الصفقة المفتوحة {open && <SideTag side={open.side} />}</div>
            {open ? (
              <div className="space-y-1 text-sm">
                <Row k="الدخول" v={fmt(open.entry)} />
                <Row k="وقف الخسارة" v={fmt(open.stop)} cls="text-bear" />
                {open.tp1 != null && <Row k={`الهدف الأول (60%)${open.tp1Hit ? " ✓" : ""}`} v={fmt(open.tp1)} cls="text-bull" />}
                <Row k="الهدف الثاني (40%)" v={fmt(open.target)} cls="text-bull" />
                <Row k="ربح/خسارة السعر" v={`${fmtSigned(movePnl)} USDT`} cls={movePnl >= 0 ? "text-bull" : "text-bear"} />
                <Row k="الصافي بعد السبريد" v={`${fmtSigned(openPnl)} USDT`} cls={openPnl >= 0 ? "text-bull" : "text-bear"} />
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
      <div className="mb-3 text-sm font-semibold">إدارة المخاطر</div>
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

const toneCls = {
  off: "border-border bg-muted text-muted-foreground",
  watch: "border-chart-2/40 bg-chart-2/10 text-chart-2",
  ready: "border-bull/40 bg-bull/10 text-bull",
  open: "border-primary/40 bg-primary/10 text-primary",
  blocked: "border-bear/40 bg-bear/10 text-bear",
} as const;

function IndicatorsPanel({ x }: { x: ReturnType<typeof useLocalPaper>["extras"] }) {
  const [open, setOpen] = useState(false);
  if (!x) return null;
  const trending = x.adx >= 20;
  const items: { group: string; label: string; value: string; note: string; cls?: string }[] = [
    { group: "الزخم", label: "Stochastic %K / %D", value: `${fmt(x.stochK, 0)} / ${fmt(x.stochD, 0)}`,
      note: x.stochK > 80 ? "تشبع شرائي" : x.stochK < 20 ? "تشبع بيعي" : "محايد",
      cls: x.stochK > 80 ? "text-bear" : x.stochK < 20 ? "text-bull" : "" },
    { group: "التقلب", label: "Bollinger (عرض الباند)", value: `${fmt(x.bbWidthPct, 2)}%`,
      note: x.close >= x.bbUpper ? "فوق الباند العلوي" : x.close <= x.bbLower ? "تحت الباند السفلي" : x.bbWidthPct < 0.15 ? "انضغاط — احتمال انفجار" : "داخل الباندات" },
    { group: "التقلب", label: "ATR 14", value: fmt(x.atr), note: "يحدد مسافة الوقف والهدف" },
    { group: "السيولة", label: "VWAP اليومي", value: fmt(x.vwap), note: x.close >= x.vwap ? "السعر فوق VWAP" : "السعر تحت VWAP",
      cls: x.close >= x.vwap ? "text-bull" : "text-bear" },
    { group: "الاتجاه", label: "MACD / الإشارة", value: `${fmt(x.macd)} / ${fmt(x.macdSignal)}`, note: x.hist >= 0 ? "زخم صاعد" : "زخم هابط",
      cls: x.hist >= 0 ? "text-bull" : "text-bear" },
    { group: "الاتجاه", label: "EMA 50 / 200", value: `${fmt(x.ema50, 0)} / ${fmt(x.ema200, 0)}`,
      note: !Number.isFinite(x.ema200) ? "—" : x.ema50 > x.ema200 ? "ترند عام صاعد" : "ترند عام هابط",
      cls: x.ema50 > x.ema200 ? "text-bull" : "text-bear" },
    { group: "القوة", label: "ADX (+DI / −DI)", value: `${fmt(x.adx, 0)} (${fmt(x.plusDi, 0)} / ${fmt(x.minusDi, 0)})`,
      note: trending ? "ترند قوي — استراتيجية تتبع الاتجاه" : "سوق عرضي — استراتيجية النطاق", cls: trending ? "text-primary" : "text-chart-2" },
  ];
  return (
    <div className="rounded-lg border bg-card p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mb-1 flex w-full items-center justify-between text-sm"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5 font-medium">
          <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
          لوحة المؤشرات
        </span>
        <span className={`rounded px-2 py-0.5 text-xs ${trending ? "bg-primary/15 text-primary" : "bg-chart-2/15 text-chart-2"}`}>
          {trending ? "تتبع الاتجاه" : "تداول النطاق"}
        </span>
      </button>
      {open && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((i) => (
            <div key={i.label} className="rounded-md bg-muted/50 p-3">
              <div className="text-[11px] text-muted-foreground">{i.group} · {i.label}</div>
              <div className={`num mt-1 font-semibold ${i.cls ?? ""}`}>{i.value}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{i.note}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SideTag({ side }: { side: "long" | "short" }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${side === "long" ? "bg-bull/15 text-bull" : "bg-bear/15 text-bear"}`}>
      {side === "long" ? "Long ▲" : "Short ▼"}
    </span>
  );
}

function StatusBadge({ tone, text }: { tone: keyof typeof toneCls; text: string }) {
  return (
    <div className={`mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${toneCls[tone]}`} role="status">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full bg-current ${tone === "watch" || tone === "open" ? "animate-pulse" : ""}`} />
      <span>{text}</span>
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

function ScorePanel({ sig }: { sig: ReturnType<typeof useLocalPaper>["signal"] }) {
  if (!sig) return null;
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">Smart VWAP & Momentum — نقاط الدخول</span>
        <span className={`num rounded px-2 py-0.5 text-xs ${sig.score >= 80 ? "bg-bull/15 text-bull" : "bg-muted text-muted-foreground"}`}>{sig.score}% / 80%</span>
      </div>
      <div className="grid gap-1.5 text-xs sm:grid-cols-2">
        {sig.checks.map((c) => (
          <div key={c.key} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1.5">
            <span>{c.label} <span className="text-muted-foreground">({c.weight}%)</span></span>
            <span className="flex gap-2">
              <span className={c.long ? "text-bull" : "text-muted-foreground"}>L {c.long ? "✓" : "✗"}</span>
              <span className={c.short ? "text-bear" : "text-muted-foreground"}>S {c.short ? "✓" : "✗"}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
