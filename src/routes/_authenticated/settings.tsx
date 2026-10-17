import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { settingsQuery, type Settings } from "@/lib/queries";
import { deleteCredentials, getCredentialStatus, resetPaperAccount, saveCredentials } from "@/functions/bot.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات — سكالبر" },
      { name: "description", content: "إعدادات الاستراتيجية وإدارة المخاطر ومفاتيح Testnet." },
      { property: "og:title", content: "الإعدادات — سكالبر" },
      { property: "og:description", content: "إعدادات الاستراتيجية وإدارة المخاطر ومفاتيح Testnet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsQuery),
  component: SettingsPage,
});

type NumKey =
  | "ema_fast" | "ema_slow" | "rsi_period" | "rsi_overbought" | "rsi_oversold"
  | "stop_loss_pct" | "take_profit_pct" | "position_usdt" | "max_trades_per_day" | "max_daily_loss_usdt";

const groups: { title: string; fields: { key: NumKey; label: string; min: number; max: number; step: number }[] }[] = [
  {
    title: "المؤشرات الفنية",
    fields: [
      { key: "ema_fast", label: "EMA سريع", min: 2, max: 100, step: 1 },
      { key: "ema_slow", label: "EMA بطيء", min: 3, max: 200, step: 1 },
      { key: "rsi_period", label: "فترة RSI", min: 2, max: 50, step: 1 },
      { key: "rsi_overbought", label: "تشبع شرائي RSI", min: 50, max: 95, step: 1 },
      { key: "rsi_oversold", label: "تشبع بيعي RSI", min: 5, max: 50, step: 1 },
    ],
  },
  {
    title: "إدارة المخاطر",
    fields: [
      { key: "stop_loss_pct", label: "وقف الخسارة %", min: 0.05, max: 10, step: 0.05 },
      { key: "take_profit_pct", label: "جني الأرباح %", min: 0.05, max: 20, step: 0.05 },
      { key: "position_usdt", label: "حجم الصفقة (USDT)", min: 10, max: 100000, step: 1 },
      { key: "max_trades_per_day", label: "أقصى صفقات يومياً", min: 1, max: 500, step: 1 },
      { key: "max_daily_loss_usdt", label: "حد الخسارة اليومي (USDT)", min: 1, max: 100000, step: 1 },
    ],
  },
];

function SettingsPage() {
  const qc = useQueryClient();
  const { data: s } = useSuspenseQuery(settingsQuery);
  const [form, setForm] = useState<Settings>(s);
  const [saving, setSaving] = useState(false);
  const reset = useServerFn(resetPaperAccount);

  async function save() {
    const errs: string[] = [];
    for (const g of groups)
      for (const f of g.fields) {
        const v = Number(form[f.key]);
        if (!Number.isFinite(v) || v < f.min || v > f.max) errs.push(`${f.label}: بين ${f.min} و ${f.max}`);
      }
    if (Number(form.ema_fast) >= Number(form.ema_slow)) errs.push("EMA السريع يجب أن يكون أصغر من البطيء");
    if (Number(form.rsi_oversold) >= Number(form.rsi_overbought)) errs.push("حدود RSI غير منطقية");
    if (errs.length) {
      toast.error(errs[0]);
      return;
    }
    setSaving(true);
    const payload = Object.fromEntries(groups.flatMap((g) => g.fields.map((f) => [f.key, Number(form[f.key])])));
    const { error } = await supabase
      .from("bot_settings")
      .update({ ...payload, mode: form.mode, updated_at: new Date().toISOString() })
      .eq("user_id", s.user_id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم حفظ الإعدادات");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">الإعدادات</h1>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold">وضع التداول</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {([
            ["paper", "محاكاة (افتراضي)", "أسعار السوق الحقيقية، رصيد افتراضي 10,000 USDT، بدون مفاتيح."],
            ["testnet", "Binance Testnet", "أوامر حقيقية على شبكة Binance التجريبية بمفاتيحك."],
          ] as const).map(([v, t, d]) => (
            <button
              key={v}
              onClick={() => setForm({ ...form, mode: v })}
              className={`rounded-md border p-3 text-start ${form.mode === v ? "border-primary bg-primary/10" : "hover:bg-accent"}`}
            >
              <div className="font-medium">{t}</div>
              <div className="mt-1 text-xs text-muted-foreground">{d}</div>
            </button>
          ))}
        </div>
        {form.mode !== "testnet" && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={async () => {
              if (!confirm("إعادة الرصيد الافتراضي إلى 10,000 USDT وحذف صفقات المحاكاة؟")) return;
              await reset();
              toast.success("تمت إعادة ضبط الحساب الافتراضي");
              qc.invalidateQueries();
            }}
          >
            إعادة ضبط الرصيد الافتراضي
          </Button>
        )}
      </section>

      {groups.map((g) => (
        <section key={g.title} className="rounded-lg border bg-card p-5">
          <h2 className="font-semibold">{g.title}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {g.fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={f.key}>{f.label}</Label>
                <Input
                  id={f.key}
                  type="number"
                  dir="ltr"
                  className="num"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={String(form[f.key])}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value as unknown as number })}
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      <Button onClick={save} disabled={saving} className="w-full">حفظ الإعدادات</Button>

      {form.mode === "testnet" && <CredentialsCard />}
    </div>
  );
}

function CredentialsCard() {
  const status = useServerFn(getCredentialStatus);
  const saveFn = useServerFn(saveCredentials);
  const delFn = useServerFn(deleteCredentials);
  const { data, refetch } = useQuery({ queryKey: ["cred-status"], queryFn: () => status() });
  const [apiKey, setKey] = useState("");
  const [apiSecret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-primary" /> مفاتيح Binance Testnet</h2>
      <p className="mt-1 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        تُحفظ المفاتيح على الخادم فقط ولا تُعرض مجدداً. احصل عليها من testnet.binance.vision.
      </p>
      {data?.configured ? (
        <div className="mt-4 flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
          <span>مفتاح محفوظ: <span className="num">{data.keyHint}</span></span>
          <Button variant="ghost" size="sm" onClick={async () => { await delFn(); refetch(); toast.success("تم حذف المفاتيح"); }}>حذف</Button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <Input placeholder="API Key" dir="ltr" value={apiKey} onChange={(e) => setKey(e.target.value)} />
          <Input placeholder="Secret Key" type="password" dir="ltr" value={apiSecret} onChange={(e) => setSecret(e.target.value)} />
          <Button
            disabled={busy || !apiKey || !apiSecret}
            onClick={async () => {
              setBusy(true);
              try {
                await saveFn({ data: { apiKey, apiSecret } });
                setKey(""); setSecret("");
                toast.success("تم التحقق من المفاتيح وحفظها");
                refetch();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "مفاتيح غير صالحة");
              } finally {
                setBusy(false);
              }
            }}
          >
            تحقق واحفظ
          </Button>
        </div>
      )}
    </section>
  );
}
