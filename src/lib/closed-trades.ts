// Pure: detect positions that disappeared between two broker snapshots and build the Telegram text.
type Pos = { ticket?: unknown; type?: unknown; volume?: unknown; price_open?: unknown; tp?: unknown; profit?: unknown };
type Snap = { balance?: number; positions?: Pos[] } | null | undefined;

export function closedTrades(prev: Snap, next: Snap): string[] {
  const before = Array.isArray(prev?.positions) ? prev!.positions : [];
  const now = new Set((Array.isArray(next?.positions) ? next!.positions : []).map((p) => Number(p.ticket)));
  const gone = before.filter((p) => Number(p.ticket) > 0 && !now.has(Number(p.ticket)));
  if (!gone.length) return [];
  const delta = typeof prev?.balance === "number" && typeof next?.balance === "number" ? next.balance - prev.balance : null;
  return gone.map((p) => {
    const profit = gone.length === 1 && delta !== null && delta !== 0 ? delta : Number(p.profit ?? 0);
    const win = profit >= 0;
    const side = p.type === "BUY" ? "شراء" : "بيع";
    const title = win ? "✅ جني أرباح" : "🛑 وقف خسارة";
    const lines = [
      `${title} — سكّرت صفقة ${side} ذهب ${p.volume ?? ""}`.trim(),
      `🎫 ${Number(p.ticket)} | دخول ${p.price_open ?? "-"}`,
      `💵 المبلغ المحقق: ${win ? "+" : ""}${profit.toFixed(2)}$`,
    ];
    if (typeof next?.balance === "number") lines.push(`💰 الرصيد: ${next.balance.toFixed(2)}$`);
    return lines.join("\n");
  });
}
