// Pure nightly Telegram summary of today's MT5 trades (bot vs manual, wins/losses, net).
export type ReportTrade = { side: "long" | "short"; pnl: number; swing: boolean; manual: boolean };

export function dailyReport(trades: ReportTrade[], startBal: number | null, endBal: number | null): string {
  const bot = trades.filter((t) => !t.manual);
  const wins = bot.filter((t) => t.pnl > 0), losses = bot.filter((t) => t.pnl < 0);
  const rate = bot.length ? Math.round((wins.length / bot.length) * 100) : 0;
  const sum = (a: ReportTrade[]) => +a.reduce((s, t) => s + t.pnl, 0).toFixed(2);
  const sign = (n: number) => `${n >= 0 ? "🟢 +" : "🔴 "}${n.toFixed(2)}$`;
  const net = startBal != null && endBal != null ? +(endBal - startBal).toFixed(2) : null;
  const pct = net != null && startBal ? ` (${((net / startBal) * 100).toFixed(2)}%)` : "";
  const turbo = bot.filter((t) => !t.swing), swing = bot.filter((t) => t.swing);
  const best = bot.length ? Math.max(...bot.map((t) => t.pnl)) : 0, worst = bot.length ? Math.min(...bot.map((t) => t.pnl)) : 0;
  const lines = [
    "📊 تقرير اليوم — ذهب MT5",
    "━━━━━━━━━━━━━━",
    startBal != null && endBal != null ? `🏦 ${startBal.toFixed(2)}$ ← ${endBal.toFixed(2)}$` : "🏦 الرصيد غير متوفر",
    net != null ? `💰 صافي اليوم: ${sign(net)}${pct}` : "",
    `🤖 صفقات البوت: ${bot.length}  |  ✅ ${wins.length}  ❌ ${losses.length}  |  نسبة النجاح ${rate}%`,
    bot.length ? `⚡ تيربو: ${turbo.length} صفقة ${sign(sum(turbo))}   🌊 سوينغ: ${swing.length} صفقة ${sign(sum(swing))}` : "",
    bot.length ? `🏆 أفضل صفقة ${sign(best)}   ⚠️ أسوأ صفقة ${sign(worst)}` : "",
    trades.length > bot.length ? `✋ صفقات يدوية: ${trades.length - bot.length} (خارج التقييم)` : "",
    "━━━━━━━━━━━━━━",
    !bot.length ? "😴 ما في صفقات تلقائية اليوم — السوق ما أعطى إشارة مكتملة." :
      rate >= 55 ? "💡 يوم جيد: البوت التزم بالاتجاه والإدارة حمت الأرباح." :
      losses.length >= 3 ? "💡 يوم متذبذب: خسائر متكررة — قاطع الخسائر والتعلّم الذاتي شدّدوا الشروط." :
      "💡 يوم متوسط: النتائج ضمن الطبيعي للسكالب، نكمل جمع الصفقات للتقييم.",
  ];
  return lines.filter(Boolean).join("\n");
}
