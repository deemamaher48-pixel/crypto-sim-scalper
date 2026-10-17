import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ShieldCheck, LineChart, History } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "سكالبر — بوت سكالبينغ آلي لـ Binance" },
      {
        name: "description",
        content: "لوحة عربية لتداول BTC/USDT آلياً على Binance Testnet بمؤشرات EMA و RSI وإدارة مخاطر صارمة.",
      },
      { property: "og:title", content: "سكالبر — بوت سكالبينغ آلي لـ Binance" },
      { property: "og:description", content: "تداول آلي بمؤشرات EMA و RSI ووقف خسارة وجني أرباح تلقائي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const features = [
  { icon: LineChart, title: "شارت وأسعار مباشرة", text: "شموع لحظية لـ BTC/USDT مع خطوط EMA." },
  { icon: Activity, title: "تنفيذ تلقائي", text: "دخول وخروج حسب تقاطع EMA وارتداد RSI." },
  { icon: ShieldCheck, title: "إدارة مخاطر صارمة", text: "وقف خسارة، جني أرباح، حد يومي للخسارة." },
  { icon: History, title: "سجل وأداء", text: "كل صفقة مع الربح، نسبة النجاح ومنحنى الأداء." },
];

function Index() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-bull" /> Binance Spot Testnet
        </div>
        <h1 className="text-4xl font-bold leading-tight md:text-6xl">
          سكالبينغ آلي <span className="text-primary">بانضباط</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          بوت يتداول BTC/USDT نيابةً عنك بقواعد واضحة، بدون عواطف وبدون مخاطرة بأموال حقيقية.
        </p>
        <div className="mt-8 flex gap-3">
          <Link to="/dashboard" className="rounded-md bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90">
            افتح لوحة التحكم
          </Link>
          <Link to="/auth" className="rounded-md border px-6 py-3 font-medium hover:bg-accent">
            تسجيل الدخول
          </Link>
        </div>
        <div className="mt-16 grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="rounded-lg border bg-card p-5">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
