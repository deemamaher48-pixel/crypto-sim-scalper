import type { PaperState } from '@/lib/background-paper';
import { tradeOutcome } from '@/lib/trade-history';

const GW = 'https://connector-gateway.lovable.dev/telegram';
type Btn = { text: string; callback_data?: string; url?: string };
type Kb = Btn[][];

export async function tg(method: string, body: Record<string, unknown>) {
  const L = process.env['LOVABLE_API_KEY'], T = process.env['TELEGRAM_API_KEY'];
  if (!L || !T) throw new Error('Telegram not configured');
  const res = await fetch(`${GW}/${method}`, { method: 'POST', headers: { Authorization: `Bearer ${L}`, 'X-Connection-Api-Key': T, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) console.error(`telegram ${method} [${res.status}]`, JSON.stringify(j));
  return j;
}
async function admin() { return (await import('@/integrations/supabase/client.server')).supabaseAdmin; }

export async function adminFor(userId: string) {
  const { data } = await (await admin()).from('telegram_admins').select('chat_id').eq('user_id', userId);
  return (data ?? []).map(r => Number(r.chat_id));
}

const sym = (s: string | undefined) => (s === 'PAXGUSDT' ? 'الذهب' : 'BTC');
const f = (n: number | undefined, d = 2) => (n == null ? '-' : n.toFixed(d));

export async function notifyTradeChanges(userId: string, before: Map<string, { closed: boolean; tp1: boolean }>, s: PaperState) {
  const chats = await adminFor(userId); if (!chats.length) return;
  const msgs: string[] = [];
  for (const t of s.trades.slice(0, 5)) {
    const b = before.get(t.id);
    const mode = t.mode === 'sniper' ? '1m قناص' : '5m أساسي';
    if (!b) msgs.push(`${t.side === 'long' ? '🟢 شراء' : '🔴 بيع'} ${sym(t.symbol)} — ${mode}\nالدخول: ${f(t.entry)}\n🛑 الستوب: ${f(t.stop)}\n🎯 TP1: ${f(t.tp1)} | TP2: ${f(t.target)}\n${t.entryReason}`);
    else if (!b.closed && t.closedAt) msgs.push(`${(t.pnl ?? 0) >= 0 ? '✅' : '❌'} إغلاق ${sym(t.symbol)} — ${tradeOutcome(t.pnl ?? 0)}\nصافي: ${(t.pnl ?? 0) >= 0 ? '+' : ''}${f(t.pnl)}$`);
    else if (!b.tp1 && t.tp1Hit) msgs.push(`🔒 ${sym(t.symbol)}: تحقق TP1 وتم نقل الستوب للدخول`);
  }
  for (const c of chats) for (const m of msgs) await tg('sendMessage', { chat_id: c, text: m });
}

export function dashboard(s: PaperState, last: string | null): { text: string; kb: Kb } {
  const day = new Date().toISOString().slice(0, 10);
  const pnl = s.trades.filter(t => t.closedAt?.startsWith(day)).reduce((a, t) => a + (t.pnl ?? 0), 0);
  const open = s.trades.filter(t => !t.closedAt).length;
  const on = (b: boolean) => (b ? '🟢' : '🔴');
  return {
    text: `🤖 لوحة التحكم\n\nالحالة: ${s.enabled ? '🟢 يعمل' : '🔴 متوقف'} | ${sym(s.symbol)}\nالرصيد: $${f(s.usdt)} | اليوم: ${pnl >= 0 ? '+' : ''}${f(pnl)}$\nالصفقات المفتوحة: ${open}\nMT5: ⚪ غير مربوط (تداول تجريبي)\n\n${last ?? ''}`,
    kb: [[{ text: '🥇 لوحة MT5', callback_data: 'mt5' }],
      [{ text: `${on(s.enabled)} البوت: ${s.enabled ? 'يعمل' : 'متوقف'}`, callback_data: 'enable' }],
      [{ text: `${on(!s.sniper)} نظام 5m`, callback_data: 'm5' }, { text: `${on(s.sniper)} قناص 1m`, callback_data: 'm1' }],
      [{ text: `${on(s.newsShield !== false)} درع الأخبار`, callback_data: 'news' }, { text: `🔁 ${s.symbol === 'PAXGUSDT' ? 'إلى BTC' : 'إلى الذهب'}`, callback_data: 'sym' }],
      [{ text: '⚡ الصفقات المفتوحة', callback_data: 'trades' }, { text: '🛡️ المخاطرة واللوت', callback_data: 'risk' }],
      [{ text: '📈 الإحصائيات', callback_data: 'stats' }, { text: '👥 المشتركين', callback_data: 'subs' }],
      [{ text: '🚨 إيقاف طوارئ (Kill Switch)', callback_data: 'kill' }],
      [{ text: '🔄 تحديث', callback_data: 'home' }],
    ],
  };
}
export const back: Btn[] = [{ text: '🔙 رجوع', callback_data: 'home' }];

export function tradesView(s: PaperState) {
  const open = s.trades.filter(t => !t.closedAt);
  const text = open.length ? open.map(t => `${t.side === 'long' ? '🟢 شراء' : '🔴 بيع'} ${sym(t.symbol)}\nالدخول ${f(t.entry)} | الستوب ${f(t.stop)} | الهدف ${f(t.target)}`).join('\n\n') : 'لا توجد صفقات مفتوحة';
  return { text: `⚡ الصفقات المفتوحة\n\n${text}`, kb: [[{ text: '🔒 تأمين على الدخول', callback_data: 'be' }], [{ text: '❌ إغلاق الكل فوراً', callback_data: 'closeall' }], [{ text: '🟢 شراء فوري', callback_data: 'long' }, { text: '🔴 بيع فوري', callback_data: 'short' }], back] };
}
export function riskView(s: PaperState) {
  const r = s.settings;
  return { text: `🛡️ المخاطرة\n\nحجم الصفقة: $${r.positionUsdt}\nأقصى خسارة يومية: $${r.maxDailyLossUsdt}\nأقصى صفقات يومياً: ${r.maxTradesPerDay}`,
    kb: [[50, 100, 250, 500].map(v => ({ text: `$${v}`, callback_data: `size:${v}` })), [25, 50, 100, 200].map(v => ({ text: `حد خسارة $${v}`, callback_data: `loss:${v}` })), [{ text: '🔓 فك التبريد وقاطع الأمان', callback_data: 'reset' }], back] };
}
export function statsView(s: PaperState) {
  const now = Date.now(), lines = [['اليوم', 864e5], ['الأسبوع', 7 * 864e5], ['الشهر', 30 * 864e5]].map(([n, ms]) => {
    const c = s.trades.filter(t => t.closedAt && now - Date.parse(t.closedAt) <= (ms as number));
    const w = c.filter(t => (t.pnl ?? 0) > 0).length, p = c.reduce((a, t) => a + (t.pnl ?? 0), 0);
    return `${n}: ${c.length} صفقة | ربح ${w} / خسارة ${c.length - w} | نجاح ${c.length ? Math.round((w / c.length) * 100) : 0}% | ${p >= 0 ? '+' : ''}${f(p)}$`;
  });
  return { text: `📈 الإحصائيات\n\n${lines.join('\n')}`, kb: [back] };
}
