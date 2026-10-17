import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { exitReasonLabel } from "@/lib/trading";
import { fmt, tradesQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/trades")({
  head: () => ({
    meta: [
      { title: "سجل الصفقات والأداء — سكالبر" },
      { name: "description", content: "كل صفقات البوت مع الأرباح ونسبة النجاح ومنحنى الأداء." },
      { property: "og:title", content: "سجل الصفقات والأداء — سكالبر" },
      { property: "og:description", content: "كل صفقات البوت مع الأرباح ونسبة النجاح ومنحنى الأداء." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(tradesQuery),
  component: TradesPage,
});

function TradesPage() {
  const { data: trades } = useSuspenseQuery(tradesQuery);
  const [filter, setFilter] = useState<"all" | "win" | "loss" | "open">("all");

  const closed = trades.filter((t) => t.status === "closed");
  const stats = useMemo(() => {
    const wins = closed.filter((t) => Number(t.pnl) > 0);
    const losses = closed.filter((t) => Number(t.pnl) <= 0);
    const gross = wins.reduce((a, t) => a + Number(t.pnl), 0);
    const lossSum = Math.abs(losses.reduce((a, t) => a + Number(t.pnl), 0));
    const total = gross - lossSum;
    return {
      total,
      count: closed.length,
      winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
      pf: lossSum ? gross / lossSum : null,
      best: closed.length ? Math.max(...closed.map((t) => Number(t.pnl))) : 0,
      worst: closed.length ? Math.min(...closed.map((t) => Number(t.pnl))) : 0,
    };
  }, [closed]);

  const curve = useMemo(() => {
    let cum = 0;
    return [...closed]
      .sort((a, b) => (a.closed_at! < b.closed_at! ? -1 : 1))
      .map((t, i) => ({ i: i + 1, pnl: Number((cum += Number(t.pnl)).toFixed(2)) }));
  }, [closed]);

  const rows = trades.filter((t) =>
    filter === "all" ? true : filter === "open" ? t.status === "open" : filter === "win" ? Number(t.pnl) > 0 : t.status === "closed" && Number(t.pnl) <= 0,
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">السجل والأداء</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Card label="صافي الربح" value={`${fmt(stats.total)}`} cls={stats.total >= 0 ? "text-bull" : "text-bear"} />
        <Card label="عدد الصفقات" value={String(stats.count)} />
        <Card label="نسبة النجاح" value={`${fmt(stats.winRate, 1)}%`} />
        <Card label="معامل الربح" value={stats.pf == null ? "—" : fmt(stats.pf)} />
        <Card label="أفضل صفقة" value={fmt(stats.best)} cls="text-bull" />
        <Card label="أسوأ صفقة" value={fmt(stats.worst)} cls="text-bear" />
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-2 text-sm font-medium">منحنى الأرباح التراكمي (USDT)</div>
        {curve.length ? (
          <div className="h-56" dir="ltr">
            <ResponsiveContainer>
              <AreaChart data={curve}>
                <CartesianGrid stroke="var(--border)" />
                <XAxis dataKey="i" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)" }} />
                <Area dataKey="pnl" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">لا توجد صفقات مغلقة بعد.</p>
        )}
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex gap-1 border-b p-2">
          {([["all", "الكل"], ["win", "رابحة"], ["loss", "خاسرة"], ["open", "مفتوحة"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded px-3 py-1 text-sm ${filter === k ? "bg-accent" : "text-muted-foreground hover:bg-accent"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                {["الوقت", "الوضع", "الدخول", "الخروج", "الكمية", "الربح", "سبب الدخول", "سبب الخروج"].map((h) => (
                  <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-accent/40">
                  <td className="num px-3 py-2 text-xs">{new Date(t.opened_at).toLocaleString("en-GB")}</td>
                  <td className="px-3 py-2 text-xs">{t.mode === "paper" ? "محاكاة" : "Testnet"}</td>
                  <td className="num px-3 py-2">{fmt(t.entry_price)}</td>
                  <td className="num px-3 py-2">{fmt(t.exit_price)}</td>
                  <td className="num px-3 py-2">{fmt(t.qty, 5)}</td>
                  <td className={`num px-3 py-2 font-medium ${t.pnl == null ? "" : Number(t.pnl) >= 0 ? "text-bull" : "text-bear"}`}>
                    {t.status === "open" ? "مفتوحة" : fmt(t.pnl)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{t.entry_reason}</td>
                  <td className="px-3 py-2 text-xs">{t.exit_reason ? exitReasonLabel[t.exit_reason] ?? t.exit_reason : "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">لا توجد صفقات.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`num mt-1 text-lg font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
